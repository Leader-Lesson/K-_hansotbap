"""LLMProvider: Claude API, Unsloth Studio·LM Studio(OpenAI 호환 로컬 API)를 같은 인터페이스로 감싼다.

LLM은 추출·위치 매핑·사유 설명·조정안 문장만 맡는다. 판정은 rules/ 가 한다.
LLM_PROVIDER 환경변수로 전환한다 (API 장애 시 unsloth·lmstudio 로 바꿔 시연을 이어간다).
"""

import json
import logging
import re
from typing import Protocol, TypeVar

from pydantic import BaseModel, ValidationError

from config import settings

log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class LLMExtractionError(RuntimeError):
    """구조화 출력을 받지 못함 (거절·잘림·형식 오류). API 연결 오류는 SDK 예외 그대로 올린다."""


class LLMProvider(Protocol):
    name: str
    model: str

    def complete(self, system: str, user: str, max_tokens: int = 2048) -> str: ...

    def extract(self, system: str, user: str, schema: type[T], max_tokens: int = 16000) -> T:
        """schema 모양의 JSON을 받아 검증한 객체를 돌려준다. system 은 매번 같게 둬서 캐시되게 한다."""
        ...

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class ClaudeProvider:
    name = "claude"

    def __init__(self) -> None:
        import anthropic

        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY 가 .env 에 없습니다")
        self._client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        self.model = settings.claude_model

    def complete(self, system: str, user: str, max_tokens: int = 2048) -> str:
        msg = self._client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return "".join(block.text for block in msg.content if block.type == "text")

    def extract(self, system: str, user: str, schema: type[T], max_tokens: int = 16000) -> T:
        kwargs = dict(
            model=self.model,
            max_tokens=max_tokens,
            # 시스템 프롬프트(규칙·구역표·작업 분해표)는 고정 → 캐시해 두 번째 계획서부터 입력 비용을 줄인다
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user}],
            output_format=schema,
            output_config={"effort": settings.llm_effort},
        )
        if settings.llm_fallbacks:
            res = self._client.beta.messages.parse(
                betas=["server-side-fallback-2026-07-01"], fallbacks="default", **kwargs
            )
        else:
            res = self._client.messages.parse(**kwargs)
        usage = res.usage
        log.info(
            "claude extract model=%s stop=%s in=%s cache_read=%s cache_write=%s out=%s",
            res.model, res.stop_reason, usage.input_tokens, usage.cache_read_input_tokens,
            usage.cache_creation_input_tokens, usage.output_tokens,
        )
        if res.stop_reason == "refusal":
            category = getattr(getattr(res, "stop_details", None), "category", None)
            raise LLMExtractionError(f"모델이 요청을 거절했습니다 (분류: {category})")
        if res.stop_reason == "max_tokens":
            raise LLMExtractionError("출력이 max_tokens 에서 잘렸습니다. 계획서를 나눠 올려 주세요")
        if res.parsed_output is None:
            raise LLMExtractionError("구조화 출력을 받지 못했습니다")
        self.model = res.model  # 대체 모델이 답했으면 그 이름을 기록한다
        return res.parsed_output

    def embed(self, texts: list[str]) -> list[list[float]]:
        # Claude API에는 임베딩이 없다 → F8 임베딩은 EMBEDDING_PROVIDER 의 로컬 서버를 쓴다
        return _LOCAL[settings.embedding_provider]().embed(texts)


_THINK = re.compile(r"<think>.*?</think>", re.DOTALL)
# Qwen 계열은 생각(reasoning)이 켜져 있으면 max_tokens 를 생각에 다 쓰고 본문이 비어 온다
_NO_THINKING = {"chat_template_kwargs": {"enable_thinking": False}}


def _json_text(content: str) -> str:
    """로컬 모델 응답에서 JSON 부분만. 생각 태그·코드 울타리를 걷어낸다."""
    content = _THINK.sub("", content).strip()
    if content.startswith("```"):
        content = content.strip("`")
        content = content.split("\n", 1)[1] if "\n" in content else content
    start, end = content.find("{"), content.rfind("}")
    return content[start : end + 1] if start != -1 and end > start else content


class _OpenAICompatProvider:
    """OpenAI 호환 로컬 서버 공통 구현. 하위 클래스가 주소·키·모델만 정한다."""

    name: str
    label: str

    def __init__(self, base_url: str, api_key: str, chat_model: str, embedding_model: str) -> None:
        from openai import OpenAI

        self._client = OpenAI(base_url=base_url, api_key=api_key)
        self.model = chat_model
        self._embedding_model = embedding_model

    def complete(self, system: str, user: str, max_tokens: int = 2048) -> str:
        res = self._client.chat.completions.create(
            model=self.model,
            max_tokens=max_tokens,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            extra_body=_NO_THINKING,
        )
        choice = res.choices[0]
        content = _THINK.sub("", choice.message.content or "").strip()
        if not content:
            raise RuntimeError(f"{self.label} 응답 본문이 비어 있습니다 (finish_reason={choice.finish_reason})")
        return content

    def extract(self, system: str, user: str, schema: type[T], max_tokens: int = 16000) -> T:
        res = self._client.chat.completions.create(
            model=self.model,
            max_tokens=max_tokens,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format={
                "type": "json_schema",
                "json_schema": {"name": schema.__name__, "schema": schema.model_json_schema(), "strict": True},
            },
            extra_body=_NO_THINKING,
        )
        content = res.choices[0].message.content or ""
        try:
            return schema.model_validate_json(_json_text(content))
        except (ValidationError, json.JSONDecodeError) as e:
            raise LLMExtractionError(f"로컬 모델 응답이 형식에 맞지 않습니다: {e}") from e

    def embed(self, texts: list[str]) -> list[list[float]]:
        # 임베딩은 LLM_PROVIDER 와 따로 EMBEDDING_PROVIDER 를 따른다 (인덱스를 한 모델로 맞추려고)
        if settings.embedding_provider != self.name:
            return _LOCAL[settings.embedding_provider]().embed(texts)
        if not self._embedding_model:
            raise RuntimeError(f"{self.label} 임베딩 모델이 .env 에 없습니다 ({self.name.upper()}_EMBEDDING_MODEL)")
        res = self._client.embeddings.create(model=self._embedding_model, input=texts)
        return [d.embedding for d in res.data]


class UnslothProvider(_OpenAICompatProvider):
    """로컬 LLM 노트북(bird-llm)의 Unsloth Studio. API 키 필수."""

    name = "unsloth"
    label = "Unsloth"

    def __init__(self) -> None:
        if not settings.unsloth_api_key:
            raise RuntimeError("UNSLOTH_API_KEY 가 .env 에 없습니다")
        super().__init__(
            settings.unsloth_base_url, settings.unsloth_api_key,
            settings.unsloth_chat_model, settings.unsloth_embedding_model,
        )


class LMStudioProvider(_OpenAICompatProvider):
    """각자 PC의 LM Studio 로컬 서버. 키를 검사하지 않으므로 비어 있으면 아무 값이나 보낸다."""

    name = "lmstudio"
    label = "LM Studio"

    def __init__(self) -> None:
        if not settings.lmstudio_chat_model and not settings.lmstudio_embedding_model:
            raise RuntimeError("LMSTUDIO_CHAT_MODEL 이 .env 에 없습니다 (lms ls 로 모델 이름 확인)")
        super().__init__(
            settings.lmstudio_base_url, settings.lmstudio_api_key or "lm-studio",
            settings.lmstudio_chat_model, settings.lmstudio_embedding_model,
        )


_LOCAL: dict[str, type[_OpenAICompatProvider]] = {"unsloth": UnslothProvider, "lmstudio": LMStudioProvider}


def get_provider() -> LLMProvider:
    if settings.llm_provider in _LOCAL:
        return _LOCAL[settings.llm_provider]()
    return ClaudeProvider()
