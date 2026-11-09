// adapter.js(백엔드 데이터 → scene3d 데이터)의 TS 경계 타입. 3D 본체(JS)는 그대로 두고, 서버 데이터가 들어오는 입구만 타입으로 묶는다.
// 입력은 React 앱과 같은 데이터 계약(src/types.ts ↔ app/backend/schemas.py)이다.
import type { Conflict, Task, ViewerRole } from "@/types";
import type { ZoneRestriction } from "@/lib/restrictions";

/** scene3d 구역 id (3D 모형의 12구역: TOP, IN-UP, IN-MID, EX-TUY, IN-HEARTH, EX-MID, CAST, GAS, STOVE …) */
export type Scene3DZoneId = string;

export interface Scene3DCompany {
  id: string; // 원래 협력사 문자열 (가상-…) — 권한·승인 비교에 그대로 쓴다
  name: string;
  trade: string;
  color: string;
}

export interface Scene3DTask {
  id: string;
  company_id: string;
  title: string;
  zone_ids: Scene3DZoneId[];
  src_zone: string;
  start: string; // YYYY-MM-DDTHH:MM
  end: string;
  crew: number | null;
  crew_unknown: boolean;
  work_types: string[]; // HOT · CONFINED · HEIGHT · LIFT · GAS
  systems: string[];
  shift: string | null;
  wbs: string;
  preconditions: { kind: "AFTER_TASK"; ref: string; text: string }[];
  source: Task["source"];
  status: string;
  sectors: { start: string; end: string; dirs: string[] }[] | null;
}

export interface Scene3DConflict {
  id: string;
  rule_id: string;
  type: string; // SAME_ZONE_TIME · VERTICAL · HOT_GAS · SEQUENCE · STANDARD
  severity: "PROHIBITED" | "CONDITIONAL" | "DEFECT";
  title: string;
  task_ids: string[];
  company_ids: string[];
  zone_ids: Scene3DZoneId[];
  start: string;
  end: string;
  reason: string;
  law_ref: string;
  suggestion: { text: string } | null;
  sources: Conflict["sources"];
  source: string;
}

export interface Scene3DRestriction {
  zone_ids: Scene3DZoneId[];
  start: string;
  end: string;
  blocked: string[];
  source_ids: string[];
  reason: string;
}

export interface Scene3DData {
  companies: Scene3DCompany[];
  tasks: Scene3DTask[];
  conflicts: Scene3DConflict[] | undefined;
  restrictions: Scene3DRestriction[] | undefined;
}

export interface Scene3DRole {
  id: string; // PRIME 또는 협력사
  level: "manager" | "lead" | "worker";
  name: string;
}

export const ZONE_MAP: Record<string, Scene3DZoneId[]>;
export function companiesFrom(tasks: Task[]): Scene3DCompany[];
export function taskFrom(t: Task): Scene3DTask;
export function conflictFrom(c: Conflict, taskById: Map<string, Scene3DTask>): Scene3DConflict;
export function fromHansotbap(input: {
  tasks?: Task[];
  conflicts?: Conflict[];
  restrictions?: Pick<ZoneRestriction, "zone_id" | "start" | "end" | "blocked" | "source_ids" | "reason">[];
}): Scene3DData;
export function roleFrom(r: (ViewerRole & { level?: "lead" | "worker" }) | null | undefined): Scene3DRole;
