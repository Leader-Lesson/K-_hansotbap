"""F6 챗봇 조회 함수. LLM 은 SQL 을 실행하지 않고 이 함수 중에서 고르기만 한다.

권한은 여기서 거른다. contractor 는 요청한 사람의 역할로 서버가 넣는 값이고, LLM 이 바꿀 수 없다.
- 원청(contractor=None): 전체
- 협력사: 자기 작업 + 원청이 공유한 충돌의 상대 작업(원문 없이), 공유된 충돌만 (db.plans.list_conflicts 와 같은 규칙)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from functools import lru_cache

from db.plans import current_schedule, list_conflicts
from db.shares import list_shared, visible_tasks
from rules.data_loader import load_zones
from rules.risk import score_windows
from schemas import (
    ChatEvidence,
    ChatEvidenceKind,
    ChatTool,
    ChatToolCall,
    Conflict,
    ConflictType,
    Grade,
    Hazard,
    Task,
)

# 한 번에 LLM 에 넘기는 건수. 많으면 느리고 작은 모델이 헷갈린다 [팀 설정값]
LIMITS = {
    ChatTool.FIND_TASKS: 15,
    ChatTool.FIND_CONFLICTS: 10,
    ChatTool.RISK_WINDOWS: 8,
    ChatTool.SHARED_NOTICES: 10,
}

HAZARD_KO = {Hazard.HOT_WORK: "화기", Hazard.CONFINED: "밀폐", Hazard.HEIGHT: "고소", Hazard.HEAVY_LIFT: "중량물", Hazard.GAS: "가스"}
TYPE_KO = {
    ConflictType.SAME_TIME_ZONE: "같은 시간·구역",
    ConflictType.VERTICAL: "위아래",
    ConflictType.HOT_GAS: "화기×가스",
    ConflictType.SEQUENCE: "순서 위반",
    ConflictType.SOP_MISSING: "표준서 단계 누락",
}
GRADE_ORDER = {Grade.PROHIBITED: 0, Grade.CONDITIONAL: 1, Grade.DEFECT: 2}
WEEKDAY = "월화수목금토일"


@lru_cache
def zone_names() -> dict[str, str]:
    return {z.id: z.name for z in load_zones()}


def zone_name(zone_id: str) -> str:
    """답에 쓰는 짧은 구역명: '풍구 레벨(풍구·환상관·송풍지관)' → '풍구 레벨'."""
    return zone_names().get(zone_id, zone_id).split("(")[0].strip()


def fmt_dt(d: datetime) -> str:
    return f"{d.month}/{d.day}({WEEKDAY[d.weekday()]}) {d:%H:%M}"


def fmt_span(a: datetime, b: datetime) -> str:
    return f"{fmt_dt(a)}~{b:%H:%M}" if a.date() == b.date() else f"{fmt_dt(a)}~{fmt_dt(b)}"


def fmt_day(d: date) -> str:
    return f"{d.month}/{d.day}({WEEKDAY[d.weekday()]})"


@dataclass
class Item:
    """조회 결과 한 건: LLM 에 넘길 사실(data)과 화면에 붙일 근거(evidence)."""

    ref: str
    data: dict
    evidence: ChatEvidence


@dataclass
class ToolResult:
    call: ChatToolCall
    items: list[Item] = field(default_factory=list)

    def for_llm(self) -> dict:
        c = self.call
        return {
            "tool": c.tool.value,
            "condition": condition_text(c),
            "total": c.count,
            "shown": len(self.items),
            "note": c.note or "",
            "items": [i.data for i in self.items],
        }


def condition_text(c: ChatToolCall) -> str:
    parts = []
    if c.date_from and c.date_to:
        parts.append(fmt_day(c.date_from) if c.date_from == c.date_to else f"{fmt_day(c.date_from)}~{fmt_day(c.date_to)}")
    elif c.date_from:
        parts.append(f"{fmt_day(c.date_from)}부터")
    if c.zone_ids:
        parts.append("·".join(zone_name(z) for z in c.zone_ids))
    if c.task_ids:
        parts.append("·".join(c.task_ids))
    if c.contractor:
        parts.append(c.contractor)
    if c.keyword:
        parts.append(f"'{c.keyword}'")
    return " ".join(parts) or "전체"


def _overlaps(start: datetime, end: datetime, c: ChatToolCall) -> bool:
    if c.date_from and end.date() < c.date_from:
        return False
    if c.date_to and start.date() > c.date_to:
        return False
    return True


def _task_item(t: Task, contractor: str | None) -> Item:
    mine = contractor is None or t.contractor == contractor
    data = {
        "ref": f"task:{t.id}",
        "id": t.id,
        "contractor": t.contractor,
        "name": t.name,
        "trade": t.trade or "",
        "zone": zone_name(t.zone_id),
        "start": fmt_dt(t.start),
        "end": fmt_dt(t.end),
        "hazards": [HAZARD_KO.get(h, h.value) for h in t.hazards],
        "predecessors": t.predecessors,
    }
    if contractor:
        data["mine"] = t.contractor == contractor
    ev = ChatEvidence(
        ref=f"task:{t.id}",
        kind=ChatEvidenceKind.TASK,
        target_id=t.id,
        label=f"{t.id} {t.contractor} {t.name} · {zone_name(t.zone_id)} · {fmt_span(t.start, t.end)}",
        source=t.source if mine else None,  # 다른 업체 계획서 원문은 주지 않는다
    )
    return Item(f"task:{t.id}", data, ev)


def find_tasks(c: ChatToolCall, contractor: str | None) -> ToolResult:
    tasks = visible_tasks(contractor) if contractor else current_schedule()
    if c.contractor and not contractor:
        tasks = [t for t in tasks if c.contractor in t.contractor]
    if c.task_ids:
        tasks = [t for t in tasks if t.id in c.task_ids]
    if c.zone_ids:
        tasks = [t for t in tasks if t.zone_id in c.zone_ids or t.zone_id == "ALL"]
    tasks = [t for t in tasks if _overlaps(t.start, t.end, c)]
    if c.keyword:
        hit = [t for t in tasks if c.keyword in t.name or c.keyword in (t.trade or "")]
        if hit or not tasks:
            tasks = hit
        else:
            c.note = f"'{c.keyword}'이 들어간 작업이 없어 그 낱말 없이 찾았습니다"
            c.keyword = None
    tasks.sort(key=lambda t: (t.zone_id == "ALL", t.start, t.id))  # 전 구역 작업은 뒤로
    c.count = len(tasks)
    if contractor and not tasks:
        c.note = c.note or "협력사 화면에서는 자기 작업과 원청이 공유한 겹침의 상대 작업만 보입니다"
    return ToolResult(c, [_task_item(t, contractor) for t in tasks[: LIMITS[c.tool]]])


def _conflict_item(cf: Conflict, status: str, by_task: dict[str, Task]) -> Item:
    tasks = [by_task[t] for t in cf.task_ids if t in by_task]
    data = {
        "ref": f"conflict:{cf.id}",
        "id": cf.id,
        "type": TYPE_KO.get(cf.type, cf.type.value),
        "grade": cf.grade.value,
        "status": status,
        "rule_id": cf.rule_id,
        "legal_basis": cf.legal_basis,
        "window": fmt_span(cf.window_start, cf.window_end),
        "reason": cf.reason,
        "suggestion": cf.suggestion or "",
        "tasks": [{"id": t.id, "contractor": t.contractor, "name": t.name, "zone": zone_name(t.zone_id)} for t in tasks],
        "sources": [s.text[:200] for s in cf.sources[:3]],
    }
    ev = ChatEvidence(
        ref=f"conflict:{cf.id}",
        kind=ChatEvidenceKind.CONFLICT,
        target_id=cf.id,
        label=f"[{cf.grade.value}] {TYPE_KO.get(cf.type, cf.type.value)} · {'·'.join(cf.task_ids)} · {fmt_span(cf.window_start, cf.window_end)}",
        rule_id=cf.rule_id,
        legal_basis=cf.legal_basis,
        source=cf.sources[0] if cf.sources else None,
    )
    return Item(f"conflict:{cf.id}", data, ev)


def find_conflicts(c: ChatToolCall, contractor: str | None) -> ToolResult:
    records = list_conflicts(contractor)  # 협력사면 공유된 것 중 자기 작업이 걸린 것만, 상대 원문은 빠진 채로 온다
    tasks = visible_tasks(contractor) if contractor else current_schedule()
    by_task = {t.id: t for t in tasks}
    out = []
    for r in records:
        cf = r.conflict
        if c.task_ids and not set(c.task_ids) & set(cf.task_ids):
            continue
        if c.zone_ids and not any(by_task[t].zone_id in c.zone_ids for t in cf.task_ids if t in by_task):
            continue
        if c.contractor and not contractor and not any(
            c.contractor in by_task[t].contractor for t in cf.task_ids if t in by_task
        ):
            continue
        if not _overlaps(cf.window_start, cf.window_end, c):
            continue
        out.append(r)
    out.sort(key=lambda r: (GRADE_ORDER.get(r.conflict.grade, 9), r.conflict.window_start, r.conflict.id))
    c.count = len(out)
    if contractor and not out:
        c.note = "협력사에게는 원청이 확인해 공유한 겹침만 보입니다. 아직 공유된 겹침이 없을 수 있습니다"
    return ToolResult(c, [_conflict_item(r.conflict, r.status.value, by_task) for r in out[: LIMITS[c.tool]]])


def risk_windows(c: ChatToolCall, contractor: str | None) -> ToolResult:
    conflicts = [r.conflict for r in list_conflicts(contractor)]
    schedule = current_schedule()
    single_day = c.date_from if c.date_from and c.date_to == c.date_from else None
    windows = score_windows(conflicts, schedule, load_zones(), single_day)
    windows = [w for w in windows if _overlaps(w.start, w.end, c)]
    if c.zone_ids:
        windows = [w for w in windows if w.zone_id in c.zone_ids]
    if c.task_ids:  # "P34 구역 위험 시간대" → 그 작업이 있는 구역·기간의 시간대만
        visible = {t.id: t for t in (visible_tasks(contractor) if contractor else schedule)}
        spans = [(visible[t].zone_id, visible[t].start, visible[t].end) for t in c.task_ids if t in visible]
        windows = [w for w in windows if any(w.zone_id == z and w.start <= e and w.end >= s for z, s, e in spans)]
    windows.sort(key=lambda w: (-w.score, w.start))
    c.count = len(windows)
    items = []
    for w in windows[: LIMITS[c.tool]]:
        ref = f"risk:{w.zone_id}:{w.start:%Y-%m-%dT%H:%M}"
        data = {
            "ref": ref,
            "zone": zone_name(w.zone_id),
            "window": fmt_span(w.start, w.end),
            "score": w.score,
            "peak_grade": w.peak_grade.value,
            "contractors": w.contractors,
            "rule_ids": w.rule_ids,
            "notice": w.notice,
        }
        ev = ChatEvidence(
            ref=ref,
            kind=ChatEvidenceKind.RISK,
            target_id=w.zone_id,
            label=f"{zone_name(w.zone_id)} {fmt_span(w.start, w.end)} · 위험 점수 {w.score:g} ({w.peak_grade.value})",
            rule_id=", ".join(w.rule_ids) or None,
            legal_basis="; ".join(w.legal_basis) or None,
            source=w.sources[0] if w.sources else None,
        )
        items.append(Item(ref, data, ev))
    if contractor and not items:
        c.note = "협력사의 위험 시간대는 원청이 공유한 겹침으로만 계산합니다"
    return ToolResult(c, items)


def shared_notices(c: ChatToolCall, contractor: str | None) -> ToolResult:
    shared = [s for s in list_shared(contractor) if _overlaps(s.window_start, s.window_end, c)]
    if c.task_ids:
        shared = [s for s in shared if set(c.task_ids) & ({*s.my_task_ids} | {t.id for t in s.adjacent_tasks})]
    if c.zone_ids:
        shared = [s for s in shared if any(t.zone_id in c.zone_ids for t in s.adjacent_tasks)]
    c.count = len(shared)
    items = []
    for s in shared[: LIMITS[c.tool]]:
        ref = f"share:{s.conflict_id}"
        data = {
            "ref": ref,
            "conflict_id": s.conflict_id,
            "grade": s.grade.value,
            "type": TYPE_KO.get(s.type, s.type.value),
            "rule_id": s.rule_id,
            "legal_basis": s.legal_basis,
            "window": fmt_span(s.window_start, s.window_end),
            "reason": s.reason,
            "handover": s.handover or "",
            "my_task_ids": s.my_task_ids,
            "adjacent_tasks": [
                {"id": t.id, "contractor": t.contractor, "name": t.name, "zone": zone_name(t.zone_id)} for t in s.adjacent_tasks
            ],
            "shared_by": s.shared_by,
            "shared_at": fmt_dt(s.shared_at),
        }
        ev = ChatEvidence(
            ref=ref,
            kind=ChatEvidenceKind.SHARE,
            target_id=s.conflict_id,
            label=f"[{s.grade.value}] 공유 {fmt_dt(s.shared_at)} · {s.shared_by}",
            rule_id=s.rule_id,
            legal_basis=s.legal_basis,
        )
        items.append(Item(ref, data, ev))
    if not items:
        c.note = "원청이 공유한 충돌이 없습니다" if not contractor else "원청에게서 받은 공유가 없습니다"
    return ToolResult(c, items)


_RUN = {
    ChatTool.FIND_TASKS: find_tasks,
    ChatTool.FIND_CONFLICTS: find_conflicts,
    ChatTool.RISK_WINDOWS: risk_windows,
    ChatTool.SHARED_NOTICES: shared_notices,
}


def run_tool(call: ChatToolCall, contractor: str | None) -> ToolResult:
    return _RUN[call.tool](call, contractor)


def known_contractors() -> list[str]:
    return sorted({t.contractor for t in current_schedule()})
