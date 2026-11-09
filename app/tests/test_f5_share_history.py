"""F5 필수 시험: 원청 확인 전 협력사 차단, 공유 범위, 책임자가 남는 이행 기록, 엑셀 내보내기."""

from io import BytesIO
from urllib.parse import quote

from conftest import s1_xlsx
from fastapi.testclient import TestClient
from openpyxl import load_workbook

from db.plans import current_schedule, list_conflicts
from main import app
from rules.engine import scope_all_zone_conflict

client = TestClient(app)
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
TARGET = "R08:P22>P34"
PIPE = "가상-배관O"
OUTSIDER = "가상-기계J"  # S1 충돌과 관련 없는 업체


def _submit_s1(file: str | None = None) -> None:
    ext = client.post("/api/plans", files={"file": ("배관O_수정.xlsx", s1_xlsx(), XLSX)}).json()
    res = client.post(
        "/api/plans/submit",
        json={"contractor": PIPE, "file": file or ext["file"], "tasks": [t["task"] for t in ext["tasks"]], "submitted_by": "배관 공무팀"},
    )
    assert res.status_code == 200, res.text


def _get(path: str, contractor: str | None = None) -> list[dict]:
    res = client.get(path, params={"contractor": contractor} if contractor else None)
    assert res.status_code == 200, res.text
    return res.json()


def _share(*conflict_ids: str, **params):
    return client.post("/api/shares", params=params, json={"conflict_ids": list(conflict_ids), "shared_by": "원청 담당자"})


def _apply(decided_by: str) -> dict:
    cand = client.get(f"/api/conflicts/{quote(TARGET, safe='')}/adjustments").json()[0]
    res = client.post("/api/adjustments", json={"conflict_id": TARGET, "candidate_id": cand["id"], "decided_by": decided_by})
    assert res.status_code == 200, res.text
    return res.json()


def test_contractor_sees_conflict_only_after_prime_confirms():
    _submit_s1()
    assert _get("/api/conflicts", PIPE) == [] and _get("/api/shares", PIPE) == []
    assert "P22" not in {t["id"] for t in _get("/api/tasks", PIPE)}  # 공유 전에는 남의 일정이 안 보인다
    assert "P34" in {t["id"] for t in _get("/api/tasks", PIPE)}

    assert _share(TARGET, contractor=PIPE).status_code == 403
    assert _share("R99:없음").status_code == 404
    assert _share(TARGET).status_code == 200

    item = next(i for i in _get("/api/shares", PIPE) if i["conflict_id"] == TARGET)
    assert item["my_task_ids"] == ["P34"] and item["rule_id"] == "R08" and item["legal_basis"]
    assert "P22" in {t["id"] for t in item["adjacent_tasks"]}
    assert "sources" not in item

    conflict = next(r["conflict"] for r in _get("/api/conflicts", PIPE) if r["conflict"]["id"] == TARGET)
    assert not any(s["locator"] == "P22" for s in conflict["sources"])  # 상대 업체 원문은 빠진다
    assert next(t for t in _get("/api/tasks", PIPE) if t["id"] == "P22")["source"] is None

    assert _get("/api/shares", OUTSIDER) == []
    assert "P34" not in {t["id"] for t in _get("/api/tasks", OUTSIDER)}


def test_history_records_who_did_what_within_role_scope():
    _submit_s1()
    adjustment_id = _apply("원청 담당자")["record"]["adjustment"]["id"]
    reverted = client.delete(f"/api/adjustments/{adjustment_id}", params={"decided_by": "원청 팀장"})
    assert reverted.status_code == 200, reverted.text

    events = _get("/api/history")
    assert [e["at"] for e in events] == sorted(e["at"] for e in events)
    actor = {e["kind"]: e["actor"] for e in events if e["target_id"] == TARGET or e["kind"] == "plan_submitted"}
    assert actor["plan_submitted"] == "배관 공무팀"
    assert actor["conflict_shared"] == actor["adjustment_applied"] == "원청 담당자"  # 적용이 곧 원청의 확인이다
    assert actor["adjustment_reverted"] == "원청 팀장"

    mine = _get("/api/history", PIPE)
    assert {"plan_submitted", "adjustment_applied", "adjustment_reverted"} <= {e["kind"] for e in mine}
    assert TARGET not in {e["target_id"] for e in _get("/api/history", OUTSIDER)}
    assert not any(e["kind"] == "plan_submitted" for e in _get("/api/history", OUTSIDER))


def test_export_marks_synthetic_data_and_never_writes_formulas():
    _submit_s1(file="=HYPERLINK(1).xlsx")
    res = client.get("/api/history/export")
    assert res.status_code == 200 and res.headers["content-type"] == XLSX

    ws = load_workbook(BytesIO(res.content)).active
    assert "합성 데이터" in ws["A1"].value
    cell = next(c for row in ws.iter_rows() for c in row if str(c.value).startswith("=HYPERLINK"))
    assert cell.data_type == "s"

    outsider = load_workbook(BytesIO(client.get("/api/history/export", params={"contractor": OUTSIDER}).content)).active
    assert not any("HYPERLINK" in str(c.value) or c.value == TARGET for row in outsider.iter_rows() for c in row)


def _bundles_with(contractor: str) -> tuple[dict[str, dict], set[str], list[dict]]:
    """현재 일정, 이 업체의 작업, 그 작업이 들어 있는 전 구역 묶음 충돌(…>ALL, 원청이 보는 그대로)."""
    tasks = {t["id"]: t for t in _get("/api/tasks")}
    mine = {i for i, t in tasks.items() if t["contractor"] == contractor}
    bundles = [
        r["conflict"] for r in _get("/api/conflicts")
        if r["conflict"]["id"].endswith(">ALL") and mine & set(r["conflict"]["task_ids"][1:])
    ]
    return tasks, mine, bundles


def test_all_zone_bundle_is_scoped_to_contractor():
    """전 구역 작업 묶음을 공유해도 협력사는 '전 구역 작업 + 자기 작업'의 겹침만 받는다 (다른 업체 일정은 비공개)."""
    _submit_s1()
    tasks, mine, bundles = _bundles_with(PIPE)
    assert bundles and max(len(b["task_ids"]) for b in bundles) > 10  # 원청에게는 묶음 전체
    assert _share(*(b["id"] for b in bundles)).status_code == 200

    allowed = mine | {b["task_ids"][0] for b in bundles}
    hidden = set(tasks) - allowed
    for r in _get("/api/conflicts", PIPE):
        c = r["conflict"]
        assert set(c["task_ids"]) <= allowed
        assert not any(f"({t})" in c["reason"] for t in hidden)  # 이유 문장에도 남의 작업을 나열하지 않는다
        assert {s["file"] for s in c["sources"]} <= {tasks[t]["source"]["file"] for t in mine if tasks[t]["source"]}
    assert {t["id"] for t in _get("/api/tasks", PIPE)} <= allowed
    assert all({t["id"] for t in i["adjacent_tasks"]} <= allowed for i in _get("/api/shares", PIPE))
    assert all(set(e["contractors"]) <= {tasks[t]["contractor"] for t in allowed} for e in _get("/api/history", PIPE))

    # 위험 시간대는 자기 작업이 있는 구역·기간에만 생긴다
    windows = _get("/api/risk-windows", PIPE)
    assert windows
    assert {w["zone_id"] for w in windows} <= {tasks[t]["zone_id"] for t in mine}
    assert min(w["start"] for w in windows)[:10] >= min(tasks[t]["start"] for t in mine)[:10]

    # 원청은 그대로 묶음 전체를 본다
    assert {b["id"]: len(b["task_ids"]) for b in _bundles_with(PIPE)[2]} == {b["id"]: len(b["task_ids"]) for b in bundles}


def test_all_zone_owner_keeps_whole_bundle():
    """전 구역 작업을 낸 업체에게는 묶음 전체가 자기 작업의 상대다 (위치를 정하면 작업별로 다시 판정된다)."""
    _submit_s1()
    schedule = current_schedule()
    bundle = next(r.conflict for r in list_conflicts() if r.conflict.id.endswith(">ALL"))
    owner = next(t.contractor for t in schedule if t.id == bundle.task_ids[0])
    assert scope_all_zone_conflict(bundle, schedule, owner) == bundle
