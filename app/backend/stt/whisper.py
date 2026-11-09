"""F7 TBM 음성 → 텍스트 (담당: 백엔드·AI).

각자 PC에서 띄운 whisper.cpp 서버(OpenAI 호환 /v1/audio/transcriptions)로 보낸다.
WHISPER_API_KEY 가 있으면 Bearer 키를 붙인다(키를 검사하는 원격 음성 서버용). WHISPER_MODEL 은 기록·표시용이다.
녹음은 동의를 받고, 전사 후 원본 삭제 등 처리 방식을 화면·README에 명시한다(기획서 11장).
"""

from pathlib import Path

import httpx

from config import settings

# 현장 용어를 힌트로 주면 오인식이 줄어든다 (예: 노흉 → 노흥) [팀 설정값]
DEFAULT_PROMPT = "고로 개수, 노흉 축조, 출선구, 송풍, 질소 라인, TBM"


def transcribe(audio_path: Path, prompt: str | None = None) -> str:
    url = settings.whisper_base_url.rstrip("/") + "/audio/transcriptions"
    headers = {"Authorization": f"Bearer {settings.whisper_api_key}"} if settings.whisper_api_key else {}
    with audio_path.open("rb") as f:
        try:
            res = httpx.post(
                url,
                headers=headers,
                files={"file": (audio_path.name, f)},
                data={"model": "whisper", "response_format": "json", "language": "ko", "prompt": prompt or DEFAULT_PROMPT},
                timeout=httpx.Timeout(settings.whisper_timeout, connect=10),
            )
        except httpx.ReadTimeout as e:
            raise RuntimeError(
                f"음성 서버가 {settings.whisper_timeout}초 안에 받아쓰지 못했습니다. "
                "CPU판은 녹음 길이의 2~3배 걸립니다. 녹음을 나누거나 .env 의 WHISPER_TIMEOUT 을 늘리세요"
            ) from e
    if res.status_code == 401:
        raise RuntimeError("음성 서버 API 키가 없거나 틀렸습니다 (.env 의 WHISPER_API_KEY)")
    if res.status_code == 503:
        raise RuntimeError("음성 서버가 다른 녹음을 받아쓰는 중입니다. 잠시 뒤 다시 시도하세요")
    res.raise_for_status()
    return res.json()["text"].strip()
