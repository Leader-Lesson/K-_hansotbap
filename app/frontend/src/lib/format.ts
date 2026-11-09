// 화면 표시용 공통 포맷·색. 판정 색은 시각화 규칙(기술스택 4.2)을 따른다: 금지 빨강 · 조건부 주황 · 결함 보라
import type { ConflictType, Grade, Hazard } from "@/types";

// 색은 시연판 토큰(index.css :root)과 같다: --red · --amber · --violet
export const GRADE_CLASS: Record<Grade, string> = {
  금지: "bg-danger-soft text-danger border-danger/40",
  조건부: "bg-warn-soft text-warn border-warn/40",
  결함: "bg-defect-soft text-defect border-defect/40",
};

export const GRADE_COLOR: Record<Grade, string> = { 금지: "#CF2F29", 조건부: "#B56B00", 결함: "#6A4DB2" };

export const CONFLICT_TYPE_LABEL: Record<ConflictType, string> = {
  same_time_zone: "같은 시간·구역",
  vertical: "위아래",
  hot_gas: "화기×가스",
  sequence: "순서 위반",
  sop_missing: "표준서 누락",
};

export const HAZARD_LABEL: Record<Hazard, string> = {
  hot_work: "화기",
  confined: "밀폐",
  height: "고소",
  heavy_lift: "중량물",
  gas: "가스",
};

/** 등급 우선순위: 금지 > 조건부 > 결함 */
export const GRADE_RANK: Record<Grade, number> = { 금지: 3, 조건부: 2, 결함: 1 };

export const worstGrade = (grades: Grade[]): Grade | undefined =>
  grades.length ? grades.reduce((a, b) => (GRADE_RANK[a] >= GRADE_RANK[b] ? a : b)) : undefined;

/** ISO → 'MM-DD' */
export const fmtDate = (iso: string) => iso.slice(5, 10).replace("-", ".");
/** ISO → 'MM-DD HH:MM' */
export const fmtDateTime = (iso: string) => `${fmtDate(iso)} ${iso.slice(11, 16)}`;
/** 기간 'MM.DD ~ MM.DD' (같은 날이면 시각까지) */
export function fmtRange(start: string, end: string): string {
  if (start.slice(0, 10) === end.slice(0, 10)) return `${fmtDate(start)} ${start.slice(11, 16)}~${end.slice(11, 16)}`;
  return `${fmtDate(start)} ~ ${fmtDate(end)}`;
}
