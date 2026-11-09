"""작업 성격 판별 (F2 규칙의 '작업 A'·'작업 B' 칸).

작업 유형 태그(hazards: 화기·밀폐·고소·중량물·가스)만으로는 '가스배관 개방'과 '가스 라인 연결'을 가를 수 없어서
작업명 낱말을 함께 본다. 낱말 목록은 작업 분해표·합성 계획서 기준 [팀 설정값].
"""

from __future__ import annotations

import re

from schemas import Hazard, Task


def _name_has(t: Task, words: tuple[str, ...]) -> bool:
    return any(w in t.name for w in words)


def hot(t: Task) -> bool:
    return Hazard.HOT_WORK in t.hazards


def gas(t: Task) -> bool:
    return Hazard.GAS in t.hazards


def confined(t: Task) -> bool:
    return Hazard.CONFINED in t.hazards


def height(t: Task) -> bool:
    return Hazard.HEIGHT in t.hazards


def heavy(t: Task) -> bool:
    return Hazard.HEAVY_LIFT in t.hazards


def anyone(t: Task) -> bool:
    """사람이 들어가는 작업 전부 (규칙 B가 '모든 작업'·'일반 작업'·'하부 작업'일 때)."""
    return True


FLAMMABLE_USE = ("도장", "탈지", "유류", "페인트", "시너", "인화성")
COMBUSTIBLE = ("보온재", "단열재", "목재", "방수포", "폐기물", "가연물")
GAS_OPENING = ("개방", "해체", "플랜지", "블리더", "퍼지", "교체", "보수", "절단", "차단")
GAS_INTRODUCE = ("연결", "복구", "투입", "밸브", "퍼지", "승온", "기밀", "송풍")
INERT_PURGE = ("퍼지", "불활성")  # '질소'만으로는 에너지 격리(P06: 송풍·냉각수·질소·전기)까지 걸린다 → LOTO 는 R23
OPENING = ("개구", "맨홀")
GAS_DISMANTLE = ("해체", "개방", "절단", "차단")
BLEEDER = ("블리더", "방산", "잔류가스")
SALAMANDER = ("살라만더", "salamander", "잔선구 출선", "랜싱")
QUENCH = ("살수 냉각", "살수냉각", "quench")
BLASTING = ("발파", "화약", "폭약")
UPPER_HANDLING = ("해체", "철거", "볼트", "자재")
SCAFFOLD = ("비계",)
CRANE_LIFT = ("인양", "크레인", "반입", "양중", "링블록", "스테이브", "쿨링플레이트", "냉각판")  # 규칙표 R18 A: 철피 링·스테이브·쿨링플레이트
VEHICLE = ("차량", "운반", "반출", "하역", "건설기계", "덤프", "지게차", "트레일러")
TEST_RUN = ("시운전",)
ENERGIZE = ("통전", "전원 투입", "LOTO 해제", "격리 해제", "에너지 투입")
_RADIATION = re.compile(r"(?<![A-Za-z])RT(?![A-Za-z])|방사선|선원|방사성")


def flammable_use(t: Task) -> bool:
    return _name_has(t, FLAMMABLE_USE)


def combustible(t: Task) -> bool:
    return _name_has(t, COMBUSTIBLE)


def gas_opening(t: Task) -> bool:
    """R04 B: 가스배관 개방·플랜지 해체·블리더 개방·퍼지 (가스 계통을 여는 작업)."""
    return gas(t) and _name_has(t, GAS_OPENING)


def gas_introduce(t: Task) -> bool:
    """R07 B: 가스 라인 연결·밸브 조작·가스 투입·승온·기밀시험."""
    return gas(t) and _name_has(t, GAS_INTRODUCE)


def inert_purge(t: Task) -> bool:
    return _name_has(t, INERT_PURGE) and gas(t)


def opening_area(t: Task) -> bool:
    return _name_has(t, OPENING) or t.zone_id == "TOP"


def gas_dismantle(t: Task) -> bool:
    return gas(t) and _name_has(t, GAS_DISMANTLE)


def bleeder(t: Task) -> bool:
    return _name_has(t, BLEEDER)


def salamander(t: Task) -> bool:
    return _name_has(t, SALAMANDER)


def quench(t: Task) -> bool:
    return _name_has(t, QUENCH)


def blasting(t: Task) -> bool:
    return _name_has(t, BLASTING)


def upper_handling(t: Task) -> bool:
    """R16 A: 상부 해체·내화물 해체·볼트 해체·자재 취급 (중량물 취급 포함)."""
    return _name_has(t, UPPER_HANDLING) or heavy(t)


def scaffold(t: Task) -> bool:
    return _name_has(t, SCAFFOLD)


def crane_lift(t: Task) -> bool:
    return heavy(t) and _name_has(t, CRANE_LIFT)


def vehicle(t: Task) -> bool:
    return _name_has(t, VEHICLE)


def trial_run(t: Task) -> bool:
    return _name_has(t, TEST_RUN)


def energize(t: Task) -> bool:
    return _name_has(t, ENERGIZE)


def radiation(t: Task) -> bool:
    return bool(_RADIATION.search(t.name))
