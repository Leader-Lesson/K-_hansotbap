"""LLM 없이 조회 결과로 답 문장을 만든다. LLM 이 늦거나 실패해도 챗봇이 근거 있는 답을 돌려주게 한다."""

from __future__ import annotations

from schemas import ChatTool

from .tools import ToolResult, condition_text

HELP = (
    "현장 작업 일정, 겹침(충돌), 위험 시간대, 원청 공지를 물어볼 수 있습니다.\n"
    "- 예: \"내일 노정에서 누가 무슨 작업?\"\n"
    "- 예: \"내 작업과 겹치는 작업은?\"\n"
    "- 예: \"이번 주 풍구 위험 시간대는?\""
)
_SHOW = 6  # 규칙 답에 줄로 보여 주는 건수 [팀 설정값]
_WHAT = {
    ChatTool.FIND_TASKS: "작업",
    ChatTool.FIND_CONFLICTS: "겹침",
    ChatTool.RISK_WINDOWS: "위험 시간대",
    ChatTool.SHARED_NOTICES: "공유된 충돌",
}


def _iga(word: str) -> str:
    """받침에 맞는 주격 조사."""
    c = ord(word[-1]) - 0xAC00
    return "이" if 0 <= c <= 11171 and c % 28 else "가"


def _cut(s: str, n: int = 90) -> str:
    s = " ".join(s.split())
    return s if len(s) <= n else s[: n - 1] + "…"


def _lines(r: ToolResult) -> list[str]:
    t = r.call.tool
    out = []
    for i in r.items[:_SHOW]:
        d = i.data
        if t == ChatTool.FIND_TASKS:
            out.append(f"- {d['start']}~{d['end']} {d['zone']} · {d['contractor']} {d['name']} ({d['id']})")
        elif t == ChatTool.FIND_CONFLICTS:
            out.append(f"- [{d['grade']}] {d['type']} {d['window']} · {_cut(d['reason'])} ({d['rule_id']})")
        elif t == ChatTool.RISK_WINDOWS:
            who = f" · {', '.join(d['contractors'][:3])}" if d["contractors"] else ""
            out.append(f"- {d['zone']} {d['window']} · 위험 점수 {d['score']:g} (최고 {d['peak_grade']}) · 규칙 {', '.join(d['rule_ids'][:3])}{who}")
        else:
            hand = f" · 인계 조건: {_cut(d['handover'], 50)}" if d["handover"] else ""
            out.append(f"- [{d['grade']}] {d['window']} · {_cut(d['reason'], 70)}{hand}")
    return out


def key_terms(results: list[ToolResult]) -> set[str]:
    """답에 하나는 나와야 할 구체 항목: 작업 번호·규칙 번호. 구역명은 요약 문장에도 나오므로 세지 않는다."""
    out = set()
    for r in results:
        for i in r.items:
            d = i.data
            if r.call.tool == ChatTool.FIND_TASKS:
                out.add(d["id"])
            else:
                out |= {d["rule_id"]} if d.get("rule_id") else set(d.get("rule_ids", []))
                out |= {t["id"] for t in d.get("tasks", []) + d.get("adjacent_tasks", [])}
    return out


def template_lines(results: list[ToolResult]) -> str:
    """결과 목록 줄만 (LLM 답이 요약 한 줄뿐일 때 붙인다)."""
    return "\n".join(line for r in results for line in _lines(r))


def template_answer(results: list[ToolResult]) -> str:
    parts = []
    for r in results:
        c = r.call
        what = _WHAT[c.tool]
        cond = condition_text(c)
        if not r.items:
            msg = f"{cond} 조건에 맞는 {what}{_iga(what)} 없습니다."
            parts.append(msg + (f" ({c.note})" if c.note else ""))
            continue
        head = f"{cond} {what} {c.count}건입니다."
        if c.tool == ChatTool.FIND_CONFLICTS:
            grades = [i.data["grade"] for i in r.items]
            by = " · ".join(f"{g} {grades.count(g)}" for g in ("금지", "조건부", "결함") if grades.count(g))
            scope = f", 앞 {len(grades)}건 기준" if c.count > len(grades) else ""
            head = f"{cond} {what} {c.count}건입니다 ({by}{scope})."
        lines = _lines(r)
        more = c.count - len(lines)
        tail = [f"- 외 {more}건은 근거 목록과 상황판에서 볼 수 있습니다."] if more > 0 else []
        note = [f"({c.note})"] if c.note else []
        parts.append("\n".join([head, *lines, *tail, *note]))
    return "\n\n".join(parts)
