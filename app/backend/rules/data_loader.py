"""data/ 의 CSV(구역·규칙·작업 분해표)를 데이터 계약 모델로 읽는다."""

import csv
from datetime import datetime, time
from functools import lru_cache
from pathlib import Path

from config import DATA_DIR
from schemas import Hazard, Rule, SourceRef, Task, Zone

HAZARD_COLUMNS = {
    "화기": Hazard.HOT_WORK,
    "밀폐공간": Hazard.CONFINED,
    "고소": Hazard.HEIGHT,
    "중량물": Hazard.HEAVY_LIFT,
    "가스계통": Hazard.GAS,
}

# 작업 분해표는 날짜 단위다. 시간표형 간트(07~19시)에 올리기 위한 기본값 [팀 설정값]
DEFAULT_DAY_START = time(7, 0)
DEFAULT_DAY_END = time(19, 0)


def wbs_parent(task_id: str) -> str:
    """세부 작업 ID(P13-2)의 기준 작업 ID(P13). 기준 작업·새 작업 ID는 그대로 돌려준다."""
    head, sep, tail = task_id.rpartition("-")
    return head if sep and tail.isdigit() and head.startswith("P") else task_id


def _hours(text: str) -> tuple[time, time]:
    """작업 분해표 '작업시간' 칸("07:00-12:00") → (시작, 끝). 비었거나 못 읽으면 주간 기본값."""
    try:
        a, b = (time.fromisoformat(x.strip()) for x in text.split("-"))
        return a, b
    except ValueError:
        return DEFAULT_DAY_START, DEFAULT_DAY_END


def _rows(name: str) -> list[dict[str, str]]:
    path: Path = DATA_DIR / name
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def _split(value: str) -> list[str]:
    return [v.strip() for v in value.replace("·", ",").split(",") if v.strip()]


@lru_cache
def load_zones() -> list[Zone]:
    return [
        Zone(
            id=r["구역ID"],
            name=r["구역명"],
            vertical_order=int(r["수직순서(상대,가정)"]),
            description=r.get("설명", ""),
        )
        for r in _rows("zones.csv")
    ]


@lru_cache
def load_rules() -> list[Rule]:
    return [
        Rule(
            id=r["규칙ID"],
            task_a=r["작업 A"],
            task_b=r["작업 B"],
            spatial=r["공간 관계"],
            temporal=r["시간 관계"],
            grade=r["판정"],
            risk_code=r["위험코드"],
            basis=r["근거"],
            adjustment=r["조정안"],
        )
        for r in _rows("conflict_rules.csv")
    ]


@lru_cache
def load_wbs_tasks() -> list[Task]:
    tasks: list[Task] = []
    for r in _rows("gy2bf_wbs.csv"):
        # 작업시간 칸(07:00-12:00)이 있으면 매일 그 시간대에만 일한다. 없으면 주간 기본값
        day_start, day_end = _hours(r.get("작업시간", ""))
        start = datetime.combine(datetime.fromisoformat(r["시작일"]).date(), day_start)
        end = datetime.combine(datetime.fromisoformat(r["종료일"]).date(), day_end)
        tasks.append(
            Task(
                id=r["작업ID"],
                contractor=r["협력사(가상)"],
                name=r["작업명"],
                trade=r["공종(협력사 유형)"] or None,
                zone_id=r["구역"],
                start=start,
                end=end,
                crew=int(r["투입인원(가정)"]) if r.get("투입인원(가정)", "").strip() else None,  # 합성 가정값
                hazards=[h for col, h in HAZARD_COLUMNS.items() if r.get(col, "0").strip() == "1"],
                risk_codes=[c for c in r["위험코드(시행령53조의2)"].split(",") if c.strip()],
                predecessors=_split(r.get("선행 작업", "")),
                # 판정 근거로 보여 줄 출처. 업로드한 계획서에서 뽑은 작업(F1)은 그 문서 위치가 들어간다
                source=SourceRef(file="gy2bf_wbs.csv", locator=r["작업ID"], text=r["작업명"]),
            )
        )
    return tasks
