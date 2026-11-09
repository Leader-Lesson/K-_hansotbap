"""F6 챗봇 API. 질문 → 조회 함수 → 근거 붙은 답. 권한은 contractor 로 서버가 거른다."""

from fastapi import APIRouter, Query

from chat.service import ask, status
from llm.chat import choices, default_choice
from schemas import ChatChoiceId, ChatChoices, ChatRequest, ChatResponse, ChatStatus

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
def chat(
    req: ChatRequest,
    contractor: str | None = Query(default=None, description="협력사로 물으면 자기 업체 범위 안에서만 답한다 (원청은 비워 둔다)"),
) -> ChatResponse:
    """질문 하나에 답한다. LLM 이 늦거나 실패하면 규칙으로 대신하고 notice 로 알린다 (최대 CHAT_TOTAL_TIMEOUT 초 안팎)."""
    return ask(req, contractor)


@router.get("/chat/models", response_model=ChatChoices)
def chat_models() -> ChatChoices:
    """화면에서 고를 수 있는 챗봇 모델 (로컬 LLM + Claude 3개)과 기본값(.env 설정과 같은 것)."""
    return ChatChoices(choices=choices(), default=default_choice())


@router.get("/chat/status", response_model=ChatStatus)
def chat_status(
    choice: ChatChoiceId | None = Query(default=None, description="고른 모델로 확인. 비우면 CHAT_PROVIDER 또는 LLM_PROVIDER"),
) -> ChatStatus:
    """챗봇 LLM 연결 확인 (짧은 질문을 보내 본다)."""
    return status(choice)
