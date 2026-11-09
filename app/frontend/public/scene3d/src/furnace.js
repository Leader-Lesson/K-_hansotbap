// 광양 2고로 개수 — 고로 점토 모형 (구역별 메시, 상태·분해·층 따로 보기)
// 형상은 '모형 단위'(clay.html 프로토타입과 같은 숫자)로 만들고 K배 키운다.
import * as THREE from 'three';
import * as THEME from './theme.js';

const K = 1.5;              // 모형 단위 → 월드 (전체 높이 약 100)
const SEG = 48;
const EXPLODE_STEP = 6;     // 층 하나당 띄우는 거리(모형 단위)
const GHOST = 0.08, DIM = 0.25;
const FALLBACK = '#b9b4ac';

// 고로 내면 프로파일 [y, 반지름]
const PROFILE = [[12, 7.4], [18, 7.4], [23, 8.3], [25.5, 8.3], [43, 5.6], [45, 5.6], [48, 2.6]];
function radiusAt(y) {
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [y0, r0] = PROFILE[i], [y1, r1] = PROFILE[i + 1];
    if (y >= y0 && y <= y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
  }
  return y < PROFILE[0][0] ? PROFILE[0][1] : PROFILE[PROFILE.length - 1][1];
}
// 카메라 쪽(+x,+z 사분면)을 열어 둔 270° 회전체
const OPEN_START = Math.PI / 2, OPEN_LEN = Math.PI * 1.5;
function latheBand(y0, y1, scale = 1, add = 0, open = false) {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const y = y0 + (y1 - y0) * i / 12; pts.push(new THREE.Vector2(radiusAt(y) * scale + add, y)); }
  return open ? new THREE.LatheGeometry(pts, SEG, OPEN_START, OPEN_LEN) : new THREE.LatheGeometry(pts, SEG);
}
function latheFree(list, seg = 32) { return new THREE.LatheGeometry(list.map(([y, r]) => new THREE.Vector2(r, y)), seg); }
// 두께 있는 고리 바닥판 (Lathe 단면 사각형)
function slabRing(y, rIn, rOut, t = 0.5) {
  return latheFree([[y, rIn], [y, rOut], [y + t, rOut], [y + t, rIn], [y, rIn]], 72);
}
function ring(y, rIn, rOut) { const g = new THREE.RingGeometry(rIn, rOut, 72, 1); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return g; }
// 두 점 사이 원기둥(배관)
function pipe(a, b, r, seg = 12) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}

const LEVELS = [
  { level: 6, name: '노정', zoneIds: ['TOP'] },
  { level: 5, name: '상부(노흉)', zoneIds: ['IN-UP', 'EX-UP'] },
  { level: 4, name: '중부(벨리·보시)', zoneIds: ['IN-MID', 'EX-MID'] },
  { level: 3, name: '풍구', zoneIds: ['IN-TUY', 'EX-TUY'] },
  { level: 2, name: '노저', zoneIds: ['IN-HEARTH'] },
  { level: 1, name: '주상', zoneIds: ['CAST'] },
  { level: 0, name: '부대설비', zoneIds: ['STOVE', 'GAS', 'ELEC'] },
];
const ZONE_LEVEL = {};
LEVELS.forEach((L) => L.zoneIds.forEach((id) => { ZONE_LEVEL[id] = L.level; }));

/* 구역 배치 정보 (모형 단위 — zoneGroup(id)에 붙이면 분해·층 이동을 그대로 따라감)
   kind: in 노 내부 원판 / ring 고리 작업대 / deck 노정 데크 / ground 지상 부지
   floorY: 사람이 서는 바닥 높이, rIn~rOut: 설 수 있는 반지름 범위
   open: 카메라 쪽 절개 각도 범위 [φ0, φ1] (x = r·sinφ, z = r·cosφ) — 노 내부는 이 범위에 두어야 보임 */
export const MODEL_SCALE = K;
/* 크기 기준 (팀 결정): 실제는 고로 110m : 사람 2m ≈ 55배지만, 보이도록 **고로 높이의 1/30**로 사람을 과장.
   고로(호퍼 끝) 높이 = 모형 67 → 사람 키 ≈ 2.25 (월드 약 3.4). 소형 장비도 같은 배율로 키움. */
export const FURNACE_H_MODEL = 67;
export const PERSON_H_MODEL = FURNACE_H_MODEL / 30;
export const OPEN_PHI = [0, Math.PI / 2];
export const ZONE_INFO = {
  TOP: { kind: 'deck', floorY: 48, rIn: 7, rOut: 15.5 },
  'IN-UP': { kind: 'in', floorY: 26, rIn: 0, rOut: radiusAt(26) * 0.85, y1: 45 },
  'EX-UP': { kind: 'ring', floorY: 31.5, rIn: 9.8, rOut: 15, decks: [31.5, 39.5] },
  'IN-MID': { kind: 'in', floorY: 19.6, rIn: 0, rOut: radiusAt(19.6) * 0.85, y1: 25.5 },
  'EX-MID': { kind: 'ring', floorY: 24, rIn: 10.7, rOut: 15.5 },
  'IN-TUY': { kind: 'in', floorY: 17.1, rIn: 0, rOut: radiusAt(17.1) * 0.85, y1: 19 },
  'EX-TUY': { kind: 'ring', floorY: 19, rIn: 9.7, rOut: 16.5 },
  'IN-HEARTH': { kind: 'in', floorY: 12.05, rIn: 0, rOut: radiusAt(12.2) * 0.85, y1: 17 },
  CAST: { kind: 'ring', floorY: 14, rIn: 10, rOut: 25.5 },
  STOVE: { kind: 'ground', floorY: 0, center: [-42, 0, 0], size: [16, 40] },
  GAS: { kind: 'ground', floorY: 0, center: [36, 0, -6], size: [14, 14] },
  ELEC: { kind: 'ground', floorY: 0, center: [0, 0, 38], size: [22, 16] },
};
export { radiusAt };

export function buildFurnace(opts = {}) {
  const palette = THEME.ZONE_COLOR || {};
  const edgesOn = opts.edges !== false;
  const root = new THREE.Group(); root.name = 'furnace';
  const model = new THREE.Group(); model.scale.setScalar(K); root.add(model);

  const zoneMeshes = new Map();
  const zoneGroups = new Map();   // id → Group (분해 시 y 이동)
  const anchors = new Map();      // id → 모형 단위 라벨 위치
  const states = new Map();
  const pickables = [];
  const noRay = () => {};
  let explodeT = 0, isoLevel = null, focusSet = null;   // focusSet: 집중 보기로 남길 구역 id Set
  function ghostedZone(id) { return (isoLevel !== null && ZONE_LEVEL[id] !== isoLevel) || (focusSet !== null && !focusSet.has(id)); }

  const baseCol = (id) => new THREE.Color(palette[id] || FALLBACK);

  function makeMat(id) {
    return new THREE.MeshStandardMaterial({ color: baseCol(id), roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  }
  function addZone(id, geos, anchor) {
    const g = new THREE.Group(); g.name = id; model.add(g);
    const list = [];
    for (const geo of geos) {
      const m = new THREE.Mesh(geo, makeMat(id));
      m.userData.zoneId = id;
      m.userData.rayFn = m.raycast;
      if (edgesOn) {
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 35),
          new THREE.LineBasicMaterial({ color: '#5a544c', transparent: true, opacity: 0.25, depthWrite: false }));
        e.raycast = noRay; e.userData.isEdge = true; m.add(e);
      }
      g.add(m); list.push(m); pickables.push(m);
    }
    zoneMeshes.set(id, list); zoneGroups.set(id, g); anchors.set(id, new THREE.Vector3(...anchor));
    states.set(id, { tint: null, emphasis: 'none', pulse: false });
  }

  // 외피(철피): 구역 아님, 반투명 + 카메라 쪽 절개
  const shellMat = new THREE.MeshStandardMaterial({ color: '#efebe5', roughness: 0.95, metalness: 0, side: THREE.DoubleSide, transparent: true, opacity: 0.22, depthWrite: false });
  const shell = new THREE.Mesh(latheBand(12, 45, 1, 1.2, true), shellMat);
  shell.raycast = noRay; shell.renderOrder = 2; model.add(shell);

  // 노 내부 구역 (270° 벽 + 층 바닥판)
  const IN_BANDS = { 'IN-HEARTH': [12, 17], 'IN-TUY': [17, 19], 'IN-MID': [19, 25.5], 'IN-UP': [25.5, 45] };
  const IN_FLOOR = { 'IN-HEARTH': 11.9, 'IN-TUY': 16.95, 'IN-MID': 19.45, 'IN-UP': 25.85 };
  for (const [id, [y0, y1]] of Object.entries(IN_BANDS)) {
    const fy = IN_FLOOR[id], fr = radiusAt(fy + 0.2) * 0.9;
    const wall = latheBand(y0, y1, 0.9, 0, true);
    const floor = new THREE.CylinderGeometry(fr, fr, 0.3, SEG).translate(0, fy, 0);
    addZone(id, [wall, floor], [0, (y0 + y1) / 2, 0]);
  }

  // 외부 작업대 (고리 바닥판)
  addZone('EX-TUY', [slabRing(18.5, 9.2, 17),
    new THREE.TorusGeometry(11.5, 0.9, 10, SEG).rotateX(Math.PI / 2).translate(0, 20.5, 0)], [17, 19.5, 0]); // 환상관
  addZone('EX-MID', [slabRing(23.5, 10.2, 16)], [16, 24.5, 0]);
  addZone('EX-UP', [slabRing(31, 9.3, 15.5), slabRing(39, 8.0, 14)], [15.5, 35, 0]);

  // 노정: 돔 + 장입설비 탑 + 호퍼 + 데크
  addZone('TOP', [
    latheBand(45, 48, 1, 1.2),
    new THREE.BoxGeometry(12, 14, 12).translate(0, 55, 0),
    new THREE.CylinderGeometry(3, 1.2, 5, 24).translate(0, 64.5, 0),
    ring(48, 6.2, 16),
  ], [9, 62, 0]);

  // 주상: 노 둘레 바닥판 + 출선구 쪽 상옥 지붕
  addZone('CAST', [
    slabRing(13.4, 9.5, 26, 0.6),
    new THREE.BoxGeometry(14, 0.6, 10).translate(0, 22, 20),
    new THREE.BoxGeometry(0.8, 8, 0.8).translate(-6.5, 18, 24.5),
    new THREE.BoxGeometry(0.8, 8, 0.8).translate(6.5, 18, 24.5),
  ], [22, 14.5, 12]);

  // 열풍로 3기 (원통 + 돔) + 열풍본관
  const stoves = [];
  [-12, 0, 12].forEach((z) => {
    stoves.push(new THREE.CylinderGeometry(4.3, 4.3, 42, 32, 1, true).translate(-42, 21, z));
    stoves.push(new THREE.SphereGeometry(4.3, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(-42, 42, z));
  });
  stoves.push(new THREE.CylinderGeometry(1, 1, 30, 12).rotateZ(Math.PI / 2).translate(-27, 20.5, 0));
  addZone('STOVE', stoves, [-42, 48, 0]);

  // 가스: 제진기 + 하강관(원통 2개)
  const dc = latheFree([[0, 1.2], [12, 1.2], [20, 5], [34, 5], [37, 1.5]]).translate(36, 0, -6);
  addZone('GAS', [dc, pipe([0, 58, 0], [16, 58, -3], 1.1), pipe([16, 58, -3], [36, 37.5, -6], 1.1)], [36, 40, -6]);

  // 전기실
  addZone('ELEC', [new THREE.BoxGeometry(14, 8, 10).translate(0, 4, 38)], [0, 9, 38]);

  // 층별 높이 범위 (분해 전, 월드)
  root.updateMatrixWorld(true);
  const levels = LEVELS.map((L) => {
    const box = new THREE.Box3();
    L.zoneIds.forEach((id) => box.expandByObject(zoneGroups.get(id)));
    return { level: L.level, name: L.name, y0: +box.min.y.toFixed(2), y1: +box.max.y.toFixed(2), zoneIds: [...L.zoneIds] };
  });

  // ── 상태 반영 ──
  function setTransparent(mat, op) {
    const tr = op < 0.999;
    if (mat.transparent !== tr) { mat.transparent = tr; mat.needsUpdate = true; }
    mat.opacity = op; mat.depthWrite = !tr || op > 0.5;
  }
  function apply(id) {
    const s = states.get(id), list = zoneMeshes.get(id);
    if (!s || !list) return;
    const ghosted = ghostedZone(id);
    const op = ghosted ? GHOST : s.emphasis === 'dim' ? DIM : 1;
    const col = s.tint ? new THREE.Color(s.tint) : baseCol(id);
    for (const m of list) {
      m.material.color.copy(col);
      setTransparent(m.material, op);
      if (!s.pulse) m.material.emissive.copy(col).multiplyScalar(s.emphasis === 'selected' && !ghosted ? 0.22 : 0);
      m.raycast = ghosted ? noRay : m.userData.rayFn;
      m.children.forEach((e) => { if (e.userData.isEdge) e.material.opacity = 0.25 * (ghosted ? 0.2 : op); });
    }
  }
  function applyShell() {
    const op = 0.22 * (1 - Math.min(1, explodeT * 2)) * (isoLevel === null && focusSet === null ? 1 : 0.3);
    shellMat.opacity = op; shell.visible = op > 0.01;
  }

  function setZoneState(id, st = {}) {
    const s = states.get(id); if (!s) return;
    if ('tint' in st) s.tint = st.tint || null;
    if (st.emphasis) s.emphasis = st.emphasis;
    if ('pulse' in st) s.pulse = !!st.pulse;
    apply(id);
  }
  function setExplode(t) {
    explodeT = Math.max(0, Math.min(1, +t || 0));
    zoneGroups.forEach((g, id) => { g.position.y = ZONE_LEVEL[id] * EXPLODE_STEP * explodeT; });
    applyShell();
  }
  function isolateLevel(level) {
    isoLevel = level === null || level === undefined ? null : level;
    states.forEach((_, id) => apply(id));
    applyShell();
  }
  function zoneAnchor(id) {
    const g = zoneGroups.get(id), a = anchors.get(id);
    if (!g || !a) return new THREE.Vector3();
    root.updateMatrixWorld(true);
    return g.localToWorld(a.clone());
  }
  const _c = new THREE.Color();
  function update(timeSec = 0) {
    const k = 0.18 + 0.16 * Math.sin(timeSec * 3.2);
    states.forEach((s, id) => {
      if (!s.pulse) return;
      if (ghostedZone(id)) return;
      for (const m of zoneMeshes.get(id)) { _c.copy(m.material.color).multiplyScalar(Math.max(0, k)); m.material.emissive.copy(_c); }
    });
  }
  function dispose() {
    root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    root.removeFromParent();
  }

  // 다른 모듈(장비·작업자·효과)이 구역에 물체를 붙일 때 씀
  const zoneGroup = (id) => zoneGroups.get(id);
  const zoneInfo = (id) => ZONE_INFO[id];
  const isGhosted = (id) => ghostedZone(id);
  // 집중 보기: 고른 구역 + 위험이 엮인 구역만 남기고 나머지는 투명하게 (null = 해제)
  function focusZones(ids) {
    focusSet = ids && [...ids].length ? new Set(ids) : null;
    states.forEach((_, id) => apply(id));
    applyShell();
  }
  const decor = new THREE.Group(); decor.name = 'decor'; model.add(decor);   // 구역 아닌 장식(모형 단위)

  return { root, model, decor, zoneMeshes, pickables, levels, zoneAnchor, zoneGroup, zoneInfo, isGhosted,
    setZoneState, setExplode, isolateLevel, focusZones, update, dispose };
}
