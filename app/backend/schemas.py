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


class ConflictStatus(str, Enum):
    """판정된 충돌의 처리 상태. 시스템은 작업을 승인·중지하지 않는다 — 사람의 조정을 기록할 뿐이다."""

    OPEN = "open"  # 아직 조정되지 않음
    ADJUSTED = "adjusted"  # 원청이 조정안을 적용함 (F4)
    RESOLVED = "resolved"  # 재판정에서 사라짐 (해소)


class AdjustmentKind(str, Enum):
    """조정안 종류. 지금은 일정 이동 하나. '선행 조건 부여' 같은 순서 변경형은 이후에 더한다."""

    RESCHEDULE = "reschedule"  # 일정 이동 (기간 유지)


class AdjustmentStatus(str, Enum):
    """조정 기록의 상태. 판정에는 active 인 기록만 얹는다."""

    ACTIVE = "active"  # 적용 중
    REVERTED = "reverted"  # 원청이 되돌렸거나, 같은 작업의 새 조정으로 대체됨
    STALE = "stale"  # 협력사가 재제출해 조정의 기준이던 원본 일정이 달라짐


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


class ConflictRecord(BaseModel):
    """저장된 충돌 하나. 판정 결과는 제출 응답에만 두지 않고 DB에 남겨 새로고침·F4 재판정·F5 이력에 쓴다."""

    conflict: Conflict
    status: ConflictStatus
    plan_id: int | None = Field(default=None, description="이 충돌을 드러낸 제출")
    judged_at: datetime
    resolved_at: datetime | None = None


class AdjustmentCandidate(BaseModel):
    """F4 조정안 후보. 규칙이 계산하고(LLM 아님), 이유 문장은 규칙 문구로 만든다."""

    id: str
    kind: AdjustmentKind
    task_id: str = Field(description="옮길 작업")
    conflict_id: str = Field(description="이 조정안이 풀려는 충돌")
    original_start: datetime
    original_end: datetime
    new_start: datetime
    new_end: datetime
    reason: str
    resolves: bool = Field(description="적용하면 conflict_id의 충돌이 사라지는가")
    new_conflict_ids: list[str] = Field(default=[], description="적용하면 새로 생기는 충돌")
    affected_successors: list[str] = Field(
        default=[], description="옮긴 뒤 시작이 이 작업의 새 종료보다 이른 후행 작업"
    )
    recommended: bool = Field(default=False, description="후보 중 새 충돌·영향 받는 후행 작업이 가장 적은 안")


class Adjustment(BaseModel):
    """적용한 조정 기록. 협력사가 낸 원본 계획서는 그대로 두고 이 기록을 위에 얹어 판정한다 (되돌리면 기록을 뺀다)."""

    id: str
    kind: AdjustmentKind
    task_id: str
    conflict_id: str
    original_start: datetime
    original_end: datetime
    new_start: datetime
    new_end: datetime
    reason: str
    decided_by: str = Field(description="적용한 책임자 (제64조 이행 기록)")
    decided_at: datetime


class ConflictGradeChange(BaseModel):
    conflict_id: str
    before: Grade
    after: Grade


class ConflictDiff(BaseModel):
    """조정 전후 비교 (Conflict.id 기준)."""

    resolved: list[Conflict] = Field(default=[], description="사라진 충돌")
    introduced: list[Conflict] = Field(default=[], description="새로 생긴 충돌")
    grade_changed: list[ConflictGradeChange] = []


class AdjustmentRecord(BaseModel):
    """저장된 조정 기록 하나 (F4 적용·되돌리기, F5 이행 기록)."""

    adjustment: Adjustment
    status: AdjustmentStatus
    closed_at: datetime | None = Field(default=None, description="되돌렸거나 무효가 된 시각")


class AdjustmentApply(BaseModel):
    """POST /api/adjustments 본문: 원청 담당자가 고른 조정안."""

    conflict_id: str
    candidate_id: str
    decided_by: str = Field(min_length=1, description="적용한 책임자")


class AdjustmentResult(BaseModel):
    """조정 적용·되돌리기 결과: 재판정한 충돌과 전후 비교."""

    record: AdjustmentRecord
    conflicts: list[Conflict]
    diff: ConflictDiff
    recheck_ms: float = Field(description="재판정에 걸린 시간(밀리초)")
    refresh: bool = Field(default=True, description="판정 후 화면을 한 번 강제 새로고침한다")


class OverlapCandidate(BaseModel):
    """규칙 판정 전 단계: 시간이 겹치고 공간이 관련된 작업 쌍."""

    task_a: str
    task_b: str
    relation: str  # same_zone | vertical | all_zone
    window_start: datetime
    window_end: datetime


class RiskWindow(BaseModel):
    """F9 위험 시간대. 여러 날이 합쳐진 건은 start 날짜~end 날짜 동안 매일 start 시각~end 시각을 뜻한다."""

    zone_id: str
    start: datetime
    end: datetime
    score: float
    contractors: list[str]
    conflict_ids: list[str]
    weights_note: str = "가중치는 팀 설정값"
    trades: list[str] = Field(default=[], description="관련 공정")
    peak_grade: Grade = Field(description="이 시간대에서 가장 높은 등급")
    rule_ids: list[str] = []
    legal_basis: list[str] = []
    sources: list[SourceRef] = []
    notice: str = Field(description="공지 문장")


class SopMatch(BaseModel):
    """F8 작업표준서 매칭."""

    task_id: str
    sop_id: str
    title: str
    score: float
    reason: str
    missing_steps: list[str] = []


# ── F1 계획서 구조화 ──────────────────────────────────────────────────


class SourceLine(BaseModel):
    """파서가 읽은 원문 한 줄 (원문 근거 하이라이트용)."""

    locator: str
    text: str


class ExtractedTask(BaseModel):
    """계획서에서 뽑은 작업 1건 + 근거·확인 필요 표시. 사람이 확인·수정한 뒤 task 만 제출한다."""

    task: Task
    wbs_id: str | None = Field(default=None, description="원청 기준 일정(작업 분해표)에서 대응하는 작업 ID")
    raw: dict[str, str] = Field(default={}, description="원문에 적힌 그대로: 업체·작업·위치·기간·시간·위험작업·선행조건")
    sources: list[SourceRef] = Field(default=[], description="근거 줄. LLM이 베낀 글이 아니라 파서 원문에서 가져온다")
    confidence: float = Field(description="0~1, 규칙 검증 결과로 계산 (가중치는 팀 설정값)")
    needs_review: bool
    warnings: list[str] = []


class PlanExtraction(BaseModel):
    """POST /api/plans 응답: 업로드한 계획서의 구조화 결과 (아직 제출 전)."""

    draft_id: str
    file: str
    file_sha256: str
    file_type: str  # pdf | xlsx | hwpx
    method: str = Field(description="table_rules(규칙만) | llm(LLM 추출 + 규칙 검증)")
    provider: str | None = None
    model: str | None = None
    contractor: str | None = None
    tasks: list[ExtractedTask]
    lines: list[SourceLine]
    warnings: list[str] = []
    cached: bool = False
    created_at: datetime


class PlanSubmission(BaseModel):
    """POST /api/plans/submit 본문: 사람이 확인·수정한 작업 목록."""

    contractor: str
    file: str
    tasks: list[Task] = Field(min_length=1)
    submitted_by: str | None = None
    draft_id: str | None = None


class PlanRecord(BaseModel):
    id: int
    contractor: str
    file: str
    version: int = Field(description="같은 협력사의 몇 번째 제출인지 (수정 계획서 재제출 시 +1)")
    submitted_at: datetime
    submitted_by: str | None = None
    task_count: int


class PlanSubmitResult(BaseModel):
    plan: PlanRecord
    conflicts: list[Conflict]
    refresh: bool = Field(default=True, description="판정 후 화면을 한 번 강제 새로고침한다")
    diff: ConflictDiff | None = Field(default=None, description="이 제출로 사라지거나 새로 생긴 충돌 (새 충돌 알림)")
    recheck_ms: float | None = Field(default=None, description="재판정에 걸린 시간(밀리초)")
