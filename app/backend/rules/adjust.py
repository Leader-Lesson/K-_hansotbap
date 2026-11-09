"""F4 조정안 계산·적용·재판정·전후 비교. LLM을 쓰지 않는다. pytest로 검증한다.

흐름: 충돌 → propose_adjustments(후보 계산, 가상 적용 재판정) → make_adjustment(원청이 고르면 기록)
      → recheck(원본 + 조정 기록을 합쳐 다시 판정) → diff_conflicts(사라짐 / 새로 생김 / 등급 바뀜)

협력사가 낸 원본 계획서(tasks)는 바꾸지 않는다. 조정은 Adjustment 기록으로 따로 두고 판정할 때 얹는다.
이유 문장은 규칙 CSV의 '조정안' 문구로 만든 결정적 문장이다. 나중에 LLM이 다듬을 수 있지만 판정과 후보 계산에는 쓰지 않는다.
"""

from datetime import datetime, timedelta

from rules.engine import detect_conflicts
from rules.overlap import ALL_ZONE
from schemas import (
    Adjustment,
    AdjustmentCandidate,
    AdjustmentKind,
    Conflict,
    ConflictDiff,
    ConflictGradeChange,
    ConflictType,
    Rule,
    Task,
    Zone,
)

# 새 충돌이 없는 이동일을 찾을 때 하루씩 늦춰 보는 최대 일수 [팀 설정값]
MAX_SHIFT_DAYS = 60


def _earliest_shift(
    conflict: Conflict,
    mover: Task,
    first_start: datetime,
    tasks: list[Task],
    zones: list[Zone],
    rules: list[Rule],
    before_ids: set[str],
) -> tuple[datetime, datetime, list[str]] | None:
    """mover를 first_start부터 하루씩 늦춰 가며(기간 유지) 전체를 다시 판정해, 이동일을 하나 고른다.

    대상 충돌이 사라지면서 새 충돌이 없는 가장 이른 날을 고른다. 한계(MAX_SHIFT_DAYS) 안에 없으면 대상 충돌이
    사라지는 가장 이른 날을 새 충돌 id와 함께 돌려준다(걸러 내지 않는다). 대상 충돌이 끝내 안 사라지면 None.
    """
    duration = mover.end - mover.start
    fallback: tuple[datetime, datetime, list[str]] | None = None
    for shift in range(MAX_SHIFT_DAYS + 1):
        new_start = first_start + timedelta(days=shift)
        new_end = new_start + duration
        moved = [t.model_copy(update={"start": new_start, "end": new_end}) if t.id == mover.id else t for t in tasks]
        after_ids = {c.id for c in detect_conflicts(moved, zones, rules)}
        if conflict.id in after_ids:
            continue  # 이 이동으로 원래 충돌이 안 풀리면 후보가 아니다
        new_ids = sorted(after_ids - before_ids)
        if not new_ids:
            return new_start, new_end, new_ids
        if fallback is None:
            fallback = (new_start, new_end, new_ids)
    return fallback


def _candidate(
    conflict: Conflict,
    mover: Task,
    chosen: tuple[datetime, datetime, list[str]],
    head: str,
    tasks: list[Task],
    rules: list[Rule],
) -> AdjustmentCandidate:
    """_earliest_shift 결과로 후보를 만든다. head는 '무엇을 어디로 옮기나' 문장이고 나머지 문장은 공통이다."""
    new_start, new_end, new_ids = chosen
    successors = sorted(t.id for t in tasks if mover.id in t.predecessors and t.start < new_end)
    rule = next((r for r in rules if r.id == conflict.rule_id), None)
    reason = head
    if rule:
        reason += f" 규칙 {rule.id} 조정안: {rule.adjustment}."
    if successors:
        reason += (
            f" 옮기면 {', '.join(successors)}의 시작이 {mover.id}의 새 종료({new_end:%Y-%m-%d})보다 앞서게 되어 "
            "일정 확인이 필요합니다."
        )
    if new_ids:
        reason += f" 새 충돌 {len(new_ids)}건이 생깁니다."
    return AdjustmentCandidate(
        id=f"{conflict.id}:shift:{mover.id}:{new_start:%Y%m%d}",
        kind=AdjustmentKind.RESCHEDULE,
        task_id=mover.id,
        conflict_id=conflict.id,
        original_start=mover.start,
        original_end=mover.end,
        new_start=new_start,
        new_end=new_end,
        reason=reason,
        resolves=True,
        new_conflict_ids=new_ids,
        affected_successors=successors,
    )


def _next_day_start(end: datetime, mover: Task) -> datetime:
    """end 다음 날, 옮기는 작업의 원래 시작 시각. 야간 작업을 주간으로 바꾸지 않는다."""
    return datetime.combine(end.date() + timedelta(days=1), mover.start.time())


def propose_adjustments(
    conflict: Conflict, tasks: list[Task], zones: list[Zone], rules: list[Rule]
) -> list[AdjustmentCandidate]:
    """2작업 충돌을 푸는 일정 이동(기간 유지) 후보를 계산한다. 추천 안이 맨 앞이다.

    - 순서 위반(SEQUENCE): 후행 작업 B만 "B를 막고 있는 모든 선행 작업이 끝난 다음 날"로 옮긴다
      (선행을 뒤로 미루면 순서가 더 나빠진다).
    - 그 밖의 2작업 충돌: A를 B 종료 다음 날로 옮기는 안과 B를 A 종료 다음 날로 옮기는 안, 최대 2개.
    - 어느 쪽이든 하루 중 시작 시각과 기간은 옮기는 작업의 원래 값을 유지한다.
    - 방향마다 _earliest_shift 로 새 충돌이 없는 가장 이른 날을 찾고, 대상 충돌이 안 풀리는 방향은 버린다.
    - 전 구역 묶음(>ALL), 혼재(R30), 표준서 결함처럼 작업이 정확히 2개가 아닌 충돌은 후보가 없다.
      (전 구역 작업은 위치를 정해 다시 제출할 일이다.)

    정렬: 새 충돌 수 → 영향 받는 후행 작업 수 → 옮기는 시간 → 작업 ID. 1등에만 recommended=True.
    """
    ids = conflict.task_ids
    if len(ids) != 2 or conflict.id.endswith(f">{ALL_ZONE}"):
        return []
    by_id = {t.id: t for t in tasks}
    a, b = by_id.get(ids[0]), by_id.get(ids[1])
    if a is None or b is None:
        return []

    before = detect_conflicts(tasks, zones, rules)
    before_ids = {c.id for c in before}
    found: list[AdjustmentCandidate] = []

    if conflict.type == ConflictType.SEQUENCE:
        # B를 막고 있는 선행 작업: 이 충돌의 선행 작업 + B가 걸린 다른 순서 위반의 선행 작업
        blocker_ids = {a.id} | {
            c.task_ids[0] for c in before if c.type == ConflictType.SEQUENCE and len(c.task_ids) == 2 and c.task_ids[1] == b.id
        }
        blockers = [by_id[i] for i in sorted(blocker_ids) if i in by_id]
        latest_end = max(t.end for t in blockers)
        chosen = _earliest_shift(conflict, b, _next_day_start(latest_end, b), tasks, zones, rules, before_ids)
        if chosen is not None:
            head = (
                f"{b.name}({b.id})을(를) {chosen[0]:%Y-%m-%d}로 옮겨, 선행 작업 {', '.join(t.id for t in blockers)}이(가) "
                f"모두 끝난({latest_end:%Y-%m-%d}) 뒤에 시작하게 합니다."
            )
            found.append(_candidate(conflict, b, chosen, head, tasks, rules))
        # B를 옮겨도 안 풀리는 순서 규칙(R23: A가 B 종료 뒤에 해야 함)은 아래 일반 방향 탐색으로 푼다

    if not found:
        for mover, other in ((a, b), (b, a)):
            chosen = _earliest_shift(conflict, mover, _next_day_start(other.end, mover), tasks, zones, rules, before_ids)
            if chosen is None:
                continue
            head = (
                f"{mover.name}({mover.id})을(를) {chosen[0]:%Y-%m-%d}로 옮겨 {other.name}({other.id})이(가) "
                f"끝난({other.end:%Y-%m-%d}) 뒤에 시작하게 합니다."
            )
            found.append(_candidate(conflict, mover, chosen, head, tasks, rules))

    found.sort(key=lambda c: (len(c.new_conflict_ids), len(c.affected_successors), c.new_start - c.original_start, c.task_id))
    if found:
        found[0].recommended = True
    return found


def make_adjustment(candidate: AdjustmentCandidate, decided_by: str, decided_at: datetime) -> Adjustment:
    """원청 담당자가 고른 후보를 조정 기록으로 만든다 (누가·언제·무엇을 바꿨는지)."""
    return Adjustment(
        id=f"ADJ-{candidate.id}",
        kind=candidate.kind,
        task_id=candidate.task_id,
        conflict_id=candidate.conflict_id,
        original_start=candidate.original_start,
        original_end=candidate.original_end,
        new_start=candidate.new_start,
        new_end=candidate.new_end,
        reason=candidate.reason,
        decided_by=decided_by,
        decided_at=decided_at,
    )


def apply_adjustments(tasks: list[Task], adjustments: list[Adjustment]) -> list[Task]:
    """원본 위에 조정 기록을 얹은 복사본을 돌려준다. 입력 tasks는 바꾸지 않는다. 같은 작업의 기록이 여럿이면 뒤의 것이 이긴다."""
    latest = {adj.task_id: adj for adj in adjustments}
    out: list[Task] = []
    for t in tasks:
        adj = latest.get(t.id)
        update = {"start": adj.new_start, "end": adj.new_end} if adj else {}
        out.append(t.model_copy(update=update, deep=True))
    return out


def recheck(
    tasks: list[Task], adjustments: list[Adjustment], zones: list[Zone], rules: list[Rule]
) -> list[Conflict]:
    """원본 + 조정 기록을 합쳐 다시 판정한다."""
    return detect_conflicts(apply_adjustments(tasks, adjustments), zones, rules)


def diff_conflicts(before: list[Conflict], after: list[Conflict]) -> ConflictDiff:
    """조정 전후 충돌을 Conflict.id 기준으로 비교한다."""
    b = {c.id: c for c in before}
    a = {c.id: c for c in after}
    return ConflictDiff(
        resolved=[b[i] for i in b if i not in a],
        introduced=[a[i] for i in a if i not in b],
        grade_changed=[
            ConflictGradeChange(conflict_id=i, before=b[i].grade, after=a[i].grade)
            for i in b
            if i in a and b[i].grade != a[i].grade
        ],
    )
