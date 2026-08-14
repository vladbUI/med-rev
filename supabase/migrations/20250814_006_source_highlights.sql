-- Phase 6: Source highlights & key concepts table

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

-- RLS
alter table source_highlights enable row level security;

create policy "Users view highlights for their sources"
  on source_highlights for all
  using (exists (
    select 1 from sources s
    join notebooks n on n.id = s.notebook_id
    where s.id = source_highlights.source_id
      and n.user_id = auth.uid()
  ));
