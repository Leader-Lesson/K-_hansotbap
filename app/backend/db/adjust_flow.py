"""F4 조정안 적용·되돌리기 흐름: 후보 계산 → 적용(기록 저장) → 일정에 얹어 재판정 → 전후 비교.

판정과 후보 계산은 rules/adjust.py(LLM 없음)가 한다. 여기는 그 결과를 DB 기록과 이어 붙인다.
적용·되돌리기는 제출과 같은 락 안에서 돈다 — 재판정이 일정 전체를 보므로 제출과 동시에 돌면 안 된다.
락은 재진입이 안 되므로 락 안에서 락을 잡는 함수(submit_plan 등)를 부르지 않는다.
"""

from __future__ import annotations

import time
from datetime import datetime
from uuid import uuid4

import sqlite3

from rules.adjust import apply_adjustments, diff_conflicts, make_adjustment, propose_adjustments
from rules.data_loader import load_rules, load_zones
from schemas import (
    AdjustmentApply,
    AdjustmentCandidate,
    AdjustmentResult,
    AdjustmentStatus,
    Conflict,
    Task,
)

from .adjustments import (
    active_adjustments,
    close_active_for_task,
    close_adjustment,
    get_adjustment,
    insert_adjustment,
)
from .database import session
from .plans import _submit_lock, base_schedule, current_schedule, judge, save_conflicts


class ConflictNotFound(Exception):
    """현재 일정을 판정한 결과에 그 충돌이 없다 (이미 해소됐거나 없는 ID)."""


class CandidateNotFound(Exception):
    """그 충돌에 대해 지금 계산한 후보 중에 그 candidate_id 가 없다."""


class AdjustmentNotFound(Exception):
    pass


class AdjustmentNotActive(Exception):
    """이미 되돌렸거나 무효가 된 조정이다."""


def _find_conflict(conflicts: list[Conflict], conflict_id: str) -> Conflict:
    found = next((c for c in conflicts if c.id == conflict_id), None)
    if found is None:
        raise ConflictNotFound(conflict_id)
    return found


def _latest_plan_id() -> int | None:
    with session() as conn:
        return conn.execute("SELECT MAX(id) FROM plans").fetchone()[0]


def _rejudge(tasks: list[Task]) -> tuple[list[Conflict], float]:
    """일정을 다시 판정하고 걸린 시간(밀리초)을 함께 돌려준다.

    저장 전에 부른다 — 재판정이 실패했을 때 조정 기록만 남고 충돌 표가 옛 상태로 남지 않도록.
    """
    started = time.perf_counter()
    conflicts = judge(tasks)
    return conflicts, (time.perf_counter() - started) * 1000


def _record_decision(conn: sqlite3.Connection, conflict_id: str, decided_by: str, decision: str, at: str) -> None:
    conn.execute(
        "INSERT INTO decisions (conflict_id, decided_by, decision, decided_at) VALUES (?, ?, ?, ?)",
        (conflict_id, decided_by, decision, at),
    )


def _result(adjustment_id: str, before: list[Conflict], after: list[Conflict], ms: float) -> AdjustmentResult:
    record = get_adjustment(adjustment_id)
    assert record is not None  # 방금 같은 락 안에서 저장했다
    return AdjustmentResult(record=record, conflicts=after, diff=diff_conflicts(before, after), recheck_ms=ms)


def candidates_for(conflict_id: str) -> list[AdjustmentCandidate]:
    """현재 일정을 판정해 그 충돌을 찾고, 풀 수 있는 조정안 후보를 계산한다. 읽기만 한다."""
    tasks = current_schedule()
    conflict = _find_conflict(judge(tasks), conflict_id)
    return propose_adjustments(conflict, tasks, load_zones(), load_rules())


def apply_adjustment(req: AdjustmentApply) -> AdjustmentResult:
    """원청이 고른 후보를 기록하고, 일정에 얹어 재판정한다."""
    with _submit_lock:
        now = datetime.now()
        now_s = now.isoformat(timespec="seconds")
        tasks = current_schedule()
        before = judge(tasks)

        conflict = _find_conflict(before, req.conflict_id)
        candidates = propose_adjustments(conflict, tasks, load_zones(), load_rules())
        cand = next((c for c in candidates if c.id == req.candidate_id), None)
        if cand is None:
            raise CandidateNotFound(req.candidate_id)

        # 이미 조정된 작업을 다시 조정해도 stale 판단은 협력사가 낸 원본 일정 기준이어야 한다
        original = next(t for t in base_schedule() if t.id == cand.task_id)
        adj = make_adjustment(cand, req.decided_by, now).model_copy(
            update={
                "id": f"ADJ-{uuid4().hex[:12]}",
                "original_start": original.start,
                "original_end": original.end,
            }
        )

        after, ms = _rejudge(apply_adjustments(tasks, [adj]))
        replaced = [a for a in active_adjustments() if a.task_id == adj.task_id]
        plan_id = _latest_plan_id()
        with session() as conn:
            save_conflicts(conn, plan_id, before, now_s)  # 대상 충돌 행이 DB에 있도록
            close_active_for_task(conn, adj.task_id, AdjustmentStatus.REVERTED, now_s)  # 앞의 조정을 대체
            for old in replaced:
                _record_decision(conn, old.conflict_id, req.decided_by, f"대체: {old.reason}", now_s)
            insert_adjustment(conn, adj)
            _record_decision(conn, req.conflict_id, req.decided_by, adj.reason, now_s)
            save_conflicts(conn, plan_id, after, now_s)
        return _result(adj.id, before, after, ms)


def revert_adjustment(adjustment_id: str, decided_by: str) -> AdjustmentResult:
    """적용 중인 조정을 되돌리고 다시 판정한다. 사라졌던 충돌은 save_conflicts 가 open 으로 되돌린다.

    decided_by 는 되돌린 사람이다. 이행 기록에 처음 적용한 사람 이름을 대신 적지 않는다.
    """
    with _submit_lock:
        now_s = datetime.now().isoformat(timespec="seconds")
        record = get_adjustment(adjustment_id)
        if record is None:
            raise AdjustmentNotFound(adjustment_id)
        if record.status != AdjustmentStatus.ACTIVE:
            raise AdjustmentNotActive(adjustment_id)
        adj = record.adjustment

        before = judge(current_schedule())
        after, ms = _rejudge(current_schedule(exclude_adjustment=adj.id))
        plan_id = _latest_plan_id()
        with session() as conn:
            close_adjustment(conn, adj.id, AdjustmentStatus.REVERTED, now_s)
            _record_decision(conn, adj.conflict_id, decided_by, f"되돌림: {adj.reason}", now_s)
            save_conflicts(conn, plan_id, after, now_s)
        return _result(adj.id, before, after, ms)
