"""시간·공간 겹침 후보 찾기. 판정(금지·조건부·결함)은 하지 않는다 — 그건 engine.py 의 규칙이 한다."""

from datetime import datetime
from itertools import combinations

from schemas import OverlapCandidate, Task, Zone

# 노 내부 수직 공동: 위아래 관계를 보는 구역 [팀 설정값, zones.csv 수직순서 기준]
FURNACE_COLUMN = {"TOP", "STACK", "BELLY_BOSH", "TUYERE", "HEARTH"}
ALL_ZONE = "ALL"


def time_overlap(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime):
    """두 구간이 겹치면 (시작, 끝)을, 아니면 None을 돌려준다. 끝이 맞닿기만 하면 겹침이 아니다."""
    start = max(a_start, b_start)
    end = min(a_end, b_end)
    return (start, end) if start < end else None


def spatial_relation(a: Task, b: Task) -> str | None:
    if ALL_ZONE in (a.zone_id, b.zone_id):
        return "all_zone"
    if a.zone_id == b.zone_id:
        return "same_zone"
    if a.zone_id in FURNACE_COLUMN and b.zone_id in FURNACE_COLUMN:
        return "vertical"
    return None


def find_overlap_candidates(tasks: list[Task], zones: list[Zone] | None = None) -> list[OverlapCandidate]:
    out: list[OverlapCandidate] = []
    for a, b in combinations(tasks, 2):
        if a.contractor == b.contractor:
            continue
        relation = spatial_relation(a, b)
        if relation is None:
            continue
        window = time_overlap(a.start, a.end, b.start, b.end)
        if window is None:
            continue
        out.append(
            OverlapCandidate(
                task_a=a.id, task_b=b.id, relation=relation,
                window_start=window[0], window_end=window[1],
            )
        )
    return out
