"""F2 판정 결과 조회. 판정은 계획서 제출 순간에 돌고(POST /api/plans/submit), 그 결과를 여기서 읽는다."""

from fastapi import APIRouter, Query

from db.plans import list_conflicts
from schemas import ConflictRecord

router = APIRouter(tags=["conflicts"])


@router.get("/conflicts", response_model=list[ConflictRecord])
def conflicts(
    contractor: str | None = Query(default=None, description="협력사로 보면 자기 작업이 걸린 충돌만 (서버에서 거른다)"),
    include_resolved: bool = Query(default=False, description="해소된 충돌까지 (F5 이행 기록)"),
) -> list[ConflictRecord]:
    """저장된 판정 결과. 화면을 새로고침해도 이 결과가 남아 있다."""
    return list_conflicts(contractor, include_resolved)
