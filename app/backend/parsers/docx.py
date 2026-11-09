"""Word(.docx) → ParsedDocument. 문단과 표를 문서 순서대로 읽는다 (python-docx).

협력사가 Word로 내는 계획서용. 위치 표식: 문단 `p12`, 표 행 `t1:r3`, 셀 `t1:r3:c2`.
HWPX 파서와 같은 방식으로 표의 첫 행을 머리글로 두고, 머리글을 알아보는지는 table_mapper 가 판단한다.
"""

from __future__ import annotations

from io import BytesIO

from docx import Document
from docx.table import Table as DocxTable
from docx.text.paragraph import Paragraph

from .document import ParsedDocument, Segment, Table, TableRow


def _clean(text: str) -> str:
    return " ".join(text.split())


def _cell_text(cell) -> str:
    return _clean(" ".join(p.text for p in cell.paragraphs))


def parse_docx(data: bytes, filename: str = "plan.docx") -> ParsedDocument:
    doc = ParsedDocument(filename=filename, file_type="docx")
    word = Document(BytesIO(data))
    para_no = 0
    table_no = 0
    body = word.element.body
    for child in body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            text = _clean(Paragraph(child, word).text)
            if text:
                para_no += 1
                doc.segments.append(Segment(f"p{para_no}", text))
        elif tag == "tbl":
            table_no += 1
            t_id = f"t{table_no}"
            rows: list[list[str]] = []
            for row in DocxTable(child, word).rows:
                cells: list[str] = []
                prev = None
                for cell in row.cells:  # 병합 셀은 같은 셀이 반복된다 → 한 번만
                    if cell._tc is prev:
                        continue
                    prev = cell._tc
                    cells.append(_cell_text(cell))
                if any(cells):
                    rows.append(cells)
            if not rows:
                continue
            table = Table(id=t_id, header=rows[0], header_loc=f"{t_id}:r1")
            doc.tables.append(table)
            for r_no, cells in enumerate(rows, start=1):
                loc = f"{t_id}:r{r_no}"
                if r_no > 1:
                    table.rows.append(TableRow(loc, cells, list(cells), [f"{loc}:c{i + 1}" for i in range(len(cells))]))
                doc.segments.append(Segment(loc, " | ".join(c for c in cells if c), "row", t_id))
    return doc


def docx_to_text(data: bytes) -> str:
    return parse_docx(data).text()
