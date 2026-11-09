"""계획서 파일 → 텍스트. 원문 근거 표시를 위해 위치 표식(페이지·시트!셀·문단)을 줄 앞에 붙인다."""

from .hwpx import hwpx_to_text
from .pdf import pdf_to_text
from .xlsx import xlsx_to_text


def extract_text(filename: str, data: bytes) -> str:
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return pdf_to_text(data)
    if lower.endswith(".xlsx"):
        return xlsx_to_text(data)
    if lower.endswith(".hwpx"):
        return hwpx_to_text(data)
    raise ValueError(f"지원하지 않는 형식: {filename}")


__all__ = ["extract_text", "pdf_to_text", "xlsx_to_text", "hwpx_to_text"]
