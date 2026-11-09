"""F2 순서 위반(R08) 시험. 시연 핵심 장면 S1: 배관 협력사가 질소·가스 라인 연결(P34)을 앞당겨 제출한다."""

from datetime import datetime

from rules.data_loader import load_rules, load_wbs_tasks, load_zones
from rules.engine import detect_conflicts, detect_sequence_violations, grade_of
from schemas import ConflictType, Grade, Hazard

# D0 = 2026-11-12(config.project_d0). 작업은 시작일 07시 ~ 종료일 19시로 읽는다(data_loader)
D105 = datetime(2027, 2, 25, 7)  # S1: P34를 앞당긴 날. P22(~D110), P21(~D105)이 아직 안 끝났다
D111 = datetime(2027, 3, 3, 7)  # P22(03-02 19시)가 끝난 다음 날. 조정안 적용 뒤


def _with_p34(**update):
    return [t.model_copy(update=update) if t.id == "P34" else t for t in load_wbs_tasks()]


def test_baseline_schedule_has_no_sequence_violation():
    # 기본 일정에는 순서 위반이 없다. '선행 작업' 열은 느슨한 의존이라 P01→P02처럼 선행보다
    # 먼저 시작하는 쌍이 있지만 R08에 해당하지 않으므로 잡지 않는다
    assert detect_sequence_violations(load_wbs_tasks(), load_rules()) == []


def test_s1_p34_before_p22_done_is_prohibited_sequence_violation():
    conflicts = detect_sequence_violations(_with_p34(start=D105), load_rules())

    # 선행 작업 중 P21(~D105 19시), P22(~D110 19시)가 아직 안 끝났다. P20(~D95)은 끝났다
    assert [c.task_ids for c in conflicts] == [["P21", "P34"], ["P22", "P34"]]

    c = conflicts[1]
    assert c.id == "R08:P22>P34"
    assert c.type == ConflictType.SEQUENCE
    assert c.grade == Grade.PROHIBITED
    assert c.rule_id == "R08"
    assert c.legal_basis  # 모든 판정에 근거
    assert "완료" in (c.suggestion or "")  # 조정안: 선행 작업 완료·인원 철수 확인 후 착수
    assert c.window_start == D105
    assert c.window_end == datetime(2027, 3, 2, 19)  # P22가 끝날 때까지
    assert [s.locator for s in c.sources] == ["P22", "P34"]  # 원문 위치


def test_after_adjustment_conflict_disappears():
    # 조정안 "P22 완료 뒤로 이동"을 적용하면(P34 시작을 P22 끝난 다음 날로) 사라진다
    assert detect_sequence_violations(_with_p34(start=D111), load_rules()) == []


def test_non_gas_task_is_not_line_connection():
    # R08 후행 작업은 가스 계통 연결 작업이다. 가스 유형이 아니면 같은 일정이라도 R08에 걸리지 않는다
    tasks = _with_p34(start=D105, hazards=[Hazard.HOT_WORK])
    assert detect_sequence_violations(tasks, load_rules()) == []


def test_detect_conflicts_includes_sequence_violations():
    tasks = _with_p34(start=D105)
    got = detect_conflicts(tasks, load_zones(), load_rules())
    assert [c.id for c in got] == ["R08:P21>P34", "R08:P22>P34"]


def test_grade_of_maps_csv_judgement_to_three_levels():
    by_id = {r.id: r for r in load_rules()}
    assert grade_of(by_id["R08"]) == Grade.PROHIBITED  # "금지 (순서 위반)"
    assert grade_of(by_id["R02"]) == Grade.CONDITIONAL  # "조건부"
    assert grade_of(by_id["R26"]) == Grade.DEFECT  # "결함: 화재감시자 미기재"
