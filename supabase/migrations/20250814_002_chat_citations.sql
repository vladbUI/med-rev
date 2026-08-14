-- Phase 3: Chat with citations — chat_sessions, chat_messages, match_chunks RPC

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

-- RLS
alter table chat_sessions enable row level security;
alter table chat_messages enable row level security;

create policy "Users manage chat sessions in their notebooks"
  on chat_sessions for all
  using (exists (
    select 1 from notebooks
    where notebooks.id = chat_sessions.notebook_id
      and notebooks.user_id = auth.uid()
  ));

create policy "Users manage messages in their chat sessions"
  on chat_messages for all
  using (exists (
    select 1 from chat_sessions cs
    join notebooks n on n.id = cs.notebook_id
    where cs.id = chat_messages.session_id
      and n.user_id = auth.uid()
  ));
