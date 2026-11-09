"""엑셀(.xlsx) → ParsedDocument. 행마다 `시트!첫셀` 위치 표식을 붙이고, 머리글로 보이는 행이 있으면 표로 묶는다."""

from io import BytesIO
from typing import Any

from openpyxl import load_workbook

from .document import ParsedDocument, Segment, Table, TableRow, cell_text
from .table_mapper import looks_like_header


def parse_xlsx(data: bytes, filename: str = "plan.xlsx") -> ParsedDocument:
    doc = ParsedDocument(filename=filename, file_type="xlsx")
    wb = load_workbook(BytesIO(data), read_only=True, data_only=True)
    try:
        for ws in wb.worksheets:
            table: Table | None = None
            columns: list[str] = []  # 표 머리글의 열 문자 (A, B, ...)
            for row in ws.iter_rows():
                cells = [c for c in row if c.value is not None and cell_text(c.value)]
                if not cells:
                    continue
                loc = f"{ws.title}!{cells[0].coordinate}"
                texts = [cell_text(c.value) for c in cells]
                if table is None and looks_like_header(texts):
                    table = Table(id=f"{ws.title}!T1", header=texts, header_loc=loc)
                    columns = [c.column_letter for c in cells]
                    doc.tables.append(table)
                    doc.segments.append(Segment(loc, " | ".join(texts), "row", table.id))
                    continue
                if table is not None:
                    by_col: dict[str, Any] = {c.column_letter: c.value for c in cells}
                    values = [by_col.get(col) for col in columns]
                    table.rows.append(
                        TableRow(
                            loc=loc,
                            cells=[cell_text(v) for v in values],
                            values=values,
                            cell_locs=[f"{ws.title}!{col}{cells[0].row}" for col in columns],
                        )
                    )
                    doc.segments.append(Segment(loc, " | ".join(texts), "row", table.id))
                else:
                    doc.segments.append(Segment(loc, " | ".join(texts)))
    finally:
        wb.close()
    return doc


def xlsx_to_text(data: bytes) -> str:
    return parse_xlsx(data).text()
