"""F9 위험 시간대 필수 시험: S1 제출 → 시간대 표시 → 조정 적용 → 사라짐, 협력사 범위, 하루 단위 집계."""

from datetime import datetime
from urllib.parse import quote

from conftest import s1_xlsx
from fastapi.testclient import TestClient

from main import app
from rules.risk import score_windows
from schemas import Conflict, ConflictType, Grade, Task, Zone

client = TestClient(app)
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
TARGET = "R08:P22>P34"
PIPE = "가상-배관O"


def _submit_s1() -> None:
    ext = client.post("/api/plans", files={"file": ("배관O_수정.xlsx", s1_xlsx(), XLSX)}).json()
    res = client.post(
        "/api/plans/submit", json={"contractor": PIPE, "file": ext["file"], "tasks": [t["task"] for t in ext["tasks"]]}
    )
    assert res.status_code == 200, res.text


def _windows(**params) -> list[dict]:
    res = client.get("/api/risk-windows", params=params)
    assert res.status_code == 200, res.text
    return res.json()


def _with_target(windows: list[dict]) -> list[dict]:
    return [w for w in windows if TARGET in w["conflict_ids"]]


def test_s1_window_has_basis_and_disappears_after_adjustment():
    _submit_s1()
    found = _with_target(_windows())
    assert found

    window = found[0]
    assert "R08" in window["rule_ids"] and window["legal_basis"] and window["sources"]
    assert window["notice"] and PIPE in window["contractors"]

    day = window["start"][:10]
    for w in _with_target(_windows(on=day)):
        assert w["start"][:10] == w["end"][:10] == day  # 하루 조각이라 밤을 건너 이어지지 않는다

    cand = client.get(f"/api/conflicts/{quote(TARGET, safe='')}/adjustments").json()[0]
    applied = client.post(
        "/api/adjustments", json={"conflict_id": TARGET, "candidate_id": cand["id"], "decided_by": "원청 담당자"}
    )
    assert applied.status_code == 200, applied.text
    assert not _with_target(_windows())


def test_contractor_sees_only_own_conflicts():
    _submit_s1()
    records = client.get("/api/conflicts").json()
    shared = client.post(
        "/api/shares", json={"conflict_ids": [r["conflict"]["id"] for r in records], "shared_by": "원청 담당자"}
    )
    assert shared.status_code == 200, shared.text
    tasks = {t["id"]: t for t in client.get("/api/tasks").json()}
    target = next(r["conflict"] for r in records if r["conflict"]["id"] == TARGET)
    involved = {tasks[t]["contractor"] for t in target["task_ids"]}
    outsider = next(t["contractor"] for t in tasks.values() if t["contractor"] not in involved)

    assert not _with_target(_windows(contractor=outsider))
    allowed = {r["conflict"]["id"] for r in client.get("/api/conflicts", params={"contractor": outsider}).json()}
    assert {i for w in _windows(contractor=outsider) for i in w["conflict_ids"]} <= allowed


def _conflict(cid: str, grade: Grade, start: datetime, end: datetime, tasks: list[str]) -> Conflict:
    return Conflict(
        id=cid, type=ConflictType.SAME_TIME_ZONE, grade=grade, task_ids=tasks, rule_id=cid, legal_basis="합성 조문",
        window_start=start, window_end=end, reason="합성",
    )


def _task(tid: str, contractor: str, zone: str) -> Task:
    return Task(
        id=tid, contractor=contractor, name=tid, zone_id=zone,
        start=datetime(2027, 1, 1, 7), end=datetime(2027, 1, 9, 19),
    )


def test_scores_split_by_time_and_merge_across_days():
    """이틀만 겹치는 3일 충돌: 겹치는 날과 아닌 날이 나뉘고, 연속된 같은 시간대는 한 건으로 합쳐진다."""
    tasks = [_task("A", "가상-갑", "TOP"), _task("B", "가상-을", "TOP"), _task("C", "가상-병", "TOP")]
    conflicts = [
        _conflict("X", Grade.PROHIBITED, datetime(2027, 1, 1, 7), datetime(2027, 1, 3, 19), ["A", "B"]),
        _conflict("Y", Grade.CONDITIONAL, datetime(2027, 1, 1, 7), datetime(2027, 1, 2, 19), ["A", "C"]),
    ]
    zones = [Zone(id="TOP", name="노정", vertical_order=7)]

    windows = score_windows(conflicts, tasks, zones)

    assert [(w.start, w.end, w.score, w.peak_grade) for w in windows] == [
        (datetime(2027, 1, 1, 7), datetime(2027, 1, 2, 19), 5.0, Grade.PROHIBITED),
        (datetime(2027, 1, 3, 7), datetime(2027, 1, 3, 19), 3.0, Grade.PROHIBITED),
    ]
    assert windows[1].conflict_ids == ["X"]
    assert "2027-01-01~2027-01-02 07:00~19:00" in windows[0].notice
