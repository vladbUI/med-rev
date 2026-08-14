"""Highlights and Key Concepts extraction service."""
import logging
from datetime import datetime, timezone
from pydantic import BaseModel, Field

from app.llm_client import LLMClient
from app.supabase_client import get_supabase

logger = logging.getLogger(__name__)


# ── Models ───────────────────────────────────────────────────

class LabValueItem(BaseModel):
    analyte: str
    range_or_value: str
    unit: str | None = None
    significance: str | None = None


class KeyTermItem(BaseModel):
    term: str
    definition: str
    note: str | None = None


class PassageItem(BaseModel):
    chunk_index: int | None = None
    page_number: int | None = None
    context: str
    highlight: str


class HighlightsData(BaseModel):
    topic_tag: str | None = None
    key_takeaways: list[str] = Field(default_factory=list)
    lab_values: list[LabValueItem] = Field(default_factory=list)
    key_terms: list[KeyTermItem] = Field(default_factory=list)
    highlighted_passages: list[PassageItem] = Field(default_factory=list)


# ── System Prompt ────────────────────────────────────────────

HIGHLIGHTS_SYSTEM = """\
You are an expert medical educator specializing in Medical Technology and Medical Laboratory Science (MLS/MT).
Analyze the provided source text and extract high-yield review highlights and key study concepts.

Generate a comprehensive JSON object with the following schema:
{
  "topic_tag": "Subject Area (e.g. Hematology, Clinical Chemistry, Immunohematology, Microbiology, Urinalysis)",
  "key_takeaways": [
    "High-yield bullet points summarizing the most important diagnostic concepts, pathognomonic findings, or procedural principles."
  ],
  "lab_values": [
    {
      "analyte": "Analyte or test name (e.g. Hemoglobin, Platelets, Fasting Glucose, Sodium)",
      "range_or_value": "Normal reference interval or cutoff value (e.g. 12.0-16.0, 150,000-450,000, 70-99)",
      "unit": "Measurement unit (e.g. g/dL, /mcL, mg/dL, mmol/L)",
      "significance": "Clinical meaning of critical high or low values (e.g. Low indicates anemia; high indicates polycythemia)"
    }
  ],
  "key_terms": [
    {
      "term": "Medical or laboratory term (e.g. Rouleaux formation, Left shift, Bence-Jones protein)",
      "definition": "Clear concise definition or diagnostic significance",
      "note": "Exam tip or common pitfall"
    }
  ],
  "highlighted_passages": [
    {
      "chunk_index": 0,
      "page_number": 1,
      "context": "Surrounding context sentence from the document",
      "highlight": "Exact critical phrase or sentence within the context that should be visually highlighted"
    }
  ]
}

Rules:
1. Focus strictly on Medical Technology / MLS board exam topics and verified laboratory facts.
2. If lab values or reference ranges are discussed in the text, extract them accurately into lab_values.
3. For key_takeaways, provide 4-8 clear, high-yield takeaways.
4. For key_terms, extract 4-10 essential terms with MLS-tailored definitions.
5. For highlighted_passages, extract 3-6 critical excerpts and specify the exact phrase inside it to highlight.
6. Return only valid JSON.
"""

MAX_CHUNKS = 25
MAX_CHARS = 28_000


def _get_source_chunks(source_id: str) -> list[dict]:
    db = get_supabase()
    rows = (
        db.table("chunks")
        .select("id, content, page_number, chunk_index")
        .eq("source_id", source_id)
        .order("chunk_index")
        .limit(MAX_CHUNKS)
        .execute()
    )
    result = []
    total_chars = 0
    for row in rows.data or []:
        total_chars += len(row["content"])
        if total_chars > MAX_CHARS:
            break
        result.append(row)
    return result


def _build_source_text(chunks: list[dict]) -> str:
    parts: list[str] = []
    for chunk in chunks:
        page = f"(page {chunk['page_number']})" if chunk.get("page_number") else ""
        parts.append(f"--- Chunk {chunk['chunk_index']} {page} ---\n{chunk['content']}")
    return "\n\n".join(parts)


def get_existing_highlights(source_id: str) -> dict | None:
    db = get_supabase()
    try:
        row = (
            db.table("source_highlights")
            .select("*")
            .eq("source_id", source_id)
            .maybe_single()
            .execute()
        )
        return row.data if row else None
    except Exception:
        return None


async def generate_and_save_highlights(source_id: str) -> HighlightsData:
    chunks = _get_source_chunks(source_id)
    if not chunks:
        raise ValueError("No chunks found for this source. Is it still processing?")

    source_text = _build_source_text(chunks)
    llm = LLMClient()
    raw = await llm.generate_json(
        HIGHLIGHTS_SYSTEM,
        f"Source study document text:\n\n{source_text}\n\nExtract key highlights, lab values, and definitions.",
    )

    if not isinstance(raw, dict):
        raise ValueError("Model did not return a JSON object for highlights.")

    data = HighlightsData(**raw)

    db = get_supabase()
    db.table("source_highlights").upsert({
        "source_id": source_id,
        "topic_tag": data.topic_tag,
        "key_takeaways": data.key_takeaways,
        "lab_values": [lv.model_dump() for lv in data.lab_values],
        "key_terms": [kt.model_dump() for kt in data.key_terms],
        "highlighted_passages": [hp.model_dump() for hp in data.highlighted_passages],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }, on_conflict="source_id").execute()

    logger.info("Generated and saved highlights for source %s", source_id)
    return data
