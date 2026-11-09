"""기준 데이터 조회: 구역, 충돌 규칙, 광양 2고로 작업 분해표(합성), 겹침 후보."""

from fastapi import APIRouter

from rules.data_loader import load_rules, load_wbs_tasks, load_zones
from rules.overlap import find_overlap_candidates
from schemas import OverlapCandidate, Rule, Task, Zone

router = APIRouter(tags=["baseline"])


@router.get("/zones", response_model=list[Zone])
def zones() -> list[Zone]:
    return load_zones()


@router.get("/rules", response_model=list[Rule])
def rules() -> list[Rule]:
    return load_rules()


@router.get("/tasks", response_model=list[Task])
def tasks() -> list[Task]:
    """합성 기준 일정(작업 37개). 실제 시연에서는 업로드된 계획서에서 나온 작업으로 바뀐다."""
    return load_wbs_tasks()


@router.get("/overlaps", response_model=list[OverlapCandidate])
def overlaps() -> list[OverlapCandidate]:
    """규칙 판정 전 후보. F2 규칙 엔진이 이 후보에 규칙 R01~R30을 적용해 Conflict를 만든다."""
    return find_overlap_candidates(load_wbs_tasks(), load_zones())
