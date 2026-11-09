"""F7 TBM 전달 확인 규칙: 전달 항목 만들기와 LLM 답 검사 (LLM 없음, pytest 대상).

말했는지는 LLM이 읽지만, 근거 문장이 전사문에 실제로 없으면 믿지 않고 빠진 것으로 본다 (더 경고하는 방향).
"""

from __future__ import annotations

import re
from datetime import date

from schemas import RiskWindow, SharedItem, TbmItem, TbmItemJudgement, TbmItemKind as Kind, TbmItemResult, TbmNotice

_MIN_QUOTE_LENGTH = 4  # 공백·문장부호를 뺀 글자 수. "네", "오늘" 같은 말을 근거로 치지 않는다 [팀 설정값]
_NOISE = re.compile(r"[\W_]+")


def _is_due(item: SharedItem, on: date) -> bool:
    """원래 시작일부터 새 시작일까지는 바뀐 일정을 작업자에게 전달해야 한다."""
    a = item.adjustment
    if a is None:
        return False
    days = (a.original_start.date(), a.new_start.date())
    return min(days) <= on <= max(days)


def _adjustment_item(item: SharedItem, task_names: dict[str, str]) -> TbmItem:
    a = item.adjustment
    name = task_names.get(a.task_id, a.task_id)
    return TbmItem(
        id=f"ADJ:{a.id}",
        kind=Kind.ADJUSTMENT,
        text=f"{name}({a.task_id}) 일정 변경: {a.original_start:%Y-%m-%d} 시작에서 {a.new_start:%Y-%m-%d} 시작으로 옮김. {a.reason}",
        rule_ids=[item.rule_id],
        legal_basis=[item.legal_basis],
        conflict_ids=[item.conflict_id],
    )


def build_items(
    shared: list[SharedItem],
    windows: list[RiskWindow],
    notices: list[TbmNotice],
    task_names: dict[str, str],
    on: date,
) -> list[TbmItem]:
    """그날 전달할 항목. 조정이 없는 공유 충돌은 위험 시간대에 모두 들어가므로 따로 넣지 않는다."""
    items = [_adjustment_item(s, task_names) for s in shared if _is_due(s, on)]
    items += [
        TbmItem(
            id=f"RW:{w.zone_id}:{w.start:%Y%m%dT%H%M}",
            kind=Kind.RISK_WINDOW,
            text=w.notice,
            rule_ids=w.rule_ids,
            legal_basis=w.legal_basis,
            conflict_ids=w.conflict_ids,
        )
        for w in windows
    ]
    items += [TbmItem(id=f"N{n.id}", kind=Kind.NOTICE, text=n.text) for n in notices]
    return items


def _squash(text: str) -> str:
    """받아쓰기의 띄어쓰기·문장부호 차이를 무시하려고 글자만 남긴다."""
    return _NOISE.sub("", text).casefold()


def _found(quote: str | None, transcript: str) -> bool:
    if not quote:
        return False
    squashed = _squash(quote)
    return len(squashed) >= _MIN_QUOTE_LENGTH and squashed in _squash(transcript)


def verify(items: list[TbmItem], judgements: list[TbmItemJudgement], transcript: str) -> list[TbmItemResult]:
    """항목마다 결과를 낸다. LLM이 답하지 않았거나 인용이 전사문에 없으면 전달을 인정하지 않는다."""
    by_item = {j.item_id: j for j in judgements}
    results = []
    for item in items:
        j = by_item.get(item.id)
        if j is None:
            results.append(TbmItemResult(item=item, mentioned=False, note="LLM이 이 항목에 답하지 않아 빠진 것으로 처리"))
        elif not j.mentioned:
            results.append(TbmItemResult(item=item, mentioned=False))
        elif _found(j.quote, transcript):
            results.append(TbmItemResult(item=item, mentioned=True, quote=j.quote))
        else:
            results.append(TbmItemResult(item=item, mentioned=False, note="근거 문장이 전사문에 없어 빠진 것으로 처리"))
    return results
