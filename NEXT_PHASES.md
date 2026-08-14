# MedTech MLS Review — Next Phases Implementation Guide

## Before continuing

Complete these items before testing features that call external services:

- Add `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` to `backend/.env`.
- Restart the FastAPI server after editing `.env`.
- Do not expose the service-role or Gemini key to the frontend.
- Run each database change through a named Supabase migration, then update `supabase/schema.sql` to match.

## Phase 3 — Chat with citations

### Goal

Let a signed-in student ask questions about one notebook and receive answers grounded only in that notebook’s indexed chunks.

### Database changes

Add `chat_sessions` and `chat_messages` tables from the original plan. `chat_messages.cited_chunk_ids` should be a UUID array. Enable RLS on both tables and add policies that require ownership through the related notebook.

Add a SQL RPC function, `match_chunks`, that accepts a query embedding, notebook ID, and match count. It should return chunk ID, source ID, content, page number, filename, and cosine similarity. Filter through `sources.notebook_id` so chunks from other notebooks can never be retrieved.

### Backend work

1. Add `app/services/rag.py`.
2. Embed the user question through `LLMClient.embed`.
3. Call `match_chunks` with a small limit (for example, 8 chunks).
4. Build context blocks with stable IDs: `[chunk_<uuid>]`, filename, and page/slide number.
5. Add an LLM method for text generation. Its system prompt must instruct the model to answer only from supplied context, say when context is insufficient, and cite every factual claim with one or more chunk IDs.
6. Parse bracketed chunk IDs from the answer. Reject citations that are not in the retrieved set.
7. Persist the question, assistant answer, and validated cited chunk IDs.
8. Add `POST /chat/sessions`, `POST /chat/sessions/{id}/messages`, and `GET /chat/sessions/{id}/messages`.

### Frontend work

1. Replace the disabled Ask composer with an active chat screen.
2. Render cited chunks below each assistant answer as filename + page/slide chips.
3. Clicking a citation opens the source metadata for now; add document-page preview only after source viewing is implemented.
4. Include loading, empty-context, and API error states.

### Acceptance checks

- A question about an uploaded source returns answer text with valid citations.
- A question not supported by the source gets an explicit insufficiency response.
- A user cannot retrieve chunks from another user’s notebook.

## Phase 4 — Flashcard and board-style MCQ generation

### Database changes

Add `flashcards` and `quiz_questions`. Store quiz choices as `jsonb`; store the correct answer as a stable option key (for example, `"A"`) rather than its display text.

### Backend work

1. Add `app/services/generation.py` and keep all Gemini calls in `llm_client.py`.
2. Retrieve source chunks in bounded batches. Avoid sending a full textbook in one request.
3. Request strict JSON from the model. Validate it with Pydantic before database insertion.
4. Flashcards support two forms: basic question/answer and cloze deletion.
5. MCQs must have 4–5 options, exactly one correct answer, a rationale, and a topic tag. Prompt for rationales that explain why the distractors are wrong.
6. Add generation request logging: source ID, feature, model, input chunk count, generated item count, and timestamp. Never log private source text.
7. Add `POST /sources/{id}/generate-flashcards` and `POST /sources/{id}/generate-quiz`.

### Frontend work

1. Add a review screen before saving generated items.
2. Support edit, delete, select-all, and save actions.
3. Clearly label generated content as editable AI draft material.

### Acceptance checks

- Invalid model JSON is rejected without partial database inserts.
- Each saved MCQ has one answer and a rationale.
- Generated items inherit a source ID and topic tag.

## Phase 5 — Spaced-repetition review

### Backend work

1. Implement scheduling only in `app/services/srs.py` using the Python `fsrs` package already installed.
2. Add all required FSRS state fields to `flashcards`: due date, stability, difficulty, elapsed days, scheduled days, reps, lapses, and state.
3. Add `GET /review/queue` to return due cards for the authenticated user, ordered by due time.
4. Add `POST /review/{flashcard_id}/grade` with a four-button rating model: Again, Hard, Good, Easy.
5. Make grading idempotent with a review-log record or request ID so an accidental retry cannot reschedule a card twice.

### Frontend work

1. Build the sequence: front → reveal → grade → next card.
2. Show progress count and an empty-state when no cards are due.
3. Keyboard shortcuts are useful: Space to reveal; 1–4 to grade.

### Acceptance checks

- A graded card receives a future review time.
- The next queue request excludes cards that are no longer due.
- A duplicate grade request does not create a second schedule transition.

## Phase 6 — Quiz mode and weak-area tracking

### Database changes

Add `quiz_attempts`. Include user ID, question ID, selected option, correctness, and timestamp. Consider a `quiz_sessions` table if timed quizzes or resumable sessions are needed.

### Backend work

1. Add `POST /quiz/start` with source, topic, mixed, question count, and optional time limit filters.
2. Randomize option display order while retaining the stable correct option key.
3. Add `POST /quiz/{session_id}/submit` that records an attempt and returns feedback after submission.
4. Add `GET /analytics/weak-areas` that aggregates attempts by topic for the current user. Require a minimum attempt count before labelling a topic weak.

### Frontend work

1. Build one-question-at-a-time quiz flow with answer confirmation.
2. Build a result summary showing score, rationale, and links to source material.
3. Build a weak-area dashboard with accuracy, attempt count, and a “practice again” action.

### Acceptance checks

- Correct answers cannot be inferred from the client payload before submission.
- Topic accuracy is calculated only from the signed-in user’s attempts.
- Mixed quizzes do not include duplicate questions.

## Phase 7 — Product hardening and release

### Authentication and authorization

1. Implement Supabase email/password registration, sign-in, sign-out, and token refresh in the frontend.
2. Send the Supabase access token to the backend as `Authorization: Bearer <token>`.
3. Add backend token verification and enforce notebook ownership for every endpoint. Remove the temporary `VITE_DEMO_NOTEBOOK_ID` workflow.

### UX and reliability

1. Add notebook creation, rename, deletion, and subject tags.
2. Add source processing retries and clear failure messages.
3. Add responsive layouts, accessibility labels, focus handling, and keyboard navigation.
4. Rate-limit generation and chat routes. Track Gemini request usage against the free-tier limit.
5. Add structured logs and avoid storing source text in logs.

### Deployment

1. Deploy FastAPI with environment secrets managed by the host.
2. Configure frontend production API URL and CORS allowed origins.
3. Use Supabase production project keys only in deployment secrets.
4. Run a security review: RLS policies, storage policies, secret scanning, dependency audit, and access-control tests.

## Suggested delivery order

1. Implement authentication and notebook creation first; it removes the current demo notebook dependency.
2. Implement Phase 3 chat because it validates ingestion, embeddings, authorization, and source citations.
3. Build card/quiz generation, then review and quiz experiences.
4. Finish analytics only after real quiz-attempt data exists.
