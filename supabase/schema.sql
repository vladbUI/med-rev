-- =============================================================
-- MedTech MLS Review — Full schema (Phases 2–5)
-- Run in the Supabase SQL Editor.
-- =============================================================

create extension if not exists vector;

-- Storage bucket for uploaded study materials
insert into storage.buckets (id, name, public) values ('sources', 'sources', false)
on conflict (id) do nothing;

-- -----------------------------------------------
-- Phase 2 — Core tables
-- -----------------------------------------------

create table notebooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  subject_tag text,
  created_at timestamptz not null default now()
);

create table sources (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references notebooks(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  upload_status text not null default 'pending',
  error_message text,
  created_at timestamptz not null default now()
);

create table chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  content text not null,
  embedding vector(768),
  page_number integer,
  chunk_index integer not null
);

create index chunks_embedding_idx on chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- -----------------------------------------------
-- Phase 3 — Chat with citations
-- -----------------------------------------------

create table chat_sessions (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references notebooks(id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  cited_chunk_ids uuid[] default '{}',
  created_at timestamptz not null default now()
);

-- Vector similarity search scoped to a single notebook
create or replace function match_chunks(
  query_embedding vector(768),
  target_notebook_id uuid,
  match_count int default 8
)
returns table (
  chunk_id uuid,
  source_id uuid,
  content text,
  page_number int,
  filename text,
  similarity float
)
language sql stable as $$
  select c.id, c.source_id, c.content, c.page_number, s.filename,
         1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  join sources s on s.id = c.source_id
  where s.notebook_id = target_notebook_id
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- -----------------------------------------------
-- Phase 4 — Flashcards and quiz questions
-- -----------------------------------------------

create table flashcards (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  card_type text not null default 'basic' check (card_type in ('basic', 'cloze')),
  front text not null,
  back text not null,
  topic_tag text,
  -- FSRS scheduling fields (used in Phase 5)
  due timestamptz not null default now(),
  stability float not null default 0,
  difficulty float not null default 0,
  elapsed_days int not null default 0,
  scheduled_days int not null default 0,
  reps int not null default 0,
  lapses int not null default 0,
  state int not null default 0,          -- 0=New, 1=Learning, 2=Review, 3=Relearning
  last_review timestamptz,
  created_at timestamptz not null default now()
);

create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  question text not null,
  choices jsonb not null,                -- {"A": "...", "B": "...", "C": "...", "D": "..."}
  correct_answer text not null,          -- "A", "B", etc.
  rationale text,
  topic_tag text,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------
-- Phase 5 — Spaced-repetition review logs
-- -----------------------------------------------

create table review_logs (
  id uuid primary key default gen_random_uuid(),
  flashcard_id uuid not null references flashcards(id) on delete cascade,
  rating int not null check (rating between 1 and 4),
  reviewed_at timestamptz not null default now(),
  scheduled_days int,
  unique (flashcard_id, reviewed_at)     -- idempotency guard
);

create table generation_logs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  feature text not null,                 -- 'flashcards' or 'quiz'
  model text not null,
  input_chunk_count int not null,
  generated_item_count int not null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------
-- Phase 6 — Source highlights & key concepts
-- -----------------------------------------------

create table source_highlights (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  topic_tag text,
  key_takeaways jsonb not null default '[]',
  lab_values jsonb not null default '[]',
  key_terms jsonb not null default '[]',
  highlighted_passages jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (source_id)
);

-- -----------------------------------------------
-- Row Level Security
-- -----------------------------------------------

alter table notebooks enable row level security;
alter table sources enable row level security;
alter table chunks enable row level security;
alter table chat_sessions enable row level security;
alter table chat_messages enable row level security;
alter table flashcards enable row level security;
alter table quiz_questions enable row level security;
alter table review_logs enable row level security;
alter table generation_logs enable row level security;
alter table source_highlights enable row level security;

-- Notebooks: owner-only
create policy "Users manage their notebooks"
  on notebooks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Sources: through notebook ownership
create policy "Users manage sources in their notebooks"
  on sources for all
  using (exists (
    select 1 from notebooks
    where notebooks.id = sources.notebook_id
      and notebooks.user_id = auth.uid()
  ));

-- Chunks: through source → notebook
create policy "Users access chunks in their notebooks"
  on chunks for all
  using (exists (
    select 1 from sources s
    join notebooks n on n.id = s.notebook_id
    where s.id = chunks.source_id
      and n.user_id = auth.uid()
  ));

-- Chat sessions: through notebook ownership
create policy "Users manage chat sessions in their notebooks"
  on chat_sessions for all
  using (exists (
    select 1 from notebooks
    where notebooks.id = chat_sessions.notebook_id
      and notebooks.user_id = auth.uid()
  ));

-- Chat messages: through session → notebook
create policy "Users manage messages in their chat sessions"
  on chat_messages for all
  using (exists (
    select 1 from chat_sessions cs
    join notebooks n on n.id = cs.notebook_id
    where cs.id = chat_messages.session_id
      and n.user_id = auth.uid()
  ));

-- Flashcards: through source → notebook
create policy "Users manage flashcards from their sources"
  on flashcards for all
  using (exists (
    select 1 from sources s
    join notebooks n on n.id = s.notebook_id
    where s.id = flashcards.source_id
      and n.user_id = auth.uid()
  ));

-- Quiz questions: through source → notebook
create policy "Users manage quiz questions from their sources"
  on quiz_questions for all
  using (exists (
    select 1 from sources s
    join notebooks n on n.id = s.notebook_id
    where s.id = quiz_questions.source_id
      and n.user_id = auth.uid()
  ));

-- Review logs: through flashcard → source → notebook
create policy "Users manage their review logs"
  on review_logs for all
  using (exists (
    select 1 from flashcards f
    join sources s on s.id = f.source_id
    join notebooks n on n.id = s.notebook_id
    where f.id = review_logs.flashcard_id
      and n.user_id = auth.uid()
  ));

-- Generation logs: through source → notebook
create policy "Users view their generation logs"
  on generation_logs for all
  using (exists (
    select 1 from sources s
    join notebooks n on n.id = s.notebook_id
    where s.id = generation_logs.source_id
      and n.user_id = auth.uid()
  ));

-- Source highlights: through source → notebook
create policy "Users view highlights for their sources"
  on source_highlights for all
  using (exists (
    select 1 from sources s
    join notebooks n on n.id = s.notebook_id
    where s.id = source_highlights.source_id
      and n.user_id = auth.uid()
  ));

