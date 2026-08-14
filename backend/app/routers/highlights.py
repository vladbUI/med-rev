"""Highlights router: endpoints to retrieve and generate key concepts for sources."""
from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.services.highlights import (
    HighlightsData,
    generate_and_save_highlights,
    get_existing_highlights,
)
from app.supabase_client import get_supabase

router = APIRouter(prefix="/sources", tags=["highlights"])


def _verify_source_ready(source_id: str) -> dict:
    db = get_supabase()
    source = (
        db.table("sources")
        .select("id, filename, upload_status")
        .eq("id", source_id)
        .maybe_single()
        .execute()
    )
    if not source.data:
        raise HTTPException(404, "Source not found.")
    if source.data["upload_status"] != "ready":
        raise HTTPException(
            409,
            f"Source is not ready (status: {source.data['upload_status']}). Wait for processing to complete.",
        )
    return source.data


@router.get("/{source_id}/highlights", response_model=HighlightsData | None)
async def get_source_highlights(source_id: UUID) -> HighlightsData | None:
    _verify_source_ready(str(source_id))
    existing = get_existing_highlights(str(source_id))
    if not existing:
        return None
    return HighlightsData(
        topic_tag=existing.get("topic_tag"),
        key_takeaways=existing.get("key_takeaways", []),
        lab_values=existing.get("lab_values", []),
        key_terms=existing.get("key_terms", []),
        highlighted_passages=existing.get("highlighted_passages", []),
    )


@router.post("/{source_id}/highlights/generate", response_model=HighlightsData, status_code=status.HTTP_200_OK)
async def generate_source_highlights(source_id: UUID) -> HighlightsData:
    _verify_source_ready(str(source_id))
    try:
        data = await generate_and_save_highlights(str(source_id))
        return data
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
