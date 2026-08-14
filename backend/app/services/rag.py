"""RAG pipeline: embed question → retrieve chunks → generate cited answer."""
import re
from dataclasses import dataclass, field
from uuid import UUID

from app.llm_client import LLMClient
from app.supabase_client import get_supabase

SYSTEM_PROMPT = """\
You are a study assistant for Medical Technology / Medical Laboratory Science students.
Answer the student's question using ONLY the context blocks provided below.

Rules:
1. If the provided context does not contain enough information to answer, say exactly:
   "I don't have enough information in your sources to answer that."
2. Cite every factual claim by appending one or more chunk IDs in square brackets,
   for example: "Red blood cells carry oxygen [chunk_abc123]."
3. You may combine information from multiple chunks but never invent facts.
4. Keep answers clear and concise, suitable for exam review.
5. Use the chunk IDs exactly as given — do not modify or abbreviate them.
"""


@dataclass
class RetrievedChunk:
    chunk_id: str
    source_id: str
    content: str
    page_number: int | None
    filename: str
    similarity: float


@dataclass
class RAGResult:
    answer: str
    cited_chunk_ids: list[str] = field(default_factory=list)
    retrieved_chunks: list[RetrievedChunk] = field(default_factory=list)


async def ask(question: str, notebook_id: str, match_count: int = 8) -> RAGResult:
    """Run the full RAG pipeline for a single question."""
    llm = LLMClient()

    # 1. Embed the question
    vectors = await llm.embed([question])
    query_embedding = vectors[0]

    # 2. Retrieve matching chunks via the match_chunks RPC
    db = get_supabase()
    response = db.rpc(
        "match_chunks",
        {
            "query_embedding": str(query_embedding),
            "target_notebook_id": notebook_id,
            "match_count": match_count,
        },
    ).execute()

    chunks = [
        RetrievedChunk(
            chunk_id=row["chunk_id"],
            source_id=row["source_id"],
            content=row["content"],
            page_number=row["page_number"],
            filename=row["filename"],
            similarity=row["similarity"],
        )
        for row in (response.data or [])
    ]

    if not chunks:
        return RAGResult(
            answer="I don't have enough information in your sources to answer that. "
                   "Please upload study materials first.",
            cited_chunk_ids=[],
            retrieved_chunks=[],
        )

    # 3. Build context blocks
    context_lines: list[str] = []
    valid_ids: set[str] = set()
    for chunk in chunks:
        tag = f"chunk_{chunk.chunk_id}"
        valid_ids.add(tag)
        page_info = f"page {chunk.page_number}" if chunk.page_number else "no page"
        context_lines.append(
            f"[{tag}] from {chunk.filename}, {page_info}:\n{chunk.content}"
        )

    context_block = "\n\n---\n\n".join(context_lines)
    user_message = f"Context:\n\n{context_block}\n\n---\n\nQuestion: {question}"

    # 4. Generate answer
    answer = await llm.generate(SYSTEM_PROMPT, user_message)

    # 5. Parse and validate citations
    raw_citations = re.findall(r"\[chunk_([a-f0-9\-]+)\]", answer)
    cited = []
    for cid in raw_citations:
        tag = f"chunk_{cid}"
        if tag in valid_ids and cid not in cited:
            cited.append(cid)

    # Strip invalid citations from the answer text
    def _replace_invalid(match: re.Match) -> str:
        tag = match.group(0)[1:-1]  # Remove brackets
        return match.group(0) if tag in valid_ids else ""

    cleaned_answer = re.sub(r"\[chunk_[a-f0-9\-]+\]", _replace_invalid, answer).strip()

    return RAGResult(
        answer=cleaned_answer,
        cited_chunk_ids=cited,
        retrieved_chunks=chunks,
    )
