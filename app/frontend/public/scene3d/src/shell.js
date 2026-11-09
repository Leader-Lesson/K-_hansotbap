// 개수 현장 철피 디테일 — 용접선·스테이브 노즐·철피 개구부·벽돌 컨베이어·환기 덕트·케이블 트레이·안전망·조명·작업 케이지
// 좌표는 모두 '모형 단위'. 구조물·장비는 실제 크기(M = 67/110 모형/미터), 사람만 과장(고로/30).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ZONE_INFO, radiusAt, FURNACE_H_MODEL } from './furnace.js';

const M = FURNACE_H_MODEL / 110;                 // 1 m → 모형 단위 (≈0.609)
const TAU = Math.PI * 2;
const OPEN_START = Math.PI / 2, OPEN_END = TAU;  // 철피가 있는 각도 (절개 사분면 제외)
const rs = (y) => radiusAt(y) + 1.2;             // 철피 바깥 반지름
const V2 = (x, y) => new THREE.Vector2(x, y);
const pol = (r, phi, y) => [r * Math.sin(phi), y, r * Math.cos(phi)];

// 무광 점토 팔레트
const C = {
  seam: '#9d978e', nozzle: '#8a847b', frame: '#6f6a63', plate: '#a29d95', belt: '#4a4743', steel: '#a7a39b',
  brick: '#b98a6c', duct: '#d9c25a', rib: '#b49d3e', exhaust: '#bdb8a0', fan: '#7f8a8f', blade: '#3f4447',
  tray: '#9aa0a3', cable: '#3a3836', box: '#8f9499', cage: '#d1a83c', rope: '#4a4540', ramp: '#b5afa5', stripe: '#d8b23a',
};

// 두 점 사이 원기둥
function pipe(a, b, r, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const g = new THREE.CylinderGeometry(r, r, Math.max(1e-3, d.length()), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
}
// 두 점 사이 각재 (폭 w = 로컬 x, 높이 h)
function beam(a, b, w, h) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const g = new THREE.BoxGeometry(w, h, Math.max(1e-3, d.length()));
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()));
  return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
}
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
// UV 늘리기 (그물 텍스처 반복용)
function scaleUV(g, su, sv) {
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}
// 바깥 구역 (철피 높이 → 작업대 구역)
const outerZone = (y) => (y < 17 ? 'CAST' : y < 19.5 ? 'EX-TUY' : y < 25.5 ? 'EX-MID' : y < 45 ? 'EX-UP' : 'TOP');
const toMs = (v) => (v == null ? null : typeof v === 'number' ? v : v instanceof Date ? v.getTime() : Date.parse(v));

export function buildShell(furnace) {
  const group = new THREE.Group(); group.name = 'shell-site';
  furnace.decor.add(group);
  const bridge = new THREE.Group(); bridge.name = 'shell-bridge'; group.add(bridge);   // 분해 시 숨김 (지상↔작업대 케이블)
  const noRay = () => {};

  // ── 재질 ──
  const textures = [];
  const netTex = (() => {
    if (typeof document === 'undefined') return null;
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const x = cv.getContext('2d');
    x.fillStyle = 'rgba(70,150,80,0.35)'; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = 'rgba(40,120,55,1)'; x.lineWidth = 3;
    for (let i = 0; i <= 64; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(64, i); x.stroke(); }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    textures.push(t); return t;
  })();
  const mats = new Map();
  function mat(key) {
    if (mats.has(key)) return mats.get(key);
    let m;
    if (key === 'net') m = new THREE.MeshStandardMaterial({ color: '#5aa864', map: netTex, roughness: 0.9, metalness: 0, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    else if (key === 'bulb') m = new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffd27a', emissiveIntensity: 0.3, roughness: 0.9, metalness: 0 });
    else m = new THREE.MeshStandardMaterial({ color: key, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    mats.set(key, m); return m;
  }
  const bulbMat = mat('bulb');

  // ── 부모별·재질별 버킷 → 합치기 ──
  const zoneRoots = new Map();   // zoneId → Group (furnace.zoneGroup 자식)
  function zr(id) {
    if (!zoneRoots.has(id)) {
      const g = new THREE.Group(); g.name = 'shell:' + id; g.userData.zone = id;
      const parent = furnace.zoneGroup(id); (parent || group).add(g); zoneRoots.set(id, g);
    }
    return zoneRoots.get(id);
  }
  const buckets = new Map();
  function add(parent, key, g) {
    const k = parent.uuid + '|' + key;
    if (!buckets.has(k)) buckets.set(k, { parent, key, geos: [] });
    buckets.get(k).geos.push(g);
  }
  const meshes = [];
  function flush() {
    buckets.forEach(({ parent, key, geos }) => {
      const list = geos.map((g) => { const n = g.index ? g.toNonIndexed() : g; if (n !== g) g.dispose(); return n; });
      const merged = mergeGeometries(list, false); list.forEach((g) => g.dispose());
      if (!merged) return;
      const m = new THREE.Mesh(merged, mat(key)); m.raycast = noRay;
      if (key !== 'net' && key !== 'bulb') { m.castShadow = true; m.receiveShadow = true; }
      if (key === 'net') m.renderOrder = 3;
      parent.add(m); meshes.push(m);
    });
    buckets.clear();
  }

  // ── 개구부 목록 (용접선·노즐이 피해 감) ──
  const OPENINGS = [];
  const opening = (phi, y0, y1, w) => { OPENINGS.push({ phi, y0, y1, half: (w / 2 + 0.25) / rs((y0 + y1) / 2) }); };
  const inOpening = (phi, y, pad = 0) => OPENINGS.some((o) => y > o.y0 - 0.2 - pad && y < o.y1 + 0.2 + pad && Math.abs(phi - o.phi) < o.half);
  // 활동 구역 연결용 레인 (컨베이어·덕트 팬)
  const lanes = [];

  const PHI_A = Math.PI + 0.3, PHI_B = 3.93, PHI_D = Math.PI + 1.0, PHI_C = 4.5;
  const WIN = 3 * M, DOOR_W = 4 * M, DOOR_H = 4.5 * M;
  const A_SILL = 14.3, B_SILL = 24.0;
  opening(PHI_A, A_SILL, A_SILL + WIN, WIN);
  opening(PHI_B, B_SILL, B_SILL + WIN, WIN);
  opening(PHI_D, 14.0, 14.0 + DOOR_H, DOOR_W);

  // ═══ 1. 철피 용접선 + 스테이브 냉각 노즐 ═══
  {
    const COURSE = 3 * M, PLATE = 4 * M, t = 0.05 * M * 1.6;
    const ys = []; for (let y = 12; y < 45 - 0.3; y += COURSE) ys.push(y); ys.push(45);
    // 가로 용접선: 개구부를 피해 원호 조각으로
    ys.slice(1, -1).forEach((y) => {
      const r = rs(y) + 0.02, steps = 140;
      let start = null;
      for (let i = 0; i <= steps; i++) {
        const p = OPEN_START + (OPEN_END - OPEN_START) * i / steps;
        const blocked = inOpening(p, y) || i === steps;
        if (!blocked && start === null) start = p;
        if (blocked && start !== null) {
          if (p - start > 0.02) add(zr(outerZone(y)), C.seam, new THREE.LatheGeometry([V2(r, y - t), V2(r + t, y - t), V2(r + t, y + t), V2(r, y + t)], Math.max(2, Math.round((p - start) * 12)), start, p - start));
          start = null;
        }
      }
    });
    // 세로 용접선: 단마다 엇갈림
    for (let k = 0; k < ys.length - 1; k++) {
      const y0 = ys[k], y1 = ys[k + 1], dp = PLATE / rs(y0), off = (k & 1) * dp / 2;
      for (let p = OPEN_START + 0.04 + off; p < OPEN_END - 0.04; p += dp) {
        if (inOpening(p, (y0 + y1) / 2)) continue;
        add(zr(outerZone((y0 + y1) / 2)), C.seam, beam(pol(rs(y0) + 0.03, p, y0), pol(rs(y1) + 0.03, p, y1), t * 1.6, t * 1.6));
      }
    }
    // 스테이브 냉각관 노즐 (EX-MID ~ EX-UP)
    let row = 0;
    for (let y = 20.2; y < 44.5; y += 1.5 * M * 1.6, row++) {
      const dp = 0.9 / rs(y), off = (row & 1) * dp / 2;
      for (let p = OPEN_START + 0.05 + off; p < OPEN_END - 0.05; p += dp) {
        if (inOpening(p, y, 0.3)) continue;
        const r = rs(y), z = outerZone(y);
        add(zr(z), C.nozzle, pipe(pol(r - 0.05, p, y), pol(r + 0.3 * M * 1.4, p, y), 0.07 * M * 1.4, 5));
        add(zr(z), C.nozzle, pipe(pol(r + 0.38 * M, p, y), pol(r + 0.46 * M, p, y), 0.12 * M * 1.4, 6));
      }
    }
  }

  // ═══ 2. 철피 개구부 프레임 + 떼어낸 철판 + 노저 출입문 ═══
  function frame(zone, phi, r, y0, w, h, ft = 0.35 * M) {
    const geos = [
      box(w + 2 * ft, ft, 0.6, 0, y0 + h + ft / 2, r), box(w + 2 * ft, ft, 0.6, 0, y0 - ft / 2, r),
      box(ft, h, 0.6, -w / 2 - ft / 2, y0 + h / 2, r), box(ft, h, 0.6, w / 2 + ft / 2, y0 + h / 2, r),
    ];
    geos.forEach((g) => add(zr(zone), C.frame, g.rotateY(phi)));
  }
  frame('IN-HEARTH', PHI_A, rs(A_SILL + WIN / 2), A_SILL, WIN, WIN);
  frame('IN-MID', PHI_B, rs(B_SILL + WIN / 2), B_SILL, WIN, WIN);
  frame('IN-HEARTH', PHI_D, rs(15), 14.0, DOOR_W, DOOR_H, 0.5 * M);
  // 떼어낸 철판 (주상 바닥에 눕혀 둠)
  add(zr('CAST'), C.plate, box(WIN, 0.08, WIN, 0, 14.04, 0).rotateY(0.4).translate(...pol(13, PHI_A + 0.35, 0)));
  add(zr('CAST'), C.plate, box(DOOR_W, 0.08, DOOR_H, 0, 14.04, 0).rotateY(0.2).translate(...pol(13.5, PHI_D - 0.3, 0)));
  // 노저 출입문 안쪽 경사로 + 철피~주상 사이 연결판
  {
    const g = zr('IN-HEARTH'), w = 3.6 * M;
    add(g, C.ramp, beam([0, 13.95, 9.7], [0, 13.95, 8.3], w, 0.12).rotateY(PHI_D));
    add(g, C.ramp, beam([0, 13.95, 8.3], [0, 12.15, 4.8], w, 0.12).rotateY(PHI_D));
    [-1, 1].forEach((s) => add(g, C.stripe, beam([s * w / 2, 14.1, 9.7], [s * w / 2, 12.3, 4.8], 0.08, 0.15).rotateY(PHI_D)));
  }

  // 지지면 (컨베이어 다리가 닿는 높이)
  const SUPPORT = [[9.5, 26, 14.0], [9.2, 17, 19.0], [10.2, 16, 24.0], [9.3, 15.5, 31.5], [0, 6.5, 12.05], [0, 6.5, 17.1], [0, 6.8, 19.45], [0, 7.5, 25.85]];
  const supportY = (r, yTop) => SUPPORT.reduce((m, [a, b, y]) => (r >= a && r <= b && y < yTop ? Math.max(m, y) : m), 0);

  // 송풍 팬 (축 = 로컬 +z 출구), 날개는 따로 회전
  function fanUnit(parent, key, x, y, z, yaw, rad = 0.8 * M) {
    const L = 1.4 * M;
    const geos = [
      new THREE.CylinderGeometry(rad, rad, L, 14, 1, true).rotateX(Math.PI / 2),
      new THREE.TorusGeometry(rad, 0.06, 4, 14).translate(0, 0, L / 2),
      new THREE.TorusGeometry(rad, 0.06, 4, 14).translate(0, 0, -L / 2),
      box(rad * 2.2, 0.25 * M, L * 1.1, 0, -rad - 0.12 * M, 0),
      new THREE.CylinderGeometry(rad * 0.45, rad * 0.45, 0.6 * M, 10).rotateX(Math.PI / 2).translate(0, 0, -L / 2 - 0.3 * M),
    ];
    const mtx = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
    geos.forEach((g) => add(parent, key, g.applyMatrix4(mtx)));
    const pivot = new THREE.Group(); pivot.position.set(x, y, z); pivot.rotation.y = yaw; parent.add(pivot);
    const bg = mergeGeometries([0, 1, 2, 3].map((i) => new THREE.BoxGeometry(rad * 0.85, 0.12 * M * 1.5, 0.04).translate(rad * 0.45, 0, 0).rotateZ(i * Math.PI / 2).toNonIndexed()));
    const blades = new THREE.Mesh(bg, mat(C.blade)); blades.position.z = L * 0.3; blades.raycast = noRay; pivot.add(blades);
    return { blades, outlet: new THREE.Vector3(0, 0, L / 2 + 0.1).applyMatrix4(mtx) };
  }
  // 주름 덕트 (튜브 + 리브)
  function duct(parent, pts, r, key = C.duct, ribKey = C.rib) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))));
    const len = curve.getLength();
    add(parent, key, new THREE.TubeGeometry(curve, Math.max(8, Math.round(len * 3)), r, 8, false));
    const n = Math.floor(len / (0.9 * M));
    for (let i = 1; i < n; i++) {
      const u = i / n, p = curve.getPointAt(u), tan = curve.getTangentAt(u);
      add(parent, ribKey, new THREE.TorusGeometry(r * 1.06, r * 0.09, 4, 10)
        .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan)).translate(p.x, p.y, p.z));
    }
  }

  // ═══ 2·3. 벽돌 컨베이어 + 환기 덕트 레인 ═══
  // pts: [[r, 벨트 윗면 y], ...] 지상 → 노 안
  function buildLane(name, phi, pts, sill, zones) {
    const lane = new THREE.Group(); lane.name = name; lane.rotation.y = phi; group.add(lane);
    const BW = 1.0 * M, x0 = -0.45, P = pts.map(([r, y]) => new THREE.Vector3(x0, y, r));
    for (let i = 0; i < P.length - 1; i++) {
      const A = P[i], B = P[i + 1];
      add(lane, C.belt, beam([x0, A.y - 0.05, A.z], [x0, B.y - 0.05, B.z], BW, 0.1));
      add(lane, C.steel, beam([x0, A.y - 0.22, A.z], [x0, B.y - 0.22, B.z], BW * 1.15, 0.18));
      [-1, 1].forEach((s) => add(lane, C.steel, beam([x0 + s * BW * 0.55, A.y + 0.18, A.z], [x0 + s * BW * 0.55, B.y + 0.18, B.z], 0.04, 0.05)));
    }
    // 레일 기둥·다리 (경로 따라 일정 간격)
    const seg = []; let total = 0;
    for (let i = 0; i < P.length - 1; i++) { const l = P[i].distanceTo(P[i + 1]); seg.push(l); total += l; }
    const at = (s) => {
      let i = 0; while (i < seg.length - 1 && s > seg[i]) { s -= seg[i]; i++; }
      const u = Math.min(1, s / seg[i]); return { p: P[i].clone().lerp(P[i + 1], u), tan: P[i + 1].clone().sub(P[i]).normalize() };
    };
    for (let s = 0.3; s < total; s += 1.2) {
      const { p } = at(s);
      [-1, 1].forEach((k) => add(lane, C.steel, pipe([x0 + k * BW * 0.55, p.y - 0.05, p.z], [x0 + k * BW * 0.55, p.y + 0.2, p.z], 0.02, 4)));
    }
    for (let s = 1; s < total; s += 3) {
      const { p } = at(s), sy = supportY(p.z, p.y - 0.3);
      if (p.y - 0.3 - sy < 0.3 || (p.z > 6.5 && p.z < 9.2)) continue;
      [-1, 1].forEach((k) => add(lane, C.steel, pipe([x0 + k * BW * 0.5, p.y - 0.3, p.z], [x0 + k * BW * 0.5, sy, p.z], 0.06, 5)));
      if (p.y - sy > 2) add(lane, C.steel, pipe([x0 - BW * 0.5, sy + 0.6, p.z], [x0 + BW * 0.5, p.y - 0.4, p.z], 0.03, 4));
    }
    // 앞뒤 드럼 + 지상 투입 호퍼
    [P[0], P[P.length - 1]].forEach((p) => add(lane, C.frame, new THREE.CylinderGeometry(0.12, 0.12, BW * 1.1, 8).rotateZ(Math.PI / 2).translate(x0, p.y - 0.1, p.z)));
    add(lane, C.steel, new THREE.CylinderGeometry(0.75, 0.35, 0.7, 4).rotateY(Math.PI / 4).translate(x0, P[0].y + 0.5, P[0].z - 0.4));
    // 벽돌 묶음 (InstancedMesh, 활성일 때 이동)
    const SP = 1.1, N = Math.floor(total / SP);
    const bricks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5 * M, 0.3 * M, 0.4 * M), mat(C.brick), N);
    bricks.raycast = noRay; bricks.castShadow = true; lane.add(bricks);
    // 환기 덕트 + 팬 (지상 → 개구부)
    const rG = pts[0][0], rK = pts[1][0], yK = pts[1][1], yAt = (r) => pts[0][1] + (yK - pts[0][1]) * (rG - r) / (rG - rK);
    const fan = fanUnit(lane, C.fan, 1.6, 0.6, rG - 1.2, Math.PI);
    const rSh = rs(sill + 1), dx = 0.45, dy = sill + 0.95;
    duct(lane, [fan.outlet, [1.3, 0.9, rG - 3], [dx, yAt(rG - 8) + 0.5, rG - 8], [dx, yAt((rG + rK) / 2) + 0.5, (rG + rK) / 2],
      [dx, yK + 0.55, rK - 0.5], [dx, dy, rSh + 2.5], [dx, dy, rSh - 0.5], [dx, dy - 0.4, rSh - 2.2]], 0.5 * M);
    const L = { lane, zones, bricks, at, total, SP, N, off: 0, fans: [fan.blades], active: false };
    lanes.push(L); placeBricks(L);
    return L;
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), Zf = new THREE.Vector3(0, 0, 1);
  function placeBricks(L) {
    if (!L.bricks) return;
    for (let i = 0; i < L.N; i++) {
      const s = (i * L.SP + L.off) % L.total, { p, tan } = L.at(s);
      p.y += 0.12; _q.setFromUnitVectors(Zf, tan);
      L.bricks.setMatrixAt(i, _m.compose(p, _q, _s));
    }
    L.bricks.instanceMatrix.needsUpdate = true;
  }
  const yA = A_SILL + 0.25, yB = B_SILL + 0.25;
  buildLane('lane-hearth', PHI_A, [[52.5, 0.9], [27, yA], [5.2, yA]], A_SILL, ['IN-HEARTH', 'IN-TUY']);
  buildLane('lane-mid', PHI_B, [[56, 0.9], [16.5, yB], [5.6, yB]], B_SILL, ['IN-MID', 'IN-UP']);
  // 풍구 레벨 환기 덕트 (컨베이어 없음)
  {
    const lane = new THREE.Group(); lane.name = 'lane-tuyere'; lane.rotation.y = PHI_C; group.add(lane);
    const fan = fanUnit(lane, C.fan, 0, 0.6, 31, Math.PI);
    duct(lane, [fan.outlet, [0, 1.6, 29], [0, 14.7, 26.8], [0, 15.3, 22], [0, 16.8, 14], [0, 17.5, 9.8], [0, 17.5, 8.4]], 0.5 * M);
    add(lane, C.frame, box(1.0 * M * 1.4, 1.0 * M * 1.4, 0.2, 0, 17.5, rs(17.5) + 0.1));
    lanes.push({ lane, zones: ['IN-TUY', 'IN-HEARTH'], fans: [fan.blades], active: false });
  }
  // 노저 출입문 경사로 (지상 → 주상 바닥, 미니 로더용)
  {
    const lane = new THREE.Group(); lane.name = 'ramp-hearth'; lane.rotation.y = PHI_D; group.add(lane);
    const w = 4 * M, r0 = 58, r1 = 26, h = 14.0, yAt = (r) => h * (r0 - r) / (r0 - r1);
    add(lane, C.ramp, beam([0, -0.05, r0], [0, h - 0.05, r1], w, 0.2));
    add(lane, C.ramp, beam([0, h - 0.05, r1], [0, h - 0.05, 9.6], w, 0.12));
    [-1, 1].forEach((s) => add(lane, C.stripe, beam([s * w / 2, 0.1, r0], [s * w / 2, h + 0.1, r1], 0.08, 0.25)));
    for (let r = r0 - 4; r > r1 + 0.5; r -= 4) {
      const y = yAt(r);
      [-1, 1].forEach((s) => add(lane, C.steel, pipe([s * w * 0.42, 0, r], [s * w * 0.42, y - 0.15, r], 0.1, 6)));
      if (y > 2) add(lane, C.steel, pipe([-w * 0.42, 0.4, r], [w * 0.42, y - 0.3, r], 0.04, 4));
    }
  }

  // ═══ 3. 노정 배기 덕트 (노 안 → 돔 → 배기팬 → 굴뚝) ═══
  const exhaust = { zones: ['IN-HEARTH', 'IN-TUY', 'IN-MID', 'IN-UP'], fans: [], active: false };
  {
    const g = zr('TOP'), phi = 4.0;
    const [fx, , fz] = pol(12, phi, 0);
    const fan = fanUnit(g, C.fan, fx, 48 + 0.9 * M * 1.2, fz, phi + Math.PI, 0.9 * M);
    const back = new THREE.Vector3(...pol(12 + 1.1, phi, 48 + 0.9 * M * 1.2));
    duct(g, [new THREE.Vector3(...pol(11.2, phi, 48 + 0.55)), pol(10, phi, 47.6), pol(7, phi, 46.6), pol(rs(46.6) - 0.2, phi, 46.6), pol(3.2, phi, 45.6), pol(2.6, phi, 44)], 0.6 * M, C.exhaust, C.seam);
    add(g, C.exhaust, pipe(back.toArray(), [back.x, 48 + 6, back.z], 0.5 * M, 10));
    add(g, C.frame, new THREE.CylinderGeometry(0.7 * M, 0.5 * M, 0.3, 10).translate(back.x, 48 + 6.2, back.z));
    exhaust.fans.push(fan.blades);
    lanes.push(exhaust);
  }

  // ═══ 4. 케이블 트레이 + 임시 분전반 ═══
  const tx = -20, tz = 20, TW = 0.6 * M;
  {
    // 계단탑 바깥면 사다리형 트레이
    const x = tx - 2.25;
    [-1, 1].forEach((s) => add(group, C.tray, box(0.05, 48.8, 0.05, x, 24.4, tz + s * TW / 2)));
    for (let y = 0.3; y < 48.8; y += 0.3 * M * 1.6) add(group, C.tray, box(0.04, 0.04, TW, x, y, tz));
    for (let y = 2; y < 48.8; y += 4) add(group, C.cable, box(0.12, 4, TW * 0.7, x - 0.07, y, tz));   // 묶은 케이블
    // 철피 세로 트레이 (구역별로 나눠 붙임)
    const phiS = 5.43;
    for (let y = 14; y < 45; y += 1.5) {
      const y1 = Math.min(45, y + 1.5), z = outerZone(y + 0.75);
      const r0 = rs(y) + 0.35, r1 = rs(y1) + 0.35, d0 = TW / 2 / r0, d1 = TW / 2 / r1;
      [-1, 1].forEach((s) => add(zr(z), C.tray, pipe(pol(r0, phiS + s * d0, y), pol(r1, phiS + s * d1, y1), 0.025, 4)));
      add(zr(z), C.cable, pipe(pol(r0 + 0.05, phiS, y), pol(r1 + 0.05, phiS, y1), 0.07, 5));
      for (let yy = y; yy < y1; yy += 0.5) add(zr(z), C.tray, pipe(pol(rs(yy) + 0.35, phiS - d0, yy), pol(rs(yy) + 0.35, phiS + d0, yy), 0.02, 4));
    }
    // 층마다 분전반 + 계단탑에서 늘어진 케이블
    const phiT = Math.atan2(tx, tz) + TAU + 0.2;
    [['CAST', 14, 24], ['EX-TUY', 19, 15.4], ['EX-MID', 24, 14.8], ['EX-UP', 31.5, 14.4], ['EX-UP', 39.5, 13.0], ['TOP', 48, 14.6]].forEach(([id, y, r]) => {
      const bw = 0.8 * M, bh = 1.2 * M, bd = 0.4 * M, g = zr(id);
      add(g, C.box, box(bw, bh, bd, 0, y + 0.3 * M + bh / 2, 0).rotateY(phiT).translate(...pol(r, phiT, 0)));
      add(g, C.frame, box(bw * 1.1, 0.06, bd * 1.1, 0, y + 0.3 * M + bh + 0.03, 0).rotateY(phiT).translate(...pol(r, phiT, 0)));
      [-1, 1].forEach((s) => add(g, C.frame, box(0.05, 0.3 * M, 0.05, s * bw * 0.4, y + 0.15 * M, 0).rotateY(phiT).translate(...pol(r, phiT, 0))));
      const a = new THREE.Vector3(tx + 2, y + 2.6, tz - 2), b = new THREE.Vector3(...pol(r, phiT, y + 0.3 * M + bh));
      const mid = a.clone().lerp(b, 0.5); mid.y = Math.min(a.y, b.y) - 0.9;
      add(bridge, C.cable, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, mid, b]), 16, 0.04, 4, false));
    });
  }

  // ═══ 5. 안전망 ═══
  function hNet(zone, y) {
    const R = radiusAt(y) * 0.9 - 0.3, tile = 1.2;
    add(zr(zone), 'net', scaleUV(new THREE.CircleGeometry(R, 32).rotateX(-Math.PI / 2).translate(0, y, 0), 2 * R / tile, 2 * R / tile));
    add(zr(zone), C.rope, new THREE.TorusGeometry(R, 0.04, 4, 40).rotateX(Math.PI / 2).translate(0, y, 0));
  }
  hNet('IN-UP', 35.4);    // 매달린 작업 발판 아래
  hNet('TOP', 44.3);      // 노정 데크 아래 (노구)
  [[Math.PI + 0.25, 1.25], [Math.PI + 2.1, Math.PI - 2.1 - 0.45]].forEach(([ps, pl]) => {
    const r = 10.55, y0 = 39.6, y1 = 45.8;
    add(zr('EX-UP'), 'net', scaleUV(new THREE.LatheGeometry([V2(r, y0), V2(r, y1)], 24, ps, pl), r * pl / 1.2, (y1 - y0) / 1.2));
  });

  // ═══ 6. 노 안 임시 조명 줄 + 중앙 작업 케이지 ═══
  function bulbString(zone, y, sag = 0.35) {
    const r = radiusAt(y) * 0.9 - 0.5, hook = 0.45, sub = 5;
    let prev = null;
    for (let p0 = OPEN_START + 0.12; p0 < OPEN_END - 0.12 - hook; p0 += hook) {
      for (let j = 0; j <= sub; j++) {
        if (prev && j === 0) continue;
        const u = j / sub, p = p0 + hook * u, yy = y - sag * 4 * u * (1 - u);
        const pt = pol(r, p, yy);
        if (prev) add(zr(zone), C.cable, pipe(prev, pt, 0.02, 3));
        if (j > 0 && j < sub) add(zr(zone), 'bulb', new THREE.SphereGeometry(0.15 * M * 1.2, 6, 4).translate(pt[0], pt[1] - 0.12, pt[2]));
        prev = pt;
      }
    }
  }
  bulbString('IN-HEARTH', 12.05 + 2.7);
  bulbString('IN-TUY', 18.6, 0.2);
  bulbString('IN-MID', 23.0);
  bulbString('IN-UP', 29.2); bulbString('IN-UP', 33.5);
  // 호이스트 로프 (구역별 조각) + 노정 도르래
  [['TOP', 45, 47.3], ['IN-UP', 25.5, 45], ['IN-MID', 19, 25.5], ['IN-TUY', 17, 19]].forEach(([id, a, b]) => add(zr(id), C.rope, pipe([0, a, 0], [0, b, 0], 0.04, 4)));
  add(zr('TOP'), C.frame, box(0.8, 0.5, 0.5, 0, 47.4, 0));
  const cage = new THREE.Group(); cage.name = 'work-cage'; cage.position.y = 12.15; zr('IN-HEARTH').add(cage);
  {
    const w = 2 * M, h = 2.5 * M, hw = w / 2, k = C.cage;
    add(cage, k, box(w, 0.1, w, 0, 0.05, 0));
    const cn = [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]];
    cn.forEach(([x, z], i) => {
      const [x2, z2] = cn[(i + 1) % 4];
      add(cage, k, pipe([x, 0, z], [x, h, z], 0.04, 5));
      add(cage, k, pipe([x, h, z], [x2, h, z2], 0.035, 4));
      add(cage, k, pipe([x, h * 0.45, z], [x2, h * 0.45, z2], 0.03, 4));
      add(cage, k, pipe([x, h, z], [0, h + 0.9, 0], 0.025, 4));
    });
    add(cage, C.frame, box(0.25, 0.3, 0.25, 0, h + 1.0, 0));
    add(cage, C.rope, pipe([0, h + 1.1, 0], [0, 17 - 12.15 + 0.3, 0], 0.04, 4));
  }
  const cageZones = ['IN-HEARTH'];
  let cageActive = false;

  flush();

  // ── 상태 ──
  const ZONE_IDS = Object.keys(ZONE_INFO);
  let night = false, lastSec = null, cageT = 0;
  function setActive({ tasks = [], conflicts = [], t } = {}) {
    void conflicts;
    const now = toMs(t);
    const act = new Set();
    (tasks || []).forEach((k) => {
      if (now != null && k.start && k.end && !(Date.parse(k.start) <= now && now < Date.parse(k.end))) return;
      (k.zone_ids || []).forEach((z) => act.add(z));
    });
    lanes.forEach((L) => { L.active = L.zones.some((z) => act.has(z)); });
    cageActive = cageZones.some((z) => act.has(z));
    if (now != null) { const h = new Date(now).getHours(); night = h >= 19 || h < 7; } else night = false;
  }
  function refresh() {
    const anyIso = ZONE_IDS.some((id) => furnace.isGhosted(id));
    zoneRoots.forEach((g, id) => { g.visible = !furnace.isGhosted(id); });
    group.visible = !anyIso;
    const cast = furnace.zoneGroup('CAST');
    bridge.visible = !(cast && cast.position.y > 0.01);
  }
  function update(sec = 0) {
    const dt = lastSec == null ? 0 : Math.min(0.1, Math.max(0, sec - lastSec)); lastSec = sec;
    lanes.forEach((L) => {
      if (!L.active) return;
      L.fans.forEach((b) => { b.rotation.z += dt * 9; });
      if (L.bricks) { L.off = (L.off + dt * 1.2) % L.total; placeBricks(L); }
    });
    if (cageActive) { cageT += dt; cage.position.y = 12.15 + 0.6 * (0.5 - 0.5 * Math.cos(cageT * 0.5)); }
    const target = night ? 1.8 : 0.3;
    bulbMat.emissiveIntensity += (target - bulbMat.emissiveIntensity) * Math.min(1, dt * 4 || 1);
    const cast = furnace.zoneGroup('CAST');
    bridge.visible = !(cast && cast.position.y > 0.01);
  }
  function dispose() {
    group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    zoneRoots.forEach((g) => { g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); g.removeFromParent(); });
    mats.forEach((m) => m.dispose()); textures.forEach((t) => t.dispose());
    group.removeFromParent();
  }
  refresh();
  return { group, setActive, refresh, update, dispose };
}
