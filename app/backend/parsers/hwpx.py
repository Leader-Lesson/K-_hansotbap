"""HWPX(한글 2014+ XML 형식) → ParsedDocument. 구형 바이너리 HWP는 다루지 않는다.

HWPX 표는 문단 안에 들어 있다(hp:p > hp:run > hp:tbl > hp:tr > hp:tc > hp:subList > hp:p).
문단 텍스트를 모을 때 표 안의 글자는 빼고, 표는 행 단위로 따로 읽어 같은 글이 두 번 나오지 않게 한다.
"""

import re
import zipfile
from io import BytesIO
from xml.etree import ElementTree as ET

from .document import ParsedDocument, Segment, Table, TableRow

_SECTION = re.compile(r"Contents/section(\d+)\.xml$")


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _text_outside_tables(el: ET.Element) -> str:
    parts: list[str] = []

    def walk(node: ET.Element, in_t: bool) -> None:
        for child in node:
            tag = _local(child.tag)
            if tag == "tbl":
                continue
            if tag == "t":
                parts.append(child.text or "")
                walk(child, True)
            else:
                if in_t:
                    parts.append(" ")  # <hp:tab/> 같은 글자 안 표식
                walk(child, in_t)
            if in_t and child.tail:  # <hp:t> 안쪽 표식 뒤에 이어지는 글자
                parts.append(child.tail)

    walk(el, False)
    return " ".join("".join(parts).split())


def _cell_text(tc: ET.Element) -> str:
    paras = [_text_outside_tables(p) for p in tc.iter() if _local(p.tag) == "p"]
    return " ".join(p for p in paras if p)


class _SectionReader:
    def __init__(self, doc: ParsedDocument, s_idx: int) -> None:
        self.doc, self.s_idx = doc, s_idx
        self.para_no = 0
        self.table_no = 0

    def walk(self, node: ET.Element) -> None:
        for child in node:
            tag = _local(child.tag)
            if tag == "tbl":
                self.table(child)
            elif tag == "p":
                text = _text_outside_tables(child)
                if text:
                    self.para_no += 1
                    self.doc.segments.append(Segment(f"s{self.s_idx}:p{self.para_no}", text))
                self.walk_tables_only(child)
            else:
                self.walk(child)

    def walk_tables_only(self, node: ET.Element) -> None:
        for child in node:
            if _local(child.tag) == "tbl":
                self.table(child)
            elif _local(child.tag) != "p":
                self.walk_tables_only(child)

    def table(self, tbl: ET.Element) -> None:
        self.table_no += 1
        t_id = f"s{self.s_idx}:t{self.table_no}"
        rows = [
            [_cell_text(tc) for tc in tr if _local(tc.tag) == "tc"]
            for tr in tbl
            if _local(tr.tag) == "tr"
        ]
        rows = [r for r in rows if any(r)]
        if not rows:
            return
        table = Table(id=t_id, header=rows[0], header_loc=f"{t_id}:r1")
        self.doc.tables.append(table)
        for r_no, cells in enumerate(rows, start=1):
            loc = f"{t_id}:r{r_no}"
            if r_no > 1:
                table.rows.append(TableRow(loc, cells, list(cells), [f"{loc}:c{i + 1}" for i in range(len(cells))]))
            self.doc.segments.append(Segment(loc, " | ".join(c for c in cells if c), "row", t_id))


def parse_hwpx(data: bytes, filename: str = "plan.hwpx") -> ParsedDocument:
    doc = ParsedDocument(filename=filename, file_type="hwpx")
    with zipfile.ZipFile(BytesIO(data)) as zf:
        sections = sorted(
            (n for n in zf.namelist() if _SECTION.search(n)),
            key=lambda n: int(_SECTION.search(n).group(1)),  # type: ignore[union-attr]
        )
        for s_idx, name in enumerate(sections):
            _SectionReader(doc, s_idx).walk(ET.fromstring(zf.read(name)))
    return doc


def hwpx_to_text(data: bytes) -> str:
    return parse_hwpx(data).text()
