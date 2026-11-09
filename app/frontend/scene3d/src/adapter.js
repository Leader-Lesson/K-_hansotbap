/* 한솥밥 3D · hansotbap 프론트(API) 데이터 → scene3d 데이터 변환
   hansotbap 계약: app/backend/schemas.py ↔ app/frontend/src/types.ts (Zone, Task, Conflict)
   scene3d 계약: SPEC_v2.md (12구역 id, work_types, severity 영문) */

/* hansotbap 구역 id → scene3d 구역 id (3D 모형 구역). 지상 야드처럼 모형에 없는 곳은 [] (목록엔 '지상·기타') */
export const ZONE_MAP = {
  TOP: ['TOP'],
  STACK: ['IN-UP'],            // 노흉(샤프트) 내부
  BELLY_BOSH: ['IN-MID'],      // 노복·조안 내부
  TUYERE: ['EX-TUY'],          // 풍구 레벨 외곽 플랫폼(풍구·환상관·송풍지관)
  HEARTH: ['IN-HEARTH'],
  SHELL: ['EX-MID'],           // 노체 철피 외부 (높이 구분이 없어 중부 작업대로 표시)
  CASTHOUSE: ['CAST'],
  SLAG: ['CAST'],
  DOWNCOMER: ['GAS'],          // 상승관·하강관 → 가스 설비
  GCP: ['GAS'],
  STOVE: ['STOVE'],
  CRANE_PAD: [],
  YARD: [],
  ALL: [],
};

const HAZARD_MAP = { hot_work: 'HOT', confined: 'CONFINED', height: 'HEIGHT', heavy_lift: 'LIFT', gas: 'GAS' };
const TYPE_MAP = { same_time_zone: 'SAME_ZONE_TIME', vertical: 'VERTICAL', hot_gas: 'HOT_GAS', sequence: 'SEQUENCE', sop_missing: 'STANDARD' };
const GRADE_MAP = { 금지: 'PROHIBITED', 조건부: 'CONDITIONAL', 결함: 'DEFECT' };
const PALETTE = ['#2e6fd0', '#8a3fa0', '#1f8a8a', '#b08300', '#a0522d', '#3f7f4f', '#b03a5b', '#5b6ad0', '#7c6f64', '#9b5d7a', '#1f4e8c', '#6b7682'];

/* ISO ('2027-01-21T22:00:00' 또는 '...+09:00') → 'YYYY-MM-DDTHH:MM' */
const iso16 = (s) => String(s || '').slice(0, 16);

/* 협력사 이름 목록 → Company[] (id = 원래 협력사 문자열, 권한·승인 비교에 그대로 씀) */
export function companiesFrom(tasks) {
  const names = [...new Set(tasks.map((t) => t.contractor).filter(Boolean))].sort();
  return names.map((n, i) => ({ id: n, name: n.replace(/^가상-/, ''), trade: tasks.find((t) => t.contractor === n)?.trade || '', color: n.startsWith('원청') ? '#8a929b' : PALETTE[i % PALETTE.length] }));
}

/* hansotbap Task → scene3d Task */
export function taskFrom(t) {
  const work_types = (t.hazards || []).map((h) => HAZARD_MAP[h]).filter(Boolean);
  // 가스 계통 작업은 질소·고로가스 계통으로 본다 (계통 정보가 없어서 [팀 설정값])
  const systems = work_types.includes('GAS') ? (/질소|N2/.test(t.name) ? ['N2'] : ['BFG']) : [];
  return {
    id: t.id, company_id: t.contractor, title: t.name, zone_ids: ZONE_MAP[t.zone_id] ?? [], src_zone: t.zone_id,
    start: iso16(t.start), end: iso16(t.end), crew: t.crew ?? null, crew_unknown: t.crew == null,
    work_types, systems, shift: t.shift || null, wbs: t.id,
    preconditions: (t.predecessors || []).map((ref) => ({ kind: 'AFTER_TASK', ref, text: `${ref} 완료 후` })),
    source: t.source || null, status: 'active',
    // 시간대별 작업 방위 [{start, end, dirs:['N',…]}] (시안 pos/path) — 작업자 위치·출입 제한 위반 판정에 씀
    sectors: Array.isArray(t.sectors) ? t.sectors.map((s) => ({ start: iso16(s.start), end: iso16(s.end), dirs: s.dirs || [] })) : null,
  };
}

/* hansotbap Conflict → scene3d Conflict (작업 → 구역·업체를 채움) */
export function conflictFrom(c, taskById) {
  const ts = (c.task_ids || []).map((id) => taskById.get(id)).filter(Boolean);
  const type = TYPE_MAP[c.type] || 'SAME_ZONE_TIME';
  return {
    id: c.id, rule_id: c.rule_id, type, severity: GRADE_MAP[c.grade] || 'CONDITIONAL',
    title: ts.length ? ts.map((t) => t.title).join(' × ') : c.reason?.slice(0, 40) || c.rule_id,
    task_ids: c.task_ids || [], company_ids: [...new Set(ts.map((t) => t.company_id))],
    zone_ids: [...new Set(ts.flatMap((t) => t.zone_ids))],
    start: iso16(c.window_start), end: iso16(c.window_end),
    reason: c.reason || '', law_ref: c.legal_basis || '', suggestion: c.suggestion ? { text: c.suggestion } : null,
    sources: c.sources || [], source: 'seed',
  };
}

/* hansotbap { tasks, conflicts? } → scene3d setData 인자 */
export function fromHansotbap({ tasks = [], conflicts, restrictions } = {}) {
  const out = tasks.map(taskFrom);
  const byId = new Map(out.map((t) => [t.id, t]));
  return {
    companies: companiesFrom(tasks),
    tasks: out,
    // conflicts가 없으면 scene3d 규칙 엔진(rules.js)이 계산 — 서버 판정이 생기면 그걸 넘기는 게 우선
    conflicts: Array.isArray(conflicts) ? conflicts.map((c) => conflictFrom(c, byId)) : undefined,
    // 방위별 출입 제한 [{zone_id, start, end, blocked:['N',…], reason}] → scene3d 구역
    restrictions: Array.isArray(restrictions)
      ? restrictions.map((r) => ({ zone_ids: ZONE_MAP[r.zone_id] ?? [], start: iso16(r.start), end: iso16(r.end), blocked: r.blocked || [], source_ids: r.source_ids || [], reason: r.reason || '' }))
      : undefined,
  };
}

/* hansotbap ViewerRole → scene3d Role */
export function roleFrom(r) {
  if (!r || r.kind === 'prime') return { id: 'PRIME', level: 'manager', name: '원청 · 직영 관리자' };
  return { id: r.contractor, level: r.level || 'lead', name: `${String(r.contractor).replace(/^가상-/, '')} ${r.level === 'worker' ? '작업자' : '파트장'}` };
}
