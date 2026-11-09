"""F9 위험 시간대: 판정 결과를 구역·시간대별로 모아 점수를 매긴다 (LLM 없음, pytest 대상).

충돌 기간은 며칠~몇 달이어도 실제로 겹치는 때는 매일의 작업 시간대다. 기간을 그대로 띠로 그리면 밤까지
위험으로 표시되므로 충돌을 하루 단위 조각으로 나눠 집계한 뒤, 연속된 날짜에 시각과 충돌 묶음이 같으면 합친다.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterator
from datetime import date, datetime, time, timedelta

from schemas import Conflict, Grade, RiskWindow, Task, Zone

# 등급별 점수. 근거 수치가 없는 [팀 설정값]
GRADE_WEIGHTS = {Grade.PROHIBITED: 3.0, Grade.CONDITIONAL: 2.0, Grade.DEFECT: 1.0}

ALL_ZONE = "ALL"
_NOTICE_ITEMS = 5  # 공지 문장에 이름을 적는 규칙·업체 수 [팀 설정값]
_ONE_DAY = timedelta(days=1)

Slice = tuple[datetime, datetime, str]


def _daily_slices(c: Conflict) -> Iterator[tuple[datetime, datetime]]:
    """충돌 기간을 매일의 시간대 조각으로 나눈다. 끝 시각이 시작 시각보다 이르면 자정을 넘는 시간대로 본다."""
    start, end = c.window_start, c.window_end
    span = datetime.combine(start.date(), end.time()) - datetime.combine(start.date(), start.time())
    if span <= timedelta(0):
        span += _ONE_DAY
    while start + span <= end:
        yield start, start + span
        start += _ONE_DAY


def _zones_of(c: Conflict, by_task: dict[str, Task]) -> set[str]:
    """충돌에 걸린 작업들의 구역 전부. 전 구역(ALL) 작업은 다른 구역이 함께 걸려 있으면 그 구역에 표시한다."""
    zones = {by_task[t].zone_id for t in c.task_ids if t in by_task}
    return zones - {ALL_ZONE} if len(zones) > 1 else zones


def _grouped(c: Conflict, by_task: dict[str, Task]) -> bool:
    """전 구역 작업 1건과 겹칠 수 있는 여러 작업을 묶은 충돌(F2 '…>ALL'). 구역마다 그 구역 작업만 관련 있다."""
    return len(c.task_ids) > 2 and any(t in by_task and by_task[t].zone_id == ALL_ZONE for t in c.task_ids)


def _members(c: Conflict, zone_id: str, by_task: dict[str, Task]) -> list[Task]:
    """이 구역 시간대에 관련된 작업. 일반 충돌은 상대 구역 작업까지 전부(위쪽 업체도 아래 구역 공지에 나와야 한다),
    묶음 충돌은 이 구역 작업과 묶음의 주인(맨 앞 전 구역 작업)만 — 그렇지 않으면 다른 구역 업체와 위치 모르는
    다른 전 구역 작업까지 모든 구역 공지에 섞인다."""
    tasks = [by_task[t] for t in c.task_ids if t in by_task]
    if not _grouped(c, by_task):
        return tasks
    return [t for t in tasks if t.zone_id == zone_id or t.id == c.task_ids[0]]


def _active(tasks: list[Task], start: datetime, end: datetime) -> bool:
    return any(t.start < end and start < t.end for t in tasks)


def _segments(slices: list[Slice]) -> list[tuple[datetime, datetime, frozenset[str]]]:
    """조각의 경계마다 잘라, 같은 충돌 묶음이 이어지는 구간을 만든다."""
    opened: dict[datetime, list[str]] = defaultdict(list)
    closed: dict[datetime, list[str]] = defaultdict(list)
    for start, end, conflict_id in slices:
        opened[start].append(conflict_id)
        closed[end].append(conflict_id)

    edges = sorted(opened.keys() | closed.keys())
    active: set[str] = set()
    out = []
    for edge, next_edge in zip(edges, edges[1:]):
        active.difference_update(closed.get(edge, []))  # 끝난 조각을 먼저 뺀다 (이어지는 다음 조각과 맞물릴 때)
        active.update(opened.get(edge, []))
        if active:
            out.append((edge, next_edge, frozenset(active)))
    return out


def _merge_days(
    segments: list[tuple[datetime, datetime, frozenset[str]]],
) -> list[tuple[datetime, datetime, frozenset[str]]]:
    """다음 날 같은 시각에 같은 충돌 묶음이면 앞 구간에 잇는다."""
    merged: list[list] = []  # [첫 시작, 마지막 끝, 묶음, 마지막 시작]
    latest: dict[tuple[time, timedelta, frozenset[str]], list] = {}
    for start, end, ids in segments:
        key = (start.time(), end - start, ids)
        run = latest.get(key)
        if run is not None and run[3] + _ONE_DAY == start:
            run[1], run[3] = end, start
        else:
            run = [start, end, ids, start]
            merged.append(run)
            latest[key] = run
    return [(r[0], r[1], r[2]) for r in merged]


def _brief(names: list[str]) -> str:
    shown = ", ".join(names[:_NOTICE_ITEMS])
    return f"{shown} 외 {len(names) - _NOTICE_ITEMS}건" if len(names) > _NOTICE_ITEMS else shown


def _notice(zone: str, start: datetime, end: datetime, group: list[Conflict], rules: list[str], contractors: list[str]) -> str:
    """규칙 문구로 만든 공지 문장. LLM은 부르는 쪽에서 선택해 다듬기만 한다."""
    days = f"{start:%Y-%m-%d}" if start.date() == end.date() else f"{start:%Y-%m-%d}~{end:%Y-%m-%d}"
    counts = "·".join(
        f"{grade.value} {n}건" for grade in GRADE_WEIGHTS if (n := sum(c.grade == grade for c in group))
    )
    return (
        f"{zone} {days} {start:%H:%M}~{end:%H:%M} 위험 시간대입니다. "
        f"{counts} 겹칩니다 (규칙 {_brief(rules)}). 관련 업체: {_brief(contractors)}."
    )


def _window(
    zone_id: str,
    start: datetime,
    end: datetime,
    ids: frozenset[str],
    by_conflict: dict[str, Conflict],
    by_task: dict[str, Task],
    zone_names: dict[str, str],
) -> RiskWindow:
    group = [by_conflict[i] for i in sorted(ids)]
    tasks = [
        t
        for c in group
        for t in _members(c, zone_id, by_task)
        # 묶음 충돌은 이 시간대에 실제로 진행 중인 이 구역 작업만 (묶음의 주인은 그대로)
        if not _grouped(c, by_task) or t.id == c.task_ids[0] or (t.start < end and start < t.end)
    ]
    contractors = sorted({t.contractor for t in tasks})
    rule_ids = sorted({c.rule_id for c in group})
    sources = list({(s.file, s.locator, s.text): s for c in group for s in c.sources}.values())
    return RiskWindow(
        zone_id=zone_id,
        start=start,
        end=end,
        score=sum(GRADE_WEIGHTS[c.grade] for c in group),
        contractors=contractors,
        conflict_ids=[c.id for c in group],
        trades=sorted({t.trade for t in tasks if t.trade}),
        peak_grade=max((c.grade for c in group), key=GRADE_WEIGHTS.__getitem__),
        rule_ids=rule_ids,
        legal_basis=list(dict.fromkeys(c.legal_basis for c in group)),
        sources=sources,
        notice=_notice(zone_names.get(zone_id, zone_id), start, end, group, rule_ids, contractors),
    )


def score_windows(
    conflicts: list[Conflict], tasks: list[Task], zones: list[Zone], on: date | None = None
) -> list[RiskWindow]:
    """구역별 위험 시간대. 여러 날이 합쳐진 건은 start 날짜~end 날짜 동안 매일 start 시각~end 시각을 뜻한다.

    on 을 주면 그날에 걸친 조각만 집계하므로 날짜별 시간표(간트)에 그대로 그릴 수 있다.
    """
    by_task = {t.id: t for t in tasks}
    by_conflict = {c.id: c for c in conflicts}
    zone_names = {z.id: z.name for z in zones}

    slices: dict[str, list[Slice]] = defaultdict(list)
    for c in conflicts:
        zone_ids = _zones_of(c, by_task)
        grouped = _grouped(c, by_task)
        for start, end in _daily_slices(c):
            if on and not (start.date() <= on and on < end.date() + _ONE_DAY):
                continue
            for zone_id in zone_ids:
                # 묶음 충돌은 공사 기간 전체에 걸쳐 있다 → 그 구역 작업이 진행 중인 날에만 그 구역에 올린다
                if grouped and not _active([t for t in _members(c, zone_id, by_task) if t.id != c.task_ids[0]], start, end):
                    continue
                slices[zone_id].append((start, end, c.id))

    windows = [
        _window(zone_id, start, end, ids, by_conflict, by_task, zone_names)
        for zone_id, zone_slices in slices.items()
        for start, end, ids in _merge_days(_segments(zone_slices))
    ]
    return sorted(windows, key=lambda w: (w.start, w.zone_id, w.end))
