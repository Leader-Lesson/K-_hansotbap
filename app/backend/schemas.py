"""데이터 계약 (백엔드·프론트 공통).

프론트의 app/frontend/src/types.ts 와 같은 모양을 유지한다. 필드를 바꾸면 두 파일을 같이 고친다.
"""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class Hazard(str, Enum):
    """작업 유형 (F1 추출 대상)."""

    HOT_WORK = "hot_work"  # 화기
    CONFINED = "confined"  # 밀폐공간
    HEIGHT = "height"  # 고소
    HEAVY_LIFT = "heavy_lift"  # 중량물
    GAS = "gas"  # 가스계통


class Shift(str, Enum):
    DAY = "day"
    NIGHT = "night"


class ConflictType(str, Enum):
    """충돌 4유형 + 표준서 누락(F8 → F2 결함)."""

    SAME_TIME_ZONE = "same_time_zone"  # 같은 시간·구역
    VERTICAL = "vertical"  # 위아래
    HOT_GAS = "hot_gas"  # 화기×가스
    SEQUENCE = "sequence"  # 순서 위반
    SOP_MISSING = "sop_missing"  # 표준서 필수 단계 누락


class Grade(str, Enum):
    PROHIBITED = "금지"
    CONDITIONAL = "조건부"
    DEFECT = "결함"


class Role(str, Enum):
    PRIME = "prime"  # 원청
    CONTRACTOR = "contractor"  # 협력사


class Zone(BaseModel):
    id: str
    name: str
    vertical_order: int = Field(description="클수록 위. -1 = 전 구역(ALL)")
    description: str = ""


class SourceRef(BaseModel):
    """판정 근거가 된 원문 위치."""

    file: str
    locator: str | None = Field(default=None, description="페이지·시트!셀·문단 번호 등")
    text: str = ""


class Task(BaseModel):
    id: str
    contractor: str
    name: str
    trade: str | None = None
    zone_id: str
    start: datetime
    end: datetime
    shift: Shift | None = None
    hazards: list[Hazard] = []
    risk_codes: list[str] = Field(default=[], description="시행령 제53조의2 1~8호, 기타는 X")
    predecessors: list[str] = []
    source: SourceRef | None = None


class Rule(BaseModel):
    id: str
    task_a: str
    task_b: str
    spatial: str
    temporal: str
    grade: str
    risk_code: str
    basis: str
    adjustment: str


class Conflict(BaseModel):
    id: str
    type: ConflictType
    grade: Grade
    task_ids: list[str]
    rule_id: str
    legal_basis: str
    window_start: datetime
    window_end: datetime
    reason: str
    suggestion: str | None = None
    sources: list[SourceRef] = []


class OverlapCandidate(BaseModel):
    """규칙 판정 전 단계: 시간이 겹치고 공간이 관련된 작업 쌍."""

    task_a: str
    task_b: str
    relation: str  # same_zone | vertical | all_zone
    window_start: datetime
    window_end: datetime


class RiskWindow(BaseModel):
    """F9 위험 시간대."""

    zone_id: str
    start: datetime
    end: datetime
    score: float
    contractors: list[str]
    conflict_ids: list[str]
    weights_note: str = "가중치는 팀 설정값"


class SopMatch(BaseModel):
    """F8 작업표준서 매칭."""

    task_id: str
    sop_id: str
    title: str
    score: float
    reason: str
    missing_steps: list[str] = []
