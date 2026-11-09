"""data/ 의 CSV(구역·규칙·작업 분해표)를 데이터 계약 모델로 읽는다."""

import csv
from datetime import datetime, time
from functools import lru_cache
from pathlib import Path

from config import DATA_DIR
from schemas import Hazard, Rule, Task, Zone

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
        start = datetime.combine(datetime.fromisoformat(r["시작일"]).date(), DEFAULT_DAY_START)
        end = datetime.combine(datetime.fromisoformat(r["종료일"]).date(), DEFAULT_DAY_END)
        tasks.append(
            Task(
                id=r["작업ID"],
                contractor=r["협력사(가상)"],
                name=r["작업명"],
                trade=r["공종(협력사 유형)"] or None,
                zone_id=r["구역"],
                start=start,
                end=end,
                hazards=[h for col, h in HAZARD_COLUMNS.items() if r.get(col, "0").strip() == "1"],
                risk_codes=[c for c in r["위험코드(시행령53조의2)"].split(",") if c.strip()],
                predecessors=_split(r.get("선행 작업", "")),
            )
        )
    return tasks
