-- Phase 2: Core tables — notebooks, sources, chunks, storage bucket, vector index, RLS

create extension if not exists vector;

-- Storage bucket for uploaded study materials
insert into storage.buckets (id, name, public) values ('sources', 'sources', false)
on conflict (id) do nothing;

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

-- RLS
alter table notebooks enable row level security;
alter table sources enable row level security;
alter table chunks enable row level security;

create policy "Users manage their notebooks"
  on notebooks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage sources in their notebooks"
  on sources for all
  using (exists (
    select 1 from notebooks
    where notebooks.id = sources.notebook_id
      and notebooks.user_id = auth.uid()
  ));

create policy "Users access chunks in their notebooks"
  on chunks for all
  using (exists (
    select 1 from sources s
    join notebooks n on n.id = s.notebook_id
    where s.id = chunks.source_id
      and n.user_id = auth.uid()
  ));
