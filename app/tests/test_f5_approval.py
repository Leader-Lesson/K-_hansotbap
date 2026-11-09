"""F5 원청 승인: 제출하면 승인 대기, 금지·출입 금지 구역이 있으면 승인 불가(422), 조정 뒤 승인, 반려하면 일정에서 빠짐, 협력사는 못 누름, 이력에 남음."""

from pathlib import Path
from urllib.parse import quote

from fastapi.testclient import TestClient

from db.plans import current_schedule
from db.seed import seed_demo
from main import app

client = TestClient(app)
SAMPLES = Path(__file__).resolve().parents[1] / "samples"
PIPE_FILE = "S1_가상-배관O_가스라인_앞당김_작업계획서.hwpx"  # 겹치는 파일(시연 S1)
S1 = "R08:P22>P34"


def _submit_pipe() -> int:
    ext = client.post("/api/plans", files={"file": (PIPE_FILE, (SAMPLES / "겹침" / PIPE_FILE).read_bytes(), "application/octet-stream")}).json()
    res = client.post(
        "/api/plans/submit",
        json={"contractor": "가상-배관O", "file": PIPE_FILE, "tasks": [t["task"] for t in ext["tasks"]], "draft_id": ext["draft_id"], "submitted_by": "배관O 현장소장"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["plan"]["status"] == "pending"
    return res.json()["plan"]["id"]


def _apply_s1() -> None:
    cand = client.get(f"/api/conflicts/{quote(S1, safe='')}/adjustments").json()[0]
    assert client.post("/api/adjustments", json={"conflict_id": S1, "candidate_id": cand["id"], "decided_by": "원청 담당자"}).status_code == 200


def test_seeded_plans_are_approved_and_counted_as_existing_approvals():
    seed_demo()
    plans = client.get("/api/plans").json()
    assert plans and all(p["status"] == "approved" and p["decided_by"] for p in plans)
    assert all(t.plan_status is None or t.plan_status.value == "approved" for t in current_schedule())


def test_prohibited_conflict_blocks_approval_until_adjusted():
    seed_demo()
    pid = _submit_pipe()
    check = client.get(f"/api/plans/{pid}/approval-check").json()
    assert check["can_approve"] is False
    assert {c["id"] for c in check["prohibited"]} >= {S1, "R07:P22>P34"}
    assert check["blockers"] and any("금지" in b for b in check["blockers"])
    assert len(check["defects"]) == 2  # 표준서 핵심 단계 누락은 경고(승인 뒤 보완 요청)
    assert any(c["id"] == S1 for c in check["endangers_approved"])  # 승인된 축로I 작업(P22)이 걸린다
    # 서버가 막는다 — 프론트 버튼 비활성화로 대신하지 않는다
    res = client.post(f"/api/plans/{pid}/approve", json={"decided_by": "원청 담당자"})
    assert res.status_code == 422 and "금지" in res.text
    # 승인 전에는 3D·현황에 '승인 대기'로 표시된다 (기준 일정·승인 작업과 구분)
    assert next(t for t in client.get("/api/tasks").json() if t["id"] == "P34")["plan_status"] == "pending"

    _apply_s1()
    check = client.get(f"/api/plans/{pid}/approval-check").json()
    assert check["can_approve"] is True and check["prohibited"] == [] and check["in_restricted_zone"] == []
    assert any("필수 단계 누락" in w for w in check["warnings"])
    res = client.post(f"/api/plans/{pid}/approve", json={"decided_by": "원청 담당자", "note": "P34 조정 적용 확인"})
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "approved" and res.json()["decided_by"] == "원청 담당자"
    assert next(t for t in client.get("/api/tasks").json() if t["id"] == "P34")["plan_status"] == "approved"
    # 두 번 승인은 안 된다
    assert client.post(f"/api/plans/{pid}/approve", json={"decided_by": "원청 담당자"}).status_code == 422
    kinds = {(e["kind"], e["target_id"]) for e in client.get("/api/history").json()}
    assert ("plan_approved", f"plan-{pid}") in kinds


def test_reject_removes_plan_from_schedule_and_resolves_its_conflicts():
    seed_demo()
    pid = _submit_pipe()
    assert S1 in {r["conflict"]["id"] for r in client.get("/api/conflicts").json()}
    assert client.post(f"/api/plans/{pid}/reject", json={"decided_by": "원청 담당자"}).status_code == 200  # 사유 없이도 서버는 받는다 (화면이 요구)
    res = client.post(f"/api/plans/{pid}/reject", json={"decided_by": "원청 담당자", "note": "축조 완료 뒤로 옮겨 다시 제출"})
    assert res.status_code == 422  # 이미 처리됨
    plans = {p["id"]: p for p in client.get("/api/plans").json()}
    assert plans[pid]["status"] == "rejected"
    # 반려된 제출분의 작업은 일정에서 빠지고(기준 일정 P34로 돌아감) 그 충돌은 해소로 적힌다
    p34 = next(t for t in client.get("/api/tasks").json() if t["id"] == "P34")
    assert p34["plan_status"] is None and p34["start"].startswith("2027-03-06")
    assert S1 not in {r["conflict"]["id"] for r in client.get("/api/conflicts").json()}
    kinds = {(e["kind"], e["target_id"]) for e in client.get("/api/history").json()}
    assert ("plan_rejected", f"plan-{pid}") in kinds
    # 협력사 화면: 자기 제출 상태가 보인다
    mine = client.get("/api/plans", params={"contractor": "가상-배관O"}).json()
    assert mine and mine[-1]["status"] == "rejected"


def test_contractor_cannot_approve_or_reject():
    seed_demo()
    pid = _submit_pipe()
    assert client.get(f"/api/plans/{pid}/approval-check", params={"contractor": "가상-배관O"}).status_code == 403
    assert client.post(f"/api/plans/{pid}/approve", params={"contractor": "가상-배관O"}, json={"decided_by": "x"}).status_code == 403
    assert client.get("/api/plans/999/approval-check").status_code == 404
