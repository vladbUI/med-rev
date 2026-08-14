"""Notebooks router: list and create notebooks."""
from uuid import UUID
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.supabase_client import get_supabase

router = APIRouter(prefix="/notebooks", tags=["notebooks"])


class NotebookItem(BaseModel):
    id: str
    title: str
    subject_tag: str | None = None
    created_at: str


class CreateNotebookRequest(BaseModel):
    title: str
    subject_tag: str | None = None


DEFAULT_NOTEBOOKS = ["Hematology", "Clinical Chemistry", "Microbiology", "Blood Banking"]


def _get_or_create_demo_user_id() -> str:
    db = get_supabase()
    try:
        users = db.auth.admin.list_users()
        if users:
            return users[0].id
        user = db.auth.admin.create_user({
            "email": "demo@medtech.local",
            "password": "DemoPassword123!",
            "email_confirm": True,
        })
        return user.user.id
    except Exception:
        # Fallback if admin auth is not enabled
        return "00000000-0000-0000-0000-000000000000"


@router.get("", response_model=list[NotebookItem])
async def list_notebooks() -> list[NotebookItem]:
    db = get_supabase()
    rows = db.table("notebooks").select("*").order("created_at").execute()

    if not rows.data:
        # Auto-seed default notebooks
        user_id = _get_or_create_demo_user_id()
        for title in DEFAULT_NOTEBOOKS:
            db.table("notebooks").insert({
                "user_id": user_id,
                "title": title,
                "subject_tag": title,
            }).execute()
        rows = db.table("notebooks").select("*").order("created_at").execute()

    return [NotebookItem(**row) for row in (rows.data or [])]


@router.post("", response_model=NotebookItem, status_code=status.HTTP_201_CREATED)
async def create_notebook(body: CreateNotebookRequest) -> NotebookItem:
    if not body.title.strip():
        raise HTTPException(400, "Notebook title cannot be empty.")

    db = get_supabase()
    user_id = _get_or_create_demo_user_id()
    row = (
        db.table("notebooks")
        .insert({
            "user_id": user_id,
            "title": body.title.strip(),
            "subject_tag": body.subject_tag or body.title.strip(),
        })
        .execute()
    )
    return NotebookItem(**row.data[0])
