"""F1 API: 업로드 → 확인·수정 → 제출(판정 자리) → 현재 일정 반영, 캐시, 입력 검사."""

from conftest import free_text_xlsx, s1_xlsx
from fastapi.testclient import TestClient

import llm.extract
from llm.extract import LLMPlan
from main import app
from test_f1_extract import FakeProvider, llm_task

client = TestClient(app)
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def upload(name: str, data: bytes, **params):
    return client.post("/api/plans", files={"file": (name, data, XLSX)}, params=params)


def test_upload_s1_then_cached():
    first = upload("배관O_수정.xlsx", s1_xlsx())
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["method"] == "table_rules" and not body["cached"]
    assert [t["task"]["id"] for t in body["tasks"]] == ["P34", "P33"]
    assert len(body["draft_id"]) == 16 and body["lines"][0]["locator"] == "작업계획!A1"
    again = upload("배관O_수정.xlsx", s1_xlsx()).json()
    assert again["cached"] and again["draft_id"] == body["draft_id"]


def test_upload_llm_path_uses_cache(monkeypatch):
    fake = FakeProvider(LLMPlan(contractor=None, tasks=[llm_task()]))
    monkeypatch.setattr(llm.extract, "get_provider", lambda: fake)
    assert upload("안내.xlsx", free_text_xlsx()).json()["method"] == "llm"
    assert upload("안내.xlsx", free_text_xlsx()).json()["cached"]
    assert fake.calls == 1


def test_upload_errors():
    assert client.post("/api/plans", files={"file": ("a.hwp", b"x", "application/octet-stream")}).status_code == 400
    assert upload("안내.xlsx", free_text_xlsx()).status_code == 502  # LLM 없이 줄글은 못 읽는다
    assert upload("배관O.xlsx", s1_xlsx(), mode="rules").status_code == 200


def test_submit_replaces_baseline_and_revision_supersedes():
    ext = upload("배관O_수정.xlsx", s1_xlsx()).json()
    tasks = [t["task"] for t in ext["tasks"]]
    res = client.post(
        "/api/plans/submit",
        json={"contractor": "가상-배관O", "file": ext["file"], "tasks": tasks, "draft_id": ext["draft_id"], "submitted_by": "배관O 현장소장"},
    )
    assert res.status_code == 200, res.text
    out = res.json()
    assert out["plan"]["version"] == 1 and out["plan"]["task_count"] == 2 and out["refresh"] is True
    assert isinstance(out["conflicts"], list)  # 제출한 협력사에게 공유된 충돌만 온다 (원청 공유 전이면 빈 목록)

    schedule = {t["id"]: t for t in client.get("/api/tasks").json()}
    assert len(schedule) == 37
    assert schedule["P34"]["start"] == "2027-02-25T08:00:00"  # 앞당긴 계획이 기준 일정을 대체

    # 같은 업체가 다시 제출하면 예전 제출분은 빠진다 → P33은 기준 일정으로 돌아간다
    res2 = client.post("/api/plans/submit", json={"contractor": "가상-배관O", "file": "배관O_v2.xlsx", "tasks": tasks[:1]})
    assert res2.json()["plan"]["version"] == 2
    schedule = {t["id"]: t for t in client.get("/api/tasks").json()}
    assert schedule["P33"]["start"] == "2027-02-20T07:00:00"
    assert [p["version"] for p in client.get("/api/plans").json()] == [1, 2]


def test_submit_rejects_unconfirmed_tasks():
    ext = upload("배관O.xlsx", s1_xlsx()).json()
    task = ext["tasks"][0]["task"] | {"zone_id": ""}
    res = client.post("/api/plans/submit", json={"contractor": "가상-배관O", "file": "x.xlsx", "tasks": [task]})
    assert res.status_code == 422
    assert "구역" in res.json()["detail"]["problems"][0]
