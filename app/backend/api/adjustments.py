"""F4 조정안: 후보 조회 · 적용 · 되돌리기 · 기록 조회.

조정안은 규칙이 계산한다(db/adjust_flow.py). LLM은 이유 문장을 다듬는 선택 기능(polish)에만 쓴다.
권한: 로그인이 없고 `contractor` 쿼리로 협력사를 구분한다(없으면 원청). 적용·되돌리기·후보 조회는
원청 전용이라 `contractor` 가 있으면 서버에서 403 으로 막는다.
"""

from fastapi import APIRouter, HTTPException, Query

from api.permissions import require_person, require_prime
from db.adjust_flow import (
    AdjustmentNotActive,
    AdjustmentNotFound,
    CandidateNotFound,
    ConflictNotFound,
    apply_adjustment,
    candidates_for,
    revert_adjustment,
)
from db.adjustments import list_adjustments
from db.plans import current_schedule
from llm.adjust_text import polish_reason
from schemas import AdjustmentApply, AdjustmentCandidate, AdjustmentRecord, AdjustmentResult

router = APIRouter(tags=["adjustments"])

_CONTRACTOR_Q = Query(default=None, description="협력사로 부르면 조정 권한이 없다 (원청은 비워 둔다)")


def _require_prime(contractor: str | None) -> None:
    """조정안 조회·적용·되돌리기는 원청 전용."""
    require_prime(contractor, "조정안은 원청만 조회·적용·되돌릴 수 있습니다")


def _not_found_conflict(conflict_id: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"충돌 {conflict_id} 을(를) 찾을 수 없습니다")


@router.get("/conflicts/{conflict_id}/adjustments", response_model=list[AdjustmentCandidate])
def adjustment_candidates(
    conflict_id: str,
    contractor: str | None = _CONTRACTOR_Q,
    polish: bool = Query(default=False, description="true 면 이유 문장을 LLM으로 다듬는다 (실패하면 원문)"),
) -> list[AdjustmentCandidate]:
    """충돌 하나를 풀 조정안 후보. 후보 계산은 규칙이 하고, polish 는 이유 문장만 바꾼다."""
    _require_prime(contractor)
    try:
        candidates = candidates_for(conflict_id)
    except ConflictNotFound:
        raise _not_found_conflict(conflict_id) from None
    if polish:
        candidates = [c.model_copy(update={"reason": polish_reason(c.reason)}) for c in candidates]
    return candidates


@router.post("/adjustments", response_model=AdjustmentResult)
def adjustment_apply(req: AdjustmentApply, contractor: str | None = _CONTRACTOR_Q) -> AdjustmentResult:
    """고른 조정안을 적용하고 재판정한 결과(충돌 목록·전후 비교)를 돌려준다."""
    _require_prime(contractor)
    require_person(req.decided_by)
    try:
        return apply_adjustment(req)
    except ConflictNotFound:
        raise _not_found_conflict(req.conflict_id) from None
    except CandidateNotFound:
        raise HTTPException(
            status_code=409,
            detail="일정이 바뀌어 이 조정안은 더 이상 유효하지 않습니다. 후보를 다시 조회하세요",
        ) from None


@router.delete("/adjustments/{adjustment_id}", response_model=AdjustmentResult)
def adjustment_revert(
    adjustment_id: str,
    decided_by: str = Query(min_length=1, description="되돌린 책임자 (이행 기록)"),
    contractor: str | None = _CONTRACTOR_Q,
) -> AdjustmentResult:
    """적용한 조정을 되돌리고 재판정한 결과를 돌려준다."""
    _require_prime(contractor)
    require_person(decided_by)
    try:
        return revert_adjustment(adjustment_id, decided_by)
    except AdjustmentNotFound:
        raise HTTPException(status_code=404, detail=f"조정 {adjustment_id} 을(를) 찾을 수 없습니다") from None
    except AdjustmentNotActive:
        raise HTTPException(status_code=409, detail="이미 되돌렸거나 무효가 된 조정입니다") from None


@router.get("/adjustments", response_model=list[AdjustmentRecord])
def adjustments(
    contractor: str | None = Query(default=None, description="협력사로 보면 자기 업체 작업에 걸린 기록만 (서버에서 거른다)"),
    task_id: str | None = Query(default=None, description="이 작업의 기록만"),
) -> list[AdjustmentRecord]:
    """조정 기록 (F5 이행 기록). 협력사는 자기 업체 작업에 걸린 기록만 본다."""
    task_ids: set[str] | None = None
    if contractor:
        task_ids = {t.id for t in current_schedule() if t.contractor == contractor}
    if task_id:
        task_ids = {task_id} if task_ids is None else task_ids & {task_id}
    if task_ids is not None and not task_ids:
        return []  # 걸러낸 결과가 비면 전체로 오해하지 않도록 여기서 끊는다
    return list_adjustments(task_ids)
