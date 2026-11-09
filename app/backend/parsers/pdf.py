"""PDF → ParsedDocument. PyMuPDF로 표(find_tables)를 먼저 찾고, 표 밖의 줄은 일반 줄로 둔다."""

import pymupdf

from .document import ParsedDocument, Segment, Table, TableRow, cell_text


def _inside(bbox: tuple[float, float, float, float], rects: list[pymupdf.Rect]) -> bool:
    cx, cy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
    return any(r.contains(pymupdf.Point(cx, cy)) for r in rects)


def parse_pdf(data: bytes, filename: str = "plan.pdf") -> ParsedDocument:
    doc = ParsedDocument(filename=filename, file_type="pdf")
    with pymupdf.open(stream=data, filetype="pdf") as pdf:
        for page_no, page in enumerate(pdf, start=1):
            found = page.find_tables().tables
            rects = [pymupdf.Rect(t.bbox) for t in found]
            # 표와 일반 줄을 위에서 아래 순서로 섞어 넣는다
            items: list[tuple[float, str, object]] = []
            for t_no, t in enumerate(found, start=1):
                items.append((t.bbox[1], "table", (t_no, t)))
            line_no = 0
            for block in page.get_text("dict")["blocks"]:
                for line in block.get("lines", []):
                    text = " ".join("".join(s["text"] for s in line["spans"]).split())
                    if not text or _inside(line["bbox"], rects):
                        continue
                    items.append((line["bbox"][1], "line", text))
            items.sort(key=lambda it: it[0])
            for _, kind, payload in items:
                if kind == "line":
                    line_no += 1
                    doc.segments.append(Segment(f"p{page_no}:L{line_no}", payload))  # type: ignore[arg-type]
                    continue
                t_no, t = payload  # type: ignore[misc]
                rows = [[cell_text(c) for c in r] for r in t.extract()]
                rows = [r for r in rows if any(r)]
                if not rows:
                    continue
                table = Table(id=f"p{page_no}:T{t_no}", header=rows[0], header_loc=f"p{page_no}:T{t_no}:R1")
                doc.tables.append(table)
                for r_no, cells in enumerate(rows, start=1):
                    loc = f"p{page_no}:T{t_no}:R{r_no}"
                    if r_no > 1:
                        table.rows.append(TableRow(loc, cells, list(cells), [f"{loc}:C{i + 1}" for i in range(len(cells))]))
                    doc.segments.append(Segment(loc, " | ".join(c for c in cells if c), "row", table.id))
    return doc


def pdf_to_text(data: bytes) -> str:
    return parse_pdf(data).text()
