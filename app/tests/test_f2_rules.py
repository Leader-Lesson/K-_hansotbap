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


def moved_many(**updates) -> list[Task]:
    """여러 작업을 한꺼번에 옮긴다: moved_many(P23={"end": ...}, P24={...})."""
    return [t.model_copy(update=updates[t.id]) if t.id in updates else t for t in load_wbs_tasks()]


def test_baseline_has_no_conflicts(baseline):
    # 기준 일정(원청이 짠 공정)은 주간 작업만, 겹치지 않게 짜 두었다. 충돌은 협력사가 계획을 바꿔 낼 때 생긴다
    assert baseline == {}


def test_every_conflict_has_rule_law_and_source():
    # 시연 장면 S1~S7 을 한꺼번에 일으킨 일정
    got = judge(moved_many(
        P34={"start": datetime(2027, 2, 26, 7), "end": datetime(2027, 3, 1, 19)},
        P23={"end": datetime(2027, 2, 20, 19)},
        P24={"start": datetime(2027, 1, 8, 7), "end": datetime(2027, 1, 17, 19)},
        P10={"start": datetime(2026, 11, 15, 7), "end": datetime(2026, 11, 24, 19)},
        P09={"start": datetime(2026, 11, 15, 7)},
        P26={"end": datetime(2027, 3, 10, 19)},
    ))
    assert got
    for c in got.values():
        assert c.rule_id and c.reason and c.suggestion
        assert MIXED_WORK_LAW in c.legal_basis  # 원청의 혼재작업 확인·조정 의무 (산안법 제64조)
        assert c.sources and all(s.locator for s in c.sources)  # 원문 위치
        assert c.window_start <= c.window_end
        assert c.grade in (Grade.PROHIBITED, Grade.CONDITIONAL, Grade.DEFECT)


def test_s1_moving_p34_early_creates_sequence_and_gas_conflicts(baseline):
    after = judge(moved("P34", start=datetime(2027, 2, 26, 7), end=datetime(2027, 3, 3, 12)))
    new = set(after) - set(baseline)
    assert {"R08:P22>P34", "R07:P22>P34"} <= new  # 노흉 축조(P22, ~03-05)가 아직 안 끝났고 같은 오전 시간대
    assert after["R08:P22>P34"].type == ConflictType.SEQUENCE and after["R08:P22>P34"].grade == Grade.PROHIBITED
    # 조정안: P22 완료·인원 철수 확인 뒤(기준 03-06)로 옮기면 P22와의 충돌이 사라진다
    adjusted = judge(moved("P34", start=datetime(2027, 3, 6, 7)))
    assert not [i for i in adjusted if "P22" in i and "P34" in i]


def test_s2_vertical_top_install_over_hearth(baseline):
    # 노정 설치(P23) 완료가 늦어져 그 아래 노저 축조(P20, 02-12~)와 겹친다
    c = judge(moved("P23", end=datetime(2027, 2, 20, 19)))["R16:P23>P20"]
    assert c.type == ConflictType.VERTICAL and c.grade == Grade.CONDITIONAL
    assert "위아래" in c.reason


def test_s3_crane_lift_next_to_casthouse(baseline):
    # 출선장 개조(P24)를 1월로 미루면 링블록 대형 인양(P17, 01-11~01-14) 반경 안에 들어간다
    c = judge(moved("P24", start=datetime(2027, 1, 8, 7), end=datetime(2027, 1, 17, 19)))["R18:P17>P24"]
    assert c.grade == Grade.PROHIBITED and "인접 구역" in c.reason


def test_s4_hot_work_vs_gas_opening_even_same_contractor(baseline):
    # 하강관 절단(P10, 오후)을 오전으로 당겨 같은 업체(가상-제관F)의 제진기 개방(P25, 12-02~ 오전)과 겹친다 — 화기×가스는 같은 협력사 안에서도 본다
    c = judge(moved("P10", start=datetime(2026, 11, 28, 7)))["R04:P10>P25"]
    assert c.type == ConflictType.HOT_GAS and c.grade == Grade.PROHIBITED
    assert "같은 협력사" in c.reason


def test_s5_salamander_tapping_when_top_dismantle_moves_early(baseline):
    assert "R12:P07>P09" not in baseline
    after = judge(moved("P09", start=datetime(2026, 11, 15, 7)))
    assert after["R12:P07>P09"].grade == Grade.PROHIBITED


def test_s6_stove_test_before_brick_repair_done(baseline):
    after = judge(moved("P26", end=datetime(2027, 3, 10, 19)))
    assert {"R07:P26>P35", "R08:P26>P35"} <= set(after) - set(baseline)


def test_s7_scaffold_all_zone_is_grouped_until_location_known(baseline):
    # 전 구역 비계(P30)가 철피 용접(P18, 01-15~01-22) 기간에 들어가면 위치를 모르니 묶음 1건(조건부)
    on = moved("P30", start=datetime(2027, 1, 18, 7), end=datetime(2027, 1, 22, 19))
    grouped = judge(on)["R17:P30>ALL"]
    assert grouped.grade == Grade.CONDITIONAL and "P18" in grouped.task_ids
    assert not [i for i in judge(on) if i.startswith("R17:P30>P")]  # 전 구역 작업은 쌍마다 쏟아내지 않는다
    # 비계 계획서가 철피(SHELL) 구역을 적어 오면 쌍별 판정으로 바뀐다
    located = judge([t.model_copy(update={"zone_id": "SHELL"}) if t.id == "P30" else t for t in on])
    assert located["R17:P30>P18"].grade == Grade.PROHIBITED
    assert "R03:P18>P30" in located


def test_same_contractor_pairs_only_for_fatal_combinations(baseline):
    # P21(풍구, 중량물)은 P20(노저) 위지만 둘 다 가상-축로I → 겹쳐도 위아래(R16)는 같은 협력사끼리 보지 않는다
    assert "R16:P21>P20" not in judge(moved("P21", start=datetime(2027, 2, 15, 7)))


def test_day_and_night_work_in_same_zone_do_not_conflict():
    # 시간별 판정: 같은 구역·같은 날이어도 주간(07~19)과 야간(19~07)은 함께 일하지 않는다
    day = _task("A1", "가상-A", "CASTHOUSE", "2027-01-05T07:00", "2027-01-07T19:00", "탕도 용접", [Hazard.HOT_WORK])
    night = _task("B1", "가상-B", "CASTHOUSE", "2027-01-05T19:00", "2027-01-08T07:00", "집진 후드 내부 점검", [Hazard.CONFINED])
    assert not judge([day, night])
    assert "R05:A1>B1" in judge([day, night.model_copy(update={"start": datetime(2027, 1, 6, 7), "end": datetime(2027, 1, 6, 19)})])


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
    assert {"R08:P22>P34", "R07:P22>P34"} <= ids and first["refresh"] is True

    fixed = [t | {"start": "2027-03-06T08:00:00", "end": "2027-03-10T17:00:00"} if t["id"] == "P34" else t for t in tasks]
    second = client.post("/api/plans/submit", json={"contractor": "가상-배관O", "file": "배관O_조정.xlsx", "tasks": fixed}).json()
    assert second["plan"]["version"] == 2
    remaining = [r["conflict"] for r in client.get("/api/conflicts").json()]
    assert not [c for c in remaining if c["rule_id"] == "R08" and "P34" in c["task_ids"]]
