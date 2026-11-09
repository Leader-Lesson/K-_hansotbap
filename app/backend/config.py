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
    llm_provider: Literal["claude", "unsloth", "lmstudio"] = "claude"
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-5-5"
    # 추출 품질·속도 조절. 시연 응답 시간을 보고 정한다 [팀 설정값]
    llm_effort: Literal["low", "medium", "high", "xhigh", "max"] = "medium"
    # 안전 분류기가 요청을 거절하면 서버가 권장 모델로 다시 돌린다 (fallbacks: "default")
    llm_fallbacks: bool = True
    # 로컬 LLM 노트북의 Unsloth Studio (OpenAI 호환 API)
    unsloth_base_url: str = "http://localhost:8888/v1"
    unsloth_api_key: str = ""
    unsloth_chat_model: str = ""
    unsloth_embedding_model: str = ""
    # 각자 PC의 LM Studio 로컬 서버 (OpenAI 호환 API, 기본 포트 1234)
    lmstudio_base_url: str = "http://localhost:1234/v1"
    lmstudio_api_key: str = ""  # LM Studio에서 인증을 켰을 때만
    lmstudio_chat_model: str = ""
    lmstudio_embedding_model: str = ""
    # F8 임베딩을 받을 로컬 서버. LLM_PROVIDER 와 따로 고른다 (Claude API에는 임베딩이 없다)
    embedding_provider: Literal["unsloth", "lmstudio"] = "unsloth"

    # F7 음성인식: large-v3-turbo(속도) / large-v3(정확도)
    whisper_model: Literal["large-v3-turbo", "large-v3"] = "large-v3-turbo"
    # 각자 PC에서 띄운 whisper.cpp 서버. 백엔드 API(8000)와 겹치지 않게 8090 [팀 설정값]
    whisper_base_url: str = "http://127.0.0.1:8090/v1"
    whisper_api_key: str = ""  # 키를 검사하는 원격 음성 서버를 쓸 때만
    # 받아쓰기 응답 대기(초). NVIDIA GPU 없는 PC(CPU판)는 녹음 길이의 약 2.5배 걸린다
    # (i5-10210U: 90초 녹음 → 219초). 10분 TBM 녹음까지 받도록 30분 [팀 설정값]
    whisper_timeout: int = 1800

    # DB·서버
    db_path: Path = BACKEND_DIR / "hansotbap.db"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:5174"]

    # 시연 기준: 광양 2고로 개수 D0
    project_d0: str = "2026-11-12"


settings = Settings()
