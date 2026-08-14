"""Content generation: flashcards and board-style MCQs from source chunks."""
import logging
from datetime import datetime, timezone
from uuid import UUID

from pydantic import BaseModel, field_validator

from app.llm_client import LLMClient
from app.supabase_client import get_supabase

logger = logging.getLogger(__name__)

# ── Validation models ────────────────────────────────────────

class FlashcardDraft(BaseModel):
    card_type: str = "basic"
    front: str
    back: str
    topic_tag: str | None = None

    @field_validator("card_type")
    @classmethod
    def validate_card_type(cls, v: str) -> str:
        if v not in ("basic", "cloze"):
            raise ValueError("card_type must be 'basic' or 'cloze'")
        return v


class QuizQuestionDraft(BaseModel):
    question: str
    choices: dict[str, str]
    correct_answer: str
    rationale: str | None = None
    topic_tag: str | None = None

    @field_validator("choices")
    @classmethod
    def validate_choices(cls, v: dict) -> dict:
        if not 4 <= len(v) <= 5:
            raise ValueError("Must have 4–5 answer choices")
        return v

    @field_validator("correct_answer")
    @classmethod
    def validate_correct(cls, v: str, info) -> str:
        choices = info.data.get("choices", {})
        if choices and v not in choices:
            raise ValueError(f"correct_answer '{v}' is not among the choices")
        return v


# ── Prompts ───────────────────────────────────────────────────

FLASHCARD_SYSTEM = """\
You are a study-aid generator for Medical Technology / Medical Laboratory Science students.
Generate flashcards from the provided source text.

Rules:
1. Create a mix of basic question/answer cards and cloze deletion cards.
2. For cloze cards, set card_type to "cloze" and use {{c1::hidden}} notation in the front field.
   The back field should contain the complete sentence with the hidden text revealed.
3. For basic cards, set card_type to "basic".
4. Each card must have a topic_tag that categorises it (e.g. "Hematology", "Urinalysis").
5. Keep questions focused and exam-relevant.
6. Return a JSON array of objects with keys: card_type, front, back, topic_tag.
"""

QUIZ_SYSTEM = """\
You are a board-exam question writer for Medical Technology / Medical Laboratory Science students.
Generate multiple-choice questions from the provided source text.

Rules:
1. Each question must have 4–5 answer choices keyed "A", "B", "C", "D" (and optionally "E").
2. Exactly one choice must be correct, identified by correct_answer (e.g. "A").
3. Include a rationale that explains why each distractor is wrong and the correct answer is right.
4. Each question must have a topic_tag (e.g. "Clinical Chemistry", "Blood Banking").
5. Questions should be board-exam style: clinical vignettes, best-answer, and recall formats.
6. Return a JSON array of objects with keys: question, choices, correct_answer, rationale, topic_tag.
"""

# ── Chunk retrieval ──────────────────────────────────────────

MAX_CHUNKS_PER_BATCH = 20
MAX_CHARS_PER_REQUEST = 24_000  # Stay well under model context limits


def _get_source_chunks(source_id: str) -> list[dict]:
    """Retrieve chunks for a source, bounded to avoid oversized prompts."""
    db = get_supabase()
    rows = (
        db.table("chunks")
        .select("id, content, page_number, chunk_index")
        .eq("source_id", source_id)
        .order("chunk_index")
        .limit(MAX_CHUNKS_PER_BATCH)
        .execute()
    )
    # Further trim if total characters would be too large
    result: list[dict] = []
    total_chars = 0
    for row in rows.data or []:
        total_chars += len(row["content"])
        if total_chars > MAX_CHARS_PER_REQUEST:
            break
        result.append(row)
    return result


def _build_source_text(chunks: list[dict]) -> str:
    """Format chunks into a single text block for the LLM prompt."""
    parts: list[str] = []
    for chunk in chunks:
        page = f"(page {chunk['page_number']})" if chunk.get("page_number") else ""
        parts.append(f"--- Chunk {chunk['chunk_index']} {page} ---\n{chunk['content']}")
    return "\n\n".join(parts)


def _log_generation(source_id: str, feature: str, model: str, chunk_count: int, item_count: int) -> None:
    """Log generation metadata to DB and Python logger. Never logs source text."""
    db = get_supabase()
    try:
        db.table("generation_logs").insert({
            "source_id": source_id,
            "feature": feature,
            "model": model,
            "input_chunk_count": chunk_count,
            "generated_item_count": item_count,
        }).execute()
    except Exception:
        pass  # Don't fail generation if logging fails
    logger.info(
        "generation_complete | source=%s feature=%s model=%s chunks=%d items=%d time=%s",
        source_id, feature, model, chunk_count, item_count,
        datetime.now(timezone.utc).isoformat(),
    )


# ── Public API ───────────────────────────────────────────────

async def generate_flashcards(source_id: str) -> list[FlashcardDraft]:
    """Generate flashcard drafts from a source's chunks."""
    chunks = _get_source_chunks(source_id)
    if not chunks:
        raise ValueError("No chunks found for this source. Is it still processing?")

    source_text = _build_source_text(chunks)
    llm = LLMClient()
    raw = await llm.generate_json(
        FLASHCARD_SYSTEM,
        f"Source material:\n\n{source_text}\n\nGenerate 8–12 flashcards from this material.",
    )

    if not isinstance(raw, list):
        raise ValueError("Model did not return a JSON array.")

    drafts = [FlashcardDraft(**item) for item in raw]
    _log_generation(source_id, "flashcards", "gemini-2.0-flash", len(chunks), len(drafts))
    return drafts


async def generate_quiz(source_id: str) -> list[QuizQuestionDraft]:
    """Generate MCQ drafts from a source's chunks."""
    chunks = _get_source_chunks(source_id)
    if not chunks:
        raise ValueError("No chunks found for this source. Is it still processing?")

    source_text = _build_source_text(chunks)
    llm = LLMClient()
    raw = await llm.generate_json(
        QUIZ_SYSTEM,
        f"Source material:\n\n{source_text}\n\nGenerate 5–8 board-style multiple-choice questions.",
    )

    if not isinstance(raw, list):
        raise ValueError("Model did not return a JSON array.")

    drafts = [QuizQuestionDraft(**item) for item in raw]
    _log_generation(source_id, "quiz", "gemini-2.0-flash", len(chunks), len(drafts))
    return drafts
