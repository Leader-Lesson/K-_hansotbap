"""환경 설정. 값은 저장소 루트의 .env 에서 읽는다 (.env 는 커밋 금지, .env.example 참고)."""

from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_DIR.parents[1]
DATA_DIR = BACKEND_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    # LLM — LLMProvider 하나로 감싸고 설정으로 전환한다
    llm_provider: Literal["claude", "lmstudio"] = "claude"
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-5-5"
    lmstudio_base_url: str = "http://localhost:1234/v1"
    lmstudio_chat_model: str = ""
    lmstudio_embedding_model: str = ""

    # F7 음성인식: large-v3-turbo(속도) / large-v3(정확도)
    whisper_model: Literal["large-v3-turbo", "large-v3"] = "large-v3-turbo"

    # DB·서버
    db_path: Path = BACKEND_DIR / "hansotbap.db"
    cors_origins: list[str] = ["http://localhost:5173"]

    # 시연 기준: 광양 2고로 개수 D0
    project_d0: str = "2026-11-12"


settings = Settings()
