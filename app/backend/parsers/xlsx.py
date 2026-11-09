from io import BytesIO

from openpyxl import load_workbook


def xlsx_to_text(data: bytes) -> str:
    wb = load_workbook(BytesIO(data), read_only=True, data_only=True)
    lines: list[str] = []
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            cells = [c for c in row if c.value is not None and str(c.value).strip()]
            if not cells:
                continue
            first = cells[0].coordinate
            values = " | ".join(str(c.value).strip() for c in cells)
            lines.append(f"[{ws.title}!{first}] {values}")
    wb.close()
    return "\n".join(lines)
