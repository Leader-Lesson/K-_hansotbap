"""F4 조정안 API 필수 시험: 제출 → 후보 → 적용 → 해소 → 되돌리기, 재제출 시 무효, 협력사 차단."""

from urllib.parse import quote

from conftest import s1_xlsx
from fastapi.testclient import TestClient

from db.database import session
from main import app

client = TestClient(app)
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
TARGET = "R08:P22>P34"
CANDIDATES = f"/api/conflicts/{quote(TARGET, safe='')}/adjustments"
PIPE = "가상-배관O"


def _ids(conflicts: list[dict]) -> set[str]:
    return {c["id"] for c in conflicts}


def _submit(shift_p34_start: str | None = None) -> dict:
    """배관 협력사가 P34를 노 내부 작업 완료 전으로 앞당긴 계획서를 제출한다."""
    ext = client.post("/api/plans", files={"file": ("배관O_수정.xlsx", s1_xlsx(), XLSX)}).json()
    tasks = [t["task"] for t in ext["tasks"]]
    if shift_p34_start:
        next(t for t in tasks if t["id"] == "P34")["start"] = shift_p34_start
    res = client.post("/api/plans/submit", json={"contractor": PIPE, "file": ext["file"], "tasks": tasks})
    assert res.status_code == 200, res.text
    return res.json()


def _apply() -> dict:
    cand = client.get(CANDIDATES).json()[0]
    res = client.post(
        "/api/adjustments", json={"conflict_id": TARGET, "candidate_id": cand["id"], "decided_by": "원청 담당자"}
    )
    assert res.status_code == 200, res.text
    return res.json()


def _status(conflict_id: str) -> str:
    records = client.get("/api/conflicts", params={"include_resolved": True}).json()
    return next(r["status"] for r in records if r["conflict"]["id"] == conflict_id)


def _p34_start() -> str:
    return next(t["start"] for t in client.get("/api/tasks").json() if t["id"] == "P34")


def test_submit_apply_resolve_and_revert():
    submitted = _submit()
    assert TARGET in _ids(submitted["diff"]["introduced"])  # 새 충돌 알림
    assert submitted["recheck_ms"] is not None
    original_start = _p34_start()

    cand = client.get(CANDIDATES).json()[0]
    assert cand["task_id"] == "P34" and cand["recommended"] is True
    assert cand["new_start"][11:] == original_start[11:]  # 옮겨도 하루 중 시작 시각은 그대로

    applied = _apply()
    assert TARGET in _ids(applied["diff"]["resolved"])
    assert applied["record"]["status"] == "active"
    assert _status(TARGET) == "resolved"
    assert _p34_start() == cand["new_start"]  # 화면이 보는 일정에 조정이 얹힌다

    adjustment_id = applied["record"]["adjustment"]["id"]
    assert client.delete(f"/api/adjustments/{adjustment_id}", params={"decided_by": "   "}).status_code == 422
    reverted = client.delete(f"/api/adjustments/{adjustment_id}", params={"decided_by": "원청 팀장"})
    assert reverted.status_code == 200, reverted.text
    assert reverted.json()["record"]["status"] == "reverted"
    assert TARGET in _ids(reverted.json()["diff"]["introduced"])
    assert _status(TARGET) == "open"
    assert _p34_start() == original_start

    with session() as conn:
        rows = conn.execute("SELECT decided_by, decision FROM decisions ORDER BY id").fetchall()
    assert [r["decided_by"] for r in rows] == ["원청 담당자", "원청 팀장"]  # 되돌린 사람이 따로 남는다
    assert rows[1]["decision"].startswith("되돌림:")


def test_resubmission_with_changed_dates_makes_adjustment_stale():
    _submit()
    adjustment_id = _apply()["record"]["adjustment"]["id"]

    _submit(shift_p34_start="2027-02-24T07:00:00")  # 조정의 기준이던 원본 일정이 달라졌다

    record = next(r for r in client.get("/api/adjustments").json() if r["adjustment"]["id"] == adjustment_id)
    assert record["status"] == "stale"
    assert _p34_start() == "2027-02-24T07:00:00"  # 무효가 된 조정은 일정에 얹지 않는다


def test_contractor_cannot_adjust_and_sees_only_own_records():
    _submit()
    adjustment_id = _apply()["record"]["adjustment"]["id"]
    who = {"contractor": PIPE}

    assert client.get(CANDIDATES, params=who).status_code == 403
    assert client.post("/api/adjustments", params=who, json={"conflict_id": TARGET, "candidate_id": "x", "decided_by": "y"}).status_code == 403
    assert client.delete(f"/api/adjustments/{adjustment_id}", params={**who, "decided_by": "y"}).status_code == 403

    assert len(client.get("/api/adjustments", params=who).json()) == 1
    assert client.get("/api/adjustments", params={"contractor": "가상-기계J"}).json() == []
