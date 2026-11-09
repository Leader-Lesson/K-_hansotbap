"""F4 조정안 이유 문장 다듬기 (선택 기능).

판정·후보 계산은 rules/ 가 하고, 여기서는 규칙이 만든 이유 문장을 읽기 쉽게 고치기만 한다.
LLM 호출이 실패하거나 결과가 원문의 작업 ID·날짜·규칙 번호를 바꿨으면 원문을 그대로 돌려준다.
"""

import logging
import re

from llm.provider import get_provider

log = logging.getLogger(__name__)

_SYSTEM = (
    "너는 제철소 고로 개수공사의 작업 조정안 이유 문장을 다듬는 도우미다.\n"
    "입력은 규칙이 만든 이유 문장이다. 현장 담당자가 읽기 쉬운 한두 문장으로 다듬어 돌려준다.\n"
    "작업 ID·날짜·숫자·규칙 번호를 바꾸거나 빼거나 새로 만들지 말고 문장만 다듬는다.\n"
    "원문에 없는 사실·판단·권고를 덧붙이지 않는다.\n"
    "머리말·따옴표·목록·마크다운 없이 다듬은 문장만 출력한다."
)

# 영문·숫자 바로 앞뒤가 아닐 때만 토큰으로 본다 ("P22가" 처럼 한글이 붙은 경우는 토큰으로 센다)
_TOKENS = {
    "작업 ID": re.compile(r"(?<![A-Za-z0-9])P\d+(?!\d)"),
    "날짜": re.compile(r"\d{4}-\d{2}-\d{2}"),
    "규칙 번호": re.compile(r"(?<![A-Za-z0-9])R\d+(?!\d)"),
    "시각": re.compile(r"(?<!\d)\d{2}:\d{2}(?!\d)"),
}


def _tokens_preserved(original: str, polished: str) -> bool:
    """원문의 토큰이 결과에 모두 있고, 결과에 원문에 없는 토큰이 없을 때만 참."""
    return all(set(p.findall(original)) == set(p.findall(polished)) for p in _TOKENS.values())


def polish_text(system: str, text: str) -> str:
    """규칙이 만든 문장을 다듬는다. 어떤 실패에서도 예외를 내지 않고 원문을 돌려준다."""
    if not text.strip():
        return text
    try:
        polished = get_provider().complete(system, text).strip()
    except Exception as e:  # 키 없음·네트워크·제공자 오류 모두. 메시지에 키가 섞일 수 있어 종류만 남긴다
        log.warning("문장 다듬기 실패, 원문 사용 (%s)", type(e).__name__)
        return text
    if not polished:
        log.warning("문장 다듬기 결과가 비어 원문 사용")
        return text
    if not _tokens_preserved(text, polished):
        log.warning("문장 다듬기 결과가 작업 ID·날짜·시각·규칙 번호를 바꿔 원문 사용")
        return text
    return polished


def polish_reason(reason: str) -> str:
    """조정안 이유 문장을 다듬는다."""
    return polish_text(_SYSTEM, reason)
