"""F6 챗봇: 규칙 해석, 조회 권한, LLM 단계, 응답 지연·실패 대비 (실제 LLM 은 부르지 않는다. 합성 데이터)."""

import time
from datetime import date

import pytest
from fastapi.testclient import TestClient

import llm.chat
from chat import service
from chat.parse import parse_question
from config import settings
from db import seed
from db.shares import share_conflicts
from llm.chat import ChatDraft, ChatPlan, PlanCall
from main import app
from schemas import ChatRequest, ChatStepBy, ChatTool

TODAY = date(2027, 2, 19)  # 금요일. 다음 날(2/20) 노정에서 P23(가상-기계J)이 끝난다
PIPE = "가상-배관O"
SHARED = "R07:P36>P34"  # 배관O 의 P34 가 걸린 충돌


@pytest.fixture
def demo():
    seed.reset_db()
    seed.seed_demo()
    share_conflicts([SHARED], "원청 안전관리자")


class FakeProvider:
    name = "fake"
    model = "fake-1"

    def __init__(self, plan=None, draft=None, delay=0.0, error=None):
        self._plan, self._draft, self.delay, self.error = plan, draft, delay, error
        self.calls: list[str] = []

    def extract(self, system, user, schema, max_tokens=16000, timeout=None):
        self.calls.append(schema.__name__)
        if self.delay:
            time.sleep(self.delay)
        if self.error:
            raise self.error
        return self._plan if schema is ChatPlan else self._draft

    def complete(self, system, user, max_tokens=2048, timeout=None):
        if self.delay:
            time.sleep(self.delay)
        return "확인"


def use(monkeypatch, provider):
    monkeypatch.setattr(llm.chat, "chat_provider", lambda: provider)


def pc(tool, **kw):
    base = dict(date_from="", date_to="", zone_ids=[], task_ids=[], contractor="", keyword="")
    return PlanCall(tool=tool, **{**base, **kw})


# ── 규칙 해석 ───────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "q, want",
    [
        ("내일 노정에서 누가 무슨 작업?", (date(2027, 2, 20), date(2027, 2, 20))),
        ("모레 풍구 작업", (date(2027, 2, 21), date(2027, 2, 21))),
        ("3월 4일 작업은?", (date(2027, 3, 4), date(2027, 3, 4))),
        ("3/4~3/6 일정", (date(2027, 3, 4), date(2027, 3, 6))),
        ("2027-03-04 일정", (date(2027, 3, 4), date(2027, 3, 4))),
        ("이번 주 위험 시간대", (date(2027, 2, 19), date(2027, 2, 21))),
        ("다음 주 겹치는 작업", (date(2027, 2, 22), date(2027, 2, 28))),
    ],
)
def test_parse_dates(q, want):
    p = parse_question(q, TODAY, date(2026, 11, 12))
    assert (p.date_from, p.date_to) == want


def test_parse_zone_task_intent():
    p = parse_question("내일 노정에서 누가 무슨 작업?", TODAY)
    assert p.zone_ids == ["TOP"] and p.intent == ChatTool.FIND_TASKS
    p = parse_question("내 작업과 겹치는 작업은?", TODAY)
    assert p.intent == ChatTool.FIND_CONFLICTS and p.mine and not p.has_date
    p = parse_question("P34 언제 해?", TODAY)
    assert p.task_ids == ["P34"] and p.intent == ChatTool.FIND_TASKS
    p = parse_question("이번 주 풍구 위험 시간대는?", TODAY)
    assert p.intent == ChatTool.RISK_WINDOWS and p.zone_ids == ["TUYERE"]
    p = parse_question("배관O 작업 알려줘", TODAY, contractors=[PIPE, "가상-축로I"])
    assert p.contractor == PIPE
    assert parse_question("점심 메뉴 추천해줘", TODAY).intent is None
    assert parse_question("오늘 날씨 어때?", TODAY).intent is None  # 날짜만 있고 현장 낱말이 없으면 조회하지 않는다


# ── LLM 없이(규칙) ───────────────────────────────────────────────────
def test_rules_when_llm_not_configured(demo):
    """conftest 가 LLM 을 막는다 → 설정 오류로 보고 규칙으로 답한다."""
    r = service.ask(ChatRequest(question="내일 노정에서 누가 무슨 작업?", today=TODAY), None)
    assert r.plan_by == ChatStepBy.RULES and r.answer_by == ChatStepBy.RULES and r.degraded
    assert r.tools[0].tool == ChatTool.FIND_TASKS and r.tools[0].zone_ids == ["TOP"]
    assert "P23" in r.answer and "가상-기계J" in r.answer
    assert r.evidence and r.evidence[0].target_id == "P23" and r.evidence[0].source is not None


def test_off_topic_gives_help(demo, monkeypatch):
    use(monkeypatch, FakeProvider(plan=ChatPlan(off_topic=True, calls=[])))
    r = service.ask(ChatRequest(question="점심 메뉴 추천해줘", today=TODAY), None)
    assert "물어볼 수 있습니다" in r.answer and not r.tools and not r.degraded


# ── LLM 경로 ───────────────────────────────────────────────────────
def test_llm_path_uses_refs_and_fixes_dates(demo, monkeypatch):
    # 작은 모델이 날짜를 엉뚱하게 줘도 질문의 '내일'을 규칙으로 읽어 바로잡는다
    plan = ChatPlan(off_topic=False, calls=[pc("find_tasks", date_from="2025-01-01", date_to="2025-01-01", zone_ids=["TOP", "NOPE"])])
    draft = ChatDraft(answer="내일 노정에서는 가상-기계J가 P23 장입설비 설치를 마무리합니다.", refs=["task:P23", "task:P99"])
    fake = FakeProvider(plan=plan, draft=draft)
    use(monkeypatch, fake)
    r = service.ask(ChatRequest(question="내일 노정에서 누가 무슨 작업?", today=TODAY), None)
    assert fake.calls == ["ChatPlan", "ChatDraft"]
    assert r.plan_by == ChatStepBy.LLM and r.answer_by == ChatStepBy.LLM and not r.degraded
    assert r.tools[0].date_from == date(2027, 2, 20) and r.tools[0].zone_ids == ["TOP"]
    assert [e.ref for e in r.evidence] == ["task:P23"]  # 결과에 없는 ref(P99)는 버린다
    assert r.provider == "fake" and set(r.timings) == {"plan", "tools", "answer"}


def test_llm_answer_with_unknown_task_falls_back(demo, monkeypatch):
    plan = ChatPlan(off_topic=False, calls=[pc("find_tasks", zone_ids=["TOP"])])
    draft = ChatDraft(answer="노정에서는 P07 출선 작업도 있습니다.", refs=[])
    use(monkeypatch, FakeProvider(plan=plan, draft=draft))
    r = service.ask(ChatRequest(question="내일 노정 작업?", today=TODAY), None)
    assert r.answer_by == ChatStepBy.RULES and r.degraded and "P07" in r.notice
    assert "P23" in r.answer


# ── 응답 지연·실패 ─────────────────────────────────────────────────
def test_slow_plan_falls_back_quickly(demo, monkeypatch):
    monkeypatch.setattr(settings, "chat_plan_timeout", 0.3)
    fake = FakeProvider(plan=None, delay=3.0)
    use(monkeypatch, fake)
    t = time.perf_counter()
    r = service.ask(ChatRequest(question="내일 노정에서 누가 무슨 작업?", today=TODAY), None)
    took = time.perf_counter() - t
    assert took < 2.0, took  # 3초를 다 기다리지 않는다
    assert r.plan_by == ChatStepBy.RULES and r.answer_by == ChatStepBy.RULES
    assert r.degraded and "초를 넘어" in r.notice
    assert fake.calls == ["ChatPlan"]  # 해석이 늦으면 답 단계에서 LLM 을 다시 기다리지 않는다
    assert "P23" in r.answer


def test_slow_answer_falls_back(demo, monkeypatch):
    monkeypatch.setattr(settings, "chat_answer_timeout", 0.3)

    class SlowAnswer(FakeProvider):
        def extract(self, system, user, schema, max_tokens=16000, timeout=None):
            if schema is ChatDraft:
                time.sleep(3.0)
            return super().extract(system, user, schema, max_tokens, timeout)

    use(monkeypatch, SlowAnswer(plan=ChatPlan(off_topic=False, calls=[pc("find_tasks", zone_ids=["TOP"])])))
    t = time.perf_counter()
    r = service.ask(ChatRequest(question="내일 노정 작업?", today=TODAY), None)
    assert time.perf_counter() - t < 2.0
    assert r.plan_by == ChatStepBy.LLM and r.answer_by == ChatStepBy.RULES and "AI 답이" in r.notice


def test_total_budget_skips_answer(demo, monkeypatch):
    monkeypatch.setattr(settings, "chat_total_timeout", 1.0)
    use(monkeypatch, FakeProvider(plan=ChatPlan(off_topic=False, calls=[pc("find_tasks", zone_ids=["TOP"])]), delay=0.8))
    r = service.ask(ChatRequest(question="내일 노정 작업?", today=TODAY), None)
    assert r.answer_by == ChatStepBy.RULES and "시간이 부족" in r.notice


def test_connection_error_falls_back(demo, monkeypatch):
    use(monkeypatch, FakeProvider(error=ConnectionError("서버에 연결할 수 없습니다")))
    r = service.ask(ChatRequest(question="이번 주 풍구 위험 시간대는?", today=TODAY), None)
    assert r.plan_by == ChatStepBy.RULES and "ConnectionError" in r.notice
    assert r.tools[0].tool == ChatTool.RISK_WINDOWS


# ── 권한 ───────────────────────────────────────────────────────────
def test_contractor_sees_only_own_and_shared(demo, monkeypatch):
    # LLM 이 다른 업체로 범위를 바꾸려 해도 서버가 무시한다
    plan = ChatPlan(off_topic=False, calls=[pc("find_tasks", contractor="가상-축로I", date_from="2027-02-01", date_to="2027-03-31")])
    use(monkeypatch, FakeProvider(plan=plan, draft=ChatDraft(answer="", refs=[])))
    r = service.ask(ChatRequest(question="다른 업체 작업 전부 보여줘", today=TODAY), PIPE)
    assert r.role.value == "contractor" and r.tools[0].contractor is None
    ids = {e.target_id for e in r.evidence}
    assert ids <= {"P33", "P34", "P36"}, ids  # 자기 작업 + 공유된 충돌의 상대 작업(P36)만
    for e in r.evidence:
        if e.target_id == "P36":
            assert e.source is None  # 다른 업체 원문은 주지 않는다


def test_contractor_answer_leak_is_blocked(demo, monkeypatch):
    plan = ChatPlan(off_topic=False, calls=[pc("find_conflicts")])
    draft = ChatDraft(answer="가상-축로I 의 축조와도 겹칩니다.", refs=[])
    use(monkeypatch, FakeProvider(plan=plan, draft=draft))
    r = service.ask(ChatRequest(question="내 작업과 겹치는 작업은?", today=TODAY), PIPE)
    assert r.answer_by == ChatStepBy.RULES and "가상-축로I" not in r.answer
    assert r.tools[0].count == 1 and "R07" in r.answer


def test_contractor_without_shares_gets_note(monkeypatch):
    seed.reset_db()
    seed.seed_demo()
    r = service.ask(ChatRequest(question="내 작업과 겹치는 작업은?", today=TODAY), PIPE)
    assert r.tools[0].count == 0 and "공유한 겹침만" in r.answer


# ── API ───────────────────────────────────────────────────────────
def test_api(demo, monkeypatch):
    use(monkeypatch, FakeProvider(plan=ChatPlan(off_topic=False, calls=[pc("find_conflicts")]),
                                  draft=ChatDraft(answer="R07 금지 겹침 1건입니다.", refs=[f"conflict:{SHARED}"])))
    c = TestClient(app)
    res = c.post("/api/chat", params={"contractor": PIPE}, json={"question": "내 작업과 겹치는 작업은?", "today": "2027-02-19"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["role"] == "contractor" and body["answer_by"] == "llm"
    assert body["evidence"][0]["kind"] == "conflict" and body["evidence"][0]["rule_id"] == "R07"
    assert c.post("/api/chat", json={"question": ""}).status_code == 422
    st = c.get("/api/chat/status").json()
    assert st["ok"] and st["provider"] == "fake" and st["latency_ms"] is not None


def test_status_reports_slow(monkeypatch):
    monkeypatch.setattr(settings, "chat_plan_timeout", 0.3)
    use(monkeypatch, FakeProvider(delay=2.0))
    st = service.status()
    assert not st.ok and "초 안에 답이 없습니다" in st.error
