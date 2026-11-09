"""표 머리글 → 계획서 항목 매핑 (규칙). LLM 없이 표를 바로 구조화할 수 있는지 판단한다.

협력사 양식은 제각각이지만 엑셀·표 머리글에 쓰는 말은 한정돼 있다. 아는 말이면 규칙으로 바로 읽고,
모르는 양식이면 LLM 추출로 넘어간다 (llm/extract.py).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from .document import Table, TableRow

# 항목별 머리글 동의어 [팀 설정값: 합성 계획서·일반 작업계획서 양식 기준, 필요하면 추가]
HEADER_SYNONYMS: dict[str, list[str]] = {
    "contractor": ["업체", "업체명", "협력사", "협력업체", "회사", "회사명", "시공사", "소속", "작업업체"],
    "name": ["작업명", "작업내용", "작업", "세부작업", "작업항목", "공정명", "작업공정", "내용"],
    "trade": ["공종", "공종명", "직종"],
    "location": ["위치", "구역", "장소", "작업장소", "작업위치", "작업구역", "설비"],
    "floor": ["층", "층수", "레벨"],
    "start_date": ["시작일", "착수일", "개시일", "시작일자", "작업시작일"],
    "end_date": ["종료일", "완료일", "종료일자", "작업종료일"],
    "period": ["기간", "작업기간", "일정", "작업일", "일자", "날짜", "작업일자"],
    "time": ["시간", "작업시간", "시간대", "작업시간대"],
    "start_time": ["시작시간", "시작시각"],
    "end_time": ["종료시간", "종료시각"],
    "shift": ["주야", "주/야", "주야간", "주간/야간", "근무", "근무형태"],
    "hazards": ["위험작업", "작업유형", "작업구분", "허가", "작업허가", "필요허가", "위험요인", "위험"],
    "precondition": ["선행", "선행조건", "선행작업", "전제조건", "착수조건"],
    "headcount": ["인원", "투입인원", "작업인원"],
    "note": ["비고", "특이사항", "참고"],
}

# 병합 셀은 맨 위 칸에만 값이 있다 → 아래 행에 이어 채울 항목
FORWARD_FILL = ("contractor", "location", "floor", "period", "start_date", "end_date", "shift", "time", "trade")

_PUNCT = re.compile(r"[\s()\[\]·.:_\-]")


def _norm(header: str) -> str:
    return _PUNCT.sub("", header).lower()


def header_field(header: str) -> str | None:
    """머리글 하나를 항목 이름으로. 정확히 같은 말 → 가장 긴 동의어를 포함하는 말 순서로 본다."""
    h = _norm(header)
    if not h:
        return None
    for field, words in HEADER_SYNONYMS.items():
        if h in (_norm(w) for w in words):
            return field
    best: tuple[int, str] | None = None
    for field, words in HEADER_SYNONYMS.items():
        for w in words:
            nw = _norm(w)
            if len(nw) >= 2 and nw in h and (best is None or len(nw) > best[0]):
                best = (len(nw), field)
    return best[1] if best else None


def map_columns(header: list[str]) -> dict[str, int]:
    """항목 → 열 번호. 같은 항목이 두 번 나오면 앞 열을 쓴다."""
    out: dict[str, int] = {}
    for i, h in enumerate(header):
        f = header_field(h)
        if f and f not in out:
            out[f] = i
    return out


def looks_like_header(cells: list[str]) -> bool:
    # 머리글 칸은 짧다. "질소 라인 연결 작업" 같은 데이터 칸이 '작업'을 포함해도 머리글로 보지 않게 길이를 본다
    short = [c for c in cells if len(_norm(c)) <= 8]
    fields = set(map_columns(short))
    return "name" in fields and len(fields) >= 3


def is_structured(table: Table) -> bool:
    """규칙만으로 읽을 수 있는 표인가: 작업명과 날짜가 있어야 한다."""
    cols = map_columns(table.header)
    return "name" in cols and bool({"period", "start_date"} & set(cols))


@dataclass
class RawCell:
    text: str
    value: Any
    loc: str


@dataclass
class RawRow:
    row: TableRow
    fields: dict[str, RawCell]


def table_rows(table: Table) -> list[RawRow]:
    """표의 데이터 행을 항목별 원문 값으로. 작업명이 없는 행(합계·비고 줄)은 건너뛴다."""
    cols = map_columns(table.header)
    out: list[RawRow] = []
    last: dict[str, RawCell] = {}
    for row in table.rows:
        fields: dict[str, RawCell] = {}
        for field, idx in cols.items():
            if idx < len(row.cells) and row.cells[idx]:
                fields[field] = RawCell(row.cells[idx], row.values[idx], row.cell_locs[idx])
        if "name" not in fields:
            continue
        for field in FORWARD_FILL:
            if field in fields:
                last[field] = fields[field]
            elif field in last:
                fields[field] = last[field]
        out.append(RawRow(row, fields))
    return out
