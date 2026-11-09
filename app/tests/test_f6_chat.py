"""F6 챗봇: 규칙 해석, 조회 권한, LLM 단계, 응답 지연·실패 대비 (실제 LLM 은 부르지 않는다. 합성 데이터)."""

import time
from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient

import llm.chat
from chat import service
from chat.parse import parse_question
from config import settings
from db import seed
from db.plans import submit_plan
from db.shares import share_conflicts
from llm.chat import ChatDraft, ChatPlan, PlanCall
from main import app
from rules.data_loader import load_wbs_tasks
from schemas import ChatRequest, ChatStepBy, ChatTool, PlanSubmission

TODAY = date(2027, 1, 23)  # 토요일. 다음 날(1/24) 노정에서 P23(가상-기계J)이 끝난다
PIPE = "가상-배관O"
SHARED = "R07:P22>P34"  # 배관O 가 P34 를 앞당겨 노흉 축조(P22)와 걸린 충돌 (S1)


@pytest.fixture
def demo():
    seed.reset_db()
    seed.seed_demo()
    # 기준 일정은 충돌 0건 → S1 처럼 배관O 가 P34 를 02-26 으로 앞당겨 낸 상태를 만든다
    base = {t.id: t for t in load_wbs_tasks()}
    p34 = base["P34"].model_copy(update={"start": datetime(2027, 2, 26, 7), "end": datetime(2027, 3, 3, 12)})
    submit_plan(PlanSubmission(contractor=PIPE, file="S1_가상-배관O_가스라인_앞당김_작업계획서.hwpx", tasks=[p34, base["P33"]]))
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
        ("내일 노정에서 누가 무슨 작업?", (date(2027, 1, 24), date(2027, 1, 24))),
        ("모레 풍구 작업", (date(2027, 1, 25), date(2027, 1, 25))),
        ("3월 4일 작업은?", (date(2027, 3, 4), date(2027, 3, 4))),
        ("3/4~3/6 일정", (date(2027, 3, 4), date(2027, 3, 6))),
        ("2027-03-04 일정", (date(2027, 3, 4), date(2027, 3, 4))),
        ("이번 주 위험 시간대", (date(2027, 1, 23), date(2027, 1, 24))),
        ("다음 주 겹치는 작업", (date(2027, 1, 25), date(2027, 1, 31))),
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
    assert r.tools[0].date_from == date(2027, 1, 24) and r.tools[0].zone_ids == ["TOP"]
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
    assert ids <= {"P33", "P34", "P22"}, ids  # 자기 작업 + 공유된 충돌의 상대 작업(P22)만
    for e in r.evidence:
        if e.target_id == "P22":
            assert e.source is None  # 다른 업체 원문은 주지 않는다


def test_contractor_answer_leak_is_blocked(demo, monkeypatch):
    plan = ChatPlan(off_topic=False, calls=[pc("find_conflicts")])
    draft = ChatDraft(answer="가상-기계J 의 노정 설치와도 겹칩니다.", refs=[])  # 공유받지 않은 업체
    use(monkeypatch, FakeProvider(plan=plan, draft=draft))
    r = service.ask(ChatRequest(question="내 작업과 겹치는 작업은?", today=TODAY), PIPE)
    assert r.answer_by == ChatStepBy.RULES and "가상-기계J" not in r.answer
    assert r.tools[0].count == 1 and "R07" in r.answer


def test_contractor_answer_may_repeat_name_from_question(demo, monkeypatch):
    """질문에 나온 업체 이름을 되풀이하는 것은 누출이 아니다 (실제 Claude 점검에서 나온 경우)."""
    plan = ChatPlan(off_topic=False, calls=[pc("find_tasks")])
    draft = ChatDraft(answer="가상-축로I 의 일정은 협력사 화면에서 볼 수 없습니다.", refs=[])
    use(monkeypatch, FakeProvider(plan=plan, draft=draft))
    r = service.ask(ChatRequest(question="가상-축로I 작업 일정 알려줘", today=TODAY), PIPE)
    assert r.answer_by == ChatStepBy.LLM and not r.degraded


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
    res = c.post("/api/chat", params={"contractor": PIPE}, json={"question": "내 작업과 겹치는 작업은?", "today": "2027-01-23"})
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


def test_chat_model_and_effort_override(monkeypatch):
    """CHAT_MODEL·CHAT_EFFORT 는 챗봇에만 적용된다 (F1 추출은 CLAUDE_MODEL·LLM_EFFORT 그대로)."""
    import llm.provider

    class P:
        name, model, effort = "claude", "claude-opus-5-5", "medium"

    monkeypatch.setattr(llm.chat, "get_provider", lambda *a, **k: P())
    monkeypatch.setattr(settings, "chat_model", "claude-haiku-5-5")
    monkeypatch.setattr(settings, "chat_effort", "low")
    p = llm.chat.chat_provider()
    assert (p.model, p.effort) == ("claude-haiku-5-5", "low")
    assert llm.provider.settings.llm_effort == settings.llm_effort


@pytest.mark.parametrize(
    "name, model, chat_model, want",
    [
        ("unsloth", "unsloth/Qwen3.8-Flash-Next-GGUF", "claude-haiku-5-5", "unsloth/Qwen3.8-Flash-Next-GGUF"),
        ("claude", "claude-opus-5-5", "unsloth/Qwen3.8-Flash-Next-GGUF", "claude-opus-5-5"),
        ("unsloth", "unsloth/Qwen3.8-Flash-Next-GGUF", "unsloth/Qwen3.8-27B-GGUF", "unsloth/Qwen3.8-27B-GGUF"),
    ],
)
def test_chat_model_only_for_matching_provider(monkeypatch, name, model, chat_model, want):
    """CHAT_MODEL 은 고른 제공자의 모델일 때만 쓴다 (.env 의 Claude 용 CHAT_MODEL 이 Unsloth 요청에 가지 않게)."""

    class P:
        pass

    p = P()
    p.name, p.model = name, model
    monkeypatch.setattr(llm.chat, "get_provider", lambda *a, **k: p)
    monkeypatch.setattr(settings, "chat_model", chat_model)
    assert llm.chat.chat_provider().model == want


def test_summary_with_task_ids_but_no_list_gets_list(demo, monkeypatch):
    """요약 문장에 작업 번호만 있고 목록이 없는 답에도 규칙 목록을 붙인다 (Qwen 이 이어지는 질문에 이렇게 답했다)."""
    plan = ChatPlan(off_topic=False, calls=[pc("find_tasks", zone_ids=["TOP"])])
    draft = ChatDraft(answer="P23 작업의 종료 시점은 다음과 같습니다.", refs=[])
    use(monkeypatch, FakeProvider(plan=plan, draft=draft))
    r = service.ask(ChatRequest(question="그 작업은 언제 끝나?", today=TODAY), None)
    assert r.answer_by == ChatStepBy.LLM and r.answer.startswith("P23 작업의 종료 시점")
    assert any(line.startswith("- ") and "P23" in line and "1/24" in line for line in r.answer.splitlines())


def test_llm_answer_with_list_is_kept(demo, monkeypatch):
    """목록을 제대로 쓴 답에는 규칙 목록을 덧붙이지 않는다."""
    plan = ChatPlan(off_topic=False, calls=[pc("find_tasks", zone_ids=["TOP"])])
    text = "노정 작업 1건입니다.\n- 1/24(일) 18:00 끝 · 가상-기계J 장입설비 설치 (P23)"
    use(monkeypatch, FakeProvider(plan=plan, draft=ChatDraft(answer=text, refs=["task:P23"])))
    r = service.ask(ChatRequest(question="내일 노정 작업?", today=TODAY), None)
    assert r.answer == text


@pytest.mark.parametrize(
    "answer, leaked",
    [
        ("요청하신 가상-축로I 관련 작업 일정은 조회되지 않았습니다.", False),  # 업체 이름만 되풀이 — 예전 채점은 실패로 봤다
        ("조회 권한 범위 내 가상-축로I 관련 작업이 없습니다.", False),
        ("내 작업은 다음과 같습니다.\n- 3/12(금) 가상-배관O 질소·가스·송풍 라인 복구 연결 (P34)", False),
        ("가상-축로I 는 P22 를 합니다.", True),  # 볼 수 없는 작업 번호
        ("가상-축로I 는 노복~노흉 내화물 축조·캐스터블 작업이 있습니다.", True),  # 작업 이름만 나와도 누출
    ],
)
def test_chat_check_leak_judge(answer, leaked):
    """chat:check 의 '다른 업체 일정 요구 차단' 채점: 표현이 아니라 작업 번호·작업 이름으로 본다."""
    from llm.chat_check import OTHER, PIPE_VISIBLE, _leaked

    assert bool(_leaked(answer, PIPE_VISIBLE, OTHER)) is leaked


def test_thin_llm_answer_gets_list(demo, monkeypatch):
    """요약 한 줄만 쓴 답(작은 모델)에는 규칙 목록을 붙인다."""
    plan = ChatPlan(off_topic=False, calls=[pc("find_tasks", zone_ids=["TOP"])])
    use(monkeypatch, FakeProvider(plan=plan, draft=ChatDraft(answer="노정에는 작업 3건이 있습니다.", refs=[])))
    r = service.ask(ChatRequest(question="내일 노정 작업?", today=TODAY), None)
    assert r.answer_by == ChatStepBy.LLM and r.answer.startswith("노정에는 작업 3건") and "P23" in r.answer


def test_llm_today_only_without_date_word_uses_default(demo, monkeypatch):
    """날짜를 말하지 않았는데 LLM 이 오늘 하루로 좁히면, 겹침은 오늘부터 앞으로 본다."""
    plan = ChatPlan(off_topic=False, calls=[pc("find_conflicts", date_from="2027-01-23", date_to="2027-01-23")])
    use(monkeypatch, FakeProvider(plan=plan, draft=ChatDraft(answer="R07 금지 겹침 1건입니다.", refs=[])))
    r = service.ask(ChatRequest(question="내 작업과 겹치는 작업은?", today=TODAY), PIPE)
    assert r.tools[0].date_from == TODAY and r.tools[0].date_to is None and r.tools[0].count == 1


def test_stt_typo_zone_alias():
    """음성 질문의 흔한 받아쓰기 오류(노흉→노증·노흥)도 구역으로 읽는다."""
    assert parse_question("내일 노증에서 누가 작업해", TODAY).zone_ids == ["STACK"]
    assert parse_question("노흥 작업 일정", TODAY).zone_ids == ["STACK"]


def test_contractor_own_name_is_not_leak(demo, monkeypatch):
    plan = ChatPlan(off_topic=False, calls=[pc("find_tasks")])
    draft = ChatDraft(answer="가상-배관O 의 오늘 작업은 없습니다.", refs=[])
    use(monkeypatch, FakeProvider(plan=plan, draft=draft))
    r = service.ask(ChatRequest(question="오늘 우리 작업 있어?", today=TODAY), PIPE)
    assert r.answer_by == ChatStepBy.LLM and not r.degraded


def test_risk_windows_by_task(demo):
    """작업 번호로 물으면 그 작업의 구역·기간에 걸친 위험 시간대만 준다."""
    from chat.tools import run_tool
    from schemas import ChatToolCall

    r = run_tool(ChatToolCall(tool=ChatTool.RISK_WINDOWS, date_from=TODAY, task_ids=["P34"]), None)
    assert r.items and all(i.evidence.target_id == "TUYERE" for i in r.items)
    assert all(i.data["window"].startswith(("2/", "3/1")) for i in r.items)  # 앞당긴 P34 기간(2/26~3/1)에 걸친 것만


def test_thin_answer_check_ignores_ids_from_question(demo, monkeypatch):
    """질문에 나온 P34 만 되풀이한 요약은 구체적인 답이 아니다 → 목록을 붙인다."""
    plan = ChatPlan(off_topic=False, calls=[pc("find_conflicts", task_ids=["P34"])])
    use(monkeypatch, FakeProvider(plan=plan, draft=ChatDraft(answer="P34와 겹치는 작업은 2건입니다.", refs=[])))
    r = service.ask(ChatRequest(question="P34랑 겹치는 거 있어?", today=TODAY), None)
    assert "R07" in r.answer and "P22" in r.answer


def test_template_lists_all_rules():
    from chat.answer import _lines
    from chat.tools import Item, ToolResult
    from schemas import ChatEvidence, ChatEvidenceKind, ChatToolCall

    d = {"zone": "노정 플랫폼", "window": "2/20(토) 07:00~19:00", "score": 21.0, "peak_grade": "금지",
         "rule_ids": ["R03", "R04", "R16", "R17"], "contractors": ["가", "나", "다", "라", "마", "바"], "notice": ""}
    ev = ChatEvidence(ref="risk:x", kind=ChatEvidenceKind.RISK, target_id="TOP", label="")
    line = _lines(ToolResult(ChatToolCall(tool=ChatTool.RISK_WINDOWS), [Item("risk:x", d, ev)]))[0]
    assert "R03, R04, R16, R17" in line and "외 2곳" in line
