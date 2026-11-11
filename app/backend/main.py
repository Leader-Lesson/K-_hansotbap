"""FastAPI 진입점. 실행: (app/backend 에서) uv run uvicorn main:app --reload --port 8000"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import adjustments, baseline, chat, conflicts, health, history, plans, risk, shares, sops, tbm
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
app.include_router(risk.router, prefix="/api")
app.include_router(shares.router, prefix="/api")
app.include_router(history.router, prefix="/api")
app.include_router(sops.router, prefix="/api")
app.include_router(tbm.router, prefix="/api")
app.include_router(chat.router, prefix="/api")

# 배포용: 빌드된 프론트(app/frontend/dist)가 있으면 API와 같은 서버에서 화면을 내준다.
# 로컬 개발(npm run dev)에는 dist 가 없으므로 영향이 없다. /api 라우터를 먼저 등록해야 화면이 API를 가리지 않는다
from pathlib import Path  # noqa: E402

from fastapi.staticfiles import StaticFiles  # noqa: E402

_DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"
if _DIST.is_dir():
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="web")
