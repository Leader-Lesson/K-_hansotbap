"""파서 공통 결과 모델.

계획서를 LLM에 넘기기 전에 코드로 먼저 읽는다. 줄·표 행마다 위치 표식(locator)을 붙여 두면
- LLM은 근거를 문장으로 베끼지 않고 위치 표식만 고르면 되고
- 원문 근거(SourceRef)는 항상 파서가 읽은 원문에서 꺼내므로 LLM이 지어낸 근거가 끼어들 수 없다.

위치 표식 형식
- 엑셀: `시트!B5` (행의 첫 값 셀), 셀 단위는 TableRow.cell_locs
- PDF: `p2:L5` (2쪽 5번째 줄), 표 행은 `p2:T1:R3`
- HWPX: `s0:p12` (구역 0의 12번째 문단), 표 행은 `s0:t1:r3`
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time
from typing import Any, Literal

SegmentKind = Literal["line", "row"]


def cell_text(value: Any) -> str:
    """셀 값을 화면·프롬프트용 문자열로. 엑셀 날짜·시간은 ISO 형식으로 바꾼다."""
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat() if value.time() == time(0, 0) else value.isoformat(timespec="minutes")
    if isinstance(value, time):
        return value.strftime("%H:%M")
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return " ".join(str(value).split())


@dataclass
class Segment:
    loc: str
    text: str
    kind: SegmentKind = "line"
    table_id: str | None = None


@dataclass
class TableRow:
    loc: str
    cells: list[str]
    values: list[Any]  # 엑셀은 datetime·time 같은 원래 타입을 유지한다 (날짜 정규화에 쓴다)
    cell_locs: list[str]


@dataclass
class Table:
    id: str
    header: list[str]
    header_loc: str
    rows: list[TableRow] = field(default_factory=list)


@dataclass
class ParsedDocument:
    filename: str
    file_type: Literal["pdf", "xlsx", "hwpx"]
    segments: list[Segment] = field(default_factory=list)
    tables: list[Table] = field(default_factory=list)

    def text(self) -> str:
        """LLM에 넘길 본문. 줄마다 `[위치표식] 내용`."""
        return "\n".join(f"[{s.loc}] {s.text}" for s in self.segments)

    def lookup(self) -> dict[str, str]:
        return {s.loc: s.text for s in self.segments}
