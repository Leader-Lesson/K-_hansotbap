import pymupdf


def pdf_to_text(data: bytes) -> str:
    lines: list[str] = []
    with pymupdf.open(stream=data, filetype="pdf") as doc:
        for i, page in enumerate(doc, start=1):
            for line in page.get_text().splitlines():
                if line.strip():
                    lines.append(f"[p{i}] {line}")
    return "\n".join(lines)
