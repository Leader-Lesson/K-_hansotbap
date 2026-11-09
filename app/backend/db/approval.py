"""원청 승인 (F5): 협력사 계획서를 승인하기 전에 겹침·위험 구역을 점검하고, 승인·반려를 기록한다.

승인은 사람이 누른다. 시스템은 판정 결과(F2)를 이 계획서 기준으로 모아 "승인 불가" 조건을 알려 줄 뿐이다.
- 승인 불가: 이 계획서 작업이 걸린 **금지** 판정이 있거나, 다른 작업들의 금지 판정으로 **막힌 구역·시간 안에서** 일한다
- 경고(승인 가능): 조건부 판정(통제조치 기재 확인), 표준서 필수 단계 누락(결함 → 보완 요청), 이미 승인된 작업과의 겹침
승인된 계획서의 작업만 3D·현황에 "확정"으로 들어간다. 반려하면 그 제출분은 일정에서 빠지고 다시 판정한다.
"""

from __future__ import annotations

from datetime import datetime

from rules.engine import is_all_zone_conflict, scope_all_zone_conflict
from rules.overlap import work_overlap
from schemas import ApprovalCheck, Conflict, ConflictType, Grade, PlanRecord, PlanStatus, RestrictedWork, Task

from .database import session
from .plans import _PLAN_SELECT, _record, _submit_lock, current_schedule, get_plan, judge, list_conflicts, plan_tasks, save_conflicts


def _active_conflicts() -> list[Conflict]:
    return [r.conflict for r in list_conflicts(include_resolved=False)]


def _restricted_work(tasks: list[Task], conflicts: list[Conflict], schedule: list[Task]) -> list[RestrictedWork]:
    """다른 작업 쌍의 금지 판정이 막은 구역·시간(= 3D 출입 금지 띠) 안에 이 계획서의 작업이 들어가는가.

    프론트 lib/restrictions.ts 와 같은 규칙: 금지 판정(표준서 결함 제외)이 걸린 작업들의 구역을 그 기간 동안 막는다.
    이 계획서 자신이 걸린 금지는 prohibited 로 따로 세므로 여기서는 뺀다.
    """
    by_id = {t.id: t for t in schedule}
    mine = {t.id for t in tasks}
    out: list[RestrictedWork] = []
    for c in conflicts:
        if c.grade != Grade.PROHIBITED or c.type == ConflictType.SOP_MISSING or mine & set(c.task_ids):
            continue
        zones = {by_id[i].zone_id for i in c.task_ids if i in by_id}
        for t in tasks:
            if t.zone_id not in zones:
                continue
            w = work_overlap(t.start, t.end, c.window_start, c.window_end)  # 둘 다 '매일 시작~끝 시각'
            if w is None:
                continue
            out.append(
                RestrictedWork(
                    task_id=t.id, task_name=t.name, zone_id=t.zone_id, window_start=w[0], window_end=w[1],
                    by_conflict_id=c.id, rule_id=c.rule_id, legal_basis=c.legal_basis,
                    reason=f"{c.rule_id} 금지 판정으로 막힌 구역·시간에 {t.contractor} '{t.name}'({t.id})이(가) 들어갑니다. {c.reason}",
                )
            )
    return out


def approval_check(plan_id: int) -> ApprovalCheck | None:
    plan = get_plan(plan_id)
    if plan is None:
        return None
    tasks = plan_tasks(plan_id)
    mine = {t.id for t in tasks}
    schedule = current_schedule()
    conflicts = _active_conflicts()
    # 전 구역 묶음 충돌(…>ALL, 작업 수십 건)은 이 계획서의 작업과 겹친 부분만 남긴다 (협력사 화면과 같은 규칙)
    involved = [
        scope_all_zone_conflict(c, schedule, plan.contractor) if is_all_zone_conflict(c) else c
        for c in conflicts
        if mine & set(c.task_ids)
    ]
    prohibited = [c for c in involved if c.grade == Grade.PROHIBITED]
    conditional = [c for c in involved if c.grade == Grade.CONDITIONAL]
    defects = [c for c in involved if c.grade == Grade.DEFECT]
    # 이미 승인된 작업(또는 원청 기준 일정)과 겹치는 것 — "기존에 승인한 곳에서 일하는 사람이 위험해지는가"
    approved_ids = {t.id for t in schedule if t.plan_status in (None, PlanStatus.APPROVED)} - mine
    endangers = [c for c in prohibited + conditional if approved_ids & set(c.task_ids)]
    restricted = _restricted_work(tasks, conflicts, schedule)

    blockers: list[str] = []
    warnings: list[str] = []
    if prohibited:
        blockers.append(f"금지 판정 {len(prohibited)}건: " + ", ".join(f"{c.rule_id}({'·'.join(c.task_ids[:3])})" for c in prohibited[:5]))
    if restricted:
        blockers.append(
            f"출입 금지 구역 안 작업 {len(restricted)}건: " + ", ".join(f"{r.task_id} {r.zone_id} {r.window_start:%m/%d %H:%M}~{r.window_end:%m/%d %H:%M}" for r in restricted[:5])
        )
    if conditional:
        warnings.append(f"조건부 판정 {len(conditional)}건 — 계획서의 통제조치(방호선반·감시자·시간 분리 등)를 확인하고 승인합니다")
    if defects:
        warnings.append(f"표준서 필수 단계 누락 {len(defects)}건 — 승인하더라도 보완 제출을 요청합니다")
    if endangers:
        warnings.append(f"이미 승인된 작업과 겹치는 판정 {len(endangers)}건 — 상대 협력사에 공유가 필요합니다")
    if plan.status != PlanStatus.PENDING:
        warnings.append("이미 처리된 계획서입니다: " + {"approved": "승인됨", "rejected": "반려"}.get(plan.status.value, plan.status.value))
    return ApprovalCheck(
        plan=plan, tasks=tasks, prohibited=prohibited, conditional=conditional, defects=defects,
        in_restricted_zone=restricted, endangers_approved=endangers,
        can_approve=not prohibited and not restricted and plan.status == PlanStatus.PENDING,
        blockers=blockers, warnings=warnings,
    )


class ApprovalRefused(Exception):
    def __init__(self, message: str, blockers: list[str]) -> None:
        super().__init__(message)
        self.message, self.blockers = message, blockers


def decide_plan(plan_id: int, approve: bool, decided_by: str, note: str | None = None, force: bool = False) -> PlanRecord:
    """승인 또는 반려. 승인은 점검을 통과해야만 한다(서버에서 막는다 — 프론트 버튼 비활성화로 대신하지 않는다).

    force 는 시드 전용: 시스템 도입 전에 이미 승인돼 있던 계획서(기준 일정 그대로)를 "기존 승인분"으로 넣을 때만 쓴다. API 로는 열지 않는다.
    """
    with _submit_lock:
        check = approval_check(plan_id)
        if check is None:
            raise KeyError(plan_id)
        if approve and not check.can_approve and not (force and check.plan.status == PlanStatus.PENDING):
            raise ApprovalRefused("승인할 수 없습니다 — 금지 판정 또는 출입 금지 구역 안 작업이 남아 있습니다", check.blockers or ["이미 처리된 계획서입니다"])
        if not approve and check.plan.status != PlanStatus.PENDING:
            raise ApprovalRefused("이미 처리된 계획서입니다", [f"현재 상태: {check.plan.status.value}"])
        now = datetime.now().isoformat(timespec="seconds")
        status = PlanStatus.APPROVED if approve else PlanStatus.REJECTED
        with session() as conn:
            conn.execute(
                "UPDATE plans SET status = ?, decided_at = ?, decided_by = ?, decision_note = ? WHERE id = ?",
                (status.value, now, decided_by, note, plan_id),
            )
        if not approve:
            # 반려된 제출분은 일정에서 빠진다 → 전체를 다시 판정해 그 작업이 만든 충돌을 해소로 적는다
            with session() as conn:
                save_conflicts(conn, None, judge(current_schedule()), now)
        with session() as conn:
            row = conn.execute(_PLAN_SELECT + " WHERE p.id = ?", (plan_id,)).fetchone()
    return _record(row)
