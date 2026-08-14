"""Spaced-repetition scheduling with the FSRS algorithm."""
from datetime import datetime, timezone
from enum import IntEnum

from fsrs import Card, Rating, Scheduler

from app.supabase_client import get_supabase

scheduler = Scheduler()


class GradeRating(IntEnum):
    AGAIN = 1
    HARD = 2
    GOOD = 3
    EASY = 4


_RATING_MAP = {
    GradeRating.AGAIN: Rating.Again,
    GradeRating.HARD: Rating.Hard,
    GradeRating.GOOD: Rating.Good,
    GradeRating.EASY: Rating.Easy,
}


def _row_to_card(row: dict) -> Card:
    """Reconstruct an FSRS Card from database fields."""
    card = Card()
    card.due = datetime.fromisoformat(row["due"]) if isinstance(row["due"], str) else row["due"]
    card.stability = row["stability"]
    card.difficulty = row["difficulty"]
    card.elapsed_days = row["elapsed_days"]
    card.scheduled_days = row["scheduled_days"]
    card.reps = row["reps"]
    card.lapses = row["lapses"]
    card.state = row["state"]
    if row.get("last_review"):
        card.last_review = (
            datetime.fromisoformat(row["last_review"])
            if isinstance(row["last_review"], str) else row["last_review"]
        )
    return card


def _card_to_update(card: Card, now: datetime) -> dict:
    """Convert an FSRS Card into a database update dict."""
    return {
        "due": card.due.isoformat(),
        "stability": card.stability,
        "difficulty": card.difficulty,
        "elapsed_days": card.elapsed_days,
        "scheduled_days": card.scheduled_days,
        "reps": card.reps,
        "lapses": card.lapses,
        "state": card.state,
        "last_review": now.isoformat(),
    }


def get_review_queue(notebook_id: str, limit: int = 50) -> list[dict]:
    """Return flashcards due for review, ordered by due time."""
    db = get_supabase()
    now = datetime.now(timezone.utc).isoformat()

    try:
        rows = (
            db.table("flashcards")
            .select("id, source_id, card_type, front, back, topic_tag, due, state, reps, lapses, sources!inner(notebook_id)")
            .eq("sources.notebook_id", notebook_id)
            .lte("due", now)
            .order("due")
            .limit(limit)
            .execute()
        )
    except Exception:
        return []

    queue: list[dict] = []
    for row in rows.data or []:
        # Flatten — remove the nested sources join
        row.pop("sources", None)
        queue.append(row)
    return queue


def grade_card(flashcard_id: str, rating: int) -> dict:
    """Grade a flashcard and update its FSRS scheduling state.

    Returns the updated flashcard row. Idempotent: a duplicate
    review at the same timestamp is silently ignored.
    """
    if rating not in (1, 2, 3, 4):
        raise ValueError("Rating must be 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy).")

    db = get_supabase()
    now = datetime.now(timezone.utc)

    # Fetch the current card state
    row = (
        db.table("flashcards")
        .select("*")
        .eq("id", flashcard_id)
        .maybe_single()
        .execute()
    )
    if not row.data:
        raise ValueError("Flashcard not found.")

    card = _row_to_card(row.data)
    fsrs_rating = _RATING_MAP[GradeRating(rating)]

    # Run FSRS scheduling
    card, review_log = scheduler.review_card(card, fsrs_rating, now)

    # Write the review log (idempotency via unique constraint)
    try:
        db.table("review_logs").insert({
            "flashcard_id": flashcard_id,
            "rating": rating,
            "reviewed_at": now.isoformat(),
            "scheduled_days": card.scheduled_days,
        }).execute()
    except Exception:
        # Duplicate (flashcard_id, reviewed_at) — silently skip
        pass

    # Update the flashcard's scheduling state
    update = _card_to_update(card, now)
    db.table("flashcards").update(update).eq("id", flashcard_id).execute()

    # Return the updated row
    updated = (
        db.table("flashcards")
        .select("id, source_id, card_type, front, back, topic_tag, due, state, reps, lapses")
        .eq("id", flashcard_id)
        .single()
        .execute()
    )
    return updated.data
