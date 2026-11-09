"""F4 조정안·재판정 필수 시험. 시연 핵심 장면 S1: P34 앞당김 → 순서 위반 → 조정안 적용 → 해소.

판정 엔진(F2)은 기본 일정에서도 충돌을 판정하므로, 충돌은 목록 순서가 아니라 id로 고르고
"앞당김이 만든 충돌만 사라지는가"를 기본 일정과 비교해 본다.
"""

from datetime import datetime

from rules import adjust
from rules.adjust import apply_adjustments, diff_conflicts, make_adjustment, propose_adjustments, recheck
from rules.data_loader import load_rules, load_wbs_tasks, load_zones
from rules.engine import detect_conflicts
from schemas import Conflict, ConflictType, Grade

D105 = datetime(2027, 2, 25, 7)  # S1: P34를 앞당긴 날 (P22 ~03-02 19시, P21 ~02-25 19시가 아직 안 끝남)
D111 = datetime(2027, 3, 3, 7)  # 모든 선행 작업이 끝난 다음 날 07시
P34_NEW_END = datetime(2027, 3, 18, 19)  # 기간(15일 12시간)을 유지한 새 종료
DECIDED_AT = datetime(2026, 11, 12, 9)
TARGET = "R08:P22>P34"


def _s1_tasks():
    return [t.model_copy(update={"start": D105}) if t.id == "P34" else t for t in load_wbs_tasks()]


def _ids(conflicts):
    return {c.id for c in conflicts}


def _conflict(cid: str, grade: Grade = Grade.PROHIBITED) -> Conflict:
    return Conflict(
        id=cid, type=ConflictType.SEQUENCE, grade=grade, task_ids=["A", "B"], rule_id="R08", legal_basis="x",
        window_start=D105, window_end=D111, reason="x",
    )


def test_s1_adjustment_resolves_only_what_the_change_caused():
    zones, rules = load_zones(), load_rules()
    baseline = detect_conflicts(load_wbs_tasks(), zones, rules)
    tasks = _s1_tasks()
    before = detect_conflicts(tasks, zones, rules)
    target = next(c for c in before if c.id == TARGET)

    cand = propose_adjustments(target, tasks, zones, rules)[0]
    assert (cand.task_id, cand.new_start, cand.new_end) == ("P34", D111, P34_NEW_END)  # 기간 유지
    assert cand.resolves and cand.new_conflict_ids == []
    assert cand.affected_successors == ["P36"]  # P36 코크스 충전(03-12 시작)이 P34 새 종료(03-18)보다 앞섬

    adj = make_adjustment(cand, "원청 담당자", DECIDED_AT)
    assert (adj.decided_by, adj.decided_at, adj.original_start, adj.new_start) == ("원청 담당자", DECIDED_AT, D105, D111)

    after = recheck(tasks, [adj], zones, rules)
    diff = diff_conflicts(before, after)
    assert _ids(after) == _ids(baseline)  # 앞당김이 만든 충돌만 사라지고 기본 일정 충돌은 그대로
    assert {"R08:P21>P34", TARGET} <= _ids(diff.resolved)
    assert diff.introduced == []


def test_apply_keeps_original_plan_and_removing_the_record_restores_conflicts():
    tasks, zones, rules = _s1_tasks(), load_zones(), load_rules()
    target = next(c for c in detect_conflicts(tasks, zones, rules) if c.id == TARGET)
    adj = make_adjustment(propose_adjustments(target, tasks, zones, rules)[0], "원청 담당자", DECIDED_AT)

    adjusted = apply_adjustments(tasks, [adj])

    assert {t.id: t for t in tasks}["P34"].start == D105  # 협력사가 낸 원본은 그대로
    assert {t.id: t for t in adjusted}["P34"].start == D111
    assert TARGET in _ids(recheck(tasks, [], zones, rules))  # 기록을 빼면(되돌리기) 충돌이 다시 나온다


def test_two_task_conflict_gets_both_directions_and_grouped_conflict_gets_none():
    tasks, zones, rules = load_wbs_tasks(), load_zones(), load_rules()
    by_id = {c.id: c for c in detect_conflicts(tasks, zones, rules)}

    candidates = propose_adjustments(by_id["R16:P23>P20"], tasks, zones, rules)  # S2 위아래
    assert {c.task_id for c in candidates} == {"P23", "P20"}
    assert [c.recommended for c in candidates] == [True, False]

    grouped = next(c for cid, c in by_id.items() if cid.endswith(">ALL"))
    assert propose_adjustments(grouped, tasks, zones, rules) == []  # 위치를 정해 재제출할 일


def test_diff_reports_resolved_introduced_and_grade_changed():
    before = [_conflict("a"), _conflict("b", Grade.PROHIBITED)]
    after = [_conflict("b", Grade.CONDITIONAL), _conflict("c")]
    diff = diff_conflicts(before, after)
    assert [c.id for c in diff.resolved] == ["a"]
    assert [c.id for c in diff.introduced] == ["c"]
    assert [(g.conflict_id, g.before, g.after) for g in diff.grade_changed] == [("b", Grade.PROHIBITED, Grade.CONDITIONAL)]


def test_picks_earliest_shift_without_new_conflicts(monkeypatch):
    # 첫 이동일(D111)이 새 충돌을 만들면 건너뛰고 새 충돌이 없는 가장 이른 날(D112)을 고른다
    real = adjust.detect_conflicts

    def fake(tasks, zones, rules):
        out = real(tasks, zones, rules)
        if next(t for t in tasks if t.id == "P34").start == D111:
            out.append(_conflict("NEW:1"))
        return out

    monkeypatch.setattr(adjust, "detect_conflicts", fake)
    tasks, zones, rules = _s1_tasks(), load_zones(), load_rules()
    target = next(c for c in real(tasks, zones, rules) if c.id == TARGET)
    cand = propose_adjustments(target, tasks, zones, rules)[0]
    assert cand.new_start == datetime(2027, 3, 4, 7)
    assert cand.new_conflict_ids == []
