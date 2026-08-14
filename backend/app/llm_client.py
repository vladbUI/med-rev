"""Provider boundary for Gemini calls. Routers and services must use this module."""
import asyncio
import json
from google import genai
from google.genai import types
from app.config import get_settings


_shared_client: genai.Client | None = None


class LLMClient:
    def __init__(self) -> None:
        global _shared_client
        if _shared_client is None:
            api_key = get_settings().gemini_api_key
            if not api_key:
                raise RuntimeError("Gemini is not configured. Add GEMINI_API_KEY to backend/.env.")
            _shared_client = genai.Client(api_key=api_key)
        self.client = _shared_client

    async def embed(self, texts: list[str], batch_size: int = 40) -> list[list[float]]:
        """Generate normalized, 768-dimensional vectors with concurrent batching."""
        if not texts:
            return []

        async def _embed_batch(batch: list[str]) -> list[list[float]]:
            result = await asyncio.to_thread(
                self.client.models.embed_content,
                model="gemini-embedding-001",
                contents=batch,
                config={"output_dimensionality": 768},
            )
            return [item.values for item in result.embeddings]

        batches = [texts[i:i + batch_size] for i in range(0, len(texts), batch_size)]
        semaphore = asyncio.Semaphore(4)

        async def _run_batch(b: list[str]) -> list[list[float]]:
            async with semaphore:
                return await _embed_batch(b)

        results = await asyncio.gather(*[_run_batch(b) for b in batches])
        flat: list[list[float]] = []
        for r in results:
            flat.extend(r)
        return flat

    async def generate(self, system_prompt: str, user_message: str) -> str:
        """Generate a text response using Gemini."""
        result = await asyncio.to_thread(
            self.client.models.generate_content,
            model="gemini-3-flash-preview",
            contents=user_message,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.3,
            ),
        )
        return result.text or ""

    async def generate_json(self, system_prompt: str, user_message: str) -> list | dict:
        """Generate a structured JSON response. Returns parsed Python object."""
        result = await asyncio.to_thread(
            self.client.models.generate_content,
            model="gemini-3-flash-preview",
            contents=user_message,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
                temperature=0.4,
            ),
        )
        text = result.text or "[]"
        return json.loads(text)
