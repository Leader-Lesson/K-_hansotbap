// 한솥밥 · 고로 3D / 단면도 앱 셸
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

import { buildFurnace } from './furnace.js';
import { renderFloorPlan } from './plan2d.js';
import { SEV, LEVEL_NAME, WORK_TYPE_NAME, TYPE_NAME, fmtTime, fmtDateTime, barrierText } from './theme.js';

const SIDE_NAME = { in: '노 내부', out: '외부 작업대', aux: '부대설비' };
import { ZONES, COMPANIES, TASKS, CONFLICTS, DEMO, SAMPLE_CHANGE } from './data.js';
import { detectConflicts, filterForRole, hazardsFor, guidanceFor, influenceZones, describeArea } from './rules.js';
import { renderLeft, renderRightIntro, renderRightZone, renderRightTask } from './panels.js';
import { buildSession } from './session.js';
import { fromHansotbap, roleFrom } from './adapter.js';
import { ALTERNATIVES, ALT_GROUP_NOTE, applyAlternative } from './alternatives.js';
import { POLL_MS, bootFromApi, loadView } from './api.ts';

// ---------- 공통 유틸 ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const hhmm = (iso) => (fmtTime ? fmtTime(iso) : String(iso).slice(11, 16));

const SEV_ORDER = ['PROHIBITED', 'CONDITIONAL', 'DEFECT'];
const sevScore = (s) => SEV[s]?.score ?? 0;

// 삽입(embed) 모드 · 날짜 지정: ?embed=1&date=2027-01-21 (hansotbap 프론트 탭 안 iframe)
const QS = new URLSearchParams(location.search);
const EMBED = QS.get('embed') === '1';

// 단독 실행(/scene3d/index.html): 백엔드의 작업·서버 판정으로 시작한다 (api.js). ?source=sample 이거나 서버가 꺼져 있으면 합성 시안 데이터
const BOOT = !EMBED && QS.get('source') !== 'sample' ? await bootFromApi(QS) : null;
const API_MODE = !!BOOT?.data;
if (API_MODE) {
  COMPANIES.splice(0, COMPANIES.length, ...BOOT.data.companies);
  TASKS.splice(0, TASKS.length, ...BOOT.data.tasks);
  CONFLICTS.splice(0, CONFLICTS.length, ...BOOT.data.conflicts);
}

const zoneById = new Map(ZONES.map((z) => [z.id, z]));
const companyById = new Map(COMPANIES.map((c) => [c.id, c]));
const taskById = new Map(TASKS.map((t) => [t.id, t]));

const DATE_Q = QS.get('date') || BOOT?.date || '';
if (/^\d{4}-\d{2}-\d{2}$/.test(DATE_Q)) {
  const d = DATE_Q;   // 작업 시간은 그날 07:00 ~ 19:00 (야간조 없음)
  Object.assign(DEMO, { date: d, windowStart: d + 'T07:00', windowEnd: d + 'T19:00', now: QS.get('now') || d + 'T10:00' });
}
if (EMBED) document.body.classList.add('embed');
{ // 상단 날짜 표시 (공정 시작 2026-11-12 = D1)
  const dd = new Date(DEMO.date + 'T00:00'), day = Math.round((dd - new Date('2026-11-12T00:00')) / 86400000) + 1;
  const el = document.querySelector('.top-mid .date');
  if (el) el.innerHTML = `${DEMO.date} (${'일월화수목금토'[dd.getDay()]}) <b>D${day}</b>`;
  if (el && !EMBED) {
    const go = (n) => {
      const x = new Date(DEMO.date + 'T00:00'); x.setDate(x.getDate() + n);
      const q = new URLSearchParams(location.search); q.set('date', toIso(x).slice(0, 10)); q.delete('now');
      location.search = q.toString();
    };
    const btn = (txt, n, label) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'date-nav'; b.textContent = txt; b.setAttribute('aria-label', label); b.onclick = () => go(n); return b; };
    el.before(btn('◀', -1, '전날'));
    el.after(btn('▶', 1, '다음 날'));
  }
  const tag = document.querySelector('.top-mid .tag-synth');
  if (tag && !EMBED) {
    tag.textContent = API_MODE ? '합성 데이터 · 서버 판정' : BOOT?.error ? '합성 시안 데이터 · 서버 연결 안 됨' : '합성 시안 데이터';
    tag.title = API_MODE ? '백엔드(/api)의 작업·판정(R01~R30)을 보여 줍니다. 다른 화면에서 제출·조정·공유하면 잠시 뒤 반영됩니다' : (BOOT?.error || '?source=sample');
  }
}

// 시간 축: windowStart ~ windowEnd, 30분 간격
const STEP_MIN = 30;
const T0 = new Date(DEMO.windowStart);
const T1 = new Date(DEMO.windowEnd);
const STEPS = Math.round((T1 - T0) / (STEP_MIN * 60000));
const idxToIso = (i) => toIso(new Date(T0.getTime() + i * STEP_MIN * 60000));
const isoToIdx = (iso) => Math.max(0, Math.min(STEPS, Math.round((new Date(iso) - T0) / (STEP_MIN * 60000))));
const NOW_IDX = isoToIdx(DEMO.now);

// ---------- 상태 ----------
const state = {
  timeIdx: NOW_IDX,
  t: DEMO.now,
  level: null,           // 선택 층 (null=전체)
  mode: '3d',            // '3d' | '2d'
  zoneId: null,          // 선택 구역
  conflictId: null,      // 강조 충돌
  explode: 0,
  playing: false,
  active: { tasks: [], conflicts: [] },
  role: { id: 'PRIME', level: 'manager', name: '원청 · 직영 관리자' },
  taskId: null,
  view: { tasks: [], conflicts: [] },   // 권한을 적용한 전체(시간 무관) 데이터
  externalConflicts: false,   // 부모(시안·서버)가 판정을 넘기면 그것만 씀 — 규칙 엔진이 경고를 더 만들지 않게
  restrictions: null,
  barriers: null,             // 그 시각 출입 제한 barrierList(t) — refresh()에서 한 번 계산해 안전띠·배너·라벨·왼쪽 목록이 같이 씀
  violations: [],             // 출입 제한 구역 안 작업 (긴급 알림 대상)         // 부모가 넘긴 방위별 출입 제한 (없으면 위험 영역에서 계산)
};
if (API_MODE) { state.externalConflicts = true; state.restrictions = BOOT.data.restrictions; }   // 서버 판정만 쓴다 (브라우저 규칙이 경고를 더 만들지 않게)

// ---------- 시간별 활성 데이터 ----------
/* pauses: 대안 적용으로 잠시 멈추는(다른 일로 돌리는) 시간대 */
const isActive = (item, t) => item.start <= t && t < item.end && !(item.pauses || []).some(([s, e]) => s <= t && t < e);

/* 승인된(진행 가능한) 작업 — 승인 대기·반려는 착수 불가라 판정·3D에서 뺌 */
const liveTasks = () => TASKS.filter((k) => (k.status || 'active') === 'active');
/* 전체 판정(규칙 + 시연 고정값) → 보는 사람 권한으로 거름 */
function computeView() {
  const live = liveTasks();
  const ids = new Set(live.map((k) => k.id));
  const conflicts = state.externalConflicts
    ? CONFLICTS.filter((c) => c.task_ids.every((id) => ids.has(id)))
    : detectConflicts(live, ZONES, { seed: CONFLICTS });
  return filterForRole({ tasks: live, conflicts, zones: ZONES }, state.role, { now: state.t });
}
function computeActive(t) {
  state.view = computeView();
  return { tasks: state.view.tasks.filter((x) => isActive(x, t)), conflicts: state.view.conflicts.filter((x) => isActive(x, t)) };
}
/* session은 아래에서 만들어지므로 아직 없을 때를 대비 */
function sessionChanges() { try { return session.changes(); } catch (e) { return []; } }
/* 왼쪽 목록에 보일 승인 대기 작업 (원청: 전부, 협력사: 자기 업체·영향받는 업체) */
function pendingVisible() {
  return TASKS.filter((k) => k.status === 'pending' && (state.role.id === 'PRIME' || k.company_id === state.role.id
    || sessionChanges().some((c) => c.task?.id === k.id && (c.affected_company_ids || []).includes(state.role.id))));
}

function tasksInZone(zoneId) {
  return state.active.tasks.filter((t) => (t.zone_ids || []).includes(zoneId));
}
function conflictsInZone(zoneId) {
  return state.active.conflicts
    .filter((c) => (c.zone_ids || []).includes(zoneId))
    .sort((a, b) => sevScore(b.severity) - sevScore(a.severity));
}
function worstSeverity(zoneId) {
  let worst = null;
  for (const c of conflictsInZone(zoneId)) {
    if (!worst || sevScore(c.severity) > sevScore(worst)) worst = c.severity;
  }
  return worst;
}
function crewInZone(zoneId) {
  // 여러 구역에 걸친 작업은 그대로 합산 (현장 표시용 근사)
  return tasksInZone(zoneId).reduce((s, t) => s + (t.crew || 0), 0);   // 제한 공개 작업은 인원 비공개(0)
}
function levelConflictCount(level) {
  const ids = new Set();
  for (const c of state.active.conflicts) {
    if ((c.zone_ids || []).some((z) => zoneById.get(z)?.level === level)) ids.add(c.id);
  }
  return ids.size;
}

// ---------- three.js 기본 ----------
const wrap = $('canvasWrap');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = false;
renderer.setClearColor(0xeef0f2, 1);
wrap.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.inset = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
wrap.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef0f2);

const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 2000);
const HOME = { pos: new THREE.Vector3(150, 95, 170), target: new THREE.Vector3(0, 45, 0) };
camera.position.copy(HOME.pos);

scene.add(new THREE.HemisphereLight(0xffffff, 0xb8bec4, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(80, 160, 100);
scene.add(sun);

// 바닥 격자 (은은하게)
const grid = new THREE.GridHelper(260, 26, 0xc9ced3, 0xdde1e4);
scene.add(grid);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.copy(HOME.target);
controls.minDistance = 20;
controls.maxDistance = 600;
controls.maxPolarAngle = Math.PI * 0.49;

// ---------- 고로 모델 ----------
const furnace = buildFurnace();
scene.add(furnace.root);
const LEVELS = furnace.levels; // 6→0

// ---------- 구역 라벨 (CSS2D) ----------
const labels = new Map(); // zoneId → {obj, el}
for (const z of ZONES) {
  if (!furnace.zoneMeshes?.has?.(z.id)) continue;
  const el = document.createElement('div');
  el.className = 'zlabel';
  const obj = new CSS2DObject(el);
  scene.add(obj);
  labels.set(z.id, { obj, el });
}

function updateLabelPositions() {
  furnace.root.updateMatrixWorld(true);
  for (const [zid, { obj }] of labels) {
    const p = furnace.zoneAnchor(zid);
    if (p) obj.position.copy(p);
  }
}

function updateLabels() {
  for (const [zid, { obj, el }] of labels) {
    const z = zoneById.get(zid);
    const crew = crewInZone(zid);
    const sev = worstSeverity(zid);
    const sel = zid === state.zoneId;
    const bar = (state.barriers || []).find((b) => b.zoneId === zid);
    // 전체 보기: 사람 있거나 충돌·출입 제한 있는 구역만, 층 선택: 그 층 전부
    const visible = !extras.banners && state.mode === '3d' && (state.level == null
      ? (crew > 0 || sev || sel || bar)
      : z.level === state.level);
    obj.visible = !!visible;
    el.style.display = visible ? '' : 'none';
    if (!visible) continue;
    el.className = 'zlabel' + (sev ? ' sev' : '') + (sel ? ' sel' : '');
    el.style.borderColor = sev && !sel ? SEV[sev].color : '';
    el.innerHTML = `${sev ? `<span style="color:${SEV[sev].color}">${SEV[sev].mark}</span> ` : ''}${esc(z.name)}`
      + (crew ? `<span class="crew">${crew}명</span>` : '')
      + (bar ? `<span class="zl-ban">${esc(barrierText(bar))}</span>` : '');
  }
}

// ---------- 색칠 / 강조 ----------
function applyZoneStates() {
  const hl = state.conflictId ? CONFLICTS.find((c) => c.id === state.conflictId) : state.taskId ? taskProblem(state.taskId) : null;
  const hlZones = new Set(hl ? hl.zone_ids : []);
  for (const z of ZONES) {
    if (!furnace.zoneMeshes?.has?.(z.id)) continue;
    const sev = worstSeverity(z.id);
    let emphasis = 'none';
    let pulse = sev === 'PROHIBITED';
    if (hl) {
      emphasis = hlZones.has(z.id) ? 'selected' : 'dim';
      pulse = hlZones.has(z.id);
    } else if (state.zoneId) {
      emphasis = z.id === state.zoneId ? 'selected' : 'none';
    }
    furnace.setZoneState(z.id, { tint: sev ? SEV[sev].color : null, emphasis, pulse });
  }
}

/* ---------- 3D 문제 말풍선 ----------
   왼쪽 목록에서 작업을 누르거나 오른쪽에서 문제를 고르면, 3D 안의 그 구역에 무엇이 문제인지 바로 띄움.
   주 말풍선 = 문제 내용, 작은 꼬리표 = 원인 구역 (위아래·같은 계통처럼 떨어진 구역일 때) */
const safeViolations = () => { try { return computeViolations(state.t); } catch (e) { return []; } };
const worstOf = (list) => [...list].sort((a, b) => (SEV[b.severity]?.score || 0) - (SEV[a.severity]?.score || 0))[0] || null;
function taskProblem(taskId) {
  const pool = state.view?.conflicts?.length ? state.view.conflicts : CONFLICTS;
  return worstOf(pool.filter((c) => (c.task_ids || []).includes(taskId) && (!c.end || c.end > state.t)));
}
const callMain = (() => { const el = document.createElement('div'); el.className = 'pcall-host'; const obj = new CSS2DObject(el); obj.visible = false; scene.add(obj); return { el, obj }; })();
const callCause = (() => { const el = document.createElement('div'); el.className = 'pcall-host'; const obj = new CSS2DObject(el); obj.visible = false; scene.add(obj); return { el, obj }; })();
const DIR1 = { N: '북', E: '동', S: '남', W: '서' };
function placeCall(c, zid) { const p = zid && furnace.zoneAnchor(zid); if (!p) { c.obj.visible = false; return false; } c.obj.position.copy(p); c.obj.visible = true; return true; }
function updateProblemCallout() {
  callMain.obj.visible = callCause.obj.visible = false;
  callMain.el.innerHTML = callCause.el.innerHTML = '';
  document.getElementById('vbar')?.classList.toggle('low', !!(state.taskId || state.conflictId));   // 말풍선을 가리지 않게 위반 띠는 아래로
  if (state.mode !== '3d' || (!state.taskId && !state.conflictId)) return;
  furnace.root.updateMatrixWorld(true);
  const task = state.taskId ? (state.view.tasks.find((k) => k.id === state.taskId) || TASKS.find((k) => k.id === state.taskId)) : null;
  const viol = task ? safeViolations().find((v) => v.taskId === task.id) : null;
  const c = state.conflictId ? CONFLICTS.find((k) => k.id === state.conflictId) : task ? taskProblem(task.id) : null;
  const here = viol?.zone || task?.zone_ids?.find((z) => zoneById.has(z)) || c?.zone_ids?.[0];
  if (viol) {
    callMain.el.innerHTML = `<div class="pcall" style="--sev:#c62828"><div class="pcall-k">⚠ 출입 제한 위반 · 지금</div><div class="pcall-t">${esc(coLabel(viol.company))} ${esc(viol.title)}</div><div class="pcall-s">${esc(viol.zoneName)} 막힌 ${esc((viol.hit || viol.dirs || []).map((d) => DIR1[d] || d).join('·'))}쪽 안에서 작업</div>${c ? `<div class="pcall-s" data-conflict="${esc(c.id)}">함께 걸린 문제: <b style="color:${(SEV[c.severity] || SEV.CONDITIONAL).color}">${(SEV[c.severity] || SEV.CONDITIONAL).mark} ${esc((SEV[c.severity] || SEV.CONDITIONAL).label)}</b> ${esc(c.title)}</div>` : ''}<div class="pcall-a">→ 시정 명령 필요 (위치 이동 또는 일시 중지)</div></div>`;
    placeCall(callMain, here);
    return;
  }
  if (!c) {
    if (task) { callMain.el.innerHTML = `<div class="pcall ok"><div class="pcall-k">✓ 걸린 문제 없음</div><div class="pcall-t">${esc(coLabel(task.company_id))} ${esc(task.title)}</div><div class="pcall-s">${esc(hhmm(task.start))}–${esc(hhmm(task.end))} · 계획대로 진행</div></div>`; placeCall(callMain, here); }
    return;
  }
  const sv = SEV[c.severity] || SEV.CONDITIONAL;
  const others = (c.task_ids || []).map((id) => TASKS.find((k) => k.id === id)).filter((k) => k && k.id !== task?.id);
  const cause = others[0];
  const live = c.start <= state.t && state.t < c.end;
  const what = c.severity === 'PROHIBITED' ? '조정 전에는 함께 작업 금지' : c.severity === 'CONDITIONAL' ? (c.suggestion?.text || '조건 지키고 진행') : '계획서 보완 필요';
  callMain.el.innerHTML = `<div class="pcall" style="--sev:${sv.color}" data-conflict="${esc(c.id)}">
    <div class="pcall-k">${sv.mark} ${esc(sv.label)} · ${esc(TYPE_NAME?.[c.type] || '')} · ${live ? '지금' : esc(hhmm(c.start)) + '부터'}</div>
    <div class="pcall-t">${esc(c.title)}</div>
    <div class="pcall-s">${cause ? `원인: ${esc(coLabel(cause.company_id))} ${esc(cause.title)} · ` : ''}${esc(hhmm(c.start))}–${esc(hhmm(c.end))}</div>
    <div class="pcall-a">→ ${esc(what)}</div></div>`;
  placeCall(callMain, here);
  const causeZone = (cause?.zone_ids || c.zone_ids || []).find((z) => z !== here && zoneById.has(z));
  if (causeZone) {
    callCause.el.innerHTML = `<div class="pcall small" style="--sev:${sv.color}">원인 · ${esc(zname(causeZone))}${cause ? ` · ${esc(coLabel(cause.company_id))}` : ''}</div>`;
    placeCall(callCause, causeZone);
  }
}
for (const c of [callMain, callCause]) c.el.addEventListener('pointerdown', (e) => {
  const k = e.target.closest('[data-conflict]'); if (!k) return;
  e.stopPropagation(); $('detail').classList.remove('collapsed');
  if (state.conflictId !== k.dataset.conflict) selectConflict(k.dataset.conflict);
});

// ---------- 카메라 이동 (부드럽게) ----------
let tween = null;
function flyTo(pos, target, ms = 700) {
  tween = {
    p0: camera.position.clone(), t0: controls.target.clone(),
    p1: pos.clone(), t1: target.clone(),
    start: performance.now(), ms,
  };
}
function stepTween(now) {
  if (!tween) return;
  let k = Math.min(1, (now - tween.start) / tween.ms);
  k = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // easeInOut
  camera.position.lerpVectors(tween.p0, tween.p1, k);
  controls.target.lerpVectors(tween.t0, tween.t1, k);
  if (k >= 1) tween = null;
}
function frameLevel(level) {
  const L = LEVELS.find((x) => x.level === level);
  if (!L) return;
  const cy = (L.y0 + L.y1) / 2;
  const h = Math.max(8, L.y1 - L.y0);
  const dist = Math.max(70, h * 4);
  const target = new THREE.Vector3(0, cy, 0);
  const dir = new THREE.Vector3(0.65, 0.55, 0.75).normalize();
  flyTo(target.clone().addScaledVector(dir, dist), target);
}

// ---------- 2D 도면 ----------
let plan = null;
function renderPlan() {
  if (plan) { plan.destroy?.(); plan = null; }
  const lv = state.level ?? zoneById.get(state.zoneId)?.level ?? null;
  if (state.mode !== '2d' || lv == null) return;
  const zones = ZONES.filter((z) => z.level === lv);
  const zIds = new Set(zones.map((z) => z.id));
  const tasks = state.active.tasks.filter((t) => (t.zone_ids || []).some((z) => zIds.has(z)));
  const conflicts = state.active.conflicts.filter((c) => (c.zone_ids || []).some((z) => zIds.has(z)));
  try {
    plan = renderFloorPlan($('planWrap'), {
      level: lv, zones, tasks, conflicts, companies: COMPANIES,
      selectedZoneId: state.zoneId,
      onZoneClick: (id) => selectZone(id),
      onConflictClick: (id) => selectConflict(id),
      now: hhmm(state.t), restrictions: planRestrictions(zones), timeline: planTimeline(zones),
      onTimeClick: (iso) => setTime(iso),
    });
  } catch (e) {
    console.error(e);
    $('planWrap').innerHTML = `<div class="error-box">도면을 그리지 못했습니다: ${esc(e.message)}</div>`;
  }
}

/* ---------- 2D 도면: 시간대별 출입 제한 · 이유 · 일어날 수 있는 사고 ----------
   barrierList(그 시각 막힌 방위)와 hazardsFor(위험 종류)를 합쳐, 원인 작업(다른 회사)과 사고 유형을 붙인다 */
const ACCIDENT = {
  DROP: { name: '낙하물', text: '위에서 인양 중인 자재·공구·볼트가 떨어지면 아래 작업자가 머리·어깨를 맞아 크게 다치거나 숨질 수 있고, 와이어·슬링이 끊어지면 인양물에 깔립니다.' },
  HOT: { name: '불티·화재', text: '용접·용단 불티가 보온재·기름·가연물에 옮겨붙어 불이 나고 화상을 입을 수 있습니다. 노 안처럼 막힌 곳이면 연기 때문에 질식할 수 있습니다.' },
  GAS: { name: '가스 중독·질식', text: '고로가스(CO)는 색도 냄새도 없어 모르는 사이 중독·의식 상실로 이어지고, 질소로 퍼지한 구역은 산소가 모자라 질식합니다. 산소가 새면 작은 불꽃도 큰불이 됩니다.' },
  HEIGHT: { name: '낙하물', text: '위쪽 작업대에서 공구·자재가 떨어져 아래 작업자가 맞을 수 있습니다.' },
  CROWD: { name: '끼임·넘어짐', text: '좁은 곳에 사람·자재·장비가 몰리면 넘어지거나 장비에 끼이고, 비상시 대피가 늦어집니다.' },
};
const kindOfTask = (k) => { const w = k?.work_types || []; return w.includes('LIFT') ? 'DROP' : w.includes('GAS') ? 'GAS' : w.includes('HOT') ? 'HOT' : w.includes('HEIGHT') ? 'HEIGHT' : 'CROWD'; };
/* 3D 화면 기준 말(앞쪽·오른쪽…)을 도면 방위(북·동·남·서)로 바꿈 */
const areaKo = (a) => { if (a?.shape !== 'sector') return describeArea(a); const TAU = Math.PI * 2, d = DIRS.reduce((m, k) => { const x = Math.abs(((DIR_PHI[k] - (a.phi ?? 0)) % TAU + TAU + Math.PI) % TAU - Math.PI); return x < m[1] ? [k, x] : m; }, ['S', 9])[0]; return DIR_KO[d]; };
const compassWhy = (h) => (h ? h.text.split(describeArea(h.area)).join(areaKo(h.area)) : '');
const trimWhy = (w, k) => (k && w.startsWith(k.title) ? w.slice(k.title.length).replace(/^\s*—\s*/, '') : w);
const whoOf = (k) => (!k ? '다른 작업' : state.role.id === 'PRIME' || state.role.id === k.company_id ? `${coLabel(k.company_id)} ${k.title}` : `타사 ${(ACCIDENT[kindOfTask(k)] || {}).name || ''} 위험 작업`);
function planRestrictions(zones) {
  const ids = new Set(zones.map((z) => z.id)), live = liveTasks(), list = barrierList(state.t).filter((b) => ids.has(b.zoneId));
  const out = list.map((b) => {
    const hz = hazardsFor(b.zoneId, live, ZONES, state.t);
    const items = (b.sources.length ? b.sources : [null]).map((sid) => {
      const k = TASKS.find((x) => x.id === sid), h = hz.find((x) => x.fromTaskId === sid);
      const kind = h?.kind || (k ? kindOfTask(k) : 'DROP');
      return { level: 'ban', kind, who: whoOf(k), why: h && h.area?.shape !== 'all' ? trimWhy(compassWhy(h), k) : `${ACCIDENT[kind].name} 위험 범위: ${b.blocked.length ? b.blocked.map((d) => DIR_KO[d]).join('·') : '중앙부'}`, accident: ACCIDENT[kind] };
    });
    const allowed = DIRS.filter((d) => !b.blocked.includes(d)).map((d) => DIR_KO[d]);
    return { zoneId: b.zoneId, zoneName: zname(b.zoneId), blocked: b.blocked, center: !!b.center, until: b.until,
      advice: b.center && !b.blocked.length ? `중앙부는 비우고 가장자리(벽 쪽)에서 상부 방호 확인 후 작업 · ${b.until} 이후 전체 작업` : allowed.length && allowed.length < 4 ? `${allowed.join('·')}에서만 작업 · ${b.until} 이후 전체 작업` : `${b.until} 이후 작업`, items };
  });
  // 막지는 않지만 주의할 위험 (불티·가스 조건부)
  for (const z of zones) for (const h of hazardsFor(z.id, live, ZONES, state.t)) {
    if (out.some((o) => o.zoneId === z.id && o.items.some((i) => i.kind === h.kind))) continue;
    if (h.severity === 'PROHIBITED' || h.kind === 'DROP') continue;
    const k = TASKS.find((x) => x.id === h.fromTaskId);
    let o = out.find((x) => x.zoneId === z.id);
    if (!o) { o = { zoneId: z.id, zoneName: z.name, blocked: [], center: false, until: hhmm(h.end), advice: '감시자 배치·측정 후 작업', items: [] }; out.push(o); }
    o.items.push({ level: 'caution', kind: h.kind, who: whoOf(k), why: trimWhy(compassWhy(h), k), accident: ACCIDENT[h.kind] });
  }
  return out;
}
function planTimeline(zones) {
  const ids = new Set(zones.map((z) => z.id)), rows = [], open = new Map();
  for (let i = 0; i <= STEPS; i++) {
    const t = idxToIso(i), cur = new Map(i < STEPS ? barrierList(t).filter((b) => ids.has(b.zoneId)).map((b) => [b.zoneId, b]) : []);
    for (const [zid, r] of open) {
      const b = cur.get(zid);
      if (!b || b.blocked.join() !== r.blocked.join() || b.sources.join() !== r.srcKey) { r.end = t; rows.push(r); open.delete(zid); }
    }
    for (const [zid, b] of cur) if (!open.has(zid)) {
      const k = TASKS.find((x) => x.id === b.sources[0]);
      open.set(zid, { zoneId: zid, zoneName: zname(zid), start: t, blocked: b.blocked, center: !!b.center, srcKey: b.sources.join(), who: whoOf(k), kind: k ? kindOfTask(k) : 'DROP' });
    }
  }
  return rows.sort((a, b) => a.start.localeCompare(b.start)).map((r) => ({ ...r, startLabel: hhmm(r.start), endLabel: hhmm(r.end),
    active: r.start <= state.t && state.t < r.end, accidentName: ACCIDENT[r.kind]?.name }));
}

// ---------- 상단 요약 ----------
function renderSummary() {
  const { tasks, conflicts } = state.active;
  const comp = new Set(tasks.map((t) => t.company_id));
  const crew = tasks.reduce((s, t) => s + (t.crew || 0), 0);
  const cnt = Object.fromEntries(SEV_ORDER.map((s) => [s, conflicts.filter((c) => c.severity === s).length]));
  $('summary').innerHTML =
    `<span>작업 업체 <b>${comp.size}</b>곳</span>` +
    `<span>투입 인원 <b>${crew}</b>명</span>` +
    `<span>충돌 ` + SEV_ORDER.map((s) =>
      `<span class="sev-count" title="${SEV[s].label}" style="color:${SEV[s].color}">${SEV[s].mark}<b>${cnt[s]}</b></span>`
    ).join(' ') + `</span>`;
}

// ---------- 왼쪽 층 목록 ----------
function buildFloorList() {
  const nav = document.querySelector('.floors');
  nav.addEventListener('click', (e) => {
    const tk = e.target.closest('[data-task]');
    if (tk) { selectTask(tk.dataset.task); return; }
    const zb = e.target.closest('[data-zone]');
    if (!zb) return;
    if (zb.dataset.zone) selectZone(zb.dataset.zone);
    else { state.taskId = null; state.conflictId = null; selectZone(null); flyTo(HOME.pos, HOME.target); }
  });
}

/* 왼쪽: 받은 작업 데이터를 위치별로 자동 묶음 (작업 없는 구역은 안 보임) */
function renderFloorList() {
  const inDay = (k) => k.start < DEMO.windowEnd && k.end > DEMO.windowStart;
  const tasks = [...state.view.tasks.filter(inDay), ...pendingVisible().filter(inDay)];
  document.querySelector('.floors').innerHTML = renderLeft({
    zones: ZONES, tasks, conflicts: state.active.conflicts,
    selectedZoneId: state.zoneId, selectedTaskId: state.taskId, t: state.t, barriers: state.barriers,
  });
}

// ---------- 오른쪽 상세 패널 ----------
/* 시연일 밖 날짜가 끼면 날짜도 함께 표시 (여러 날 걸친 작업) */
const inWindow = (iso) => iso >= DEMO.windowStart && iso <= DEMO.windowEnd;
const timeRange = (a, b) => (inWindow(a) && inWindow(b)
  ? `<span class="t">${hhmm(a)}–${hhmm(b)}</span>`
  : `<span class="t">${fmtDateTime(a)} – ${fmtDateTime(b)}</span>`);
const companyChip = (cid) => {
  const c = companyById.get(cid);
  return `<span class="chip"><i class="dot" style="background:${c?.color || '#999'}"></i>${esc(c?.name || cid)}</span>`;
};
const zoneLink = (zid) => {
  const z = zoneById.get(zid);
  return z ? `<button type="button" class="zlink" data-zone="${esc(zid)}">${esc(z.name)} <small>(${esc(LEVEL_NAME[z.level] ?? z.level)})</small></button>` : '';
};

function conflictCard(c) {
  const s = SEV[c.severity] || { color: '#999', label: c.severity, mark: '•' };
  return `<div class="card conflict${c.id === state.conflictId ? ' on' : ''}" data-conflict="${esc(c.id)}" style="border-left-color:${s.color}">
    <div class="row"><span class="sevtag" style="color:${s.color}">${s.mark} ${esc(s.label)}</span>${timeRange(c.start, c.end)}</div>
    <div class="title">${esc(c.title)}</div>
    <div class="meta">${(c.company_ids || []).map(companyChip).join('')}</div>
    ${c.reason ? `<div class="reason">${esc(c.reason)}</div>` : ''}
    ${c.law_ref ? `<div class="law">근거: ${esc(c.law_ref)}</div>` : ''}
    ${altBlock(c)}
  </div>`;
}

/* 금지(치명): 멈추지 않고 조정하는 대안 / 조건부·결함: 위험 알림만 (작업 계속) */
function altBlock(c) {
  const g = ALTERNATIVES[c.id];
  if (c.severity !== 'PROHIBITED') {
    return `<div class="alert-only"><b>알림 · 작업 계속</b>${c.suggestion?.text ? ` — 조치 조건: ${esc(c.suggestion.text)}` : ''}</div>`;
  }
  if (!g) return c.suggestion?.text ? `<div class="suggest">조정안: ${esc(c.suggestion.text)}</div>` : '';
  return `<div class="alts">
    <div class="alts-head">치명 위험 — <b>멈추지 않고</b> 아래 조정안 중 하나를 고르세요</div>
    <div class="alts-loss">전원 대기하면 <b>${g.stopAll.ph}</b>인시 손실 <small>(${esc(g.stopAll.text)})</small></div>
    ${ALT_GROUP_NOTE[c.id] ? `<div class="alts-note">${esc(ALT_GROUP_NOTE[c.id])}</div>` : ''}
    ${g.list.map((a, i) => `<div class="alt">
      <div class="alt-top"><span class="alt-no">${i + 1}</span><b>${esc(a.title)}</b><span class="alt-tag">${esc(a.tag)}</span></div>
      <ul>${a.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <div class="alt-metrics">
        <span>대기 <b>${a.idlePh}</b>인시 <small>(−${g.stopAll.ph - a.idlePh})</small></span>
        <span>남는 위험: ${a.residual ? `<span class="warn">${esc(a.residual)}</span>` : '<b class="ok">없음</b>'}</span>
      </div>
      <button type="button" class="alt-apply" data-alt="${esc(a.id)}">이 대안 적용</button>
    </div>`).join('')}
  </div>`;
}

/* 대안 적용 · 되돌리기 */
const altHistory = [];
function applyAlt(altId) {
  altHistory.push(JSON.stringify({ tasks: TASKS, conflicts: CONFLICTS }));
  const nowProhibited = () => state.active.conflicts.filter((c) => c.severity === 'PROHIBITED').length;
  const before = nowProhibited();
  const r = applyAlternative(altId, TASKS, CONFLICTS);
  if (!r) { altHistory.pop(); return; }
  state.conflictId = null;
  setTime(state.timeIdx);   // 다시 계산 + 전체 갱신
  toast(`「${r.alt.title}」 적용 · 지금 금지 ${before}건 → ${nowProhibited()}건 · 대기 ${r.stopAll}인시 → ${r.alt.idlePh}인시`, true);
}
function undoAlt() {
  const h = altHistory.pop();
  if (!h) return;
  const d = JSON.parse(h);
  TASKS.splice(0, TASKS.length, ...d.tasks);
  CONFLICTS.splice(0, CONFLICTS.length, ...d.conflicts);
  setTime(state.timeIdx);
  toast(altHistory.length ? '한 단계 되돌렸습니다' : '처음 계획으로 되돌렸습니다', altHistory.length > 0);
}
let toastTimer = null;
function toast(msg, canUndo) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.innerHTML = `<span>${esc(msg)}</span>${canUndo ? '<button type="button" data-undo="1">되돌리기</button>' : ''}`;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 9000);
}
document.addEventListener('click', (e) => { if (e.target.closest('#toast [data-undo]')) undoAlt(); });

function renderIntro() {
  const lvName = state.level == null ? '전체 층' : (LEVEL_NAME[state.level] ?? `${state.level}층`);
  const conflicts = state.level == null ? state.active.conflicts
    : state.active.conflicts.filter((c) => (c.zone_ids || []).some((z) => zoneById.get(z)?.level === state.level));
  const sorted = [...conflicts].sort((a, b) => sevScore(b.severity) - sevScore(a.severity));
  return `<div class="intro">
    <h2>${esc(lvName)}</h2>
    <p><span class="t">${hhmm(state.t)}</span> 기준입니다. 구역을 누르면 작업과 충돌이 보입니다.</p>
    <h3>지금 걸린 충돌 ${sorted.length}건</h3>
    ${sorted.length ? sorted.map(conflictCard).join('') : '<div class="empty">이 시간에는 충돌이 없습니다.</div>'}
  </div>`;
}

function renderZoneDetail(zid) {
  const z = zoneById.get(zid);
  if (!z) return renderIntro();
  const tasks = tasksInZone(zid);
  const conflicts = conflictsInZone(zid);
  const crew = tasks.reduce((s, t) => s + (t.crew || 0), 0);
  const aboveIds = ZONES.filter((o) => (o.below || []).includes(zid)).map((o) => o.id);
  const belowIds = z.below || [];
  return `
    <button type="button" class="back" data-back="1">‹ 목록으로</button>
    <h2>${esc(z.name)}</h2>
    ${z.plain ? `<p class="plain">${esc(z.plain)}</p>` : ''}
    <div class="meta">
      <span class="chip">${esc(LEVEL_NAME[z.level] ?? z.level)}</span>
      ${z.side ? `<span class="chip">${esc(SIDE_NAME[z.side] || z.side)}</span>` : ''}
      ${z.cap ? `<span class="chip">정원 <b>${esc(z.cap)}</b>명</span>` : ''}
      ${z.confined ? `<span class="chip"><span class="danger">밀폐공간</span></span>` : ''}
    </div>

    <h3>지금 작업 ${tasks.length}건 · <b>${crew}</b>명 (<span class="t">${hhmm(state.t)}</span>)</h3>
    ${tasks.length ? tasks.map((t) => `<div class="card task${t.id === state.taskId ? ' on' : ''}" data-task="${esc(t.id)}" title="누르면 이 작업의 작업자만 보입니다">
        <div class="row">${companyChip(t.company_id)}${timeRange(t.start, t.end)}</div>
        <div class="title">${esc(t.title)}</div>
        <div class="sub">인원 <b>${t.crew ?? '-'}</b>명${(t.work_types || []).length ? ' · ' + esc(t.work_types.map((w) => WORK_TYPE_NAME[w] || w).join(', ')) : ''}</div>
      </div>`).join('') : '<div class="empty">이 시간에는 작업이 없습니다.</div>'}

    <h3>충돌 ${conflicts.length}건</h3>
    ${conflicts.length ? conflicts.map(conflictCard).join('') : '<div class="empty">충돌이 없습니다.</div>'}

    <h3>위층 구역</h3>
    <div class="linklist">${aboveIds.length ? aboveIds.map(zoneLink).join('') : '<span class="empty">없음</span>'}</div>
    <h3>아래층 구역</h3>
    <div class="linklist">${belowIds.length ? belowIds.map(zoneLink).join('') : '<span class="empty">없음</span>'}</div>
    ${(z.adj || []).length ? `<h3>옆 구역</h3><div class="linklist">${z.adj.map(zoneLink).join('')}</div>` : ''}
  `;
}

/* 구역별 시간대 안전 안내 (위험은 권한과 무관하게 모든 진행 작업 기준 — 안전 정보이므로) */
const guidanceOf = (zid) => (zid ? guidanceFor(zid, liveTasks(), ZONES, { start: DEMO.windowStart, end: DEMO.windowEnd }) : null);
function renderDetail() {
  let html;
  if (state.taskId) {
    const task = state.view.tasks.find((k) => k.id === state.taskId) || TASKS.find((k) => k.id === state.taskId);
    html = renderRightTask({ task, zones: ZONES, t: state.t, tasks: state.view.tasks,
      conflicts: state.view.conflicts.filter((c) => c.task_ids.includes(state.taskId)),
      guidance: guidanceOf(task?.zone_ids?.[0]), alternatives: ALTERNATIVES, role: state.role });
  } else if (state.zoneId) {
    html = renderRightZone({ zone: zoneById.get(state.zoneId), zones: ZONES, t: state.t, tasks: tasksInZone(state.zoneId),
      allTasks: state.view.tasks, conflicts: conflictsInZone(state.zoneId), alternatives: ALTERNATIVES, guidance: guidanceOf(state.zoneId),
      selectedTaskId: state.taskId, role: state.role, selectedConflictId: state.conflictId });
  } else {
    html = renderRightIntro({ title: state.role.id === 'PRIME' ? '전체' : `${state.role.name} 화면`, t: state.t, zones: ZONES,
      conflicts: state.active.conflicts, tasks: state.active.tasks, allTasks: state.view.tasks, alternatives: ALTERNATIVES, role: state.role, selectedConflictId: state.conflictId,
      violations: safeViolations(), pending: pendingVisible().length });
  }
  if (!state.taskId && !state.zoneId) html += placementGuideHtml();
  $('detailBody').innerHTML = html;
}

$('detailBody').addEventListener('click', (e) => {
  const ab = e.target.closest('[data-alt]');
  if (ab) { e.stopPropagation(); applyAlt(ab.dataset.alt); return; }
  const zl = e.target.closest('[data-zone]');
  if (zl) { selectZone(zl.dataset.zone); return; }
  const tc = e.target.closest('[data-task]');
  if (tc) { selectTask(tc.dataset.task); return; }
  const cc = e.target.closest('[data-conflict]');
  if (cc) { selectConflict(cc.dataset.conflict); return; }
  if (e.target.closest('[data-back]')) selectZone(null);
});
$('detailToggle').addEventListener('click', () => {
  const d = $('detail');
  d.classList.toggle('collapsed');
  $('detailToggle').setAttribute('aria-label', d.classList.contains('collapsed') ? '패널 펼치기' : '패널 접기');
  setTimeout(onResize, 220);
});

// ---------- 디테일 레이어 (구조물·장비·작업자·충돌 효과) ----------
// 모듈 하나가 없거나 오류가 나도 기본 화면은 그대로 동작하게 따로 불러옴
const extras = {};
async function loadExtras() {
  // 경로를 변수로 넘기면 Vite가 파일을 알아보지 못해 빌드 결과물에서 빠진다 → 경로마다 고정 문자열로 불러온다
  const MODULES = {
    './details.js': () => import('./details.js'), './equipment.js': () => import('./equipment.js'), './workers.js': () => import('./workers.js'),
    './effects.js': () => import('./effects.js'), './piping.js': () => import('./piping.js'), './look.js': () => import('./look.js'),
    './shell.js': () => import('./shell.js'), './siteprops.js': () => import('./siteprops.js'), './top.js': () => import('./top.js'),
    './barriers.js': () => import('./barriers.js'), './safezones.js': () => import('./safezones.js'), './banners.js': () => import('./banners.js'),
  };
  const tryImport = async (p) => { try { return await MODULES[p](); } catch (e) { console.warn('[scene3d] 모듈 불러오기 실패', p, e); return null; } };
  const tryBuild = (name, fn) => { try { extras[name] = fn(); } catch (e) { console.warn('[scene3d] 생성 실패', name, e); } };
  const [d, eq, wk, fx, pp, lk, sh, sp, tp] = await Promise.all(['./details.js', './equipment.js', './workers.js', './effects.js', './piping.js',
    './look.js', './shell.js', './siteprops.js', './top.js'].map(tryImport));
  if (lk) tryBuild('look', () => lk.buildLook({ scene, renderer, camera, furnace }));
  if (d) tryBuild('details', () => d.buildDetails(furnace));
  if (pp) tryBuild('piping', () => pp.buildPiping(furnace));
  if (sh) tryBuild('shell', () => sh.buildShell(furnace));
  if (sp) tryBuild('siteprops', () => sp.buildSiteProps(furnace));
  if (tp) tryBuild('top', () => tp.buildTop(furnace));
  if (eq) tryBuild('equipment', () => eq.buildEquipment(furnace, { tasks: TASKS }));
  if (wk) tryBuild('workers', () => wk.buildWorkers(furnace, { companies: COMPANIES, spots: extras.equipment?.spots || [] }));
  if (fx) tryBuild('effects', () => fx.buildEffects(furnace, { showBadges: false }));
  const br = await tryImport('./barriers.js');
  if (br) { tryBuild('barriers', () => br.buildBarriers(furnace)); tryBuild('compass', () => br.buildCompass(furnace)); }
  const sz = await tryImport('./safezones.js');
  if (sz) tryBuild('safezones', () => sz.buildSafeZones(furnace));
  const bn = await tryImport('./banners.js');
  if (bn) tryBuild('banners', () => bn.buildBanners({ container: wrap, camera, renderer, furnace, zones: ZONES, onZoneClick: (id) => selectZone(id) }));
  refresh();   // 배너가 생겼으면 구조물 위 라벨을 숨기도록 다시 그림
}
function syncExtras() {
  const { tasks, conflicts } = state.active;
  const t = state.t;
  const hl = state.conflictId ? CONFLICTS.find((c) => c.id === state.conflictId) : null;
  const call = (name, fn) => { try { if (extras[name]) fn(extras[name]); } catch (e) { console.warn('[scene3d]', name, e); } };
  const bars = state.barriers || barrierList(t);   // refresh()에서 계산한 그 시각 출입 제한
  call('equipment', (x) => x.setActive?.({ tasks, t }));
  call('workers', (x) => {
    x.setActive?.({ tasks: tasks.map((k) => ({ ...k, place_dirs: taskDirsAt(k, t) })), t });
    x.setAlert?.(state.violations.map((v) => v.taskId));
    const only = state.taskId ? [state.taskId] : hl ? hl.task_ids : null;
    if (x.setFilter) { x.setHighlight?.(null); x.setFilter(only); } else x.setHighlight?.(only);
  });
  call('effects', (x) => { x.setActive?.({ conflicts, tasks, t }); x.setSelected?.(state.conflictId); });
  for (const name of ['look', 'shell', 'siteprops', 'top', 'details']) call(name, (x) => x.setActive?.({ tasks, conflicts, t }));
  call('piping', (x) => {
    x.setActive?.({ tasks, conflicts, t });
    // 충돌을 고르면 그 작업들이 쓰는 계통(예: 질소) 배관만 또렷하게
    const sys = hl ? hl.task_ids.flatMap((id) => TASKS.find((k) => k.id === id)?.systems || [])[0] : null;
    x.highlightSystem?.(sys || null);
  });
  call('banners', (x) => {
    const byZone = new Map();
    for (const z of ZONES) {
      const ts = tasksInZone(z.id), cs = conflictsInZone(z.id);
      byZone.set(z.id, { name: z.name, crew: ts.length && ts.every((k) => k.crew == null) ? null : ts.reduce((a, k) => a + (k.crew || 0), 0), crewHidden: ts.some((k) => k.acc === 'limited'), taskCount: ts.length,
        worst: worstSeverity(z.id), topType: cs[0] ? cs[0].type : null });
    }
    x.setData({ byZone });
    x.setBarriers?.(bars);   // 배너에 빨간 「출입 금지 · HH:MM까지」 꼬리표 (권한과 무관하게 모두에게)
    const barZ = new Set(bars.map((b) => b.zoneId));
    const vis = ZONES.filter((z) => (state.level == null ? (byZone.get(z.id).taskCount || byZone.get(z.id).worst || barZ.has(z.id)) : z.level === state.level)).map((z) => z.id);
    x.setVisibleZones(state.focus ? [...new Set([...vis, ...state.focus.ids])].filter((id) => state.focus.ids.includes(id)) : vis);
    x.setFocus(state.focus ? { zoneId: state.focus.zoneId, relatedIds: state.focus.ids.filter((id) => id !== state.focus.zoneId) } : null);
    x.setEnabled(state.mode === '3d');
  });
  call('barriers', (x) => { x.set(bars); x.setNight?.(extras.look?.nightLevel?.() ?? 0); });
  call('safezones', (x) => {
    const zid = state.taskId ? (TASKS.find((k) => k.id === state.taskId)?.zone_ids || [])[0] : state.zoneId;
    if (!zid || state.mode !== '3d' || !zoneById.has(zid)) { x.clear(); return; }
    const live = liveTasks();
    const hz = hazardsFor(zid, live, ZONES, state.t);
    const slot = guidanceFor(zid, live, ZONES, { start: state.t, end: idxToIso(Math.min(STEPS, state.timeIdx + 1)) }).slots[0];
    if (!hz.length || !slot) { x.show({ zoneId: zid, hazards: [], danger: [], safe: [{ shape: 'all' }], labels: { safe: '안전 · 위층·주변 영향 없음' } }); return; }
    const where = [...new Set(slot.danger.map(describeArea))].join('·');
    x.show({ zoneId: zid, hazards: hz, danger: slot.danger, safe: slot.safe,
      labels: { danger: `위험 · ${where} ${hz[0].kind === 'DROP' ? '낙하' : hz[0].kind === 'GAS' ? '가스 유입' : '화기'}`,
        safe: slot.safe.length ? `안전 · ${slot.safe.map(describeArea).join('·')} 작업 가능` : '' } });
  });
  for (const name of Object.keys(extras)) call(name, (x) => x.refresh?.());
}

/* ---------- 방위별 출입 제한 → 안전띠·러버콘 ----------
   부모가 넘긴 제한(서버 금지 판정 또는 시안 zoneMap)과 규칙 엔진의 위험 영역(동서남북 4방위로 변환)을 합쳐 씀.
   방위: 남 φ=0(+z) · 동 π/2(+x) · 북 π(−z) · 서 3π/2(−x), 각 방위는 ±45° */
const DIRS = ['N', 'E', 'S', 'W'], DIR_PHI = { S: 0, E: Math.PI / 2, N: Math.PI, W: 1.5 * Math.PI }, DIR_KO = { N: '북쪽', E: '동쪽', S: '남쪽', W: '서쪽' };
const TAU2 = Math.PI * 2, angDiff = (a, b) => { const d = ((a - b) % TAU2 + TAU2) % TAU2; return d > Math.PI ? TAU2 - d : d; };
function quadrantsOf(area) {
  if (!area || area.shape === 'all') return { dirs: DIRS.slice() };
  if (area.shape === 'disc') return { dirs: [], center: (area.r1 ?? 0.45) };
  if (area.shape === 'sector') {   // 방위 중심이 부채꼴 안(±여유 15°)에 들면 그 방위는 위험
    const half = (area.width ?? 1) / 2 + Math.PI / 12;
    return { dirs: DIRS.filter((k) => angDiff(DIR_PHI[k], area.phi ?? 0) <= half) };
  }
  return { dirs: [] };   // ring(벽 쪽 띠)은 방위 제한 대신 안내 문구로
}
function barrierList(t) {
  const byZone = new Map();
  const add = (zid, dirs, center, until, reason, srcIds) => {
    if (!zoneById.has(zid) || (!dirs.length && !center)) return;
    const z = byZone.get(zid) || { zoneId: zid, blocked: new Set(), center: null, until, reason, sources: new Set() };
    (srcIds || []).forEach((id) => z.sources.add(id));
    dirs.forEach((k) => z.blocked.add(k));
    if (center) z.center = { r: Math.max(z.center?.r || 0, center) };
    if (until && (!z.until || until < z.until)) z.until = until;
    byZone.set(zid, z);
  };
  // 부모(서버 금지 판정·시안 zoneMap)가 넘긴 제한을 먼저 세우고, 브라우저 규칙의 위험 영역(낙하 중앙부 같은 방위 정보)을 보탠다.
  // 서버 판정은 구역 단위라 방위가 없고, 브라우저 규칙만으로는 서버가 금지한 구역을 빠뜨릴 수 있어서 둘을 합친다
  if (state.restrictions) {
    for (const r of state.restrictions) if (isActive(r, t)) r.zone_ids.forEach((zid) => add(zid, r.blocked, null, r.end, r.reason, r.source_ids));
  }
  {
    const live = liveTasks();
    for (const z of ZONES) for (const h of hazardsFor(z.id, live, ZONES, t)) {
      if (h.severity !== 'PROHIBITED' && h.kind !== 'DROP') continue;   // 출입 제한은 치명·낙하 위험에만
      const q = quadrantsOf(h.area);
      add(z.id, q.dirs, q.center, h.end, h.text, [h.fromTaskId]);
    }
  }
  return [...byZone.values()].map((z) => {
    const blocked = DIRS.filter((k) => z.blocked.has(k));
    const where = blocked.length === 4 ? '전 구역' : blocked.map((k) => DIR_KO[k]).join('·');
    return { zoneId: z.zoneId, blocked, center: z.center, until: hhmm(z.until || ''),
      label: `${where || '중앙부'} · ${hhmm(z.until || '')}까지`, reason: z.reason, sources: [...z.sources] };
  });
}

/* ---------- 출입 제한 위반 → 긴급 알림 · 시정 명령 ----------
   작업 방위(task.sectors 시간대별, 없으면 work_area)가 그 시각 막힌 방위와 겹치면 위반.
   제한을 만든 원인 작업 자신은 제외. 알림은 원청 관리자와 그 협력사(책임자)에게만 보인다. */
const sliceTimes = (a, b) => { const out = []; for (let m = isoToIdx(a); m < isoToIdx(b); m += 1) out.push(idxToIso(m)); return out; };
function taskDirsAt(task, t) {
  const o = task.place_override;
  if (o && t >= o.from) return o.dirs;
  const seg = (task.sectors || []).find((s) => s.start <= t && t < s.end);
  if (seg) return seg.dirs.length && seg.dirs.length < 4 ? seg.dirs : null;
  if (task.work_area) { const q = quadrantsOf(task.work_area).dirs; return q.length && q.length < 4 ? q : null; }
  return null;   // 어디서 일하는지 모르면 판정하지 않음
}
/* 그 시각 그 구역에서 이 작업에게 막힌 방위 (원인 작업 자신의 제한은 뺌) */
function blockedFor(task, zid, t, list) {
  const b = (list || barrierList(t)).find((x) => x.zoneId === zid);
  if (!b || (b.sources || []).includes(task.id)) return null;
  return b;
}
function computeViolations(t = state.t) {
  const list = barrierList(t), out = [];
  for (const task of state.active.tasks) {
    if (task.acc === 'limited') continue;   // 다른 업체 작업은 그 업체·원청이 처리
    const dirs = taskDirsAt(task, t);
    if (!dirs) continue;
    for (const zid of task.zone_ids || []) {
      const b = blockedFor(task, zid, t, list);
      const hit = b ? dirs.filter((d) => b.blocked.includes(d)) : [];
      if (!hit.length) continue;
      out.push({ taskId: task.id, company: task.company_id, title: task.title, zone: zid, zoneName: zname(zid), dirs, hit,
        where: `${zname(zid)} ${hit.map((d) => DIR_KO[d]).join('·')}`, until: b.until, cause: b.reason, best: bestDirs(task, zid, t) });
    }
  }
  return out;
}
/* 남은 작업 시간 동안 방위별 금지 시간(분) → 금지 시간이 가장 적은 방위 추천 */
function bestDirs(task, zid, from) {
  const mins = { N: 0, E: 0, S: 0, W: 0 };
  for (const tt of sliceTimes(from > task.start ? from : task.start, task.end < DEMO.windowEnd ? task.end : DEMO.windowEnd)) {
    const b = blockedFor(task, zid, tt);
    if (b) b.blocked.forEach((d) => { mins[d] += STEP_MIN; });
  }
  const order = DIRS.slice().sort((a, b) => mins[a] - mins[b]);
  return { mins, best: order[0], bestMin: mins[order[0]] };
}
/* 작업 위치 가이드: 설계된 일정 기준, 계획 방위의 금지 시간 vs 금지 시간이 가장 적은 방위 */
function placementGuide() {
  const inDay = (k) => k.start < DEMO.windowEnd && k.end > DEMO.windowStart;
  return state.view.tasks.filter((k) => inDay(k) && k.acc !== 'limited' && (k.zone_ids || []).length).map((k) => {
    const zid = k.zone_ids[0], plan = taskDirsAt(k, k.start > DEMO.windowStart ? k.start : DEMO.windowStart);
    const r = bestDirs(k, zid, DEMO.windowStart);
    const planMin = plan ? Math.max(...plan.map((d) => r.mins[d])) : null;
    return { taskId: k.id, title: k.title, company: k.company_id, zone: zname(zid), plan, planMin, ...r };
  }).filter((g) => g.planMin === null ? g.bestMin < Math.max(...Object.values(g.mins)) : g.planMin > g.bestMin)
    .sort((a, b) => (b.planMin ?? 0) - (a.planMin ?? 0));
}
const dirsKo = (ds) => (ds || []).map((d) => DIR_KO[d]).join('·');
function placementGuideHtml() {
  const g = placementGuide();
  if (!g.length) return '';
  return `<div class="vg-guide"><h3>작업 위치 가이드 <small>금지 시간이 가장 적은 방위</small></h3>
    ${g.slice(0, 8).map((x) => `<button type="button" class="vg-row" data-task="${esc(x.taskId)}">
      <span class="vg-t">${esc(coLabel(x.company))} · ${esc(x.title)} <small>${esc(x.zone)}</small></span>
      <span class="vg-m">${x.plan ? `지금 계획 ${esc(dirsKo(x.plan))} <b class="bad">금지 ${x.planMin}분</b> → ` : ''}추천 <b class="good">${DIR_KO[x.best]}</b> <small>금지 ${x.bestMin}분</small></span>
    </button>`).join('')}</div>`;
}
const coLabel = (id) => (/^[A-Z]$/.test(id) ? `${id}사` : String(id || '').replace(/^가상-/, ''));
const canCorrect = (v) => state.role.id === 'PRIME' || (state.role.id === v.company && state.role.level !== 'worker');
const seesViolation = (v) => state.role.id === 'PRIME' || state.role.id === v.company;

/* 긴급 알림 띠 + 부모(시안)에 알림 전달 */
const sentViolations = new Set();
function updateViolations() {
  state.violations = computeViolations(state.t);
  const mine = state.violations.filter(seesViolation);
  let bar = document.getElementById('vbar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'vbar'; bar.className = 'vbar'; $('view').appendChild(bar); }
  bar.hidden = !mine.length || state.mode !== '3d';
  bar.innerHTML = mine.length ? `<div class="vbar-h">⚠ 긴급 · 출입 제한 구역 안에서 작업 중 <b>${mine.length}</b>건 <small>사고 전에 바로 시정하세요</small></div>
    ${mine.map((v, i) => `<div class="vbar-r"><span><b>${esc(coLabel(v.company))}</b> ${esc(v.title)} — <span class="kw">${esc(v.where)}</span> 금지 구역 <span class="t">${esc(v.until)}</span>까지 <small>(${esc(v.cause || '')})</small></span>
      ${canCorrect(v) ? `<button type="button" class="vbar-btn" data-vio="${i}">시정 명령</button>` : '<span class="vbar-wait">책임자·원청 조치 대기</span>'}</div>`).join('')}` : '';
  bar._list = mine;
  const fresh = state.violations.filter((v) => !sentViolations.has(v.taskId + '|' + v.zone + '|' + v.until));
  fresh.forEach((v) => sentViolations.add(v.taskId + '|' + v.zone + '|' + v.until));
  if (fresh.length) post({ type: 'violation', items: fresh.map(({ taskId, zone, where, until, cause, company }) => ({ taskId, zone, where, until, cause, company })) });
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('#vbar [data-vio]');
  if (b) openCorrection(document.getElementById('vbar')._list[+b.dataset.vio]);
});

/* 시정 명령 창: 위반 내용 + 방위별 금지 시간 + [추천 방위로 이동] [제한 해제까지 중지] */
function openCorrection(v) {
  if (!v) return;
  let m = document.getElementById('cmodal');
  if (!m) { m = document.createElement('div'); m.id = 'cmodal'; m.className = 'cmodal'; document.body.appendChild(m); }
  const r = v.best, ok = canCorrect(v);
  m.innerHTML = `<div class="cm-box" role="dialog" aria-label="시정 명령">
    <div class="cm-h">⚠ 출입 제한 구역 안 작업 — 시정 명령</div>
    <div class="cm-b"><b>${esc(coLabel(v.company))} · ${esc(v.title)}</b><br>
      지금 작업 위치 <b>${esc(v.zoneName)} ${esc(dirsKo(v.dirs))}</b> 중 <span class="kw">${esc(dirsKo(v.hit))}</span>이(가) <span class="t">${esc(v.until)}</span>까지 출입 제한입니다.<br>
      <small>원인: ${esc(v.cause || '상부 작업')}</small></div>
    <table class="cm-t"><tr><th>방위</th>${DIRS.map((d) => `<th>${DIR_KO[d]}</th>`).join('')}</tr>
      <tr><td>남은 작업 중 금지 시간</td>${DIRS.map((d) => `<td class="${d === r.best ? 'good' : r.mins[d] ? 'bad' : ''}">${r.mins[d]}분</td>`).join('')}</tr></table>
    <div class="cm-a">
      <button type="button" class="cm-go" data-act="move" ${ok ? '' : 'disabled'}>추천 위치 ${DIR_KO[r.best]}으로 이동 지시 <small>(금지 ${r.bestMin}분)</small></button>
      <button type="button" class="cm-stop" data-act="stop" ${ok ? '' : 'disabled'}>${esc(v.until)}까지 작업 중지</button>
      <button type="button" class="cm-x" data-act="close">닫기</button>
    </div>${ok ? '' : '<div class="cm-n">협력사 파트장 또는 원청 관리자만 시정 명령을 내릴 수 있습니다</div>'}</div>`;
  m.hidden = false;
  m.onclick = (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (e.target === m || a === 'close') { m.hidden = true; return; }
    if (a === 'move' || a === 'stop') { issueCorrection(v, a); m.hidden = true; }
  };
}
/* 내린 시정 명령은 기억해 두고, 부모가 데이터를 다시 보내도(setData) 같은 작업에 다시 적용 */
const corrections = [];
function applyCorrection(task, rec) {
  if (rec.action === 'move') task.place_override = { dirs: [rec.dir], from: rec.at };
  else if (!(task.pauses || []).some(([a, b]) => a === rec.at && b === rec.untilIso)) task.pauses = [...(task.pauses || []), [rec.at, rec.untilIso]];
}
function issueCorrection(v, action) {
  const task = TASKS.find((k) => k.id === v.taskId);
  if (!task) return;
  const untilIso = `${state.t.slice(0, 11)}${v.until}` > state.t ? `${state.t.slice(0, 11)}${v.until}` : state.t;
  const rec = { at: state.t, taskId: task.id, action, dir: v.best.best, dirName: DIR_KO[v.best.best], until: v.until, untilIso, where: v.where, by: { id: state.role.id, level: state.role.level } };
  applyCorrection(task, rec);
  corrections.unshift(rec);
  post({ type: 'correction', ...rec });
  setTime(state.timeIdx);   // 진행 작업·위반을 다시 계산
  toast(action === 'move' ? `시정 명령 — ${coLabel(task.company_id)} ${task.title}: ${DIR_KO[v.best.best]}으로 이동` : `시정 명령 — ${coLabel(task.company_id)} ${task.title}: ${v.until}까지 작업 중지`);
}

/* 집중 보기: 고른 구역 + 그 구역과 지금 충돌로 엮인 구역만 남기고 나머지는 투명하게 */
function relatedZones(zid) {
  const ids = new Set([zid]);
  for (const c of state.active.conflicts) if ((c.zone_ids || []).includes(zid)) c.zone_ids.forEach((z) => ids.add(z));
  return [...ids];
}
function applyFocus() {
  let f = null;
  if (state.taskId) {
    const k = TASKS.find((x) => x.id === state.taskId);
    const ids = (k?.zone_ids || []).filter((z) => zoneById.has(z));
    if (ids.length) f = { zoneId: ids[0], ids };
  } else if (state.conflictId) {
    const c = CONFLICTS.find((k) => k.id === state.conflictId);
    if (c) f = { zoneId: c.zone_ids[0], ids: [...c.zone_ids] };
  } else if (state.zoneId) {
    f = { zoneId: state.zoneId, ids: relatedZones(state.zoneId) };
  }
  state.focus = f;
  furnace.focusZones?.(f ? f.ids : null);
  $('btnExitFocus').hidden = !f;   // 집중 보기 중임을 알리고 바로 빠져나오게
}
function frameZones(ids) {
  const box = new THREE.Box3();
  ids.forEach((id) => box.expandByPoint(furnace.zoneAnchor(id)));
  const c = box.getCenter(new THREE.Vector3());
  const r = Math.max(28, box.getSize(new THREE.Vector3()).length() * 0.9);
  const dir = camera.position.clone().sub(controls.target).normalize();
  flyTo(c.clone().addScaledVector(dir, r * 2.2), c);
}

// ---------- 권한 · 긴급 변경 승인 ----------
const zname = (id) => zoneById.get(id)?.name || id;
function affectedCompanies(task) {
  const inf = influenceZones(task, ZONES);
  const s = new Set();
  for (const k of liveTasks()) if (k.start < task.end && task.start < k.end && k.zone_ids.some((z) => inf.has(z))) s.add(k.company_id);
  s.delete(task.company_id);
  return [...s];
}
function previewRisks(change) {
  const live = liveTasks();
  const before = new Set(detectConflicts(live, ZONES, { seed: CONFLICTS }).map((c) => c.id));
  return detectConflicts([...live, { ...change.task, status: 'active' }], ZONES, { seed: CONFLICTS })
    .filter((c) => !before.has(c.id)).map((c) => ({ severity: c.severity, title: c.title, reason: c.reason }));
}
function previewGuidance(change) {
  const live = liveTasks(), task = { ...change.task, status: 'active' };
  const win = { start: task.start, end: task.end };
  return [...influenceZones(task, ZONES)].filter((z) => !task.zone_ids.includes(z) && zoneById.has(z)).map((z) => {
    const a = guidanceFor(z, live, ZONES, win).slots[0], b = guidanceFor(z, [...live, task], ZONES, win).slots[0];
    return a && b && (a.level !== b.level || a.text !== b.text) ? `${zname(z)} ${hhmm(task.start)}–${hhmm(task.end)}: ${a.level} → ${b.level} · ${b.text.replace(/^\w+: /, '')}` : null;
  }).filter(Boolean);
}
let simN = 0;
function pushChange(change) {
  const ch = { ...change, task: change.task ? { ...change.task, status: 'pending' } : null, status: 'pending' };
  if (ch.task && !ch.affected_company_ids) {
    // 영향 범위 안 업체 + 승인하면 새로 생길 충돌의 상대 업체 (그 업체 파트장도 알림·승인 가능)
    const live = liveTasks(), before = new Set(detectConflicts(live, ZONES, { seed: CONFLICTS }).map((c) => c.id));
    const fresh = detectConflicts([...live, { ...ch.task, status: 'active' }], ZONES, { seed: CONFLICTS }).filter((c) => !before.has(c.id));
    ch.affected_company_ids = [...new Set([...affectedCompanies(ch.task), ...fresh.flatMap((c) => c.company_ids)])].filter((id) => id !== ch.task.company_id);
  }
  if (ch.task && !TASKS.some((k) => k.id === ch.task.id)) TASKS.push(ch.task);
  session?.pushChange(ch);
  refresh();
}
const session = buildSession({
  topbar: document.querySelector('.topbar'), zones: ZONES, companies: COMPANIES,
  onRoleChange: (role) => {
    state.role = role; state.taskId = null; state.conflictId = null; state.zoneId = null;
    setTime(state.timeIdx);
    toast(`보는 사람: ${role.name} — 권한 안의 데이터만 보입니다`);
    if (API_MODE) {
      // 새로고침해도 같은 사람으로 열리게 주소에 남기고, 그 사람의 권한으로 서버에서 다시 받는다
      const q = new URLSearchParams(location.search);
      if (role.id === 'PRIME') { q.delete('role'); q.delete('level'); } else { q.set('role', role.id); q.set('level', role.level); }
      q.set('date', DEMO.date);
      history.replaceState(null, '', `${location.pathname}?${q}`);
      void syncFromApi(true);
    }
  },
  onSimulate: API_MODE ? undefined : () => {
    simN += 1;
    const c = JSON.parse(JSON.stringify(SAMPLE_CHANGE));
    if (simN > 1) { c.id += '-' + simN; c.task.id += '-' + simN; }
    pushChange(c);
  },
  onDecision: (change, decision, role) => {
    const task = TASKS.find((k) => k.id === change.task?.id);
    if (!task) return;
    task.status = decision === 'approved' ? 'active' : 'rejected';
    task.approved_by = { role: role.id, name: role.name, at: state.t };
    post({ type: 'decision', changeId: change.id, taskId: task.id, decision, by: { id: role.id, level: role.level } });
    if (decision === 'approved') {
      // 승인되면 재판정 → 영향받는 아래 구역의 위험/안전 안내로 바로 이동
      const below = [...influenceZones(task, ZONES)].find((z) => !task.zone_ids.includes(z) && liveTasks().some((k) => k.zone_ids.includes(z) && k.start < task.end && task.start < k.end));
      setTime(task.start);
      if (below) selectZone(below);
      toast(`승인 — 「${task.title}」 착수 허용 · 규칙 재판정, 안전 안내가 바뀌었습니다`);
    } else {
      refresh();
      toast(`반려 — 「${task.title}」 착수 불가`);
    }
  },
  previewRisks, previewGuidance,
});
state.role = session.role || state.role;

// ---------- 전체 갱신 ----------
function refresh() {
  state.barriers = barrierList(state.t);   // 한 번만 계산 → 안전띠(barriers)·배너(banners)·3D 라벨·왼쪽 목록
  applyFocus();
  updateViolations();
  syncExtras();
  applyZoneStates();
  updateLabels();
  renderSummary();
  renderFloorList();
  renderDetail();
  if (state.mode === '2d') renderPlan();
  updateProblemCallout();
}

// ---------- 공개 동작 ----------
function selectZone(zoneId) {
  state.zoneId = zoneId && zoneById.has(zoneId) ? zoneId : null;
  state.taskId = null;
  state.conflictId = null;
  $('mode2d').disabled = !state.zoneId && state.level == null;
  if (state.zoneId) $('detail').classList.remove('collapsed');
  refresh();
  if (state.zoneId && state.mode === '3d') frameZones(state.focus ? state.focus.ids : [state.zoneId]);
  post({ type: 'select', taskId: null, zoneId: state.zoneId });
}

/* 작업 선택 (나중에 백엔드 작업 id로도 호출): 그 작업 구역에 집중하고 그 작업의 작업자만 보임. 같은 작업 다시 고르면 해제 */
function selectTask(taskId) {
  state.taskId = state.taskId === taskId || !taskId ? null : taskId;
  state.conflictId = null;
  applyFocus();
  syncExtras();
  applyZoneStates();
  renderDetail();
  if (state.mode === '2d') renderPlan();
  updateProblemCallout();
  if (state.focus && state.mode === '3d') frameZones(state.focus.ids);
  post({ type: 'select', taskId: state.taskId, zoneId: state.zoneId });
}

function selectConflict(conflictId) {
  // 같은 충돌 다시 누르면 해제
  state.taskId = null;
  state.conflictId = state.conflictId === conflictId ? null : conflictId;
  applyFocus();
  syncExtras();
  updateLabels();
  if (state.focus && state.mode === '3d') frameZones(state.focus.ids);
  applyZoneStates();
  renderDetail();
  if (state.mode === '2d') renderPlan();
  updateProblemCallout();
}

function selectLevel(level) {
  state.level = level == null ? null : Number(level);
  state.taskId = null;
  state.zoneId = null;
  state.conflictId = null;
  furnace.isolateLevel(state.level);
  updateLabelPositions();
  $('mode2d').disabled = state.level == null;
  $('mode2d').title = state.level == null ? '층을 먼저 고르세요' : '';
  if (state.level == null) {
    if (state.mode === '2d') setMode('3d');
    flyTo(HOME.pos, HOME.target);
  } else if (state.mode === '3d') {
    frameLevel(state.level);
  }
  refresh();
}

function setTime(v) {
  // 인덱스(0..STEPS) 또는 'YYYY-MM-DDTHH:MM'
  const idx = typeof v === 'string' ? isoToIdx(v) : Math.max(0, Math.min(STEPS, Math.round(v)));
  state.timeIdx = idx;
  state.t = idxToIso(idx);
  state.active = computeActive(state.t);
  $('time').value = idx;
  $('timeLabel').textContent = hhmm(state.t) + (state.t.slice(0, 10) !== DEMO.date ? ' (다음날)' : '');
  refresh();
}

function setMode(mode) {
  if (mode === '2d' && state.level == null && !state.zoneId) return;   // 층이나 구역을 골라야 도면을 그림
  state.mode = mode === '2d' ? '2d' : '3d';
  const is2d = state.mode === '2d';
  $('mode3d').classList.toggle('active', !is2d);
  $('mode2d').classList.toggle('active', is2d);
  $('canvasWrap').hidden = is2d;
  $('planWrap').hidden = !is2d;
  $('explodeWrap').style.visibility = is2d ? 'hidden' : '';
  $('stageHint').textContent = is2d ? '도면의 구역을 누르면 자세히 보입니다' : '구역을 누르면 오른쪽에 자세히 보입니다';
  updateViolations();
  updateProblemCallout();
  if (is2d) renderPlan();
  else { if (plan) { plan.destroy?.(); plan = null; } onResize(); }
  updateLabels();
}

// ---------- 입력 연결 ----------
$('mode3d').addEventListener('click', () => setMode('3d'));
$('mode2d').addEventListener('click', () => setMode('2d'));
$('explode').addEventListener('input', (e) => {
  state.explode = Number(e.target.value) / 100;
  furnace.setExplode(state.explode);
  updateLabelPositions();
  for (const x of Object.values(extras)) { try { x.refresh?.(); } catch (err) { console.warn('[scene3d]', err); } }
});
$('time').max = STEPS;
$('time').addEventListener('input', (e) => setTime(Number(e.target.value)));
$('btnNow').addEventListener('click', () => setTime(NOW_IDX));
$('btnExitFocus').addEventListener('click', () => {
  state.taskId = null; state.conflictId = null;
  selectZone(null);
  flyTo(HOME.pos, HOME.target);
});

// 전체 화면: 버튼 · F 키 · 주소 ?full=1
function setFull(on) {
  if (on && state.mode === '2d') setMode('3d');
  document.body.classList.toggle('full', on);
  try {
    if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  } catch (e) { /* 브라우저가 막으면 화면 배치만 바꿈 */ }
  setTimeout(onResize, 50);
}
$('btnFull').addEventListener('click', () => setFull(true));
$('btnFullExit').addEventListener('click', () => setFull(false));
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('full')) setFull(false); });
document.addEventListener('keydown', (e) => {
  if (e.target.matches?.('input, textarea')) return;
  if (e.key === 'f' || e.key === 'F') setFull(!document.body.classList.contains('full'));
  if (e.key === 'Escape' && document.body.classList.contains('full')) setFull(false);
});
if (new URLSearchParams(location.search).get('full') === '1') document.body.classList.add('full');

// 재생: 1초에 30분
let playTimer = null;
$('play').addEventListener('click', () => {
  state.playing = !state.playing;
  $('play').classList.toggle('on', state.playing);
  $('play').textContent = state.playing ? '❚❚' : '▶';
  $('play').setAttribute('aria-label', state.playing ? '멈춤' : '재생');
  clearInterval(playTimer);
  if (state.playing) {
    playTimer = setInterval(() => setTime(state.timeIdx >= STEPS ? 0 : state.timeIdx + 1), 1000);
  }
});

// 눈금 + "지금" 표시
function buildTicks() {
  const box = $('ticks');
  box.innerHTML = '';
  for (let i = 0; i <= STEPS; i += 6) { // 3시간마다
    const s = document.createElement('span');
    s.style.left = `${(i / STEPS) * 100}%`;
    s.textContent = hhmm(idxToIso(i));
    box.appendChild(s);
  }
  $('nowMarker').style.left = `${(NOW_IDX / STEPS) * 100}%`;
}

// 범례 색
for (const el of document.querySelectorAll('.sw[data-sev]')) {
  const s = SEV[el.dataset.sev];
  if (s) el.style.background = s.color;
}
for (const el of document.querySelectorAll('[data-label]')) {
  const s = SEV[el.dataset.label];
  if (s) el.textContent = `${s.mark} ${s.label}`;
}

// ---------- 클릭 선택 (레이캐스트) ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 5) return; // 드래그(회전)는 무시
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  // 충돌 배지(효과 레이어)를 먼저 확인
  const badge = raycaster.intersectObjects(extras.effects?.pickables || [], false).find((h) => isVisibleDeep(h.object));
  if (badge?.object.userData.conflictId) { selectConflict(badge.object.userData.conflictId); return; }
  const hits = raycaster.intersectObjects(furnace.pickables || [], true);
  for (const h of hits) {
    let o = h.object;
    if (!isVisibleDeep(o)) continue;
    while (o && !o.userData?.zoneId) o = o.parent;
    if (o) { selectZone(o.userData.zoneId); return; }
  }
  // 빈 곳 클릭: 집중 보기 해제
  if (state.conflictId) selectConflict(state.conflictId);
  else if (state.taskId) selectTask(null);
  else if (state.zoneId) selectZone(null);
});
function isVisibleDeep(o) {
  for (let p = o; p; p = p.parent) if (p.visible === false) return false;
  return true;
}

// ---------- 크기 대응 ----------
function onResize() {
  const w = wrap.clientWidth || 1;
  const h = wrap.clientHeight || 1;
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
new ResizeObserver(onResize).observe(wrap);

// ---------- 렌더 루프 ----------
const clock = new THREE.Clock();
function animate(now) {
  requestAnimationFrame(animate);
  stepTween(now ?? performance.now());
  controls.update();
  const sec = clock.getElapsedTime();
  furnace.update?.(sec);
  for (const x of Object.values(extras)) { try { x.update?.(sec); } catch (e) { /* 한 프레임 오류는 무시 */ } }
  if (state.mode === '3d') {
    updateLabelPositions(); // 펼치기/분리 애니메이션 따라감
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    try { extras.banners?.update?.(); } catch (e) { /* 무시 */ }
  }
}

// ---------- 시작 ----------
buildFloorList();
buildTicks();
onResize();
updateLabelPositions();
setTime(NOW_IDX);
requestAnimationFrame(animate);
loadExtras();

/* ---------- 단독 실행 + 서버: 보는 사람의 권한으로 다시 받기 ----------
   역할을 바꿀 때(force)와 POLL_MS 마다. 다른 화면에서 계획서 제출·조정·공유가 일어나면 바뀐 경우에만 다시 그린다 */
let apiSig = BOOT?.sig || '', apiBusy = false;
async function syncFromApi(force = false) {
  if (!API_MODE || apiBusy || (!force && document.hidden)) return;
  apiBusy = true;
  try {
    const contractor = state.role?.id && state.role.id !== 'PRIME' ? state.role.id : null;
    const { data, sig } = await loadView(contractor, BOOT.companies);
    if (force || sig !== apiSig) { apiSig = sig; setData(data); }
  } catch (e) {
    console.warn('[scene3d] 서버 데이터 다시 받기 실패', e);
  } finally {
    apiBusy = false;
  }
}
// 주소의 ?role= 로 열면 bootFromApi 가 처음부터 그 사람 범위로 받았다
if (API_MODE) setInterval(() => void syncFromApi(), POLL_MS);

// 통합/테스트용
/* 프론트 웹페이지 연동: 작업 데이터를 넘기면 위치별 목록·판정·3D가 다시 그려짐 */
function setData({ companies, tasks, conflicts, restrictions } = {}) {
  if (Array.isArray(conflicts)) state.externalConflicts = true;
  if (restrictions !== undefined) state.restrictions = Array.isArray(restrictions) ? restrictions : null;
  if (companies) { COMPANIES.splice(0, COMPANIES.length, ...companies); companyById.clear(); COMPANIES.forEach((c) => companyById.set(c.id, c)); }
  if (tasks) {
    TASKS.splice(0, TASKS.length, ...tasks.map((k) => ({ ...k })));
    for (const rec of corrections) { const k = TASKS.find((x) => x.id === rec.taskId); if (k) applyCorrection(k, rec); }
  }
  if (tasks || conflicts) CONFLICTS.splice(0, CONFLICTS.length, ...(conflicts || []));
  state.taskId = null; state.conflictId = null;
  setTime(state.timeIdx);
}
function setRole(role) { session.setRole(role); state.role = session.role || role; setTime(state.timeIdx); }
/* ---------- iframe 연동: 부모 페이지(hansotbap)와 postMessage ----------
   받는 것 (source:'hansotbap'):
     { type:'data', tasks, conflicts? }   hansotbap API 모양 그대로 (adapter.js가 변환)
     { type:'scene3dData', tasks, conflicts?, companies? }  이미 scene3d 모양
     { type:'role', role: ViewerRole }    { kind:'prime' } | { kind:'contractor', contractor, level? }
     { type:'selectTask', taskId } · { type:'time', iso } · { type:'change', change }
   보내는 것 (source:'scene3d'): ready · select{taskId,zoneId} · decision{changeId,taskId,decision,by} */
function post(msg) { try { if (window.parent !== window) window.parent.postMessage({ source: 'scene3d', ...msg }, location.origin); } catch (e) { /* 단독 실행이면 무시 */ } }
window.addEventListener('message', (e) => {
  const m = e.data;
  if (e.origin !== location.origin || !m || m.source !== 'hansotbap') return;   // 같은 사이트(/scene3d)에서 띄운 경우만
  try {
    if (m.type === 'data') setData(fromHansotbap(m));
    else if (m.type === 'scene3dData') setData(m);
    else if (m.type === 'role') setRole(roleFrom(m.role));
    else if (m.type === 'selectTask') selectTask(m.taskId);
    else if (m.type === 'time') setTime(m.iso);
    else if (m.type === 'change') pushChange(m.change);
  } catch (err) { console.warn('[scene3d] 메시지 처리 실패', m.type, err); }
});
const dataUrl = new URLSearchParams(location.search).get('data');
if (dataUrl) fetch(dataUrl).then((r) => r.json()).then(setData).catch((e) => console.warn('[scene3d] 데이터 불러오기 실패', e));
post({ type: 'ready', version: 2 });
window.scene3d = { computeViolations, placementGuide, issueCorrection, barrierList, fromHansotbap, setData, setRole, pushChange, session, selectTask, applyAlt, undoAlt, selectZone, selectLevel, setTime, setMode, selectConflict, state, furnace, extras, camera, controls };
