"""F2 충돌 판정: 데모 시나리오 S1~S7(docs/20 5장), 근거 붙이기, 전 구역 작업, 혼재 경고, 표준서 결함, 제출 흐름."""

from datetime import datetime

import pytest
from conftest import s1_xlsx
from fastapi.testclient import TestClient

from main import app
from rules.data_loader import load_rules, load_wbs_tasks, load_zones
from rules.engine import MIXED_WORK_LAW, detect_conflicts
from schemas import ConflictType, Grade, Hazard, SopMatch, SourceRef, Task

client = TestClient(app)
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def judge(tasks):
    return {c.id: c for c in detect_conflicts(tasks, load_zones(), load_rules())}


def moved(task_id: str, **update) -> list[Task]:
    return [t.model_copy(update=update) if t.id == task_id else t for t in load_wbs_tasks()]


@pytest.fixture(scope="module")
def baseline():
    return judge(load_wbs_tasks())


def test_every_conflict_has_rule_law_and_source(baseline):
    assert baseline, "기본 일정에도 S2~S4·S7 충돌이 있다"
    for c in baseline.values():
        assert c.rule_id and c.reason and c.suggestion
        assert MIXED_WORK_LAW in c.legal_basis  # 원청의 혼재작업 확인·조정 의무 (산안법 제64조)
        assert c.sources and all(s.locator for s in c.sources)  # 원문 위치
        assert c.window_start <= c.window_end
        assert c.grade in (Grade.PROHIBITED, Grade.CONDITIONAL, Grade.DEFECT)


def test_s1_moving_p34_early_creates_sequence_and_gas_conflicts(baseline):
    after = judge(moved("P34", start=datetime(2027, 2, 25, 7)))
    new = set(after) - set(baseline)
    assert {"R08:P21>P34", "R08:P22>P34", "R07:P22>P34"} <= new
    assert after["R08:P22>P34"].type == ConflictType.SEQUENCE and after["R08:P22>P34"].grade == Grade.PROHIBITED
    # 조정안: P22 완료·인원 철수 확인 뒤(03-03)로 옮기면 P22와의 충돌이 사라진다
    adjusted = judge(moved("P34", start=datetime(2027, 3, 3, 7)))
    assert not [i for i in adjusted if "P22" in i and "P34" in i]


def test_s2_vertical_top_install_over_hearth(baseline):
    c = baseline["R16:P23>P20"]
    assert c.type == ConflictType.VERTICAL and c.grade == Grade.CONDITIONAL
    assert "위아래" in c.reason


def test_s3_crane_lift_next_to_casthouse(baseline):
    c = baseline["R18:P17>P24"]
    assert c.grade == Grade.PROHIBITED and "인접 구역" in c.reason


def test_s4_hot_work_vs_gas_opening_even_same_contractor(baseline):
    c = baseline["R04:P10>P25"]  # 두 작업 모두 가상-제관F — 화기×가스는 같은 협력사 안에서도 본다
    assert c.type == ConflictType.HOT_GAS and c.grade == Grade.PROHIBITED
    assert "같은 협력사" in c.reason


def test_s5_salamander_tapping_when_top_dismantle_moves_a_day_early(baseline):
    assert "R12:P07>P09" not in baseline
    after = judge(moved("P09", start=datetime(2026, 11, 14, 7)))
    assert after["R12:P07>P09"].grade == Grade.PROHIBITED


def test_s6_stove_test_before_brick_repair_done(baseline):
    after = judge(moved("P35", start=datetime(2027, 2, 20, 7)))
    assert {"R07:P26>P35", "R08:P26>P35"} <= set(after) - set(baseline)


def test_s7_scaffold_all_zone_is_grouped_until_location_known(baseline):
    grouped = baseline["R17:P30>ALL"]
    assert grouped.grade == Grade.CONDITIONAL and "P18" in grouped.task_ids
    assert not [i for i in baseline if i.startswith("R17:P30>P")]  # 전 구역 작업은 쌍마다 쏟아내지 않는다
    # 비계 계획서가 철피(SHELL) 구역을 적어 오면 쌍별 판정으로 바뀐다
    located = judge(moved("P30", zone_id="SHELL"))
    assert located["R17:P30>P18"].grade == Grade.PROHIBITED
    assert "R03:P18>P30" in located


def test_same_contractor_pairs_only_for_fatal_combinations(baseline):
    # P21(풍구, 중량물)은 P20(노저) 위지만 둘 다 가상-축로I → 위아래(R16)는 같은 협력사끼리 보지 않는다
    assert "R16:P21>P20" not in baseline


def _task(id: str, contractor: str, zone: str, start: str, end: str, name: str = "일반 작업", hazards=()) -> Task:
    return Task(
        id=id, contractor=contractor, name=name, zone_id=zone,
        start=datetime.fromisoformat(start), end=datetime.fromisoformat(end),
        hazards=list(hazards), source=SourceRef(file="test", locator=id, text=name),
    )


def test_r30_three_contractors_same_zone_same_time():
    tasks = [
        _task("A1", "가상-A", "CASTHOUSE", "2027-01-05T07:00", "2027-01-05T19:00"),
        _task("B1", "가상-B", "CASTHOUSE", "2027-01-05T09:00", "2027-01-05T15:00"),
        _task("C1", "가상-C", "CASTHOUSE", "2027-01-05T13:00", "2027-01-05T17:00"),
        _task("D1", "가상-D", "ALL", "2027-01-05T07:00", "2027-01-05T19:00"),  # 전 구역 작업은 세지 않는다
    ]
    got = judge(tasks)
    c = got["R30:CASTHOUSE:202701051300"]
    assert c.task_ids == ["A1", "B1", "C1"] and c.grade == Grade.CONDITIONAL
    assert (c.window_start, c.window_end) == (datetime(2027, 1, 5, 13), datetime(2027, 1, 5, 15))


def test_r25_combustibles_within_fire_watch():
    tasks = [
        _task("H1", "가상-A", "CASTHOUSE", "2027-01-05T07:00", "2027-01-05T12:00", "탕도 용접", [Hazard.HOT_WORK]),
        _task("W1", "가상-B", "CASTHOUSE", "2027-01-05T12:10", "2027-01-05T15:00", "보온재 반입"),
    ]
    assert judge(tasks)["R25:H1>W1"].type == ConflictType.HOT_GAS


def test_sop_missing_step_becomes_defect():
    task = _task("P34", "가상-배관O", "TUYERE", "2027-03-04T07:00", "2027-03-04T19:00", "질소 라인 연결", [Hazard.GAS])
    sop = SopMatch(task_id="P34", sop_id="SOP-12", title="가스 배관 연결 표준", score=0.9, reason="작업명 일치", missing_steps=["작업 전 가스 측정"])
    got = detect_conflicts([task], load_zones(), load_rules(), sop_matches=[sop])
    c = next(c for c in got if c.type == ConflictType.SOP_MISSING)
    assert c.grade == Grade.DEFECT and "제65조" in c.legal_basis and "가스 측정" in c.reason


def test_end_to_end_upload_submit_conflict_then_adjust():
    """시연 핵심 흐름: S1 엑셀 업로드(F1) → 제출 순간 판정(F2) → P34를 P22 완료 뒤로 고쳐 재제출 → 해소."""
    ext = client.post("/api/plans", files={"file": ("배관O_수정.xlsx", s1_xlsx(), XLSX)}).json()
    tasks = [t["task"] for t in ext["tasks"]]
    first = client.post("/api/plans/submit", json={"contractor": "가상-배관O", "file": ext["file"], "tasks": tasks}).json()
    ids = {r["conflict"]["id"] for r in client.get("/api/conflicts").json()}
    assert {"R08:P21>P34", "R08:P22>P34"} <= ids and first["refresh"] is True

    fixed = [t | {"start": "2027-03-03T08:00:00", "end": "2027-03-07T17:00:00"} if t["id"] == "P34" else t for t in tasks]
    second = client.post("/api/plans/submit", json={"contractor": "가상-배관O", "file": "배관O_조정.xlsx", "tasks": fixed}).json()
    assert second["plan"]["version"] == 2
    remaining = [r["conflict"] for r in client.get("/api/conflicts").json()]
    assert not [c for c in remaining if c["rule_id"] == "R08" and "P34" in c["task_ids"]]
