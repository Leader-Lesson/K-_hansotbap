"""F8 작업표준서 매칭: 핵심 단계 읽기, 합성 계획서 5건 정답셋, 단계 근거, 주 표준서만 결함, 임베딩 보강·장애, API·제출 흐름."""

import json
from datetime import datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from config import settings
from llm.provider import LMStudioProvider
from main import app
from parsers import parse_document
from rules.data_loader import load_rules, load_zones
from rules.engine import detect_conflicts
from schemas import ConflictType, Grade, Hazard, SourceLine, Task
from search import sop_index, sop_match
from search.sop_catalog import load_sops
from search.sop_match import match_plan

client = TestClient(app)
SAMPLES = Path(__file__).resolve().parents[1] / "samples"
ANSWERS = sorted((SAMPLES / "answers").glob("가상-*.json"))
HWPX = "application/octet-stream"


def sample(answer_path: Path) -> tuple[dict, list[Task], list[SourceLine]]:
    """정답셋의 작업(사람이 확인한 값)과 계획서 원문 줄."""
    a = json.loads(answer_path.read_text(encoding="utf-8"))
    doc = parse_document(a["file"], (SAMPLES / a["file"]).read_bytes())
    lines = [SourceLine(locator=s.loc, text=s.text) for s in doc.segments]
    tasks = [
        Task(
            id=t.get("wbs_id") or f"X{i}",
            contractor=a["contractor"],
            name=t["name"],
            zone_id=t["zone_id"],
            start=datetime.fromisoformat(t["start"]),
            end=datetime.fromisoformat(t["end"]),
            hazards=[Hazard(h) for h in t["hazards"]],
        )
        for i, t in enumerate(a["tasks"])
    ]
    return a, tasks, lines


def task(name: str, task_id: str = "U-1", hazards=()) -> Task:
    return Task(
        id=task_id, contractor="가상-테스트", name=name, zone_id="TUYERE",
        start=datetime(2027, 3, 4, 7), end=datetime(2027, 3, 4, 19), hazards=list(hazards),
    )


def test_critical_steps_are_read_from_sop_documents():
    assert {s.id: sorted(s.critical) for s in load_sops()} == {
        "SOP-01": [2, 4, 7],
        "SOP-02": [2, 3, 5],
        "SOP-03": [3, 4, 5],
        "SOP-04": [4, 5],
    }


@pytest.mark.parametrize("answer_path", ANSWERS, ids=lambda p: p.stem.split("_")[0])
def test_defects_match_answer_set(answer_path):
    a, tasks, lines = sample(answer_path)
    matches = match_plan(tasks, lines, a["file"], use_default_embedder=False)
    expected = sorted(e["with"].split()[0] for e in a["expected_conflicts"] if e["type"] == "sop_missing")
    assert sorted(m.sop_id for m in matches if m.missing_steps) == expected


def test_pipe_plan_misses_gas_measurement_and_inside_work_check():
    """완료 기준: 배관 계획서의 '작업 전 가스 측정' 누락이 결함으로 표시된다."""
    a, tasks, lines = sample(next(p for p in ANSWERS if "배관O" in p.name))
    m = next(m for m in match_plan(tasks, lines, a["file"], use_default_embedder=False) if m.missing_steps)
    assert (m.task_id, m.sop_id, m.primary) == ("P34", "SOP-04", True)
    assert m.basis == ["wbs_example", "name", "hazard"]
    assert any("작업 전 가스 측정" in s for s in m.missing_steps)
    assert any("인원 철수" in s for s in m.missing_steps)  # '축조(P22) 완료 후' 착수 조건은 현장 확인 절차가 아니다
    found = {s.no: s for s in m.steps}
    assert found[7].found and found[7].evidence.locator == "s0:p11"  # ④ 질소 가압 기밀시험
    assert not found[3].found and not found[3].critical  # 맹판 확인: 빠졌지만 핵심 단계가 아니라 참고


def test_secondary_sop_is_advisory_only():
    a, tasks, lines = sample(next(p for p in ANSWERS if "배관O" in p.name))
    hot = next(m for m in match_plan(tasks, lines, a["file"], use_default_embedder=False) if m.sop_id == "SOP-01")
    # P34는 용접도 하지만 원청 적용 목록에 화기 표준이 없다 → 단계 확인은 보여 주되 결함은 아니다
    assert not hot.primary and hot.missing_steps == []
    assert [s.no for s in hot.steps if s.critical and not s.found] == [2, 4, 7]


def test_name_only_match_is_dropped():
    # '비계 설치'의 '설치'만으로 크레인 표준(SOP-03)에 붙이지 않는다
    assert match_plan([task("노체 철피 외부 비계 설치", hazards=[Hazard.HEIGHT])], [], "x", use_default_embedder=False) == []


def test_task_outside_sop_list_is_not_a_defect():
    m = match_plan([task("가스 배관 연결", hazards=[Hazard.GAS])], [], "x", use_default_embedder=False)[0]
    assert m.sop_id == "SOP-04" and not m.primary and m.missing_steps == []
    assert all(not s.found for s in m.steps)


def _fake_embedder(texts):
    keys = ("가스", "밀폐", "인양", "화기")
    return [[1.0 if k in t else 0.0 for k in keys] + [0.1] for t in texts]


def test_embedding_adds_reason_but_never_a_defect():
    m = match_plan([task("가스 배관 플랜지 점검")], [], "x", embedder=_fake_embedder)
    gas = next(x for x in m if x.sop_id == "SOP-04")
    assert gas.basis == ["embedding"] and not gas.primary and "임베딩 유사도" in gas.reason


def test_embedding_server_down_falls_back_to_rules():
    def broken(texts):
        raise ConnectionError("노트북 꺼짐")

    a, tasks, lines = sample(next(p for p in ANSWERS if "배관O" in p.name))
    assert [m.sop_id for m in match_plan(tasks, lines, a["file"], embedder=broken) if m.missing_steps] == ["SOP-04"]


def _embedding_env(monkeypatch, provider: str, *, unsloth: str = "", lmstudio: str = "", unsloth_key: str = ""):
    """.env 대신 임베딩 설정을 고정한다."""
    monkeypatch.setattr(settings, "embedding_provider", provider)
    monkeypatch.setattr(settings, "unsloth_embedding_model", unsloth)
    monkeypatch.setattr(settings, "unsloth_api_key", unsloth_key)
    monkeypatch.setattr(settings, "lmstudio_embedding_model", lmstudio)
    monkeypatch.setattr(settings, "lmstudio_chat_model", "")


def test_lmstudio_embedding_reaches_match(monkeypatch):
    """EMBEDDING_PROVIDER=lmstudio 면 LM Studio 임베딩으로 매칭을 보강한다 (서버 대신 가짜 임베딩)."""
    _embedding_env(monkeypatch, "lmstudio", lmstudio="text-embedding-bge-m3")
    monkeypatch.setattr(LMStudioProvider, "embed", lambda self, texts: _fake_embedder(texts))
    monkeypatch.setattr(sop_match, "default_embedder", sop_index.default_embedder)  # conftest 차단을 푼다
    m = match_plan([task("가스 배관 플랜지 점검")], [], "x")
    assert next(x for x in m if x.sop_id == "SOP-04").basis == ["embedding"]


def test_embedding_does_not_fall_back_to_other_server(monkeypatch):
    """LM Studio를 골랐는데 LM Studio 임베딩 모델이 비어 있으면 Unsloth 설정이 있어도 쓰지 않는다."""
    _embedding_env(monkeypatch, "lmstudio", unsloth="bge-m3", unsloth_key="k")
    assert sop_index.default_embedder() is None


def test_embedding_off_when_server_cannot_start(monkeypatch):
    _embedding_env(monkeypatch, "unsloth", unsloth="bge-m3")  # API 키 없음 → 규칙만으로 매칭
    assert sop_index.default_embedder() is None


def test_defect_conflict_points_to_plan_and_sop():
    a, tasks, lines = sample(next(p for p in ANSWERS if "배관O" in p.name))
    matches = match_plan(tasks, lines, a["file"], use_default_embedder=False)
    c = next(c for c in detect_conflicts(tasks, load_zones(), load_rules(), sop_matches=matches) if c.type == ConflictType.SOP_MISSING)
    assert (c.id, c.grade) == ("SOP:P34:SOP-04", Grade.DEFECT) and "제65조" in c.legal_basis
    assert {s.locator for s in c.sources if s.file == "SOP-04"} == {"필수 단계 4", "필수 단계 5"}


def test_sop_api():
    listed = client.get("/api/sops").json()
    assert [s["id"] for s in listed] == ["SOP-01", "SOP-02", "SOP-03", "SOP-04"]
    assert listed[3]["critical_steps"] == [4, 5] and listed[3]["text"] is None
    assert "## 필수 단계" in client.get("/api/sops/SOP-04").json()["text"]
    assert client.get("/api/sops/SOP-99").status_code == 404


def test_upload_submit_stores_sop_defect():
    """시연 흐름: 배관O 계획서 업로드 → 확인 화면에 누락 단계 → 제출 순간 결함 저장 (새로고침 뒤에도 남음)."""
    name = "가상-배관O_가스라인_복구_작업계획서.hwpx"
    ext = client.post("/api/plans", files={"file": (name, (SAMPLES / name).read_bytes(), HWPX)}).json()
    primary = [m for m in ext["sop_matches"] if m["primary"]]
    assert [(m["task_id"], m["sop_id"]) for m in primary] == [("P34", "SOP-04")]
    assert any("가스 측정" in s for s in primary[0]["missing_steps"])

    res = client.post(
        "/api/plans/submit",
        json={"contractor": "가상-배관O", "file": name, "tasks": [t["task"] for t in ext["tasks"]], "draft_id": ext["draft_id"]},
    ).json()
    assert "SOP:P34:SOP-04" in {c["id"] for c in res["conflicts"]}
    stored = {r["conflict"]["id"]: r for r in client.get("/api/conflicts").json()}  # 원청 화면
    assert stored["SOP:P34:SOP-04"]["conflict"]["grade"] == "결함"

    # F5: 협력사는 원청이 확인·공유한 뒤에 받는다. 표준서 근거는 어느 업체 원문도 아니라 그대로 남는다
    mine = lambda: {r["conflict"]["id"]: r for r in client.get("/api/conflicts", params={"contractor": "가상-배관O"}).json()}
    assert "SOP:P34:SOP-04" not in mine()
    shared = client.post("/api/shares", json={"conflict_ids": ["SOP:P34:SOP-04"], "shared_by": "원청 담당자"})
    assert shared.status_code == 200, shared.text
    sources = mine()["SOP:P34:SOP-04"]["conflict"]["sources"]
    assert {s["locator"] for s in sources if s["file"] == "SOP-04"} == {"필수 단계 4", "필수 단계 5"}


def test_applying_f4_adjustment_keeps_sop_defect_open():
    """조정안(F4)을 적용해 순서 위반을 풀어도, 계획서에 빠진 표준서 단계는 그대로 결함으로 남아야 한다."""
    name = "가상-배관O_가스라인_복구_작업계획서.hwpx"
    ext = client.post("/api/plans", files={"file": (name, (SAMPLES / name).read_bytes(), HWPX)}).json()
    client.post(
        "/api/plans/submit",
        json={"contractor": "가상-배관O", "file": name, "tasks": [t["task"] for t in ext["tasks"]], "draft_id": ext["draft_id"]},
    )
    cand = client.get("/api/conflicts/R08:P22>P34/adjustments").json()[0]
    res = client.post("/api/adjustments", json={"conflict_id": "R08:P22>P34", "candidate_id": cand["id"], "decided_by": "원청 담당자"})
    assert res.status_code == 200, res.text
    assert "SOP:P34:SOP-04" not in {c["id"] for c in res.json()["diff"]["resolved"]}
    stored = {r["conflict"]["id"]: r["status"] for r in client.get("/api/conflicts").json()}
    assert stored["SOP:P34:SOP-04"] == "open"


def test_submit_without_document_skips_sop():
    """원문 없이(draft_id 없이) 낸 계획은 표준서 결함을 판정하지 않는다 — 없는 단계를 추측하지 않는다."""
    t = task("질소·가스·송풍 라인 복구 연결", "P34", [Hazard.GAS]).model_dump(mode="json") | {"contractor": "가상-배관O"}
    res = client.post("/api/plans/submit", json={"contractor": "가상-배관O", "file": "x.xlsx", "tasks": [t]}).json()
    assert not [c for c in res["conflicts"] if c["type"] == "sop_missing"]


def test_sop_matches_api_follows_current_schedule_and_filters_by_contractor():
    """GET /api/sop-matches: 제출 전에는 빈 목록, 제출 뒤에는 보관된 원문으로 다시 계산한 매칭. 협력사는 자기 작업만."""
    assert client.get("/api/sop-matches").json() == []
    name = "가상-배관O_가스라인_복구_작업계획서.hwpx"
    ext = client.post("/api/plans", files={"file": (name, (SAMPLES / name).read_bytes(), HWPX)}).json()
    client.post(
        "/api/plans/submit",
        json={"contractor": "가상-배관O", "file": name, "tasks": [t["task"] for t in ext["tasks"]], "draft_id": ext["draft_id"]},
    )
    all_matches = client.get("/api/sop-matches").json()
    primary = [m for m in all_matches if m["primary"]]
    assert [(m["task_id"], m["sop_id"]) for m in primary] == [("P34", "SOP-04")]
    assert any("가스 측정" in s for s in primary[0]["missing_steps"])
    assert client.get("/api/sop-matches", params={"contractor": "가상-배관O"}).json() == all_matches
    assert client.get("/api/sop-matches", params={"contractor": "가상-축로I"}).json() == []
