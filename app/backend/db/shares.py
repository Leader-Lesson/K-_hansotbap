"""F5 협력사 공유: 원청이 확인한 충돌만 협력사로 내려간다.

협력사에게는 기획서의 공유 범위(인접 위치 작업·위험 요소·작업 인계 조건)만 추려 주고, 상대 업체의 원문은 주지 않는다.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime

from schemas import ConflictRecord, SharedItem, SharedTask, Task

from .adjustments import active_adjustments
from .database import session
from .plans import current_schedule, list_conflicts


class UnknownConflicts(Exception):
    """저장된 판정 결과에 없는 충돌 ID가 들어 있다."""

    def __init__(self, conflict_ids: list[str]):
        super().__init__(", ".join(conflict_ids))
        self.conflict_ids = conflict_ids


def insert_shares(conn: sqlite3.Connection, conflict_ids: list[str], shared_by: str, shared_at: str) -> None:
    """공유 기록을 넣는다. 이미 공유한 충돌은 처음 확인한 사람·시각을 그대로 둔다."""
    conn.executemany(
        "INSERT OR IGNORE INTO shares (conflict_id, shared_by, shared_at) VALUES (?, ?, ?)",
        [(c, shared_by, shared_at) for c in conflict_ids],
    )


def share_conflicts(conflict_ids: list[str], shared_by: str) -> list[ConflictRecord]:
    """원청이 확인한 충돌을 협력사에 공유하고, 공유 시각이 붙은 기록을 돌려준다."""
    wanted = set(conflict_ids)
    with session() as conn:
        marks = ",".join("?" * len(wanted))
        known = {r["id"] for r in conn.execute(f"SELECT id FROM conflicts WHERE id IN ({marks})", tuple(wanted))}
        if missing := sorted(wanted - known):
            raise UnknownConflicts(missing)
        insert_shares(conn, sorted(wanted), shared_by, datetime.now().isoformat(timespec="seconds"))
    return [r for r in list_conflicts(include_resolved=True) if r.conflict.id in wanted]


def shared_by_map() -> dict[str, str]:
    """충돌 ID → 공유를 확인한 책임자."""
    with session() as conn:
        return {r["conflict_id"]: r["shared_by"] for r in conn.execute("SELECT * FROM shares")}


def _shared_task(t: Task) -> SharedTask:
    return SharedTask(
        id=t.id, contractor=t.contractor, name=t.name, zone_id=t.zone_id, start=t.start, end=t.end, hazards=t.hazards
    )


def list_shared(contractor: str | None = None) -> list[SharedItem]:
    """공유된 충돌 (최근 공유순). 협력사로 부르면 자기 작업이 걸린 것만, 공유 범위로 추려서 준다."""
    records = [r for r in list_conflicts(contractor, include_resolved=True) if r.shared_at]
    by_task = {t.id: t for t in current_schedule()}
    actors = shared_by_map()
    adjustments = {a.conflict_id: a for a in active_adjustments()}

    items = []
    for record in records:
        c = record.conflict
        tasks = [by_task[t] for t in c.task_ids if t in by_task]
        mine = [t.id for t in tasks if t.contractor == contractor]
        items.append(
            SharedItem(
                conflict_id=c.id,
                type=c.type,
                grade=c.grade,
                status=record.status,
                rule_id=c.rule_id,
                legal_basis=c.legal_basis,
                window_start=c.window_start,
                window_end=c.window_end,
                reason=c.reason,
                handover=c.suggestion,
                my_task_ids=mine,
                adjacent_tasks=[_shared_task(t) for t in tasks if t.id not in mine],
                adjustment=adjustments.get(c.id),
                shared_by=actors[c.id],
                shared_at=record.shared_at,
            )
        )
    return sorted(items, key=lambda i: (i.shared_at, i.conflict_id), reverse=True)


def visible_tasks(contractor: str) -> list[Task]:
    """협력사가 볼 수 있는 일정: 자기 작업 + 공유된 충돌의 상대 작업(원문 위치는 뺀다)."""
    schedule = current_schedule()
    shared_ids = {t for r in list_conflicts(contractor, include_resolved=True) for t in r.conflict.task_ids}
    out = []
    for t in schedule:
        if t.contractor == contractor:
            out.append(t)
        elif t.id in shared_ids:
            out.append(t.model_copy(update={"source": None}))
    return out
