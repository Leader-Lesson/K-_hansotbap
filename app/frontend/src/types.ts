// 데이터 계약 — app/backend/schemas.py 와 같은 모양을 유지한다. 필드를 바꾸면 두 파일을 같이 고친다.

export type Hazard = "hot_work" | "confined" | "height" | "heavy_lift" | "gas";
export type Shift = "day" | "night";
export type ConflictType = "same_time_zone" | "vertical" | "hot_gas" | "sequence" | "sop_missing";
export type Grade = "금지" | "조건부" | "결함";

export interface Zone {
  id: string;
  name: string;
  vertical_order: number; // 클수록 위, -1 = 전 구역
  description: string;
}

export interface SourceRef {
  file: string;
  locator: string | null;
  text: string;
}

export interface Task {
  id: string;
  contractor: string;
  name: string;
  trade: string | null;
  zone_id: string;
  start: string; // ISO datetime
  end: string;
  shift: Shift | null;
  hazards: Hazard[];
  risk_codes: string[];
  predecessors: string[];
  source: SourceRef | null;
}

export interface Conflict {
  id: string;
  type: ConflictType;
  grade: Grade;
  task_ids: string[];
  rule_id: string;
  legal_basis: string;
  window_start: string;
  window_end: string;
  reason: string;
  suggestion: string | null;
  sources: SourceRef[];
}

// 저장된 충돌 하나 (GET /api/conflicts). 판정 결과는 제출 응답에만 두지 않고 DB에 남는다
export type ConflictStatus = "open" | "adjusted" | "resolved";

export interface ConflictRecord {
  conflict: Conflict;
  status: ConflictStatus;
  plan_id: number | null; // 이 충돌을 드러낸 제출
  judged_at: string;
  resolved_at: string | null; // 재판정에서 사라진 시각
}

export interface OverlapCandidate {
  task_a: string;
  task_b: string;
  relation: "same_zone" | "vertical" | "all_zone";
  window_start: string;
  window_end: string;
}

export interface RiskWindow {
  zone_id: string;
  start: string;
  end: string;
  score: number;
  contractors: string[];
  conflict_ids: string[];
  weights_note: string;
}

/** F8 표준서 필수 단계 1개가 계획서에 적혀 있는지 (규칙 판정) */
export interface SopStepCheck {
  no: number;
  text: string;
  critical: boolean; // 핵심 단계 — 빠지면 결함
  found: boolean;
  evidence: SourceRef | null; // 이 단계를 찾은 계획서 원문 줄
}

export interface SopMatch {
  task_id: string;
  sop_id: string;
  title: string;
  score: number;
  reason: string;
  missing_steps: string[]; // 빠진 핵심 단계. 주 표준서(primary)일 때만 → F2 결함
  primary: boolean; // 결함 판정 대상인 주 표준서 (원청 적용 목록 + 작업명 일치)
  basis: string[]; // wbs_example | name | hazard | embedding
  steps: SopStepCheck[];
}

/** GET /api/sops: 원청 작업표준서 (합성) */
export interface SopInfo {
  id: string;
  title: string;
  file: string;
  hazards: string[];
  wbs_examples: string[];
  steps: string[];
  critical_steps: number[]; // 빠지면 결함인 단계 번호 (1부터)
  source: string;
  text: string | null; // 본문(마크다운). 목록 조회에서는 null
}

// 로그인 없이 역할 선택 (원청 / 협력사 A~E)
export type ViewerRole = { kind: "prime" } | { kind: "contractor"; contractor: string };

// ── F1 계획서 구조화 ──────────────────────────────────────────────────

/** 파서가 읽은 원문 한 줄 (원문 근거 하이라이트용) */
export interface SourceLine {
  locator: string;
  text: string;
}

/** 계획서에서 뽑은 작업 1건 + 근거·확인 필요 표시. 사람이 확인·수정한 뒤 task 만 제출한다 */
export interface ExtractedTask {
  task: Task;
  wbs_id: string | null; // 원청 기준 일정(작업 분해표)에서 대응하는 작업 ID
  raw: Record<string, string>; // 원문 그대로: contractor·name·location·period·time·shift·hazards·precondition
  sources: SourceRef[]; // 근거 줄 (파서 원문)
  confidence: number; // 0~1
  needs_review: boolean;
  warnings: string[];
}

/** POST /api/plans 응답 */
export interface PlanExtraction {
  draft_id: string;
  file: string;
  file_sha256: string;
  file_type: string; // pdf | xlsx | hwpx
  method: string; // table_rules | llm
  provider: string | null;
  model: string | null;
  contractor: string | null;
  tasks: ExtractedTask[];
  lines: SourceLine[];
  warnings: string[];
  cached: boolean;
  created_at: string;
  sop_matches: SopMatch[]; // F8 작업별 표준서 매칭·필수 단계 확인 (제출 전 확인 화면용)
}

/** POST /api/plans/submit 본문 */
export interface PlanSubmission {
  contractor: string;
  file: string;
  tasks: Task[];
  submitted_by?: string | null;
  draft_id?: string | null;
}

export interface PlanRecord {
  id: number;
  contractor: string;
  file: string;
  version: number; // 같은 협력사의 몇 번째 제출인지
  submitted_at: string;
  submitted_by: string | null;
  task_count: number;
}

export interface PlanSubmitResult {
  plan: PlanRecord;
  conflicts: Conflict[];
  refresh: boolean; // 판정 후 화면을 한 번 강제 새로고침
}
