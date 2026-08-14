-- 20250814_007_textbooks.sql
-- Store uploaded textbooks and chapter hierarchies for on-demand chapter importing

create table if not exists books (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references notebooks(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  total_chapters int not null default 0,
  chapters jsonb not null default '[]',
  created_at timestamptz not null default now()
);
