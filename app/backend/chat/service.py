"""F6 챗봇 흐름: 질문 해석(LLM) → 조회(서버 코드, 권한 적용) → 답 문장(LLM) → 근거 붙이기.

응답이 늦을 때:
- 단계마다 시간 한도(CHAT_PLAN_TIMEOUT · CHAT_ANSWER_TIMEOUT)와 질문 하나의 전체 한도(CHAT_TOTAL_TIMEOUT)를 둔다
- LLM 호출은 별도 스레드에서 돌리고, 한도를 넘으면 기다리지 않고 규칙(chat/parse.py · chat/answer.py)으로 대신한다
  (SDK 에도 같은 timeout 을 넘겨 늦은 요청은 곧 끊긴다. 재시도는 하지 않는다)
- 질문 해석이 늦거나 실패하면 LLM 서버가 느리거나 꺼진 것으로 보고 답 문장도 규칙으로 바로 만든다
- 어느 단계를 규칙으로 했는지 plan_by·answer_by·notice 로 화면에 알린다
"""

from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from datetime import date, datetime
from time import perf_counter

from config import settings
from llm import chat as llm_chat
from schemas import ChatRequest, ChatResponse, ChatStepBy, ChatTool, ChatToolCall, Role

from .answer import HELP, key_terms, template_answer, template_lines
from .parse import ParsedQuestion, default_range, parse_question
from .tools import ToolResult, known_contractors, run_tool, zone_names

log = logging.getLogger(__name__)

_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="chat-llm")
_MAX_CALLS = 3
_MIN_ANSWER_BUDGET = 3.0  # 남은 시간이 이보다 적으면 LLM 답을 부르지 않는다(초) [팀 설정값]
_MAX_EVIDENCE = 8
_TASK_ID = re.compile(r"(?<![A-Za-z0-9])P\d{2}(?!\d)")


class _Slow(Exception):
    pass


def chat_today(req_today: date | None) -> date:
    if req_today:
        return req_today
    if settings.chat_today:
        try:
            return date.fromisoformat(settings.chat_today.strip())
        except ValueError:
            log.warning("CHAT_TODAY 형식이 YYYY-MM-DD 가 아닙니다: %r", settings.chat_today)
    return date.today()


def _d0() -> date | None:
    try:
        return date.fromisoformat(settings.project_d0)
    except ValueError:
        return None


def _call_llm(fn, budget: float):
    """budget 초 안에 끝나지 않으면 _Slow. 남은 스레드는 같은 timeout 을 받은 SDK 가 곧 끊는다."""
    fut = _POOL.submit(fn)
    try:
        return fut.result(timeout=budget)
    except FutureTimeout:
        fut.cancel()
        raise _Slow from None


def _secs(b: float) -> str:
    return f"{b:.0f}" if b >= 1 else f"{b:.1f}"


def _is_timeout(e: BaseException) -> bool:
    return isinstance(e, _Slow) or "timeout" in type(e).__name__.lower() or "timed out" in str(e).lower()


def _date(s: str) -> date | None:
    try:
        return date.fromisoformat(s.strip()[:10]) if s and s.strip() else None
    except ValueError:
        return None


def rule_calls(p: ParsedQuestion, today: date, contractor: str | None) -> list[ChatToolCall]:
    if p.intent is None:
        return []
    f, t = default_range(p.intent, p, today)
    return [
        ChatToolCall(
            tool=p.intent,
            date_from=f,
            date_to=t,
            zone_ids=p.zone_ids,
            task_ids=p.task_ids,
            contractor=None if contractor else p.contractor,
        )
    ]


def sanitize(plan: llm_chat.ChatPlan, p: ParsedQuestion, today: date, contractor: str | None) -> list[ChatToolCall]:
    """LLM 이 고른 조건을 바로잡는다. 날짜·구역·작업 번호는 규칙이 읽은 값을 우선하고, 업체 범위는 서버가 정한다."""
    zones = zone_names()
    known = set(known_contractors())
    d0 = _d0()
    out: list[ChatToolCall] = []
    for pc in plan.calls[:_MAX_CALLS]:
        tool = ChatTool(pc.tool)
        if p.has_date:
            f, t = p.date_from, p.date_to
        else:
            f, t = _date(pc.date_from), _date(pc.date_to)
            # 엉뚱한 해(작은 모델이 연도를 틀린다)는 버리고 도구별 기본값으로
            if f and d0 and abs((f - d0).days) > 400:
                f = t = None
            # 날짜를 말하지 않았는데 '오늘 하루'로 좁히면(작은 모델의 버릇) 도구별 기본값으로. "오늘"이라 했으면 규칙이 이미 읽었다
            if f == today and t in (None, today):
                f = t = None
            if f is None and t is None:
                f, t = default_range(tool, p, today)
            elif f and t and t < f:
                f, t = t, f
        zone_ids = p.zone_ids or [z for z in pc.zone_ids if z in zones and z != "ALL"]
        task_ids = list(dict.fromkeys(p.task_ids + [x.upper() for x in pc.task_ids if _TASK_ID.fullmatch(x.upper())]))
        who = None
        if not contractor:  # 원청만 업체로 좁힐 수 있다. 협력사 질문에서 LLM 이 업체를 넣어도 무시한다
            who = p.contractor or next((k for k in known if pc.contractor and pc.contractor.strip() and pc.contractor.strip() in k), None)
        keyword = pc.keyword.strip()[:20] or None
        if keyword and (keyword in {"작업", "일정", "공사", "충돌", "겹침"} or any(keyword in n for n in zones.values())):
            keyword = None
        call = ChatToolCall(tool=tool, date_from=f, date_to=t, zone_ids=zone_ids, task_ids=task_ids, contractor=who, keyword=keyword)
        if all(call.model_dump(exclude={"count", "note"}) != c.model_dump(exclude={"count", "note"}) for c in out):
            out.append(call)
    return out


def _leaks(text: str, results: list[ToolResult], question: str = "", contractor: str | None = None) -> str | None:
    """LLM 답에 조회 결과 밖의 작업 번호·업체가 있으면 그 이유. 협력사에게 다른 업체 정보가 새는 것도 여기서 막는다.

    질문에 나온 이름과 묻는 사람 자신의 업체는 이미 아는 것이라 되풀이해도 괜찮다 ("가상-축로I 일정은 볼 수 없습니다").
    """
    blob = " ".join(str(i.data) for r in results for i in r.items) + " " + " ".join(
        (r.call.contractor or "") for r in results
    ) + " " + question + " " + (contractor or "")
    ids = set(_TASK_ID.findall(text)) - set(_TASK_ID.findall(blob))
    if ids:
        return f"조회 결과에 없는 작업 번호({', '.join(sorted(ids))})"
    names = {k for k in known_contractors() if k in text and k not in blob}
    if names:
        return f"조회 결과에 없는 업체({', '.join(sorted(names))})"
    return None


def _evidence(refs: list[str], results: list[ToolResult]):
    by_ref = {i.ref: i.evidence for r in results for i in r.items}
    picked = [by_ref[x] for x in dict.fromkeys(refs) if x in by_ref]
    if not picked:  # LLM 이 근거를 안 붙였거나 규칙 답이면 결과 앞쪽을 근거로
        picked = [i.evidence for r in results for i in r.items[:4]]
    return picked[:_MAX_EVIDENCE]


def ask(req: ChatRequest, contractor: str | None) -> ChatResponse:
    t0 = perf_counter()
    deadline = t0 + settings.chat_total_timeout
    today = chat_today(req.today)
    contractor = contractor or None
    p = parse_question(req.question, today, _d0(), known_contractors())
    history = [(h.question, h.answer) for h in req.history]
    notices: list[str] = []
    timings: dict[str, float] = {}

    provider = None
    provider_name, model = settings.chat_provider or settings.llm_provider, ""
    try:
        provider = llm_chat.chat_provider()
        provider_name, model = provider.name, provider.model
    except Exception as e:  # 키·주소가 비어 있는 등 설정 오류
        log.warning("chat provider 설정 오류: %s", e)
        notices.append(f"AI 연결 설정을 확인해 주세요 ({e}). 규칙으로 답했습니다")

    # 1) 질문 해석
    calls: list[ChatToolCall] | None = None
    plan_by = ChatStepBy.RULES
    llm_ok = provider is not None
    off_topic = False
    if provider:
        budget = max(0.05, min(settings.chat_plan_timeout, deadline - perf_counter()))
        s = perf_counter()
        try:
            plan = _call_llm(lambda: llm_chat.plan(provider, req.question, history, today, contractor, budget), budget)
            calls = sanitize(plan, p, today, contractor)
            plan_by = ChatStepBy.LLM
            off_topic = plan.off_topic and p.intent is None
            if not calls and not off_topic:
                calls = None  # LLM 이 도구를 못 골랐으면 규칙으로
        except Exception as e:
            llm_ok = False
            if _is_timeout(e):
                notices.append(f"AI 응답이 {_secs(budget)}초를 넘어 규칙으로 질문을 해석하고 답했습니다")
            else:
                log.warning("chat plan 실패: %s: %s", type(e).__name__, e)
                notices.append(f"AI 질문 해석에 실패해({type(e).__name__}) 규칙으로 답했습니다")
        timings["plan"] = round((perf_counter() - s) * 1000, 1)
    if calls is None:
        calls = rule_calls(p, today, contractor)
        if provider and plan_by == ChatStepBy.LLM:
            plan_by = ChatStepBy.RULES

    def done(answer: str, answer_by: ChatStepBy, results: list[ToolResult], refs: list[str]) -> ChatResponse:
        return ChatResponse(
            answer=answer,
            evidence=_evidence(refs, results) if results else [],
            tools=[r.call for r in results],
            today=today,
            role=Role.CONTRACTOR if contractor else Role.PRIME,
            plan_by=plan_by,
            answer_by=answer_by,
            degraded=bool(notices),
            notice=" · ".join(notices) or None,
            provider=provider_name,
            model=model,
            elapsed_ms=round((perf_counter() - t0) * 1000, 1),
            timings=timings,
        )

    if off_topic or not calls:
        return done(HELP, ChatStepBy.RULES, [], [])

    # 2) 조회 (권한은 run_tool 안에서 contractor 로 거른다)
    s = perf_counter()
    results = [run_tool(c, contractor) for c in calls]
    timings["tools"] = round((perf_counter() - s) * 1000, 1)

    # 3) 답 문장
    if llm_ok and provider:
        budget = min(settings.chat_answer_timeout, deadline - perf_counter())
        if budget >= min(_MIN_ANSWER_BUDGET, settings.chat_answer_timeout):
            s = perf_counter()
            try:
                draft = _call_llm(
                    lambda: llm_chat.answer(provider, req.question, [r.for_llm() for r in results], today, contractor, budget),
                    budget,
                )
                text = draft.answer.strip()
                timings["answer"] = round((perf_counter() - s) * 1000, 1)
                if not text:
                    notices.append("AI 답이 비어 있어 규칙으로 답했습니다")
                elif why := _leaks(text, results, req.question, contractor):
                    log.warning("chat answer 에 %s", why)
                    notices.append(f"AI 답에 {why}가 있어 규칙 답으로 바꿨습니다")
                else:
                    terms = key_terms(results, req.question)
                    if terms and not any(k in text for k in terms):
                        # 요약 한 줄만 쓰고 목록을 빼먹었으면(작은 모델) 규칙 목록을 붙인다
                        text = f"{text}\n{template_lines(results)}"
                    return done(text, ChatStepBy.LLM, results, draft.refs)
            except Exception as e:
                timings["answer"] = round((perf_counter() - s) * 1000, 1)
                if _is_timeout(e):
                    notices.append(f"AI 답이 {_secs(budget)}초를 넘어 규칙으로 답했습니다")
                else:
                    log.warning("chat answer 실패: %s: %s", type(e).__name__, e)
                    notices.append(f"AI 답 쓰기에 실패해({type(e).__name__}) 규칙으로 답했습니다")
        else:
            notices.append("응답 시간이 부족해 규칙으로 답했습니다")
    return done(template_answer(results), ChatStepBy.RULES, results, [])


def status():
    """연결 확인용: 짧은 질문 하나를 보내 걸린 시간을 잰다."""
    from schemas import ChatStatus

    common = dict(
        plan_timeout=settings.chat_plan_timeout,
        answer_timeout=settings.chat_answer_timeout,
        total_timeout=settings.chat_total_timeout,
    )
    try:
        provider = llm_chat.chat_provider()
    except Exception as e:
        return ChatStatus(provider=settings.chat_provider or settings.llm_provider, model="", ok=False, error=str(e), **common)
    budget = min(10.0, settings.chat_plan_timeout)  # [팀 설정값]
    s = perf_counter()
    try:
        _call_llm(lambda: llm_chat.ping(provider, budget), budget)
        return ChatStatus(provider=provider.name, model=provider.model, ok=True, latency_ms=round((perf_counter() - s) * 1000, 1), **common)
    except Exception as e:
        err = f"{budget:.0f}초 안에 답이 없습니다" if _is_timeout(e) else f"{type(e).__name__}: {e}"
        return ChatStatus(provider=provider.name, model=provider.model, ok=False, latency_ms=None, error=err[:300], **common)
