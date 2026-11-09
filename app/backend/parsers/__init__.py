"""계획서 파일 → ParsedDocument(줄·표 행 + 위치 표식). 원문 근거 표시를 위해 위치 표식(페이지·시트!셀·문단)을 붙인다."""

from .document import ParsedDocument, Segment, Table, TableRow
from .docx import docx_to_text, parse_docx
from .hwpx import hwpx_to_text, parse_hwpx
from .pdf import parse_pdf, pdf_to_text
from .xlsx import parse_xlsx, xlsx_to_text

SUPPORTED = (".pdf", ".xlsx", ".hwpx", ".docx")


def parse_document(filename: str, data: bytes) -> ParsedDocument:
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return parse_pdf(data, filename)
    if lower.endswith(".xlsx"):
        return parse_xlsx(data, filename)
    if lower.endswith(".hwpx"):
        return parse_hwpx(data, filename)
    if lower.endswith(".docx"):
        return parse_docx(data, filename)
    raise ValueError(f"지원하지 않는 형식: {filename}")


def extract_text(filename: str, data: bytes) -> str:
    return parse_document(filename, data).text()


__all__ = [
    "SUPPORTED",
    "ParsedDocument",
    "Segment",
    "Table",
    "TableRow",
    "parse_document",
    "extract_text",
    "parse_pdf",
    "parse_xlsx",
    "parse_hwpx",
    "parse_docx",
    "pdf_to_text",
    "xlsx_to_text",
    "hwpx_to_text",
    "docx_to_text",
]
