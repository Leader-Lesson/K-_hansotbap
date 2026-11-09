// 한솥밥 · 고로 3D / 단면도 앱 셸
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

import { buildFurnace } from './furnace.js';
import { renderFloorPlan } from './plan2d.js';
import { SEV, LEVEL_NAME, WORK_TYPE_NAME, TYPE_NAME, fmtTime, fmtDateTime } from './theme.js';

const SIDE_NAME = { in: '노 내부', out: '외부 작업대', aux: '부대설비' };
import { ZONES, COMPANIES, TASKS, CONFLICTS, DEMO, SAMPLE_CHANGE } from './data.js';
import { detectConflicts, filterForRole, hazardsFor, guidanceFor, influenceZones, describeArea } from './rules.js';
import { renderLeft, renderRightIntro, renderRightZone, renderRightTask } from './panels.js';
import { buildSession } from './session.js';
import { fromHansotbap, roleFrom } from './adapter.js';
import { ALTERNATIVES, ALT_GROUP_NOTE, applyAlternative } from './alternatives.js';

// ---------- 공통 유틸 ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const hhmm = (iso) => (fmtTime ? fmtTime(iso) : String(iso).slice(11, 16));

const SEV_ORDER = ['PROHIBITED', 'CONDITIONAL', 'DEFECT'];
const sevScore = (s) => SEV[s]?.score ?? 0;

const zoneById = new Map(ZONES.map((z) => [z.id, z]));
const companyById = new Map(COMPANIES.map((c) => [c.id, c]));
const taskById = new Map(TASKS.map((t) => [t.id, t]));

// 삽입(embed) 모드 · 날짜 지정: ?embed=1&date=2027-01-21 (hansotbap 프론트 탭 안 iframe)
const QS = new URLSearchParams(location.search);
const EMBED = QS.get('embed') === '1';
if (/^\d{4}-\d{2}-\d{2}$/.test(QS.get('date') || '')) {
  const d = QS.get('date'), n = new Date(d + 'T00:00');
  n.setDate(n.getDate() + 1);
  Object.assign(DEMO, { date: d, windowStart: d + 'T07:00', windowEnd: toIso(n).slice(0, 10) + 'T07:00', now: QS.get('now') || d + 'T10:00' });
}
if (EMBED) document.body.classList.add('embed');
{ // 상단 날짜 표시 (공정 시작 2026-11-12 = D1)
  const dd = new Date(DEMO.date + 'T00:00'), day = Math.round((dd - new Date('2026-11-12T00:00')) / 86400000) + 1;
  const el = document.querySelector('.top-mid .date');
  if (el) el.innerHTML = `${DEMO.date} (${'일월화수목금토'[dd.getDay()]}) <b>D${day}</b>`;
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
};

// ---------- 시간별 활성 데이터 ----------
/* pauses: 대안 적용으로 잠시 멈추는(다른 일로 돌리는) 시간대 */
const isActive = (item, t) => item.start <= t && t < item.end && !(item.pauses || []).some(([s, e]) => s <= t && t < e);

/* 승인된(진행 가능한) 작업 — 승인 대기·반려는 착수 불가라 판정·3D에서 뺌 */
const liveTasks = () => TASKS.filter((k) => (k.status || 'active') === 'active');
/* 전체 판정(규칙 + 시연 고정값) → 보는 사람 권한으로 거름 */
function computeView() {
  const live = liveTasks();
  const conflicts = detectConflicts(live, ZONES, { seed: CONFLICTS });
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
    // 전체 보기: 사람 있거나 충돌 있는 구역만, 층 선택: 그 층 전부
    const visible = !extras.banners && state.mode === '3d' && (state.level == null
      ? (crew > 0 || sev || sel)
      : z.level === state.level);
    obj.visible = !!visible;
    el.style.display = visible ? '' : 'none';
    if (!visible) continue;
    el.className = 'zlabel' + (sev ? ' sev' : '') + (sel ? ' sel' : '');
    el.style.borderColor = sev && !sel ? SEV[sev].color : '';
    el.innerHTML = `${sev ? `<span style="color:${SEV[sev].color}">${SEV[sev].mark}</span> ` : ''}${esc(z.name)}`
      + (crew ? `<span class="crew">${crew}명</span>` : '');
  }
}

// ---------- 색칠 / 강조 ----------
function applyZoneStates() {
  const hl = state.conflictId ? CONFLICTS.find((c) => c.id === state.conflictId) : null;
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
    });
  } catch (e) {
    console.error(e);
    $('planWrap').innerHTML = `<div class="error-box">도면을 그리지 못했습니다: ${esc(e.message)}</div>`;
  }
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
    selectedZoneId: state.zoneId, selectedTaskId: state.taskId, t: state.t,
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
      conflicts: conflictsInZone(state.zoneId), alternatives: ALTERNATIVES, guidance: guidanceOf(state.zoneId),
      selectedTaskId: state.taskId, role: state.role, selectedConflictId: state.conflictId });
  } else {
    html = renderRightIntro({ title: state.role.id === 'PRIME' ? '전체' : `${state.role.name} 화면`, t: state.t, zones: ZONES,
      conflicts: state.active.conflicts, tasks: state.active.tasks, alternatives: ALTERNATIVES, role: state.role, selectedConflictId: state.conflictId });
  }
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
  const tryImport = async (p) => { try { return await import(p); } catch (e) { console.warn('[scene3d] 모듈 불러오기 실패', p, e); return null; } };
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
  call('equipment', (x) => x.setActive?.({ tasks, t }));
  call('workers', (x) => {
    x.setActive?.({ tasks, t });
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
    const vis = ZONES.filter((z) => (state.level == null ? (byZone.get(z.id).taskCount || byZone.get(z.id).worst) : z.level === state.level)).map((z) => z.id);
    x.setVisibleZones(state.focus ? [...new Set([...vis, ...state.focus.ids])].filter((id) => state.focus.ids.includes(id)) : vis);
    x.setFocus(state.focus ? { zoneId: state.focus.zoneId, relatedIds: state.focus.ids.filter((id) => id !== state.focus.zoneId) } : null);
    x.setEnabled(state.mode === '3d');
  });
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
  if (ch.task && !ch.affected_company_ids) ch.affected_company_ids = affectedCompanies(ch.task);
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
  },
  onSimulate: () => {
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
  applyFocus();
  syncExtras();
  applyZoneStates();
  updateLabels();
  renderSummary();
  renderFloorList();
  renderDetail();
  if (state.mode === '2d') renderPlan();
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

// 통합/테스트용
/* 프론트 웹페이지 연동: 작업 데이터를 넘기면 위치별 목록·판정·3D가 다시 그려짐 */
function setData({ companies, tasks, conflicts } = {}) {
  if (companies) { COMPANIES.splice(0, COMPANIES.length, ...companies); companyById.clear(); COMPANIES.forEach((c) => companyById.set(c.id, c)); }
  if (tasks) TASKS.splice(0, TASKS.length, ...tasks.map((k) => ({ ...k })));
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
  if (e.origin !== location.origin || !m || m.source !== 'hansotbap') return;   // 같은 사이트(public/scene3d)에서 띄운 경우만
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
window.scene3d = { fromHansotbap, setData, setRole, pushChange, session, selectTask, applyAlt, undoAlt, selectZone, selectLevel, setTime, setMode, selectConflict, state, furnace, extras, camera, controls };
