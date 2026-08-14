-- Generation audit logging

create table generation_logs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  feature text not null,                 -- 'flashcards' or 'quiz'
  model text not null,
  input_chunk_count int not null,
  generated_item_count int not null,
  created_at timestamptz not null default now()
);

-- RLS
alter table generation_logs enable row level security;

create policy "Users view their generation logs"
  on generation_logs for all
  using (exists (
    select 1 from sources s
    join notebooks n on n.id = s.notebook_id
    where s.id = generation_logs.source_id
      and n.user_id = auth.uid()
  ));
