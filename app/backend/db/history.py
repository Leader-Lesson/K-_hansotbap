"""F5 이행 기록: 제출·판정·공유·조정 기록을 시각순 한 줄 목록으로 모은다 (읽기만 한다).

저장은 각 기능의 표가 이미 하고 있다. 되돌린 사람처럼 decisions 표에만 있는 정보는 거기서 읽는다.
"""

from __future__ import annotations

from datetime import datetime

from schemas import AdjustmentStatus, Conflict, HistoryEvent, HistoryEventKind as Kind

from .adjustments import list_adjustments
from .database import session
from .plans import current_schedule, list_conflicts, list_plans
from .shares import shared_by_map
from .tbm import list_checks

_ORDER = {kind: i for i, kind in enumerate(Kind)}

# decisions.decision 은 앞머리로 종류를 나눈다 (db/adjust_flow.py 가 적는 형식)
_REVERTED, _REPLACED = "되돌림: ", "대체: "


def _decision_kind(decision: str) -> Kind:
    if decision.startswith(_REVERTED):
        return Kind.ADJUSTMENT_REVERTED
    if decision.startswith(_REPLACED):
        return Kind.ADJUSTMENT_REPLACED
    return Kind.ADJUSTMENT_APPLIED


def list_history(contractor: str | None = None) -> list[HistoryEvent]:
    """이행 기록 (시각순). 협력사로 부르면 자기 제출과, 공유된 충돌 중 자기 작업이 걸린 기록만 준다."""
    records = list_conflicts(contractor, include_resolved=True)
    visible = {r.conflict.id: r.conflict for r in records}
    by_task = {t.id: t for t in current_schedule()}
    actors = shared_by_map()

    def parties(c: Conflict) -> list[str]:
        return sorted({by_task[t].contractor for t in c.task_ids if t in by_task})

    def conflict_event(kind: Kind, at: datetime, c: Conflict, detail: str, actor: str | None = None) -> HistoryEvent:
        return HistoryEvent(
            at=at, kind=kind, target_id=c.id, actor=actor, contractors=parties(c), detail=detail,
            rule_id=c.rule_id, legal_basis=c.legal_basis,
        )

    events = [
        HistoryEvent(
            at=p.submitted_at, kind=Kind.PLAN_SUBMITTED, target_id=f"plan-{p.id}", actor=p.submitted_by,
            contractors=[p.contractor], detail=f"{p.file} ({p.version}번째 제출, 작업 {p.task_count}건)",
        )
        for p in list_plans(contractor)
    ]

    for r in records:
        c = r.conflict
        events.append(conflict_event(Kind.CONFLICT_JUDGED, r.judged_at, c, f"[{c.grade.value}] {c.reason}"))
        if r.resolved_at:
            events.append(conflict_event(Kind.CONFLICT_RESOLVED, r.resolved_at, c, "재판정에서 사라짐"))
        if r.shared_at:
            events.append(conflict_event(Kind.CONFLICT_SHARED, r.shared_at, c, "원청 확인 후 협력사 공유", actors.get(c.id)))

    with session() as conn:
        decisions = conn.execute("SELECT * FROM decisions ORDER BY id").fetchall()
    for d in decisions:
        if c := visible.get(d["conflict_id"]):
            at = datetime.fromisoformat(d["decided_at"])
            events.append(conflict_event(_decision_kind(d["decision"]), at, c, d["decision"], d["decided_by"]))

    for record in list_adjustments():
        adj = record.adjustment
        if record.status == AdjustmentStatus.STALE and record.closed_at and (c := visible.get(adj.conflict_id)):
            events.append(
                conflict_event(Kind.ADJUSTMENT_STALE, record.closed_at, c, f"재제출로 조정 무효: {adj.reason}")
            )

    for check in list_checks(contractor):
        total, missing = len(check.results), len(check.missing_ids)
        events.append(
            HistoryEvent(
                at=check.checked_at, kind=Kind.TBM_CHECKED, target_id=f"tbm-{check.id}", actor=check.checked_by,
                contractors=[check.contractor],
                detail=f"{check.date} TBM: 전달 항목 {total}건 중 {total - missing}건 전달, {missing}건 미전달",
            )
        )

    return sorted(events, key=lambda e: (e.at, _ORDER[e.kind]))
