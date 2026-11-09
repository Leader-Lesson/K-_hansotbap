"""F4 조정 기록 저장 (저장만 한다. 판정·일정 계산은 db.plans / db.adjust_flow).

협력사가 낸 원본 계획서(tasks 표)는 건드리지 않고, 원청이 적용한 일정 이동은 이 표에 따로 둔다.
판정할 때 active 기록만 원본 위에 얹는다. 되돌리거나 원본이 달라지면 지우지 않고 상태만 바꾼다 (F5 이행 기록).
"""

from __future__ import annotations

import sqlite3

from schemas import Adjustment, AdjustmentRecord, AdjustmentStatus

from .database import session

# 적용 순서 = 시각 순. 같은 시각이면 넣은 순서(rowid)
_ORDER = " ORDER BY decided_at, rowid"


def _record(row: sqlite3.Row) -> AdjustmentRecord:
    return AdjustmentRecord(
        adjustment=Adjustment.model_validate_json(row["payload"]),
        status=AdjustmentStatus(row["status"]),
        closed_at=row["closed_at"],
    )


def insert_adjustment(conn: sqlite3.Connection, adj: Adjustment) -> None:
    """새 조정 기록을 active 로 넣는다."""
    conn.execute(
        "INSERT INTO adjustments (id, conflict_id, task_id, payload, status, decided_at, closed_at)"
        " VALUES (?, ?, ?, ?, ?, ?, NULL)",
        (
            adj.id,
            adj.conflict_id,
            adj.task_id,
            adj.model_dump_json(),
            AdjustmentStatus.ACTIVE.value,
            adj.decided_at.isoformat(timespec="microseconds"),
        ),
    )


def get_adjustment(adjustment_id: str) -> AdjustmentRecord | None:
    with session() as conn:
        row = conn.execute("SELECT * FROM adjustments WHERE id = ?", (adjustment_id,)).fetchone()
    return _record(row) if row else None


def active_adjustments() -> list[Adjustment]:
    """판정에 얹을 조정 기록 (적용 순서대로)."""
    with session() as conn:
        rows = conn.execute(
            "SELECT payload FROM adjustments WHERE status = ?" + _ORDER, (AdjustmentStatus.ACTIVE.value,)
        ).fetchall()
    return [Adjustment.model_validate_json(r["payload"]) for r in rows]


def close_adjustment(
    conn: sqlite3.Connection, adjustment_id: str, status: AdjustmentStatus, closed_at: str
) -> None:
    """active 기록 하나를 되돌림·무효로 닫는다. 이미 닫힌 기록은 건드리지 않는다."""
    conn.execute(
        "UPDATE adjustments SET status = ?, closed_at = ? WHERE id = ? AND status = ?",
        (status.value, closed_at, adjustment_id, AdjustmentStatus.ACTIVE.value),
    )


def close_active_for_task(
    conn: sqlite3.Connection, task_id: str, status: AdjustmentStatus, closed_at: str
) -> None:
    """한 작업에 걸린 active 기록을 모두 닫는다 (같은 작업을 다시 조정할 때 앞의 조정을 대체)."""
    conn.execute(
        "UPDATE adjustments SET status = ?, closed_at = ? WHERE task_id = ? AND status = ?",
        (status.value, closed_at, task_id, AdjustmentStatus.ACTIVE.value),
    )


def list_adjustments(task_ids: set[str] | None = None) -> list[AdjustmentRecord]:
    """저장된 조정 기록 (시각 순). task_ids 를 주면 그 작업의 기록만. 권한 거르기는 부르는 쪽 몫이다."""
    sql, args = "SELECT * FROM adjustments", ()
    if task_ids is not None:
        if not task_ids:
            return []
        sql += f" WHERE task_id IN ({','.join('?' * len(task_ids))})"
        args = tuple(sorted(task_ids))
    with session() as conn:
        rows = conn.execute(sql + _ORDER, args).fetchall()
    return [_record(r) for r in rows]
