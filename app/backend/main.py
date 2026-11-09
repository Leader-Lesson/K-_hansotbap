"""FastAPI 진입점. 실행: (app/backend 에서) uv run uvicorn main:app --reload --port 8000"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import adjustments, baseline, conflicts, health, plans, sops
from config import settings

app = FastAPI(title="한솥밥 API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(baseline.router, prefix="/api")
app.include_router(plans.router, prefix="/api")
app.include_router(conflicts.router, prefix="/api")
app.include_router(adjustments.router, prefix="/api")
app.include_router(sops.router, prefix="/api")
