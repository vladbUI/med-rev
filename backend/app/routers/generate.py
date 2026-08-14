"""Content generation endpoints: flashcards and quiz questions from sources."""
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.services.generation import (
    FlashcardDraft,
    QuizQuestionDraft,
    generate_flashcards,
    generate_quiz,
)
from app.supabase_client import get_supabase

router = APIRouter(prefix="/sources", tags=["generation"])


# ── Request / response models ────────────────────────────────

class GenerateFlashcardsResponse(BaseModel):
    source_id: str
    drafts: list[FlashcardDraft]


class GenerateQuizResponse(BaseModel):
    source_id: str
    drafts: list[QuizQuestionDraft]


class SaveFlashcardsRequest(BaseModel):
    flashcards: list[FlashcardDraft]


class SaveFlashcardsResponse(BaseModel):
    saved_count: int


class SaveQuizRequest(BaseModel):
    questions: list[QuizQuestionDraft]


class SaveQuizResponse(BaseModel):
    saved_count: int


# ── Helpers ───────────────────────────────────────────────────

def _verify_source_ready(source_id: str) -> dict:
    """Check that the source exists and is ready for generation."""
    db = get_supabase()
    source = (
        db.table("sources")
        .select("id, upload_status")
        .eq("id", source_id)
        .maybe_single()
        .execute()
    )
    if not source.data:
        raise HTTPException(404, "Source not found.")
    if source.data["upload_status"] != "ready":
        raise HTTPException(
            409, f"Source is not ready (status: {source.data['upload_status']}). Wait for processing to complete."
        )
    return source.data


# ── Endpoints ─────────────────────────────────────────────────

@router.post("/{source_id}/generate-flashcards", response_model=GenerateFlashcardsResponse)
async def generate_flashcards_endpoint(source_id: UUID) -> GenerateFlashcardsResponse:
    _verify_source_ready(str(source_id))
    try:
        drafts = await generate_flashcards(str(source_id))
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    return GenerateFlashcardsResponse(source_id=str(source_id), drafts=drafts)


@router.post("/{source_id}/generate-quiz", response_model=GenerateQuizResponse)
async def generate_quiz_endpoint(source_id: UUID) -> GenerateQuizResponse:
    _verify_source_ready(str(source_id))
    try:
        drafts = await generate_quiz(str(source_id))
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    return GenerateQuizResponse(source_id=str(source_id), drafts=drafts)


@router.post("/{source_id}/save-flashcards", response_model=SaveFlashcardsResponse, status_code=status.HTTP_201_CREATED)
async def save_flashcards_endpoint(source_id: UUID, body: SaveFlashcardsRequest) -> SaveFlashcardsResponse:
    _verify_source_ready(str(source_id))
    db = get_supabase()
    rows = [
        {
            "source_id": str(source_id),
            "card_type": fc.card_type,
            "front": fc.front,
            "back": fc.back,
            "topic_tag": fc.topic_tag,
        }
        for fc in body.flashcards
    ]
    if rows:
        db.table("flashcards").insert(rows).execute()
    return SaveFlashcardsResponse(saved_count=len(rows))


@router.post("/{source_id}/save-quiz", response_model=SaveQuizResponse, status_code=status.HTTP_201_CREATED)
async def save_quiz_endpoint(source_id: UUID, body: SaveQuizRequest) -> SaveQuizResponse:
    _verify_source_ready(str(source_id))
    db = get_supabase()
    rows = [
        {
            "source_id": str(source_id),
            "question": q.question,
            "choices": q.choices,
            "correct_answer": q.correct_answer,
            "rationale": q.rationale,
            "topic_tag": q.topic_tag,
        }
        for q in body.questions
    ]
    if rows:
        db.table("quiz_questions").insert(rows).execute()
    return SaveQuizResponse(saved_count=len(rows))
