"""기준 데이터 조회: 구역, 충돌 규칙, 광양 2고로 작업 분해표(합성), 겹침 후보, 현재 판정 결과."""

from datetime import datetime

from fastapi import APIRouter, Query

from db.plans import current_schedule, judge
from rules.data_loader import load_rules, load_zones
from rules.overlap import find_overlap_candidates
from schemas import Conflict, Grade, OverlapCandidate, Rule, Task, Zone

router = APIRouter(tags=["baseline"])


@router.get("/zones", response_model=list[Zone])
def zones() -> list[Zone]:
    return load_zones()


@router.get("/rules", response_model=list[Rule])
def rules() -> list[Rule]:
    return load_rules()


@router.get("/tasks", response_model=list[Task])
def tasks() -> list[Task]:
    """현재 일정: 합성 기준 일정(작업 37개) 위에 제출된 계획서의 작업을 덮어쓴 것."""
    return current_schedule()


@router.get("/overlaps", response_model=list[OverlapCandidate])
def overlaps() -> list[OverlapCandidate]:
    """규칙 판정 전 후보. F2 규칙 엔진이 이 후보에 규칙 R01~R30을 적용해 Conflict를 만든다."""
    return find_overlap_candidates(current_schedule(), load_zones())


@router.get("/conflicts", response_model=list[Conflict])
def conflicts(
    at: datetime | None = Query(default=None, description="이 시각에 걸쳐 있는 충돌만 (시간표형 간트의 '지금')"),
    grade: Grade | None = Query(default=None, description="금지 | 조건부 | 결함"),
    task_id: str | None = Query(default=None, description="이 작업이 들어간 충돌만"),
) -> list[Conflict]:
    """현재 일정 전체의 F2 판정. 제출 때마다 다시 계산되는 값과 같다 (시스템은 승인·중지하지 않는다)."""
    out = judge(current_schedule())
    if at is not None:
        out = [c for c in out if c.window_start <= at < c.window_end]
    if grade is not None:
        out = [c for c in out if c.grade == grade]
    if task_id is not None:
        out = [c for c in out if task_id in c.task_ids]
    return out
