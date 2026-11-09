"""LLMProvider: Claude API 와 LM Studio(OpenAI 호환 로컬 API)를 같은 인터페이스로 감싼다.

LLM은 추출·위치 매핑·사유 설명·조정안 문장만 맡는다. 판정은 rules/ 가 한다.
LLM_PROVIDER 환경변수로 전환한다 (API 장애 시 lmstudio 로 바꿔 시연을 이어간다).
"""

from typing import Protocol

from config import settings


class LLMProvider(Protocol):
    name: str

    def complete(self, system: str, user: str, max_tokens: int = 2048) -> str: ...

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class ClaudeProvider:
    name = "claude"

    def __init__(self) -> None:
        import anthropic

        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY 가 .env 에 없습니다")
        self._client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        self._model = settings.claude_model

    def complete(self, system: str, user: str, max_tokens: int = 2048) -> str:
        msg = self._client.messages.create(
            model=self._model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return "".join(block.text for block in msg.content if block.type == "text")

    def embed(self, texts: list[str]) -> list[list[float]]:
        # Claude API에는 임베딩이 없다 → F8 임베딩은 LM Studio를 쓴다
        return LMStudioProvider().embed(texts)


class LMStudioProvider:
    name = "lmstudio"

    def __init__(self) -> None:
        from openai import OpenAI

        self._client = OpenAI(base_url=settings.lmstudio_base_url, api_key="lm-studio")

    def complete(self, system: str, user: str, max_tokens: int = 2048) -> str:
        res = self._client.chat.completions.create(
            model=settings.lmstudio_chat_model,
            max_tokens=max_tokens,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        )
        return res.choices[0].message.content or ""

    def embed(self, texts: list[str]) -> list[list[float]]:
        res = self._client.embeddings.create(model=settings.lmstudio_embedding_model, input=texts)
        return [d.embedding for d in res.data]


def get_provider() -> LLMProvider:
    if settings.llm_provider == "lmstudio":
        return LMStudioProvider()
    return ClaudeProvider()
