from functools import lru_cache
from supabase import Client, create_client
from app.config import get_settings


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """Return a cached, persistent Supabase client with connection keep-alive."""
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to backend/.env.")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
