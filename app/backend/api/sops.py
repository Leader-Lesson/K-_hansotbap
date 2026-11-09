"""F8 원청 작업표준서 조회 (합성). 매칭·필수 단계 확인 결과는 POST /api/plans 응답과 제출 판정(결함)에 들어간다."""

from fastapi import APIRouter, HTTPException

from schemas import SopInfo
from search.sop_catalog import get_sop, load_sops

router = APIRouter(tags=["sops"])


@router.get("/sops", response_model=list[SopInfo])
def sops() -> list[SopInfo]:
    """표준서 목록: 적용 작업 유형·적용 작업 예·필수 단계·핵심 단계(빠지면 결함)."""
    return [s.info() for s in load_sops()]


@router.get("/sops/{sop_id}", response_model=SopInfo)
def sop(sop_id: str) -> SopInfo:
    s = get_sop(sop_id)
    if s is None:
        raise HTTPException(404, f"표준서 {sop_id} 가 없습니다")
    return s.info(with_text=True)
