from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import sources, chat, generate, review, highlights, notebooks

app = FastAPI(title="MedTech MLS Review API", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(notebooks.router)
app.include_router(sources.router)
app.include_router(chat.router)
app.include_router(generate.router)
app.include_router(review.router)
app.include_router(highlights.router)

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
