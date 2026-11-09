"""F7 TBM 음성 → 텍스트 (담당: 백엔드·AI).

모델: large-v3-turbo(속도) / large-v3(정확도), WHISPER_MODEL 설정으로 선택.
팀 PC에 준비된 Whisper 실행 방식(openai-whisper, faster-whisper 등)에 맞춰 transcribe 를 채운다.
녹음은 동의를 받고, 전사 후 원본 삭제 등 처리 방식을 화면·README에 명시한다(기획서 11장).
"""

from pathlib import Path

from config import settings


def transcribe(audio_path: Path, model: str | None = None) -> str:
    model = model or settings.whisper_model
    raise NotImplementedError(f"TODO(F7): Whisper {model} 연결")
