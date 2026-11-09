"""F7 필수 시험: 시연 흐름, 업체 권한, 근거 없는 '전달됨' 차단, 녹음 동의와 원본 삭제 (LLM은 가짜)."""

import json
from pathlib import Path
from urllib.parse import quote

import api.tbm
import llm.tbm_check
from conftest import s1_xlsx
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
TARGET = "R08:P22>P34"
PIPE = "가상-배관O"
OUTSIDER = "가상-기계J"  # S1 충돌과 관련 없는 업체
DAY = "2027-02-26"
TRANSCRIPT = "라인 복구 연결 작업은 원청 조정안에 따라 3월 3일로 미뤄졌습니다. 3월 1일부터 비계 해체에 들어갑니다."
CONFINED = "노흉 내부 밀폐공간 작업 중 맹판·LOTO 유지"
SCAFFOLD = "비계 해체, 자재 반입 동선 겹침 주의"


class FakeProvider:
    """항목 글에 keyword 가 든 항목만 quote 를 붙여 '말했다'고 답한다."""

    name, model = "fake", "fake-1"

    def __init__(self, answers: dict[str, str]):
        self.answers = answers

    def extract(self, system, user, schema, max_tokens=0):
        out = []
        for item in json.loads(user)["checklist"]:
            said = next((q for keyword, q in self.answers.items() if keyword in item["text"]), None)
            out.append({"item_id": item["id"], "mentioned": said is not None, "quote": said})
        return schema.model_validate({"items": out})


def _use_llm(monkeypatch, answers: dict[str, str]) -> None:
    monkeypatch.setattr(llm.tbm_check, "get_provider", lambda: FakeProvider(answers))


def _apply_s1() -> None:
    ext = client.post("/api/plans", files={"file": ("배관O_수정.xlsx", s1_xlsx(), XLSX)}).json()
    res = client.post(
        "/api/plans/submit",
        json={"contractor": PIPE, "file": ext["file"], "tasks": [t["task"] for t in ext["tasks"]], "submitted_by": "배관 공무팀"},
    )
    assert res.status_code == 200, res.text
    cand = client.get(f"/api/conflicts/{quote(TARGET, safe='')}/adjustments").json()[0]
    res = client.post("/api/adjustments", json={"conflict_id": TARGET, "candidate_id": cand["id"], "decided_by": "원청 담당자"})
    assert res.status_code == 200, res.text


def _notice(text: str, **params):
    body = {"contractor": PIPE, "date": DAY, "text": text, "created_by": "원청 담당자"}
    return client.post("/api/tbm/notices", params=params, json=body)


def _checklist(contractor: str) -> list[dict]:
    res = client.get("/api/tbm/checklist", params={"contractor": contractor, "on": DAY})
    assert res.status_code == 200, res.text
    return res.json()["items"]


def _check():
    body = {"contractor": PIPE, "date": DAY, "transcript": TRANSCRIPT, "checked_by": "배관 반장"}
    return client.post("/api/tbm/checks", json=body)


def test_demo_flow_finds_the_item_left_out_of_the_tbm(monkeypatch):
    _apply_s1()
    assert _notice(CONFINED).status_code == 200
    assert _notice(SCAFFOLD).status_code == 200

    items = _checklist(PIPE)
    assert [i["kind"] for i in items] == ["adjustment", "notice", "notice"]  # 해소된 충돌은 위험 시간대에서 빠진다
    adjustment = items[0]
    assert "P34" in adjustment["text"] and adjustment["rule_ids"] == ["R08"] and adjustment["legal_basis"]

    _use_llm(monkeypatch, {"P34": "3월 3일로 미뤄졌습니다", "비계 해체": "3월 1일부터 비계 해체에 들어갑니다"})
    res = _check()
    assert res.status_code == 200, res.text
    record = res.json()
    confined_id = next(i["id"] for i in items if i["text"] == CONFINED)
    assert record["missing_ids"] == [confined_id]
    assert record["results"][0]["quote"] == "3월 3일로 미뤄졌습니다"

    event = next(e for e in client.get("/api/history", params={"contractor": PIPE}).json() if e["kind"] == "tbm_checked")
    assert event["actor"] == "배관 반장" and "3건 중 2건 전달" in event["detail"]
    assert client.get("/api/history/export").status_code == 200


def test_contractor_scope_is_enforced_by_the_server(monkeypatch):
    _apply_s1()
    assert _notice(CONFINED, contractor=PIPE).status_code == 403
    assert _notice(CONFINED).status_code == 200
    assert _checklist(OUTSIDER) == []

    _use_llm(monkeypatch, {"P34": "3월 3일로 미뤄졌습니다"})
    assert client.post(
        "/api/tbm/checks",
        params={"contractor": OUTSIDER},
        json={"contractor": PIPE, "date": DAY, "transcript": TRANSCRIPT, "checked_by": "기계 반장"},
    ).status_code == 403

    assert _check().status_code == 200
    assert len(client.get("/api/tbm/checks", params={"contractor": PIPE}).json()) == 1
    assert client.get("/api/tbm/checks", params={"contractor": OUTSIDER}).json() == []


def test_mention_without_a_real_quote_counts_as_missing(monkeypatch):
    assert _notice(CONFINED).status_code == 200
    _use_llm(monkeypatch, {"맹판": "맹판과 LOTO를 유지합니다"})  # 전사문에 없는 문장을 지어낸 답

    result = _check().json()["results"][0]
    assert result["mentioned"] is False and result["quote"] is None and result["note"]


def test_recording_needs_consent_and_is_deleted_after_transcribing(monkeypatch):
    seen: list[Path] = []

    def fake_transcribe(path: Path) -> str:
        assert path.exists()
        seen.append(path)
        return TRANSCRIPT

    monkeypatch.setattr(api.tbm, "transcribe", fake_transcribe)
    upload = {"file": ("녹음.m4a", b"audio", "audio/mp4")}

    assert client.post("/api/tbm/transcribe", files=upload, data={"consent": "false"}).status_code == 422
    assert not seen

    res = client.post("/api/tbm/transcribe", files=upload, data={"consent": "true"})
    assert res.status_code == 200 and res.json()["transcript"] == TRANSCRIPT
    assert len(seen) == 1 and not seen[0].exists()
