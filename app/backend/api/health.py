from fastapi import APIRouter

from config import settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "llm_provider": settings.llm_provider}
