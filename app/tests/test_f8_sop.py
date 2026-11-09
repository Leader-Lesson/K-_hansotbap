"""F8 작업표준서 매칭: 핵심 단계 읽기, 합성 계획서 5건 정답셋, 단계 근거, 주 표준서만 결함, 임베딩 보강·장애, API·제출 흐름."""

import json
from datetime import datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from main import app
from parsers import parse_document
from rules.data_loader import load_rules, load_zones
from rules.engine import detect_conflicts
from schemas import ConflictType, Grade, Hazard, SourceLine, Task
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
    stored = {r["conflict"]["id"]: r for r in client.get("/api/conflicts", params={"contractor": "가상-배관O"}).json()}
    assert stored["SOP:P34:SOP-04"]["conflict"]["grade"] == "결함"


def test_submit_without_document_skips_sop():
    """원문 없이(draft_id 없이) 낸 계획은 표준서 결함을 판정하지 않는다 — 없는 단계를 추측하지 않는다."""
    t = task("질소·가스·송풍 라인 복구 연결", "P34", [Hazard.GAS]).model_dump(mode="json") | {"contractor": "가상-배관O"}
    res = client.post("/api/plans/submit", json={"contractor": "가상-배관O", "file": "x.xlsx", "tasks": [t]}).json()
    assert not [c for c in res["conflicts"] if c["type"] == "sop_missing"]
