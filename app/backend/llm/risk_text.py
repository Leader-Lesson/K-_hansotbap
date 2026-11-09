"""F9 위험 시간대 공지 문장 다듬기 (선택 기능). 점수와 시간대는 rules/risk.py 가 정하고 여기서는 문장만 고친다."""

from llm.adjust_text import polish_text

_SYSTEM = (
    "너는 제철소 고로 개수공사의 위험 시간대 공지 문장을 다듬는 도우미다.\n"
    "입력은 규칙이 만든 공지 문장이다. 현장 작업자가 읽기 쉬운 한두 문장으로 다듬어 돌려준다.\n"
    "구역·업체 이름, 날짜, 시각, 건수, 규칙 번호를 바꾸거나 빼거나 새로 만들지 말고 문장만 다듬는다.\n"
    "원문에 없는 사실·판단·권고를 덧붙이지 않는다.\n"
    "머리말·따옴표·목록·마크다운 없이 다듬은 문장만 출력한다."
)


def polish_notice(notice: str) -> str:
    return polish_text(_SYSTEM, notice)
