"""F8 원청 작업표준서 조회 (합성). 매칭·필수 단계 확인 결과는 POST /api/plans 응답과 제출 판정(결함)에 들어간다."""

from fastapi import APIRouter, HTTPException, Query

from db.plans import current_schedule, sop_matches_for_schedule
from schemas import SopInfo, SopMatch
from search.sop_catalog import get_sop, load_sops

router = APIRouter(tags=["sops"])


@router.get("/sops", response_model=list[SopInfo])
def sops() -> list[SopInfo]:
    """표준서 목록: 적용 작업 유형·적용 작업 예·필수 단계·핵심 단계(빠지면 결함)."""
    return [s.info() for s in load_sops()]


@router.get("/sop-matches", response_model=list[SopMatch])
def sop_matches(
    contractor: str | None = Query(default=None, description="협력사로 보면 자기 작업의 매칭만 (서버에서 거른다)"),
) -> list[SopMatch]:
    """현재 일정(협력사별 최근 제출 계획서)의 작업별 표준서 매칭·필수 단계 확인.

    원청 화면의 '표준서 매칭' 목록과 협력사 화면의 '매칭된 표준서'에 쓴다. 제출 응답에만 두면 새로고침할 때
    사라지므로 보관된 계획서 원문으로 매번 다시 계산한다(규칙이라 LLM을 부르지 않는다).
    """
    matches = sop_matches_for_schedule()
    if contractor:
        mine = {t.id for t in current_schedule() if t.contractor == contractor}
        matches = [m for m in matches if m.task_id in mine]
    return sorted(matches, key=lambda m: (m.task_id, not m.primary, -m.score))


@router.get("/sops/{sop_id}", response_model=SopInfo)
def sop(sop_id: str) -> SopInfo:
    s = get_sop(sop_id)
    if s is None:
        raise HTTPException(404, f"표준서 {sop_id} 가 없습니다")
    return s.info(with_text=True)
