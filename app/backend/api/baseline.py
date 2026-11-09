"""기준 데이터 조회: 구역, 충돌 규칙, 광양 2고로 작업 분해표(합성), 겹침 후보."""

from fastapi import APIRouter, Query

from db.plans import current_schedule, list_plans
from db.shares import visible_tasks
from rules.data_loader import load_rules, load_wbs_tasks, load_zones
from rules.overlap import find_overlap_candidates
from schemas import OverlapCandidate, Rule, Task, Zone

router = APIRouter(tags=["baseline"])

_CONTRACTOR_Q = Query(default=None, description="협력사로 보면 자기 작업과 공유된 충돌의 상대 작업만 (서버에서 거른다)")


@router.get("/zones", response_model=list[Zone])
def zones() -> list[Zone]:
    return load_zones()


@router.get("/rules", response_model=list[Rule])
def rules() -> list[Rule]:
    return load_rules()


@router.get("/contractors", response_model=list[str])
def contractors() -> list[str]:
    """'보는 사람'에서 고를 협력사(가상-…): 작업 분해표의 업체 + 계획서를 낸 업체.
    일정과 따로 준다 — 기준 일정을 끄고(USE_BASELINE=false) 아무도 안 냈어도 협력사를 골라 계획서를 올릴 수 있게."""
    names = {t.contractor for t in load_wbs_tasks()} | {p.contractor for p in list_plans()}
    return sorted(n for n in names if n.startswith("가상-"))


@router.get("/tasks", response_model=list[Task])
def tasks(contractor: str | None = _CONTRACTOR_Q) -> list[Task]:
    """현재 일정: 합성 기준 일정(작업 37개) 위에 제출된 계획서의 작업을 덮어쓴 것."""
    return visible_tasks(contractor) if contractor else current_schedule()


@router.get("/overlaps", response_model=list[OverlapCandidate])
def overlaps(contractor: str | None = _CONTRACTOR_Q) -> list[OverlapCandidate]:
    """규칙 판정 전 후보. F2 규칙 엔진이 이 후보에 규칙 R01~R30을 적용해 Conflict를 만든다."""
    found = find_overlap_candidates(current_schedule(), load_zones())
    if not contractor:
        return found
    visible = visible_tasks(contractor)
    ids = {t.id for t in visible}
    mine = {t.id for t in visible if t.contractor == contractor}
    return [o for o in found if {o.task_a, o.task_b} <= ids and {o.task_a, o.task_b} & mine]
