"""F5 이행 기록 조회와 엑셀 내보내기 (제64조)."""

from datetime import datetime
from io import BytesIO

from fastapi import APIRouter, Query, Response
from openpyxl import Workbook

from db.history import list_history
from schemas import HistoryEvent, HistoryEventKind as Kind

router = APIRouter(tags=["history"])

_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_CONTRACTOR_Q = Query(default=None, description="협력사로 보면 자기 제출과 공유된 자기 충돌의 기록만 (서버에서 거른다)")
_HEADERS = ["시각", "구분", "대상", "관련 업체", "책임자", "내용", "규칙", "근거 조문"]
_LABELS = {
    Kind.PLAN_SUBMITTED: "계획서 제출",
    Kind.CONFLICT_JUDGED: "충돌 판정",
    Kind.CONFLICT_SHARED: "협력사 공유",
    Kind.ADJUSTMENT_REPLACED: "조정 대체",
    Kind.ADJUSTMENT_APPLIED: "조정 적용",
    Kind.CONFLICT_RESOLVED: "충돌 해소",
    Kind.ADJUSTMENT_REVERTED: "조정 되돌림",
    Kind.ADJUSTMENT_STALE: "조정 무효",
    Kind.TBM_CHECKED: "TBM 전달 확인",
}


def _workbook(events: list[HistoryEvent], contractor: str | None) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "이행 기록"
    ws.append(["합성 데이터 — 산업안전보건법 제64조 이행 기록"])
    ws.append([f"범위: {contractor or '원청 전체'}", f"내보낸 시각: {datetime.now():%Y-%m-%d %H:%M}"])
    ws.append([])
    ws.append(_HEADERS)
    for e in events:
        ws.append(
            [
                f"{e.at:%Y-%m-%d %H:%M:%S}",
                _LABELS[e.kind],
                e.target_id,
                ", ".join(e.contractors),
                e.actor or "시스템",
                e.detail,
                e.rule_id or "",
                e.legal_basis or "",
            ]
        )
    # 제출한 파일 이름·문구가 '=' 로 시작해도 엑셀에서 수식으로 실행되지 않도록 전부 문자열로 고정한다
    for row in ws.iter_rows():
        for cell in row:
            if isinstance(cell.value, str):
                cell.data_type = "s"
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


@router.get("/history", response_model=list[HistoryEvent])
def history(contractor: str | None = _CONTRACTOR_Q) -> list[HistoryEvent]:
    """제출·판정·공유·조정 기록 (시각순)."""
    return list_history(contractor)


@router.get("/history/export")
def history_export(contractor: str | None = _CONTRACTOR_Q) -> Response:
    """이행 기록 엑셀. 조회와 같은 권한 범위로 내보낸다."""
    return Response(
        content=_workbook(list_history(contractor), contractor),
        media_type=_XLSX,
        headers={"Content-Disposition": 'attachment; filename="hansotbap_history.xlsx"'},
    )
