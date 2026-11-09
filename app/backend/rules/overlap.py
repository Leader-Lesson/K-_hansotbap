"""시간·공간 겹침 후보 찾기. 판정(금지·조건부·결함)은 하지 않는다 — 그건 engine.py 의 규칙이 한다.

작업 시간은 '날짜 × 하루 작업 시간대'다. Task.start 는 첫날 작업 시작 시각, Task.end 는 마지막 작업이 끝나는 시각이고,
그 사이 매일 start 시각~end 시각에만 일한다 (계획서 파서 build_interval·프론트 간트와 같은 약속).
- 07:00 → 19:00: 매일 주간 12시간
- 19:00 → 다음 날 07:00: 매일 야간 (끝 시각이 시작 시각보다 이르면 자정을 넘긴다)
- 07:00 → 07:00: 24시간 연속 (끝 시각과 시작 시각이 같으면)
그래서 두 작업은 날짜가 겹치고 그날 작업 시간대도 겹쳐야 겹친다. 주간 작업과 야간 작업은 같은 날·같은 구역이어도 겹치지 않는다.
"""

from datetime import datetime, timedelta
from functools import lru_cache
from itertools import combinations

from schemas import OverlapCandidate, Task, Zone

# 노 내부 수직 공동: 위아래 관계를 보는 구역 [팀 설정값, zones.csv 수직순서 기준]
FURNACE_COLUMN = {"TOP", "STACK", "BELLY_BOSH", "TUYERE", "HEARTH"}
ALL_ZONE = "ALL"
DAY = timedelta(days=1)

Span = tuple[datetime, datetime]


def time_overlap(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime):
    """두 연속 구간이 겹치면 (시작, 끝)을, 아니면 None을 돌려준다. 끝이 맞닿기만 하면 겹침이 아니다."""
    start = max(a_start, b_start)
    end = min(a_end, b_end)
    return (start, end) if start < end else None


def daily_length(start: datetime, end: datetime) -> timedelta:
    """하루 작업 시간 길이: start 시각 → end 시각. 끝이 이르면 자정을 넘기고, 같으면 24시간 연속이다."""
    span = datetime.combine(start.date(), end.time()) - datetime.combine(start.date(), start.time())
    if span <= timedelta(0):
        span += DAY
    return min(span, end - start)


def work_periods(start: datetime, end: datetime) -> list[Span]:
    """실제로 일하는 구간들 (매일 하나씩)."""
    if end <= start:
        return []
    length = daily_length(start, end)
    days = (end - start - length) // DAY
    return [(start + k * DAY, start + k * DAY + length) for k in range(days + 1)]


@lru_cache(maxsize=1 << 16)
def overlap_spans(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> tuple[Span, ...]:
    """두 작업이 실제로 함께 일하는 구간들 (날짜 × 하루 작업 시간대)."""
    lo, hi = max(a_start, b_start), min(a_end, b_end)
    if lo >= hi:
        return ()
    a = [p for p in work_periods(a_start, a_end) if p[1] > lo and p[0] < hi]
    b = [p for p in work_periods(b_start, b_end) if p[1] > lo and p[0] < hi]
    out: list[Span] = []
    i = j = 0
    while i < len(a) and j < len(b):
        s, e = max(a[i][0], b[j][0]), min(a[i][1], b[j][1])
        if s < e:
            out.append((s, e))
        if a[i][1] <= b[j][1]:
            i += 1
        else:
            j += 1
    return tuple(out)


def work_overlap(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> Span | None:
    """두 작업이 함께 일하는 첫 구간의 시작 ~ 마지막 구간의 끝. 없으면 None.

    돌려준 (시작, 끝)도 같은 약속으로 읽는다: 그 날짜들 동안 매일 시작 시각~끝 시각 (F9 위험 시간대·프론트 간트).
    """
    spans = overlap_spans(a_start, a_end, b_start, b_end)
    return (spans[0][0], spans[-1][1]) if spans else None


def tasks_overlap(a: Task, b: Task) -> Span | None:
    return work_overlap(a.start, a.end, b.start, b.end)


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
        window = tasks_overlap(a, b)
        if window is None:
            continue
        out.append(
            OverlapCandidate(
                task_a=a.id, task_b=b.id, relation=relation,
                window_start=window[0], window_end=window[1],
            )
        )
    return out
