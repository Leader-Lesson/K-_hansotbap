"""F5 협력사 공유: 원청이 확인한 충돌을 협력사로 내려보내고, 협력사는 자기 관련 내용만 받는다."""

from fastapi import APIRouter, HTTPException, Query

from api.permissions import require_person, require_prime
from db.shares import UnknownConflicts, list_shared, share_conflicts
from schemas import ConflictRecord, SharedItem, ShareRequest

router = APIRouter(tags=["shares"])


@router.post("/shares", response_model=list[ConflictRecord])
def share(
    req: ShareRequest,
    contractor: str | None = Query(default=None, description="협력사로 부르면 공유 권한이 없다 (원청은 비워 둔다)"),
) -> list[ConflictRecord]:
    """원청이 확인한 충돌을 협력사에 공유한다. 이미 공유한 충돌은 처음 기록을 유지한다."""
    require_prime(contractor, "공유는 원청만 할 수 있습니다")
    require_person(req.shared_by)
    try:
        return share_conflicts(req.conflict_ids, req.shared_by)
    except UnknownConflicts as e:
        raise HTTPException(status_code=404, detail=f"충돌을 찾을 수 없습니다: {', '.join(e.conflict_ids)}") from None


@router.get("/shares", response_model=list[SharedItem])
def shared(
    contractor: str | None = Query(default=None, description="협력사로 보면 자기 작업이 걸린 공유만 (서버에서 거른다)"),
) -> list[SharedItem]:
    """공유된 충돌을 인접 작업·위험 요소·인계 조건으로 추려 돌려준다 (최근 공유순)."""
    return list_shared(contractor)
