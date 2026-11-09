// 작업자 인형 — 작업(task)별로 역할을 나눠 구역에 배치하고, 구조물·장비와 상호작용하는 동작을 줌
// 모든 좌표는 '모형 단위'. 인형은 키 1로 만들고 station(그룹) 스케일로 키 H를 맞춤.
import * as THREE from 'three';
import { ZONE_INFO, PERSON_H_MODEL, OPEN_PHI } from './furnace.js';

const CAP = 260;            // 성능상 최대 인원
const CREW_PER_FIG = 1.3;   // 인형 1명 = 작업자 1.3명 (넓은 곳 기준)
/* 구역 바닥 면적으로 인형 수 상한 — 좁은 노 안에 실제 인원을 다 그리면 비현실적이고 느려짐.
   인원 숫자(배너·패널)는 실제 값 그대로, 3D 인형만 대표 인원으로 줄임 */
const FIG_SPACE = 2.0;      // 인형 한 명이 차지하는 간격 (사람 키 배수)
function zoneFigCap(info, H) {
  const cell = (FIG_SPACE * H) ** 2;
  if (info.kind === 'in') return Math.max(3, Math.min(8, Math.round(Math.PI * info.rOut ** 2 / cell)));
  if (info.kind === 'ring' || info.kind === 'deck') return Math.max(4, Math.min(22, Math.round(Math.PI * (info.rOut ** 2 - info.rIn ** 2) / cell * 0.35)));
  return 14;
}
const TAU = Math.PI * 2;

/* ── 시드 난수 (작업 id → 항상 같은 배치) ── */
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rngOf(s) { let a = hashStr(s); return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const toMs = (x) => (x instanceof Date ? x.getTime() : typeof x === 'number' ? x : Date.parse(x));
const smooth = (x) => x * x * (3 - 2 * x);
const angLerp = (a, b, k) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return a + d * k; };

/* ── 방위 사분면 (S=+z φ=0, E=+x φ=π/2, N=−z φ=π, W=−x φ=3π/2, 각 ±45°) ── */
const DIR_Q = { S: 0, E: 1, N: 2, W: 3 };
const EDGE = 8 * Math.PI / 180;   // 테이프 선 위에 서지 않도록 가장자리 여유
const normDirs = (d) => (Array.isArray(d) ? [...new Set(d.map((x) => String(x).toUpperCase()).filter((x) => x in DIR_Q))].sort() : []);
/* 사분면 합집합 → 연속 호 목록 [{a0,a1}] (경계 넘어감 처리, 양끝 EDGE만큼 줄임) */
function dirArcs(dirs) {
  if (!dirs.length) return null;
  const on = [0, 1, 2, 3].map((q) => dirs.some((d) => DIR_Q[d] === q));
  if (on.every(Boolean)) return [{ a0: 0, a1: TAU, full: true }];
  const arcs = [];
  for (let q = 0; q < 4; q++) {
    if (!on[q] || on[(q + 3) % 4]) continue; // 호의 시작 사분면만
    let e = q; while (on[(e + 1) % 4]) e++;
    arcs.push({ a0: q * Math.PI / 2 - Math.PI / 4 + EDGE, a1: e * Math.PI / 2 + Math.PI / 4 - EDGE });
  }
  return arcs;
}
function sampleArc(arcs, rng) {
  const tot = arcs.reduce((s, a) => s + a.a1 - a.a0, 0);
  let u = rng() * tot;
  for (const a of arcs) { const w = a.a1 - a.a0; if (u <= w) return a.a0 + u; u -= w; }
  return arcs[0].a0;
}
const inArcs = (arcs, phi) => arcs.some((a) => a.full || (((phi - a.a0) % TAU) + TAU) % TAU <= a.a1 - a.a0);
/* 지상 구역: 해당 방향을 향한 사각형 절반 [x0,x1,z0,z1] (바깥 1, 중앙선 m 여유) */
function groundHalf(info, d, m = 1) {
  const [cx, , cz] = info.center, [sx, sz] = info.size, hx = sx / 2 - 1, hz = sz / 2 - 1;
  if (d === 'E') return [cx + m, cx + hx, cz - hz, cz + hz];
  if (d === 'W') return [cx - hx, cx - m, cz - hz, cz + hz];
  if (d === 'S') return [cx - hx, cx + hx, cz + m, cz + hz];
  return [cx - hx, cx + hx, cz - hz, cz - m];
}

/* ── 공유 형상 (키 1 기준) ── */
function box(w, h, d, ty = 0, tz = 0) { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, ty, tz); return g; }
function cyl(r, h, seg, rot) { const g = new THREE.CylinderGeometry(r, r, h, seg); if (rot === 'x') g.rotateZ(Math.PI / 2); if (rot === 'z') g.rotateX(Math.PI / 2); return g; }
function makeGeo() {
  const G = {
    leg: box(0.11, 0.47, 0.13, -0.235), torso: box(0.3, 0.36, 0.19, 0.18), vest: box(0.315, 0.11, 0.2, 0.2),
    head: new THREE.SphereGeometry(0.075, 8, 6), helm: new THREE.SphereGeometry(0.093, 10, 5, 0, TAU, 0, Math.PI / 2),
    arm: box(0.08, 0.36, 0.09, -0.18),
    brick: box(0.14, 0.06, 0.07), stack: box(0.24, 0.14, 0.15), wall: box(0.9, 0.28, 0.16, 0.14), course: box(0.9, 0.07, 0.16, 0.315),
    pallet: box(0.44, 0.08, 0.44, 0.04), load: box(0.36, 0.24, 0.32, 0.2),
    pipeH: cyl(0.055, 1.2, 8, 'x'), pipeLong: cyl(0.035, 1.3, 6, 'z'), pipeV: cyl(0.07, 1.25, 8), flange: cyl(0.16, 0.05, 10),
    wrench: box(0.03, 0.03, 0.2, 0, 0.08), torch: box(0.025, 0.025, 0.22, 0, 0.1), grinder: box(0.08, 0.08, 0.17, 0, 0.06),
    det: box(0.06, 0.1, 0.04), clip: box(0.13, 0.17, 0.02), stick: cyl(0.012, 0.5, 4),
    spark: new THREE.SphereGeometry(0.045, 6, 4), glow: new THREE.SphereGeometry(0.13, 8, 6),
    plate: box(0.8, 0.85, 0.05, 0.425), tub: box(0.42, 0.18, 0.3, 0.09),
    rail: box(0.035, 2.3, 0.035, 1.15), rung: box(0.36, 0.025, 0.025), plank: box(0.8, 0.04, 0.45),
    cabBase: box(1.0, 0.26, 1.1, 0.13), post: box(0.04, 0.8, 0.04, 0.4), roof: box(1.05, 0.05, 1.15), seat: box(0.34, 0.1, 0.34),
    hload: box(0.9, 0.5, 0.9), line: (() => { const g = new THREE.CylinderGeometry(0.01, 0.01, 1, 4); g.translate(0, 0.5, 0); return g; })(),
  };
  return G;
}

/* ── 재질 (점토 무광) ── */
const clay = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0, ...extra });
function makeMats() {
  return {
    cloth: clay('#4a4d52'), skin: clay('#d9b08c'), helmW: clay('#f2efe8'), helmY: clay('#f2c230'), mgrVest: clay('#e8742a'),
    brick: clay('#a8553a'), wall: clay('#b7745a'), mortar: clay('#a39d93'), wood: clay('#9c7a4f'), steel: clay('#8d949b'),
    dark: clay('#3a3d42'), cab: clay('#d9a52a'), hload: clay('#6f777f'), line: clay('#e6d36a'), paper: clay('#f4f1ea'),
    det: clay('#1d3a26', { emissive: new THREE.Color('#38ff6a'), emissiveIntensity: 1.2 }),
    spark: new THREE.MeshBasicMaterial({ color: '#fff0c0', toneMapped: false }),
    glow: new THREE.MeshBasicMaterial({ color: '#ff9a3c', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  };
}

/* ── 작업 → 역할 목록 ── */
function rolePlan(task) {
  const t = task.title || '', wt = task.work_types || [];
  const has = (x) => wt.includes(x);
  let pat, lead = [];
  if (/축조|벽돌|연와|카본|블록 마감/.test(t)) pat = ['lay', 'carry', 'lay', 'mix', 'lay', 'carry', 'lay', 'carry'];
  else if (/용접|용단|절단/.test(t)) { pat = ['weld', 'grind', 'weld', 'bolt', 'weld', 'pipecarry']; if (has('GAS')) lead.push('gas'); }
  else if (/인양/.test(t)) { lead = ['operator', 'signal', 'rigger']; pat = ['rigger', 'bolt', 'signal', 'bolt', 'pipecarry', 'rigger']; }
  else if (/볼트|체결/.test(t)) pat = ['bolt', 'bolt', 'pipecarry', 'bolt', 'grind'];
  else if (/배관|연결|질소|수압|보온/.test(t)) { lead = ['gas']; pat = ['bolt', 'pipecarry', 'bolt', 'gas', 'bolt', 'grind']; }
  else if (/점검/.test(t)) pat = ['gas', 'climb', 'gas', 'bolt'];
  else if (/정비|개공기|탕도/.test(t)) pat = ['grind', 'bolt', 'weld', 'carry', 'bolt'];
  else pat = ['bolt', 'carry', 'grind', 'gas'];
  if (has('LIFT') && !lead.includes('signal')) lead.push('operator', 'signal', 'rigger');
  if (has('HOT') && !pat.includes('weld')) pat = ['weld', ...pat];
  return { lead, pat, height: has('HEIGHT') };
}

/* ── 인형 한 명 ── */
function mesh(g, m, parent, shadow = false) { const o = new THREE.Mesh(g, m); o.userData.baseMat = m; o.castShadow = shadow; parent.add(o); return o; }
function pivot(parent, x, y, z) { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; }
function makeFigure(G, M, vestMat, helmMat) {
  const fig = new THREE.Group();
  const legL = pivot(fig, -0.08, 0.47, 0), legR = pivot(fig, 0.08, 0.47, 0);
  mesh(G.leg, M.cloth, legL); mesh(G.leg, M.cloth, legR);
  const upper = pivot(fig, 0, 0.47, 0);
  mesh(G.torso, M.cloth, upper, true); mesh(G.vest, vestMat, upper);
  const head = mesh(G.head, M.skin, upper); head.position.y = 0.43;
  const helm = mesh(G.helm, helmMat, upper); helm.position.y = 0.445;
  const armL = pivot(upper, -0.19, 0.32, 0), armR = pivot(upper, 0.19, 0.32, 0);
  mesh(G.arm, M.cloth, armL); mesh(G.arm, M.cloth, armR);
  const handR = pivot(armR, 0, -0.36, 0), handL = pivot(armL, 0, -0.36, 0);
  return { fig, legL, legR, upper, armL, armR, handR, handL };
}

/* ── 자세 도우미 ── */
function rest(f) {
  f.legL.rotation.set(0, 0, 0); f.legR.rotation.set(0, 0, 0); f.upper.rotation.set(0, 0, 0);
  f.armL.rotation.set(0, 0, 0.06); f.armR.rotation.set(0, 0, -0.06); f.fig.position.set(0, 0, 0);
}
function walk(f, ph, amp = 0.55) {
  const s = Math.sin(ph);
  f.legL.rotation.x = s * amp; f.legR.rotation.x = -s * amp;
  f.armL.rotation.x = -s * amp * 0.7; f.armR.rotation.x = s * amp * 0.7;
  f.fig.position.y = Math.abs(Math.cos(ph)) * 0.02;
}
function kneel(f) { f.legL.rotation.x = -1.45; f.legR.rotation.x = 0.35; f.fig.position.y = -0.2; }
function flicker(s, on, k = 1) {
  if (!s) return;
  const v = on && Math.random() > 0.12;
  s.spark.visible = v; s.glow.visible = v;
  if (v) { const q = (0.5 + Math.random() * 0.9) * k; s.spark.scale.setScalar(q); s.glow.scale.setScalar(q * (0.7 + Math.random() * 0.6)); }
}

/* ── 역할별 동작 (t: 초) ── */
const POSE = {
  lay(f, t) { // 팔레트에서 벽돌 집기 → 돌아서 벽에 놓기 → 흙손 두드리기
    rest(f); const u = ((t + f.off) / 4.5) % 1; let rot = 0;
    if (u < 0.28) { const b = Math.sin(u / 0.28 * Math.PI); rot = Math.PI; f.upper.rotation.x = 1.1 * b; f.armL.rotation.x = f.armR.rotation.x = -0.5 - 0.9 * b; f.legL.rotation.x = f.legR.rotation.x = -0.25 * b; }
    else if (u < 0.4) { const k = smooth((u - 0.28) / 0.12); rot = angLerp(Math.PI, 0, k); walk(f, t * 9, 0.25); f.armR.rotation.x = -0.9; }
    else if (u < 0.75) { const b = Math.sin((u - 0.4) / 0.35 * Math.PI); f.upper.rotation.x = 0.75 * b; f.armL.rotation.x = f.armR.rotation.x = -0.9 - 0.5 * b; }
    else { f.upper.rotation.x = 0.35; f.armR.rotation.x = -1.0 + 0.25 * Math.sin(t * 12); f.armL.rotation.x = -0.6; }
    f.fig.rotation.y = rot;
    if (f.prop) f.prop.visible = u > 0.14 && u < 0.6;
  },
  carry(f, t) { // 팔레트(A) ↔ 벽/거치대(B) 왕복 운반
    rest(f); const u = ((t + f.off) / 7) % 1, A = f.a, B = f.b; let z, rot, loaded;
    if (u < 0.1) { z = A; rot = 0; const b = Math.sin(u / 0.1 * Math.PI); f.upper.rotation.x = 0.9 * b; f.armL.rotation.x = f.armR.rotation.x = -0.6 - 0.7 * b; loaded = u > 0.06; }
    else if (u < 0.45) { z = A + (B - A) * smooth((u - 0.1) / 0.35); rot = 0; walk(f, t * 8); loaded = true; }
    else if (u < 0.55) { z = B; rot = 0; const b = Math.sin((u - 0.45) / 0.1 * Math.PI); f.upper.rotation.x = 0.8 * b; f.armL.rotation.x = f.armR.rotation.x = -1.0 - 0.4 * b; loaded = u < 0.5; }
    else if (u < 0.9) { z = B + (A - B) * smooth((u - 0.55) / 0.35); rot = Math.PI; walk(f, t * 8); loaded = false; }
    else { z = A; rot = angLerp(Math.PI, 0, smooth((u - 0.9) / 0.1)); loaded = false; }
    if (loaded) { if (f.pipe) { f.armR.rotation.x = -2.7; f.armL.rotation.x = -0.3; } else { f.armL.rotation.x = f.armR.rotation.x = -1.15; } }
    f.fig.position.z = z; f.fig.rotation.y = rot;
    if (f.prop) f.prop.visible = loaded;
  },
  mix(f, t) { // 모르타르 통 젓기
    rest(f); const w = t * 3 + f.off; f.upper.rotation.x = 0.55;
    f.armR.rotation.x = -1.0 + 0.25 * Math.sin(w); f.armR.rotation.z = 0.25 * Math.cos(w);
    f.armL.rotation.x = -1.0 + 0.25 * Math.sin(w); f.armL.rotation.z = 0.25 * Math.cos(w);
  },
  weld(f, t) { // 쪼그려 철피·배관 용접 (불꽃 깜빡)
    rest(f); kneel(f); const u = ((t + f.off) / 6.5) % 1, on = u < 0.78;
    f.upper.rotation.x = 0.35; f.armR.rotation.x = -1.25 + (on ? 0.04 * Math.sin(t * 30) : 0.5); f.armL.rotation.x = -1.1;
    flicker(f.sp, on, 1);
  },
  grind(f, t) { // 서서 그라인더
    rest(f); const u = ((t + f.off) / 5) % 1, on = u < 0.7; f.upper.rotation.x = 0.28;
    const j = on ? 0.03 * Math.sin(t * 60) : 0;
    f.armR.rotation.x = -1.3 + j; f.armL.rotation.x = -1.25 - j; f.fig.position.x = on ? 0.08 * Math.sin(t * 0.9 + f.off) : 0;
    flicker(f.sp, on, 0.6);
  },
  bolt(f, t) { // 플랜지 볼트 렌치 체결
    rest(f); if (f.kneel) kneel(f);
    f.upper.rotation.x = f.kneel ? 0.2 : 0.12; f.armL.rotation.x = -1.2;
    f.armR.rotation.x = -1.35 + 0.35 * Math.sin(t * 3 + f.off); f.armR.rotation.z = -0.2;
  },
  signal(f, t) { // 신호수: 한 팔 들고 수신호
    rest(f); const k = Math.sin(t * 2.4 + f.off);
    f.armR.rotation.x = -2.85 + 0.2 * k; f.armR.rotation.z = -0.25 + 0.15 * k; f.armL.rotation.x = -1.45;
    f.fig.rotation.y = 0.15 * Math.sin(t * 0.3 + f.off);
  },
  rigger(f, t) { // 태그라인으로 매단 짐 유도
    rest(f); const s = Math.sin(t * 0.8 + f.off);
    f.fig.position.x = 0.18 * s; walk(f, t * 5, 0.15 * Math.abs(s) + 0.05);
    f.armL.rotation.x = -1.1 - 0.1 * s; f.armR.rotation.x = -1.2 + 0.1 * s; f.upper.rotation.x = -0.08;
    if (f.load) { f.load.rotation.z = 0.05 * Math.sin(t * 0.7 + f.off); f.load.rotation.y = 0.15 * s; }
  },
  operator(f, t) { // 운전석에 앉아 레버 조작
    rest(f); f.legL.rotation.x = f.legR.rotation.x = -1.5; f.fig.position.y = 0.0;
    f.armL.rotation.x = -0.9 + 0.12 * Math.sin(t * 1.3 + f.off); f.armR.rotation.x = -0.9 + 0.12 * Math.sin(t * 1.7 + f.off + 1);
  },
  gas(f, t) { // 측정기를 배관에 대고 이동하며 측정
    rest(f); const s = Math.sin(t * 0.35 + f.off), c = Math.cos(t * 0.35 + f.off);
    f.fig.position.x = 0.35 * s; if (Math.abs(c) > 0.3) walk(f, t * 6, 0.25);
    f.armR.rotation.x = -1.4; f.armL.rotation.x = -0.35; f.upper.rotation.x = 0.1;
    if (f.prop) { const bl = ((t * 2 + f.off) % 1) < 0.6; f.prop.scale.setScalar(bl ? 1.15 : 0.9); }
  },
  climb(f, t) { // 비계 사다리 오르내리기
    rest(f); const u = ((t + f.off) / 9) % 1, h = u < 0.5 ? smooth(u * 2) : smooth((1 - u) * 2);
    const ph = t * 5, s = Math.sin(ph);
    f.fig.position.y = h * 1.25; f.fig.position.z = 0.02;
    f.armL.rotation.x = -2.5 + 0.35 * s; f.armR.rotation.x = -2.5 - 0.35 * s;
    f.legL.rotation.x = -0.45 - 0.35 * s; f.legR.rotation.x = -0.45 + 0.35 * s;
  },
  mgr(f, t) { // 안전관리자 순회
    rest(f); const P = f.path, L = f.pathLen, s = ((t * f.speed + f.off * 3) % L + L) % L;
    let i = 0; while (i < P.length - 2 && f.cum[i + 1] < s) i++;
    const a = P[i], b = P[i + 1], seg = f.cum[i + 1] - f.cum[i] || 1, k = (s - f.cum[i]) / seg;
    f.fig.position.x = a.x + (b.x - a.x) * k; f.fig.position.z = a.z + (b.z - a.z) * k;
    const want = Math.atan2(b.x - a.x, b.z - a.z);
    f.fig.rotation.y = angLerp(f.fig.rotation.y, want, 0.12);
    walk(f, t * 6.5, 0.45); f.armL.rotation.x = -1.1; // 왼손 점검표
  },
};

/* ── 메인 ── */
export function buildWorkers(furnace, { companies, spots = [] } = {}) {
  const G = makeGeo(), M = makeMats();
  const PH = PERSON_H_MODEL;
  const compColor = new Map();
  (Array.isArray(companies) ? companies : Object.values(companies || {})).forEach((c) => compColor.set(c.id, c.color));
  const vestCache = new Map();
  const vestOf = (cid) => { if (!vestCache.has(cid)) vestCache.set(cid, clay(compColor.get(cid) || '#8a8f96')); return vestCache.get(cid); };
  const fadeCache = new Map();
  const fadeOf = (m) => {
    if (!fadeCache.has(m)) { const c = m.clone(); c.transparent = true; c.opacity = (m.opacity ?? 1) * 0.25; c.depthWrite = false; fadeCache.set(m, c); }
    return fadeCache.get(m);
  };

  let spotList = spots || [];
  let tasksActive = [];
  let activeKey = '';
  const byTask = new Map();       // taskId → stations[]
  let stations = [];              // 표시 순서 (상한 적용)
  let highlight = null;

  /* 구역 정보 */
  const zoneH = (info) => (info && info.y1 != null ? Math.min(PH, 0.9 * (info.y1 - info.floorY)) : PH);
  const parentFor = (zoneId) => (zoneId ? furnace.zoneGroup(zoneId) : furnace.decor);
  const faceAngle = (f) => (f == null ? null : typeof f === 'number' ? f : f.isVector3 ? Math.atan2(f.x, f.z) : null);
  function spotsIn(zid) {
    const info = ZONE_INFO[zid];
    return spotList.filter((s) => {
      if (s.zoneId) return s.zoneId === zid;
      if (!info || info.kind !== 'ground' || !s.pos) return false;
      const [cx, , cz] = info.center, [sx, sz] = info.size;
      return Math.abs(s.pos.x - cx) <= sx / 2 + 2 && Math.abs(s.pos.z - cz) <= sz / 2 + 2;
    });
  }

  /* 구역 안 위치 뽑기: wall=벽 쪽(벽 바라봄) / free=작업면 아무 곳 */
  function samplePos(zid, info, rng, H, wallSide, sector, placed, area = null) {
    for (let tries = 0; tries < 24; tries++) {
      let x, z, y = info.floorY, rot;
      if (info.kind === 'ground' && area) { // 지정 방향의 사각형 절반 안
        const [x0, x1, z0, z1] = groundHalf(info, area.dirs[Math.floor(rng() * area.dirs.length)]);
        x = x0 + rng() * Math.max(0, x1 - x0); z = z0 + rng() * Math.max(0, z1 - z0); rot = rng() * TAU;
      } else if (info.kind === 'in') {
        const m = 0.14, phi = area ? sampleArc(area.arcs, rng) : OPEN_PHI[0] + m + rng() * (OPEN_PHI[1] - OPEN_PHI[0] - 2 * m);
        const r = wallSide ? info.rOut - 0.35 * H : (0.2 + rng() * 0.55) * info.rOut;
        x = r * Math.sin(phi); z = r * Math.cos(phi); rot = wallSide ? phi : phi + (rng() - 0.5) * 2;
      } else if (info.kind === 'ring' || info.kind === 'deck') {
        const phi = area ? sampleArc(area.arcs, rng) : sector.c + (rng() - 0.5) * sector.w;
        const r = wallSide ? info.rIn + 0.55 * H : info.rIn + 0.8 * H + rng() * Math.max(0.1, info.rOut - info.rIn - 1.4 * H);
        x = r * Math.sin(phi); z = r * Math.cos(phi); rot = wallSide ? phi + Math.PI : rng() * TAU;
        if (info.decks) y = info.decks[Math.floor(rng() * info.decks.length)];
      } else {
        const [cx, , cz] = info.center, [sx, sz] = info.size;
        x = cx + (rng() - 0.5) * (sx - 2); z = cz + (rng() - 0.5) * (sz - 2); rot = rng() * TAU;
      }
      const minD = 0.95 * H;
      if (tries < 23 && placed.some((p) => Math.abs(p.y - y) < 1 && Math.hypot(p.x - x, p.z - z) < minD)) continue;
      return { x, y, z, rot };
    }
    return null;
  }

  /* 역할별 소품 + 인형 하나 (station) */
  function makeStation(task, role, zid, info, H, rng, place, spot) {
    const st = new THREE.Group(); st.name = 'worker';
    st.position.set(place.x, place.y, place.z); st.rotation.y = place.rot; st.scale.setScalar(H);
    const helm = role === 'signal' || role === 'mgr' ? M.helmY : M.helmW;
    const vest = role === 'mgr' ? M.mgrVest : vestOf(task.company_id);
    const f = makeFigure(G, M, vest, helm); st.add(f.fig);
    f.role = role; f.off = rng() * 10; f.kneel = rng() < 0.4;
    const add = (g, m, x, y, z, parent = st) => { const o = mesh(g, m, parent); o.position.set(x, y, z); return o; };
    const sparkAt = (x, y, z) => ({ spark: add(G.spark, M.spark, x, y, z), glow: add(G.glow, M.glow, x, y, z) });
    switch (role) {
      case 'lay':
        add(G.wall, M.wall, 0, 0, 0.52); add(G.course, M.mortar, 0, 0, 0.52);
        add(G.pallet, M.wood, 0, 0, -0.52); add(G.load, M.brick, 0, 0, -0.52);
        f.prop = add(G.brick, M.brick, 0, -0.02, 0.04, f.handR); break;
      case 'carry': case 'pipecarry': {
        const pipe = role === 'pipecarry'; f.pipe = pipe;
        f.a = -1.0; f.b = 0.95;
        if (!spot) { add(G.pallet, M.wood, 0, 0, f.a - 0.35); add(pipe ? G.pipeH : G.load, pipe ? M.steel : M.brick, 0, pipe ? 0.12 : 0, f.a - 0.35); }
        if (pipe) { const r1 = add(G.pipeH, M.steel, 0, 0.1, f.b + 0.4); add(G.pipeH, M.steel, 0, 0.21, f.b + 0.4); r1.scale.y = 1; }
        else add(G.wall, M.wall, 0, 0, f.b + 0.4);
        f.prop = pipe ? add(G.pipeLong, M.steel, 0.12, 0.85, 0, f.fig) : add(G.stack, M.brick, 0, 0.62, 0.24, f.fig);
        break; }
      case 'mix': add(G.tub, M.dark, 0, 0, 0.45); { const s = add(G.stick, M.wood, 0, -0.05, 0.05, f.handR); s.rotation.x = 0.6; } break;
      case 'weld':
        if (info.kind === 'in' || info.kind === 'ring' || rng() < 0.5) add(G.plate, M.steel, 0, 0, 0.6);
        else add(G.pipeH, M.steel, 0, 0.32, 0.55);
        add(G.torch, M.dark, 0, 0, 0.02, f.handR); f.sp = sparkAt(0.02, 0.33, 0.55); break;
      case 'grind':
        add(G.pipeH, M.steel, 0, 0.55, 0.5); add(G.grinder, M.dark, -0.1, 0, 0.03, f.handR); f.sp = sparkAt(0.0, 0.55, 0.44); break;
      case 'bolt': {
        const y = f.kneel ? 0.38 : 0.62;
        add(G.pipeV, M.steel, 0, 0, 0.47); add(G.flange, M.steel, 0, y, 0.47); add(G.flange, M.steel, 0, y + 0.06, 0.47);
        const w = add(G.wrench, M.dark, 0, 0, 0.02, f.handR); w.rotation.x = -0.4; break; }
      case 'signal': break;
      case 'rigger': {
        let target;
        if (spot) { target = new THREE.Vector3(0, 2.2, 1.6); }
        else {
          f.load = add(G.hload, M.hload, 0, 1.55, 1.5);
          const cab = add(G.line, M.dark, 0, 1.8, 1.5); cab.scale.y = 4;
          target = new THREE.Vector3(0, 1.4, 1.1);
        }
        const from = new THREE.Vector3(0, 0.55, 0.3), dir = target.clone().sub(from);
        const ln = add(G.line, M.line, from.x, from.y, from.z); ln.scale.y = dir.length();
        ln.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()); break; }
      case 'operator':
        if (!spot) {
          add(G.cabBase, M.cab, 0, 0, 0);
          for (const [px, pz] of [[-0.48, -0.52], [0.48, -0.52], [-0.48, 0.52], [0.48, 0.52]]) add(G.post, M.dark, px, 0.26, pz);
          add(G.roof, M.cab, 0, 1.08, 0);
        }
        add(G.seat, M.dark, 0, spot ? 0 : 0.31, -0.08);
        f.seatY = spot ? 0.0 : 0.31;
        break;
      case 'gas':
        add(G.pipeH, M.steel, 0, 0.78, 0.45);
        f.prop = add(G.det, M.det, 0, -0.03, 0.04, f.handR); break;
      case 'climb':
        add(G.rail, M.steel, -0.18, 0, 0.2); add(G.rail, M.steel, 0.18, 0, 0.2);
        for (let k = 1; k <= 8; k++) add(G.rung, M.steel, 0, k * 0.27, 0.2);
        add(G.plank, M.wood, 0, 2.3, 0.35); break;
      default: break;
    }
    if (role === 'operator') { const base = f.seatY; const orig = POSE.operator; f.pose = (ff, t) => { orig(ff, t); ff.fig.position.y = base + 0.05 - 0.47; }; }
    else f.pose = POSE[role] || POSE.bolt;
    st.userData = { taskId: task.id, zoneId: zid, fig: f, capped: false, faded: false };
    return st;
  }

  /* 안전관리자: 구역 순회 경로 */
  function makeManager(task, zid, info, H, rng, area = null) {
    const pts = [];
    const big = area && info.kind !== 'ground' && !area.arcs[0].full ? area.arcs.reduce((b, a) => (a.a1 - a.a0 > b.a1 - b.a0 ? a : b)) : null;
    if (big) { // 지정 사분면 호 안에서만 왕복
      const r = info.kind === 'in' ? info.rOut * 0.62 : (info.rIn + info.rOut) / 2 + 0.3 * H;
      for (let i = 0; i <= 10; i++) { const a = big.a0 + (big.a1 - big.a0) * i / 10; pts.push(new THREE.Vector3(r * Math.sin(a), 0, r * Math.cos(a))); }
      for (let i = 9; i >= 0; i--) pts.push(pts[i].clone());
    } else if (area && info.kind === 'ground') {
      const [x0, x1, z0, z1] = groundHalf(info, area.dirs[0]);
      [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]].forEach(([x, z]) => pts.push(new THREE.Vector3(x, 0, z)));
    } else if (info.kind === 'in') {
      const r = info.rOut * 0.62, a0 = OPEN_PHI[0] + 0.15, a1 = OPEN_PHI[1] - 0.15;
      for (let i = 0; i <= 8; i++) { const a = a0 + (a1 - a0) * i / 8; pts.push(new THREE.Vector3(r * Math.sin(a), 0, r * Math.cos(a))); }
      for (let i = 7; i >= 0; i--) pts.push(pts[i].clone());
    } else if (info.kind === 'ring' || info.kind === 'deck') {
      const r = (info.rIn + info.rOut) / 2 + 0.3 * H;
      for (let i = 0; i <= 28; i++) { const a = i / 28 * TAU; pts.push(new THREE.Vector3(r * Math.sin(a), 0, r * Math.cos(a))); }
    } else {
      const [cx, , cz] = info.center, [sx, sz] = info.size, hx = sx / 2 - 1, hz = sz / 2 - 1;
      [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz], [-hx, -hz]].forEach(([x, z]) => pts.push(new THREE.Vector3(cx + x, 0, cz + z)));
    }
    const st = new THREE.Group(); st.name = 'worker-mgr';
    st.position.set(0, info.decks ? info.decks[0] : info.floorY, 0); st.scale.setScalar(H);
    const f = makeFigure(G, M, M.mgrVest, M.helmY); st.add(f.fig);
    const clip = mesh(G.clip, M.paper, f.handL); clip.position.set(0, -0.02, 0.06); clip.rotation.x = -0.6;
    f.path = pts.map((p) => p.clone().multiplyScalar(1 / H));
    f.cum = [0]; for (let i = 1; i < f.path.length; i++) f.cum.push(f.cum[i - 1] + f.path[i].distanceTo(f.path[i - 1]));
    f.pathLen = f.cum[f.cum.length - 1] || 1; f.speed = 0.55; f.off = rng() * 10; f.pose = POSE.mgr;
    st.userData = { taskId: task.id, zoneId: zid, fig: f, capped: false, faded: false };
    return st;
  }

  /* 작업 하나 → station 목록 (시드 고정) */
  const used = new Set();   // 이미 쓴 장비 지점
  const zoneUsed = new Map(); // 구역별 이미 그린 인형 수 (상한 공유)
  function buildTask(task) {
    const rng = rngOf(task.id);
    const zones = (task.zone_ids || []).filter((z) => ZONE_INFO[z] && furnace.zoneGroup(z));
    if (!zones.length) return [];
    const total = Math.max(2, Math.round((task.crew || 4) / CREW_PER_FIG));
    const plan = rolePlan(task);
    const out = [];
    // 작업 방위(place_dirs)가 있으면 그 사분면 안에만 배치
    const pdirs = normDirs(task.place_dirs), parcs = dirArcs(pdirs);
    const area = parcs ? { dirs: pdirs, arcs: parcs } : null;
    const spotOk = (s, info) => {
      if (!area || !s.pos) return true;
      if (info.kind === 'ground') return pdirs.some((d) => { const [x0, x1, z0, z1] = groundHalf(info, d, 0); return s.pos.x >= x0 - 1 && s.pos.x <= x1 + 1 && s.pos.z >= z0 - 1 && s.pos.z <= z1 + 1; });
      return inArcs(parcs, Math.atan2(s.pos.x, s.pos.z));
    };
    zones.forEach((zid, zi) => {
      const info = ZONE_INFO[zid], H = zoneH(info), parent = furnace.zoneGroup(zid);
      const want = Math.round(total / zones.length) + (zi === 0 ? total % zones.length : 0);
      const left = zoneFigCap(info, H) - (zoneUsed.get(zid) || 0);
      if (left <= 0) return;
      const n = Math.max(1, Math.min(want, left));
      zoneUsed.set(zid, (zoneUsed.get(zid) || 0) + n + (zi === 0 ? 1 : 0));
      const sector = { c: rng() * TAU, w: Math.min(TAU, Math.max(1.2, n * 0.32)) };
      const zs = spotsIn(zid), placed = [];
      // 장비 지점: 운전·신호·줄걸이는 지점 그대로, 나머지는 지정 사분면 안의 지점만
      const takeSpot = (kinds, free = false) => { const s = zs.find((p) => kinds.includes(p.kind) && !used.has(p) && (free || spotOk(p, info))); if (s) used.add(s); return s; };
      // 역할 목록: 선두 역할(구역 첫 번째에만) + 반복 패턴, 높은 곳 작업은 가끔 비계 등반
      const roles = [];
      if (zi === 0) plan.lead.forEach((r) => roles.push(r));
      for (let i = 0; roles.length < n; i++) {
        let r = plan.pat[i % plan.pat.length];
        if (plan.height && info.kind !== 'in' && i % 6 === 5) r = 'climb';
        roles.push(r);
      }
      roles.length = Math.max(1, n);
      roles.forEach((role) => {
        let spot = null;
        if (role === 'operator') spot = takeSpot(['crane-cab'], true);
        else if (role === 'signal') spot = takeSpot(['signal'], true) || takeSpot(['crane-hook'], true);
        else if (role === 'rigger') spot = takeSpot(['crane-hook'], true);
        else if (role === 'carry' || role === 'pipecarry') spot = takeSpot(['pallet', 'truck-door']);
        else if (role === 'weld') spot = takeSpot(['welder']);
        else if (role === 'climb') spot = takeSpot(['scaffold', 'hoist']);
        else if (role === 'gas') spot = takeSpot(['blower']);
        let place, par = parent;
        if (spot && spot.pos) {
          par = parentFor(spot.zoneId) || parent;
          const fa = faceAngle(spot.facing) ?? Math.atan2(-spot.pos.x, -spot.pos.z);
          const p = spot.pos;
          if (role === 'operator') place = { x: p.x, y: p.y, z: p.z, rot: fa };
          else if (role === 'rigger' || (role === 'signal' && spot.kind === 'crane-hook')) {
            const d = role === 'rigger' ? 1.4 * H : 3.2 * H, a = rng() * TAU, fy = spot.zoneId ? info.floorY : 0;
            place = { x: p.x + d * Math.sin(a), y: fy, z: p.z + d * Math.cos(a), rot: a + Math.PI };
          } else if (role === 'weld') place = { x: p.x + Math.sin(fa) * 0.9 * H, y: p.y, z: p.z + Math.cos(fa) * 0.9 * H, rot: fa };
          else place = { x: p.x, y: p.y, z: p.z, rot: fa };
        } else {
          spot = null;
          const wallSide = ['lay', 'weld', 'grind', 'bolt', 'gas', 'climb'].includes(role) && info.kind !== 'ground';
          place = samplePos(zid, info, rng, H, wallSide, sector, placed, area);
          if (!place) return;
          if (role === 'carry' || role === 'pipecarry') { if (info.kind === 'in') place.rot = Math.atan2(place.x, place.z); else if (info.kind !== 'ground') place.rot = Math.atan2(-place.x, -place.z); }
        }
        if (role === 'operator' && !spot && info.kind === 'in') role = 'bolt'; // 노 안엔 장비 운전석 없음
        placed.push(place);
        const st = makeStation(task, role, zid, info, H, rng, place, spot);
        par.add(st); out.push(st);
      });
      if (zi === 0) { const m = makeManager(task, zid, info, H, rng, area); parent.add(m); out.push(m); }
    });
    return out;
  }

  function removeTask(id) { (byTask.get(id) || []).forEach((st) => st.removeFromParent()); byTask.delete(id); }

  function rebuildOrder() {
    stations = [];
    tasksActive.forEach((t) => (byTask.get(t.id) || []).forEach((st) => stations.push(st)));
    stations.forEach((st, i) => { st.userData.capped = i >= CAP; });
    applyHighlight(); applyAlert(); refresh();
  }

  /* ── 경보: 바닥 붉은 링(인형마다) + 작업·구역마다 '!' 표지 하나 ── */
  let alertIds = null;
  let alertSprites = [];          // { sprite, sts }
  const alertRings = [];          // 현재 붙어 있는 링 (update용)
  const ringGeo = (() => { const g = new THREE.RingGeometry(0.42, 0.5, 28); g.rotateX(-Math.PI / 2); return g; })();
  const ringMat = new THREE.MeshBasicMaterial({ color: '#d32f2f', transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  let warnTex = null;
  try {
    if (typeof document !== 'undefined') {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const c = cv.getContext('2d');
      c.fillStyle = '#d32f2f'; c.beginPath(); c.arc(32, 32, 29, 0, TAU); c.fill();
      c.lineWidth = 3; c.strokeStyle = '#ffffff'; c.stroke();
      c.fillStyle = '#ffffff'; c.font = 'bold 44px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', 32, 35);
      warnTex = new THREE.CanvasTexture(cv); warnTex.colorSpace = THREE.SRGBColorSpace;
    }
  } catch (e) { warnTex = null; }
  const warnMat = new THREE.SpriteMaterial({ map: warnTex, color: warnTex ? '#ffffff' : '#d32f2f', sizeAttenuation: false, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });

  function applyAlert() {
    alertSprites.forEach((a) => a.sprite.removeFromParent()); alertSprites = [];
    alertRings.length = 0;
    const set = alertIds ? new Set(alertIds) : null;
    const groups = new Map(); // taskId|zoneId → stations
    stations.forEach((st) => {
      const ud = st.userData, on = !!set && set.has(ud.taskId);
      if (on && !ud.ring) { const r = new THREE.Mesh(ringGeo, ringMat); r.position.y = 0.02; r.renderOrder = 2; st.add(r); ud.ring = r; }
      else if (!on && ud.ring) { ud.ring.removeFromParent(); ud.ring = null; }
      if (!on) return;
      alertRings.push(st);
      const k = ud.taskId + '|' + ud.zoneId;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(st);
    });
    groups.forEach((sts) => {
      const zg = furnace.zoneGroup(sts[0].userData.zoneId);
      // 그 구역 그룹에 붙은 고정 인형 기준 중심 (순회 관리자·다른 구역 장비 지점 제외)
      let pick = sts.filter((s) => s.name === 'worker' && s.parent === zg);
      if (!pick.length) pick = sts.filter((s) => s.name === 'worker');
      if (!pick.length) pick = sts;
      const par = pick[0].parent; if (!par) return;
      pick = pick.filter((s) => s.parent === par);
      const c = new THREE.Vector3(); let top = -Infinity, h = 0;
      pick.forEach((s) => { c.add(s.position); top = Math.max(top, s.position.y); h = Math.max(h, s.scale.y); });
      c.multiplyScalar(1 / pick.length); c.y = top + h * 2.4;
      const sp = new THREE.Sprite(warnMat); sp.name = 'worker-alert'; sp.position.copy(c); sp.scale.set(0.026, 0.026, 1); sp.renderOrder = 999;
      par.add(sp); alertSprites.push({ sprite: sp, sts });
    });
  }
  function setAlert(ids) { alertIds = ids && ids.length ? [...ids] : null; applyAlert(); refresh(); }

  function setActive({ tasks = [], t } = {}) {
    const now = toMs(t);
    const act = tasks.filter((k) => toMs(k.start) <= now && now < toMs(k.end)).sort((a, b) => (a.id < b.id ? -1 : 1));
    const key = act.map((k) => k.id + ':' + normDirs(k.place_dirs).join('')).join('|'); // 방위 바뀌면 재배치
    if (key === activeKey) return;
    activeKey = key;
    const ids = new Set(act.map((k) => k.id));
    [...byTask.keys()].forEach((id) => { if (!ids.has(id)) removeTask(id); });
    // 장비 지점 점유는 활성 작업 기준으로 다시 계산 (새로 생기는 작업만 빌드하면 순서가 꼬이므로 지점 있는 경우 전체 재빌드)
    // 구역 상한을 작업끼리 나눠 쓰므로 항상 전체 다시 배치
    [...byTask.keys()].forEach(removeTask); used.clear(); zoneUsed.clear();
    act.forEach((k) => { if (!byTask.has(k.id)) byTask.set(k.id, buildTask(k)); });
    tasksActive = act;
    rebuildOrder();
  }

  function setSpots(sp) {
    spotList = sp || [];
    [...byTask.keys()].forEach(removeTask); used.clear(); zoneUsed.clear();
    tasksActive.forEach((k) => byTask.set(k.id, buildTask(k)));
    rebuildOrder();
  }

  function applyHighlight() {
    const set = highlight ? new Set(highlight) : null;
    stations.forEach((st) => {
      const faded = !!set && !set.has(st.userData.taskId);
      if (faded === st.userData.faded) return;
      st.userData.faded = faded;
      st.traverse((o) => { if (o.isMesh && o.userData.baseMat) o.material = faded ? fadeOf(o.userData.baseMat) : o.userData.baseMat; });
    });
  }
  function setHighlight(ids) { highlight = ids && ids.length ? ids : null; applyHighlight(); }
  /* 작업 선택: 이 작업들의 작업자만 보이고 나머지는 숨김 (null = 모두) */
  let filter = null;
  function setFilter(ids) { filter = ids && ids.length ? new Set(ids) : null; refresh(); }

  function refresh() {
    stations.forEach((st) => { st.visible = !st.userData.capped && !(filter && !filter.has(st.userData.taskId)) && !(furnace.isGhosted && furnace.isGhosted(st.userData.zoneId)); });
    alertSprites.forEach((a) => { a.sprite.visible = a.sts.some((s) => s.visible); }); // 인형과 함께 숨김
  }

  function update(timeSec) {
    for (let i = 0; i < stations.length; i++) {
      const st = stations[i]; if (!st.visible) continue;
      const f = st.userData.fig; f.pose(f, timeSec);
    }
    if (alertRings.length) { // 링: 공유 재질 투명도 + 인형 발밑 따라가며 맥동
      const p = 0.5 + 0.5 * Math.sin(timeSec * 5);
      ringMat.opacity = 0.35 + 0.55 * p;
      const sc = 0.9 + 0.35 * p;
      for (let i = 0; i < alertRings.length; i++) {
        const st = alertRings[i]; if (!st.visible) continue;
        const r = st.userData.ring, fp = st.userData.fig.fig.position;
        if (r) { r.position.x = fp.x; r.position.z = fp.z; r.scale.set(sc, 1, sc); }
      }
    }
    if (alertSprites.length) warnMat.opacity = (timeSec * 2.5) % 1 < 0.65 ? 1 : 0.15; // '!' 깜빡임
  }

  const count = () => stations.reduce((n, st) => n + (st.visible ? 1 : 0), 0);

  function dispose() {
    [...byTask.keys()].forEach(removeTask); stations = [];
    alertSprites.forEach((a) => a.sprite.removeFromParent()); alertSprites = []; alertRings.length = 0;
    ringGeo.dispose(); ringMat.dispose(); warnMat.dispose(); if (warnTex) warnTex.dispose();
    Object.values(G).forEach((g) => g.dispose());
    Object.values(M).forEach((m) => m.dispose());
    vestCache.forEach((m) => m.dispose()); fadeCache.forEach((m) => m.dispose());
  }

  return { setActive, setSpots, setHighlight, setFilter, setAlert, refresh, update, count, dispose };
}
