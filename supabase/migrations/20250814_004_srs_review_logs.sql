-- Phase 5: Spaced-repetition review logs

create table review_logs (
  id uuid primary key default gen_random_uuid(),
  flashcard_id uuid not null references flashcards(id) on delete cascade,
  rating int not null check (rating between 1 and 4),
  reviewed_at timestamptz not null default now(),
  scheduled_days int,
  unique (flashcard_id, reviewed_at)     -- idempotency guard
);

-- RLS
alter table review_logs enable row level security;

create policy "Users manage their review logs"
  on review_logs for all
  using (exists (
    select 1 from flashcards f
    join sources s on s.id = f.source_id
    join notebooks n on n.id = s.notebook_id
    where f.id = review_logs.flashcard_id
      and n.user_id = auth.uid()
  ));
