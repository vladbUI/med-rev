import tempfile
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.config import get_settings
from app.llm_client import LLMClient
from app.services.ingestion import ALLOWED_EXTENSIONS, chunk_sections, extract_text
from app.supabase_client import get_supabase

router = APIRouter(prefix="/sources", tags=["sources"])


class SourceStatus(BaseModel):
    id: UUID
    filename: str
    upload_status: str
    error_message: str | None = None


def _source_row(source_id: str) -> dict:
    response = get_supabase().table("sources").select("id, filename, upload_status, error_message").eq("id", source_id).single().execute()
    return response.data


async def process_source(source_id: str, storage_path: str, content_type: str, local_path: Path) -> None:
    db = get_supabase()
    settings = get_settings()
    try:
        # 1. Upload to Supabase Storage in the background
        contents = local_path.read_bytes()
        try:
            db.storage.from_(settings.storage_bucket).upload(
                storage_path,
                contents,
                {"content-type": content_type or "application/octet-stream"},
            )
        except Exception:
            pass  # If already uploaded or warning, continue with text extraction

        # 2. Extract text and create chunks
        db.table("sources").update({"upload_status": "extracting"}).eq("id", source_id).execute()
        sections = extract_text(local_path)
        chunks = chunk_sections(sections)
        if not chunks:
            raise ValueError("No readable text was found in this document.")

        # 3. Concurrent vector embeddings
        db.table("sources").update({"upload_status": "embedding"}).eq("id", source_id).execute()
        embeddings = await LLMClient().embed([chunk.content for chunk in chunks])

        # 4. Batch insert chunks in groups of 50
        rows = [
            {
                "source_id": source_id,
                "content": chunk.content,
                "embedding": str(vector),
                "page_number": chunk.page_number,
                "chunk_index": chunk.chunk_index,
            }
            for chunk, vector in zip(chunks, embeddings, strict=True)
        ]

        batch_size = 50
        for i in range(0, len(rows), batch_size):
            db.table("chunks").insert(rows[i:i + batch_size]).execute()

        # 5. Mark as ready
        db.table("sources").update({"upload_status": "ready", "error_message": None}).eq("id", source_id).execute()
    except Exception as error:
        db.table("sources").update({"upload_status": "failed", "error_message": str(error)[:500]}).eq("id", source_id).execute()
    finally:
        local_path.unlink(missing_ok=True)


@router.post("/upload", response_model=SourceStatus, status_code=status.HTTP_202_ACCEPTED)
async def upload_source(background_tasks: BackgroundTasks, notebook_id: UUID, file: UploadFile = File(...)) -> SourceStatus:
    if not file.filename:
        raise HTTPException(400, "A filename is required.")
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(415, "Supported file types: PDF, PPTX, DOCX.")
    settings = get_settings()
    contents = await file.read()
    if len(contents) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"Files must be {settings.max_upload_mb} MB or smaller.")
    
    db = get_supabase()
    source_id = str(uuid4())
    storage_path = f"{notebook_id}/{source_id}{suffix}"

    temp_dir = Path(tempfile.mkdtemp(prefix="medtech-source-"))
    local_path = temp_dir / f"source{suffix}"
    local_path.write_bytes(contents)

    try:
        db.table("sources").insert({
            "id": source_id,
            "notebook_id": str(notebook_id),
            "filename": file.filename,
            "storage_path": storage_path,
            "upload_status": "processing",
        }).execute()
    except Exception as error:
        local_path.unlink(missing_ok=True)
        raise HTTPException(502, f"Could not register source: {error}") from error

    background_tasks.add_task(
        process_source,
        source_id,
        storage_path,
        file.content_type or "application/octet-stream",
        local_path,
    )
    return SourceStatus(**_source_row(source_id))


@router.get("/{source_id}/status", response_model=SourceStatus)
async def source_status(source_id: UUID) -> SourceStatus:
    try:
        return SourceStatus(**_source_row(str(source_id)))
    except Exception as error:
        raise HTTPException(404, "Source not found.") from error


from app.services.chapter_splitter import (
    ChapterItem,
    detect_chapters,
    extract_chapter_sections,
)


class DetectChaptersResponse(BaseModel):
    filename: str
    chapters: list[ChapterItem]
    total_chapters: int


async def process_chapter_source(
    source_id: str,
    sections: list,
) -> None:
    db = get_supabase()
    try:
        chunks = chunk_sections(sections)
        if not chunks:
            raise ValueError("No readable text found in this chapter section.")

        # 1. Concurrent vector embeddings
        db.table("sources").update({"upload_status": "embedding"}).eq("id", source_id).execute()
        embeddings = await LLMClient().embed([chunk.content for chunk in chunks])

        # 2. Batch insert chunks in groups of 50
        rows = [
            {
                "source_id": source_id,
                "content": chunk.content,
                "embedding": str(vector),
                "page_number": chunk.page_number,
                "chunk_index": chunk.chunk_index,
            }
            for chunk, vector in zip(chunks, embeddings, strict=True)
        ]

        batch_size = 50
        for i in range(0, len(rows), batch_size):
            db.table("chunks").insert(rows[i : i + batch_size]).execute()

        # 3. Ready
        db.table("sources").update({"upload_status": "ready", "error_message": None}).eq("id", source_id).execute()
    except Exception as error:
        db.table("sources").update({"upload_status": "failed", "error_message": str(error)[:500]}).eq("id", source_id).execute()


@router.post("/detect-chapters", response_model=DetectChaptersResponse)
async def detect_document_chapters(file: UploadFile = File(...)) -> DetectChaptersResponse:
    if not file.filename:
        raise HTTPException(400, "A filename is required.")
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(415, "Supported file types: PDF, PPTX, DOCX.")

    settings = get_settings()
    contents = await file.read()
    if len(contents) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"Files must be {settings.max_upload_mb} MB or smaller.")

    temp_dir = Path(tempfile.mkdtemp(prefix="medtech-detect-"))
    local_path = temp_dir / f"detect{suffix}"
    local_path.write_bytes(contents)

    try:
        chapters = detect_chapters(local_path)
        return DetectChaptersResponse(
            filename=file.filename,
            chapters=chapters,
            total_chapters=len(chapters),
        )
    finally:
        local_path.unlink(missing_ok=True)


@router.post("/upload-chapters", response_model=list[SourceStatus], status_code=status.HTTP_202_ACCEPTED)
async def upload_chapters(
    background_tasks: BackgroundTasks,
    notebook_id: UUID,
    chapters_json: str = Form(...),
    file: UploadFile = File(...),
) -> list[SourceStatus]:
    import json

    if not file.filename:
        raise HTTPException(400, "A filename is required.")
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(415, "Supported file types: PDF, PPTX, DOCX.")

    try:
        selected_raw = json.loads(chapters_json)
        selected_chapters = [ChapterItem(**c) for c in selected_raw]
    except Exception as err:
        raise HTTPException(400, f"Invalid chapters list: {err}")

    if not selected_chapters:
        raise HTTPException(400, "At least one chapter must be selected.")

    settings = get_settings()
    contents = await file.read()
    if len(contents) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"Files must be {settings.max_upload_mb} MB or smaller.")

    db = get_supabase()
    temp_dir = Path(tempfile.mkdtemp(prefix="medtech-chapters-"))
    local_path = temp_dir / f"book{suffix}"
    local_path.write_bytes(contents)

    created_statuses: list[SourceStatus] = []
    base_name = Path(file.filename).stem

    try:
        # Pre-extract sections for all selected chapters in milliseconds
        chapter_sections_map = {}
        for ch in selected_chapters:
            sections = extract_chapter_sections(local_path, ch.start_page, ch.end_page)
            chapter_sections_map[ch.index] = sections

        # Upload original file once to storage in background
        book_storage_path = f"{notebook_id}/books/{uuid4()}{suffix}"
        try:
            db.storage.from_(settings.storage_bucket).upload(
                book_storage_path,
                contents,
                {"content-type": file.content_type or "application/octet-stream"},
            )
        except Exception:
            pass

        for ch in selected_chapters:
            source_id = str(uuid4())
            chapter_filename = f"{base_name} — {ch.title}"
            storage_path = f"{notebook_id}/{source_id}{suffix}"

            db.table("sources").insert({
                "id": source_id,
                "notebook_id": str(notebook_id),
                "filename": chapter_filename,
                "storage_path": storage_path,
                "upload_status": "processing",
            }).execute()

            created_statuses.append(SourceStatus(**_source_row(source_id)))

            sections = chapter_sections_map.get(ch.index, [])
            background_tasks.add_task(
                process_chapter_source,
                source_id,
                sections,
            )
    finally:
        local_path.unlink(missing_ok=True)

    return created_statuses


@router.get("/list/{notebook_id}", response_model=list[SourceStatus])
async def list_sources(notebook_id: UUID) -> list[SourceStatus]:
    db = get_supabase()
    rows = (
        db.table("sources")
        .select("id, filename, upload_status, error_message")
        .eq("notebook_id", str(notebook_id))
        .order("created_at", desc=True)
        .execute()
    )
    return [SourceStatus(**row) for row in (rows.data or [])]



