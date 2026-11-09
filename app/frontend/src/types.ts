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

export interface SopMatch {
  task_id: string;
  sop_id: string;
  title: string;
  score: number;
  reason: string;
  missing_steps: string[];
}

// 로그인 없이 역할 선택 (원청 / 협력사 A~E)
export type ViewerRole = { kind: "prime" } | { kind: "contractor"; contractor: string };
