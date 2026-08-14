"""Review endpoints: spaced-repetition queue and grading."""
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.srs import get_review_queue, grade_card

router = APIRouter(prefix="/review", tags=["review"])


# ── Response models ──────────────────────────────────────────

class FlashcardInQueue(BaseModel):
    id: str
    source_id: str
    card_type: str
    front: str
    back: str
    topic_tag: str | None = None
    due: str
    state: int
    reps: int
    lapses: int


class GradeRequest(BaseModel):
    rating: int  # 1=Again, 2=Hard, 3=Good, 4=Easy


class GradeResponse(BaseModel):
    id: str
    source_id: str
    card_type: str
    front: str
    back: str
    topic_tag: str | None = None
    due: str
    state: int
    reps: int
    lapses: int


# ── Endpoints ────────────────────────────────────────────────

@router.get("/queue", response_model=list[FlashcardInQueue])
async def review_queue(notebook_id: UUID = Query(...)) -> list[FlashcardInQueue]:
    queue = get_review_queue(str(notebook_id))
    return [FlashcardInQueue(**card) for card in queue]


@router.post("/{flashcard_id}/grade", response_model=GradeResponse)
async def grade(flashcard_id: UUID, body: GradeRequest) -> GradeResponse:
    try:
        updated = grade_card(str(flashcard_id), body.rating)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    return GradeResponse(**updated)
