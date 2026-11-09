"""F1 혼합 추출: 표 규칙 경로, LLM 경로(가짜 LLM), 규칙 검증(근거·기간·구역·기준 일정)."""

from datetime import datetime

import pytest
from conftest import free_text_xlsx, s1_xlsx

from llm.extract import ExtractionFailed, LLMPlan, LLMTask, extract_plan
from parsers import parse_document


class FakeProvider:
    name, model = "fake", "fake-1"

    def __init__(self, plan: LLMPlan) -> None:
        self.plan = plan
        self.calls = 0

    def extract(self, system, user, schema, max_tokens=16000):
        self.calls += 1
        assert schema is LLMPlan and "<document>" in user
        return self.plan


def llm_task(**overrides) -> LLMTask:
    base = dict(
        name="노흉 구간 내화물 축조",
        contractor=None,
        trade=None,
        location_text="노흉 구간",
        zone_id="STACK",
        period_text="2월 5일부터 3월 2일까지",
        start_date="2027-02-05",
        end_date="2027-03-02",
        time_text=None,
        start_time=None,
        end_time=None,
        shift="day",
        headcount=None,
        hazards=["confined"],
        hazard_text=None,
        precondition_text=None,
        predecessor_wbs_ids=[],
        wbs_id="P22",
        evidence_locs=["Sheet1!A2"],
    )
    return LLMTask(**(base | overrides))


def run_llm(task: LLMTask) -> tuple:
    fake = FakeProvider(LLMPlan(contractor=None, tasks=[task]))
    doc = parse_document("안내.xlsx", free_text_xlsx())
    return extract_plan(doc, provider_factory=lambda: fake), fake


def test_s1_table_rules_without_llm():
    fake = FakeProvider(LLMPlan(contractor=None, tasks=[]))
    out = extract_plan(parse_document("배관O.xlsx", s1_xlsx()), provider_factory=lambda: fake)
    assert out.method == "table_rules" and fake.calls == 0
    p34, p33 = out.tasks
    assert (p34.task.id, p34.task.zone_id) == ("P34", "TUYERE")
    assert (p34.task.start, p34.task.end) == (datetime(2027, 2, 25, 8), datetime(2027, 3, 1, 17))
    assert {h.value for h in p34.task.hazards} == {"hot_work", "gas"}
    assert p34.task.predecessors == ["P20", "P21", "P22"]  # 기준 일정의 선행 관계 → F2 순서 위반 판정에 쓴다
    assert p34.sources[0].locator == "작업계획!A5" and not p34.needs_review
    # 문서에 적힌 선행 조건(노흉 축조 완료 후 → P22)도 붙는다
    assert (p33.task.id, p33.task.zone_id) == ("P33", "BELLY_BOSH")
    assert p33.task.predecessors == ["P19", "P22"]
    assert out.contractor == "가상-배관O"


def test_llm_path_grounds_evidence_and_links_wbs():
    out, fake = run_llm(llm_task(evidence_locs=["Sheet1!A2", "Sheet1!Z99"]))
    assert out.method == "llm" and fake.calls == 1
    t = out.tasks[0]
    assert t.task.id == "P22" and t.task.zone_id == "STACK"
    assert (t.task.start, t.task.end) == (datetime(2027, 2, 5, 7), datetime(2027, 3, 2, 19))
    assert [s.locator for s in t.sources] == ["Sheet1!A2"]  # 원문에 없는 위치는 버린다
    assert "노흉 구간 내화물 축조" in t.sources[0].text  # 근거 문장은 파서 원문
    assert any("Z99" in w for w in t.warnings)
    assert t.task.predecessors == ["P19"]
    assert out.contractor == "가상-축로I"  # 문서 머리에서 읽은 업체


def test_llm_date_disagreement_uses_rule_value():
    out, _ = run_llm(llm_task(start_date="2027-02-06"))
    t = out.tasks[0]
    assert t.task.start == datetime(2027, 2, 5, 7)
    assert any("기간 해석이 다릅니다" in w for w in t.warnings)


def test_llm_text_not_in_source_is_flagged():
    out, _ = run_llm(llm_task(period_text="2월 1일부터 3월 9일까지", start_date="2027-02-01", end_date="2027-03-09"))
    assert any("근거 줄에 그대로 있지 않습니다" in w for w in out.tasks[0].warnings)


def test_llm_implausible_wbs_is_rejected():
    out, _ = run_llm(llm_task(wbs_id="P01"))
    t = out.tasks[0]
    assert t.wbs_id != "P01" and any("P01" in w for w in t.warnings)


def test_llm_missing_zone_needs_review():
    out, _ = run_llm(llm_task(location_text=None, zone_id=None))
    t = out.tasks[0]
    assert t.task.zone_id == "" and t.needs_review


def test_free_text_without_llm_fails_clearly():
    with pytest.raises(ExtractionFailed) as e:
        extract_plan(parse_document("안내.xlsx", free_text_xlsx()))
    assert e.value.status_code == 502


def test_llm_failure_falls_back_to_table_rules():
    def broken():
        raise RuntimeError("API 장애")

    doc = parse_document("배관O.xlsx", s1_xlsx())
    out = extract_plan(doc, mode="llm", provider_factory=broken)
    assert out.method == "table_rules" and len(out.tasks) == 2
    assert any("LLM 추출 실패" in w for w in out.warnings)


def test_crew_is_read_from_plan_table():
    """투입 인원: 계획서 인원 칸을 읽는다 (합성 계획서 5건 모두 인원 칸이 있다)."""
    from pathlib import Path

    from llm.extract import extract_plan as run
    from parsers import parse_document

    samples = Path(__file__).resolve().parents[1] / "samples"
    name = "가상-배관O_가스라인_복구_작업계획서.hwpx"
    ext = run(parse_document(name, (samples / name).read_bytes()), mode="rules", contractor_hint="가상-배관O")
    assert {e.task.id: e.task.crew for e in ext.tasks} == {"P34": 8, "P33": 6}
    assert all(e.raw.get("crew") for e in ext.tasks)  # 원문 근거


def test_crew_falls_back_to_baseline_with_warning():
    """계획서에 인원 칸이 없으면 기준 일정 값(가정값)을 넣고 확인하라고 알린다."""
    from conftest import s1_xlsx

    from llm.extract import extract_plan as run
    from parsers import parse_document

    ext = run(parse_document("배관O.xlsx", s1_xlsx()), mode="rules", contractor_hint="가상-배관O")
    p34 = next(e for e in ext.tasks if e.task.id == "P34")
    assert p34.task.crew == 8 and any("투입 인원" in w for w in p34.warnings)


def test_parse_crew_reads_first_number():
    from parsers.normalize import parse_crew

    assert [parse_crew(v) for v in ("8", "8명", "작업인원 12명", "8명(신호수 2명 포함)", 6.0, None, "-")] == [8, 8, 12, 8, 6, None, None]
