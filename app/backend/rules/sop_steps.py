"""F8 필수 단계 누락 판정 (규칙). LLM을 쓰지 않는다. pytest로 검증한다.

표준서 단계마다 '같은 줄에 함께 나와야 하는 낱말 묶음'을 둔다. 묶음 하나라도 맞는 줄이 계획서에 있으면 적혀 있다고 본다.
낱말 하나로만 보면 '노흉 축조 완료 후'(착수 조건)를 '내부 작업 완료·인원 철수 확인'(현장 확인 절차)으로 잘못 읽는다.
사전에 없는 단계(새 표준서)는 단계 문장의 낱말 중 절반 이상이 한 줄에 있으면 적혀 있다고 본다.
낱말 사전은 합성 표준서 4종·합성 계획서 5종 기준 [팀 설정값].
"""

from __future__ import annotations

import re

from schemas import SopStepCheck, SourceLine, SourceRef

Patterns = tuple[tuple[str, ...], ...]

STEP_PATTERNS: dict[str, dict[int, Patterns]] = {
    "SOP-01": {  # 화기작업
        1: (("허가서",), ("작업허가",)),
        2: (("가스", "측정"), ("lel",), ("가스농도",), ("가연성가스",)),
        3: (("가연물",), ("방화포",), ("불연",)),
        4: (("화재감시자",), ("화재", "감시", "배치")),
        5: (("소화기",),),
        6: (("불티",), ("비산방지",), ("비산 방지",)),
        7: (("30분",), ("종료", "감시")),
        8: (("반납",),),
    },
    "SOP-02": {  # 밀폐공간 출입
        1: (("허가서",), ("작업허가",)),
        2: (("산소", "측정"), ("산소농도",), ("유해가스",), ("가스", "측정")),
        3: (("맹판",), ("블라인드",), ("불활성가스", "차단")),
        4: (("환기",),),
        5: (("감시인",), ("출입구", "감시")),
        6: (("구조장비",), ("공기호흡기",), ("삼각대",)),
        7: (("명부",), ("출입 기록",), ("출입기록",), ("기록부",)),
        8: (("퇴출",), ("인원 철수",), ("전원", "철수")),
    },
    "SOP-03": {  # 중량물 인양
        1: (("중장비", "계획"), ("인양", "계획")),
        2: (("줄걸이",), ("슬링",), ("와이어", "점검"), ("중량", "확인")),
        3: (("신호수",), ("신호", "통일")),
        4: (("하부", "출입"), ("하부", "통제"), ("경로", "통제")),
        5: (("작업반경",), ("인원", "철수")),
        6: (("아웃트리거",), ("지반",)),
        7: (("풍속",), ("m/s",)),
        8: (("구역 해제",), ("인양", "해제")),
    },
    "SOP-04": {  # 가스 배관 연결·기밀시험
        1: (("허가서",), ("작업허가",)),
        2: (("loto",), ("차단밸브",), ("잠금",)),
        3: (("맹판",), ("블라인드",)),
        4: (("가스", "측정"), ("lel",), ("가스농도",), ("산소농도",)),
        5: (("인원", "철수"), ("퇴출",), ("내부", "완료", "확인"), ("철수", "확인")),
        6: (("볼트",), ("체결",), ("용접",)),
        7: (("기밀",), ("누설",)),
        8: (("맹판", "제거"), ("loto", "해제"), ("잠금", "해제")),
        9: (("반납",),),
    },
}

_WORD = re.compile(r"[0-9A-Za-z가-힣]{2,}")
_STOP = {"작업", "확인", "실시", "기록", "설치", "미만", "이상", "후", "전", "및"}


def _fallback_patterns(step: str) -> Patterns:
    """사전에 없는 단계: 괄호 밖 낱말 중 절반 이상(최소 1개)이 한 줄에 있어야 한다."""
    words = [w.lower() for w in _WORD.findall(re.sub(r"\(.*?\)", " ", step)) if w not in _STOP]
    if not words:
        return ()
    need = max(1, (len(words) + 1) // 2)
    if need >= len(words):
        return (tuple(words),)
    # 낱말 조합을 모두 나열하는 대신 앞에서부터 need 개씩 묶는다 (단계 문장은 짧다)
    return tuple(tuple(words[i : i + need]) for i in range(len(words) - need + 1))


def patterns_for(sop_id: str, no: int, step: str) -> Patterns:
    return STEP_PATTERNS.get(sop_id, {}).get(no) or _fallback_patterns(step)


def find_step(patterns: Patterns, lines: list[SourceLine]) -> SourceLine | None:
    for line in lines:
        text = line.text.lower()
        if any(all(w in text for w in group) for group in patterns):
            return line
    return None


def check_steps(
    sop_id: str, steps: tuple[str, ...], critical: frozenset[int], lines: list[SourceLine], file: str
) -> list[SopStepCheck]:
    out: list[SopStepCheck] = []
    for no, step in enumerate(steps, start=1):
        hit = find_step(patterns_for(sop_id, no, step), lines)
        out.append(
            SopStepCheck(
                no=no,
                text=step,
                critical=no in critical,
                found=hit is not None,
                evidence=SourceRef(file=file, locator=hit.locator, text=hit.text) if hit else None,
            )
        )
    return out
