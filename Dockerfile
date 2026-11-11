# 배포용 단일 컨테이너: 프론트를 빌드해 FastAPI가 같이 내준다 (Render 무료 플랜. 포트는 PORT 환경변수, 없으면 7860)
FROM node:24-slim AS web
WORKDIR /src/app/frontend
COPY app/frontend/package.json app/frontend/package-lock.json ./
RUN npm install --no-audit --no-fund
COPY app/frontend/ ./
RUN npm run build

FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.8.4 /uv /usr/local/bin/uv
RUN useradd -m -u 1000 user
WORKDIR /home/user/repo
COPY --chown=user app/backend/pyproject.toml app/backend/uv.lock app/backend/.python-version app/backend/
RUN cd app/backend && UV_PYTHON_DOWNLOADS=never uv sync --locked && chown -R user /home/user/repo
COPY --chown=user app/backend/ app/backend/
COPY --chown=user app/samples/ app/samples/
COPY --chown=user --from=web /src/app/frontend/dist app/frontend/dist
USER user
WORKDIR /home/user/repo/app/backend
ENV PATH="/home/user/repo/app/backend/.venv/bin:$PATH" \
    LLM_PROVIDER=claude CHAT_PROVIDER=claude CHAT_MODEL=claude-haiku-5-5 \
    CORS_ORIGINS='["*"]'
EXPOSE 7860
# 컨테이너가 켜질 때마다 시연 시작 상태로 시드한다
CMD ["sh", "-c", "python -m db.seed && uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
