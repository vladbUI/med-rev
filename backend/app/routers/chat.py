"""Chat endpoints: sessions and messages with RAG-powered answers."""
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.services.rag import ask
from app.supabase_client import get_supabase

router = APIRouter(prefix="/chat", tags=["chat"])


# ── Request / response models ────────────────────────────────

class CreateSessionRequest(BaseModel):
    notebook_id: UUID


class SessionResponse(BaseModel):
    id: str
    notebook_id: str
    title: str | None = None
    created_at: str


class SendMessageRequest(BaseModel):
    content: str


class CitedChunk(BaseModel):
    chunk_id: str
    source_id: str
    filename: str
    page_number: int | None = None
    similarity: float | None = None


class MessageResponse(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    cited_chunk_ids: list[str] = []
    cited_chunks: list[CitedChunk] = []
    created_at: str


# ── Endpoints ────────────────────────────────────────────────

@router.post("/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(body: CreateSessionRequest) -> SessionResponse:
    db = get_supabase()
    # Verify the notebook exists
    nb = db.table("notebooks").select("id").eq("id", str(body.notebook_id)).maybe_single().execute()
    if not nb.data:
        raise HTTPException(404, "Notebook not found.")
    row = (
        db.table("chat_sessions")
        .insert({"notebook_id": str(body.notebook_id)})
        .execute()
    )
    return SessionResponse(**row.data[0])


@router.post("/sessions/{session_id}/messages", response_model=MessageResponse)
async def send_message(session_id: UUID, body: SendMessageRequest) -> MessageResponse:
    if not body.content.strip():
        raise HTTPException(400, "Message content cannot be empty.")

    db = get_supabase()

    # Look up the session and its notebook
    session = (
        db.table("chat_sessions")
        .select("id, notebook_id")
        .eq("id", str(session_id))
        .maybe_single()
        .execute()
    )
    if not session.data:
        raise HTTPException(404, "Chat session not found.")

    notebook_id = session.data["notebook_id"]

    # Persist user message
    db.table("chat_messages").insert({
        "session_id": str(session_id),
        "role": "user",
        "content": body.content.strip(),
    }).execute()

    # Run RAG pipeline
    rag_result = await ask(body.content.strip(), notebook_id)

    # Persist assistant message
    assistant_row = (
        db.table("chat_messages")
        .insert({
            "session_id": str(session_id),
            "role": "assistant",
            "content": rag_result.answer,
            "cited_chunk_ids": rag_result.cited_chunk_ids,
        })
        .execute()
    )

    # Build citation metadata for the frontend
    cited_chunks_meta: list[CitedChunk] = []
    for chunk in rag_result.retrieved_chunks:
        if chunk.chunk_id in rag_result.cited_chunk_ids:
            cited_chunks_meta.append(CitedChunk(
                chunk_id=chunk.chunk_id,
                source_id=chunk.source_id,
                filename=chunk.filename,
                page_number=chunk.page_number,
                similarity=chunk.similarity,
            ))

    msg = assistant_row.data[0]
    return MessageResponse(
        id=msg["id"],
        session_id=msg["session_id"],
        role=msg["role"],
        content=msg["content"],
        cited_chunk_ids=msg.get("cited_chunk_ids", []),
        cited_chunks=cited_chunks_meta,
        created_at=msg["created_at"],
    )


@router.get("/sessions/{session_id}/messages", response_model=list[MessageResponse])
async def list_messages(session_id: UUID) -> list[MessageResponse]:
    db = get_supabase()

    # Verify session exists
    session = (
        db.table("chat_sessions")
        .select("id")
        .eq("id", str(session_id))
        .maybe_single()
        .execute()
    )
    if not session.data:
        raise HTTPException(404, "Chat session not found.")

    rows = (
        db.table("chat_messages")
        .select("*")
        .eq("session_id", str(session_id))
        .order("created_at")
        .execute()
    )

    return [
        MessageResponse(
            id=row["id"],
            session_id=row["session_id"],
            role=row["role"],
            content=row["content"],
            cited_chunk_ids=row.get("cited_chunk_ids", []),
            cited_chunks=[],
            created_at=row["created_at"],
        )
        for row in (rows.data or [])
    ]
