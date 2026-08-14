-- Phase 4: Flashcards and quiz questions

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

-- RLS
alter table flashcards enable row level security;
alter table quiz_questions enable row level security;

create policy "Users manage flashcards from their sources"
  on flashcards for all
  using (exists (
    select 1 from sources s
    join notebooks n on n.id = s.notebook_id
    where s.id = flashcards.source_id
      and n.user_id = auth.uid()
  ));

create policy "Users manage quiz questions from their sources"
  on quiz_questions for all
  using (exists (
    select 1 from sources s
    join notebooks n on n.id = s.notebook_id
    where s.id = quiz_questions.source_id
      and n.user_id = auth.uid()
  ));
