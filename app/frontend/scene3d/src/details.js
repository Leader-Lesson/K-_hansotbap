// 개수 현장 디테일 — 난간·풍구·벽돌 줄눈·비계·계단탑·컨베이어·부지 (점토 무광 스타일)
// 모든 좌표는 '모형 단위'. 재질(색)별·구역별로 지오메트리를 합쳐 메시 수를 줄인다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ZONE_INFO, radiusAt, OPEN_PHI, PERSON_H_MODEL } from './furnace.js';

const PH = PERSON_H_MODEL;          // 사람 키 (≈2.23)
const RAIL_H = PH * 0.55;           // 난간 높이
const OPEN_START = Math.PI / 2, OPEN_LEN = Math.PI * 1.5;   // 노 벽 270° (furnace.js와 동일)
const TAU = Math.PI * 2;

// 무광 점토 팔레트 (색 하나당 재질 하나)
const C = {
  rail: '#d6c27e', pipe: '#9c9890', tuy: '#8a857d', brick: '#b98a6c', mortar: '#8c6a56',
  carbon: '#4b4946', carbon2: '#5c5955', scaf: '#c99f6a', plank: '#b8a07a', steel: '#a7a39b',
  runner: '#7d6f63', iron: '#5e4f45', concrete: '#d6d2cb', ground: '#ebe8e2', edge: '#cdc8c0',
  road: '#c3bfb8', dash: '#e6e1d5', cont1: '#9fb0b8', cont2: '#c9b48a', door: '#6f7a80', roof: '#b3aea6',
};

const V2 = (x, y) => new THREE.Vector2(x, y);
const pol = (r, phi, y) => [r * Math.sin(phi), y, r * Math.cos(phi)];   // x = r·sinφ, z = r·cosφ

// 두 점 사이 원기둥
function pipe(a, b, r, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
}
// 두 점 사이 각재(박스) — 갤러리·계단 등
function beam(a, b, w, h) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const g = new THREE.BoxGeometry(w, h, d.length());
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()));
  return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
}
// 원호 띠 (반지름 r, 높이 y0~y1) — 난간 레일·줄눈용
function arcBand(r, y0, y1, ps = 0, pl = TAU, seg = 64) {
  return new THREE.LatheGeometry([V2(r, y0), V2(r, y1)], seg, ps, pl);
}
// 원호 평판 (반지름 r0~r1, 높이 y) — 비계 발판·플랫폼
function arcFlat(r0, r1, y, ps = 0, pl = TAU, seg = 64) {
  return new THREE.LatheGeometry([V2(r1, y), V2(r0, y)], seg, ps, pl);
}
// 두께 있는 고리 바닥판
function slabRing(y, rIn, rOut, t = 0.25, seg = 48) {
  return new THREE.LatheGeometry([V2(rIn, y), V2(rOut, y), V2(rOut, y + t), V2(rIn, y + t), V2(rIn, y)], seg);
}
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

export function buildDetails(furnace) {
  const group = new THREE.Group(); group.name = 'details';
  furnace.decor.add(group);

  const mats = new Map();
  const mat = (c) => {
    if (!mats.has(c)) mats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }));
    return mats.get(c);
  };
  const buckets = new Map();   // "구역|색" → 지오메트리 목록
  const add = (zone, color, geo) => {
    const k = zone + '|' + color;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(geo);
  };

  // ── 난간 (기둥 2인 간격 + 상부·중간 레일 + 발끝막이) ──
  function railRing(zone, y, r, cx = 0, cz = 0, ps = 0, pl = TAU) {
    const n = Math.max(6, Math.round(pl * r / (2 * PH)));
    const full = pl >= TAU - 1e-3;
    for (let i = 0; i <= n - (full ? 1 : 0); i++) {
      const p = ps + pl * i / n;
      add(zone, C.rail, new THREE.CylinderGeometry(0.06, 0.06, RAIL_H, 5).translate(cx + r * Math.sin(p), y + RAIL_H / 2, cz + r * Math.cos(p)));
    }
    const seg = Math.max(24, Math.round(pl * r * 1.5));
    [RAIL_H - 0.05, RAIL_H * 0.5].forEach((h) => add(zone, C.rail, arcBand(r, y + h - 0.05, y + h + 0.05, ps, pl, seg).translate(cx, 0, cz)));
    add(zone, C.rail, arcBand(r, y, y + 0.16, ps, pl, seg).translate(cx, 0, cz));   // 발끝막이
  }
  // ── 사다리 (세로) ──
  function ladder(zone, x, z, y0, y1, along = 'z') {
    const o = 0.35;
    const [ax, az] = along === 'z' ? [0, o] : [o, 0];
    add(zone, C.steel, pipe([x - ax, y0, z - az], [x - ax, y1, z - az], 0.05, 4));
    add(zone, C.steel, pipe([x + ax, y0, z + az], [x + ax, y1, z + az], 0.05, 4));
    for (let y = y0 + 0.4; y < y1; y += 0.75) add(zone, C.steel, pipe([x - ax, y, z - az], [x + ax, y, z + az], 0.035, 4));
  }

  // ═══ EX-TUY: 송풍지관 24개 + 난간 ═══
  for (let i = 0; i < 24; i++) {
    const p = (i + 0.5) / 24 * TAU;
    const A = pol(11.0, p, 20.1), B = pol(8.95, p, 19.55), Cc = pol(8.78, p, 17.5);
    add('EX-TUY', C.tuy, pipe(A, B, 0.22));
    add('EX-TUY', C.tuy, pipe(B, Cc, 0.18));
    add('EX-TUY', C.pipe, new THREE.SphereGeometry(0.26, 6, 4).translate(...B));   // 엘보
  }
  railRing('EX-TUY', 19, 16.85);

  // ═══ EX-MID / CAST / TOP 난간 ═══
  railRing('EX-MID', 24, 15.85);
  railRing('CAST', 14, 25.85);
  railRing('TOP', 48, 15.85);
  railRing('TOP', 48, 6.4);

  // ═══ EX-UP: 난간 2단 + 냉각수 수직관 + 비계 ═══
  railRing('EX-UP', 31.5, 15.35);
  railRing('EX-UP', 39.5, 13.85);
  for (let i = 0; i < 16; i++) {
    const p = OPEN_START + 0.1 + (OPEN_LEN - 0.2) * i / 15;
    const ys = [25.5, 28, 31, 35, 39, 43, 45];
    for (let k = 0; k < ys.length - 1; k++) {
      add('EX-UP', C.pipe, pipe(pol(radiusAt(ys[k]) + 1.55, p, ys[k]), pol(radiusAt(ys[k + 1]) + 1.55, p, ys[k + 1]), 0.14));
    }
  }
  {
    const r1 = 8.4, r2 = 10.4, y0 = 39.5, lv = [41.5, 43.5, 45.5];
    const ps = Math.PI, pe = TAU - 0.25, n = Math.round((pe - ps) * r1 / 2.0);
    for (let i = 0; i <= n; i++) {
      const p = ps + (pe - ps) * i / n;
      add('EX-UP', C.scaf, pipe(pol(r1, p, y0), pol(r1, p, 45.9), 0.07, 5));
      add('EX-UP', C.scaf, pipe(pol(r2, p, y0), pol(r2, p, 45.9), 0.07, 5));
      lv.forEach((y) => add('EX-UP', C.scaf, pipe(pol(r1, p, y), pol(r2, p, y), 0.05, 4)));
      if (i < n) {   // 대각 가새
        const q = ps + (pe - ps) * (i + 1) / n;
        add('EX-UP', C.scaf, pipe(pol(r2, p, y0), pol(r2, q, lv[1]), 0.045, 4));
      }
    }
    lv.forEach((y) => {
      add('EX-UP', C.scaf, arcBand(r1, y - 0.05, y + 0.05, ps, pe - ps, 40));
      add('EX-UP', C.scaf, arcBand(r2, y - 0.05, y + 0.05, ps, pe - ps, 40));
      add('EX-UP', C.plank, arcFlat(r1, r2, y - 0.06, ps, pe - ps, 40));
    });
  }

  // ═══ IN-MID / IN-UP: 내화벽돌 축조 + 줄눈 ═══
  function brickLining(zone, y0, y1, step = 0.5) {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const y = y0 + (y1 - y0) * i / 10; pts.push(V2(radiusAt(y) * 0.9 - 0.12, y)); }
    add(zone, C.brick, new THREE.LatheGeometry(pts, 48, OPEN_START, OPEN_LEN));
    for (let y = y0 + step; y < y1 - 0.05; y += step) {
      const r = radiusAt(y) * 0.9 - 0.15;
      add(zone, C.mortar, arcBand(r, y - 0.03, y + 0.03, OPEN_START, OPEN_LEN, 48));
    }
  }
  brickLining('IN-MID', 19.45, 25.5);
  const upTop = 25.5 + (45 - 25.5) * 0.6;   // 축조 중: 60%까지만
  brickLining('IN-UP', 25.5, upTop);
  {
    // 쌓고 있는 맨 윗단 (일부 둘레만)
    const r = radiusAt(upTop) * 0.9 - 0.12;
    add('IN-UP', C.brick, new THREE.LatheGeometry([V2(r, upTop), V2(r, upTop + 0.45)], 24, OPEN_START, OPEN_LEN * 0.55));
    // 매달린 작업 발판 (고리형) + 와이어 + 난간 + 벽돌 팔레트
    const py = upTop - 0.6, rr = radiusAt(py) * 0.9 - 0.25, rIn = rr - 2.4;
    add('IN-UP', C.plank, slabRing(py, rIn, rr, 0.2));
    railRing('IN-UP', py + 0.2, rIn + 0.1);
    for (let i = 0; i < 6; i++) {
      const p = i / 6 * TAU + 0.3;
      add('IN-UP', C.steel, pipe(pol(rr - 1.2, p, py + 0.2), pol(rr - 1.2, p, 45.5), 0.03, 4));
    }
    [Math.PI * 0.9, Math.PI * 1.3, Math.PI * 1.7].forEach((p) => {
      const [x, , z] = pol(rr - 1.2, p, 0);
      add('IN-UP', C.brick, box(0.9, 0.5, 0.9, x, py + 0.45, z));
    });
  }

  // ═══ IN-HEARTH: 카본 블록 바닥 ═══
  {
    const R = radiusAt(12.2) * 0.9, s = 1.45;
    for (let ix = -6; ix <= 6; ix++) for (let iz = -6; iz <= 6; iz++) {
      const x = ix * s, z = iz * s;
      if (Math.hypot(x, z) + 0.95 > R) continue;
      add('IN-HEARTH', (ix + iz) & 1 ? C.carbon : C.carbon2, box(1.33, 0.08, 1.33, x, 12.09, z));
    }
  }

  // ═══ CAST: 출선구 탕도 2개 + 상옥 기둥 ═══
  [0.3, 1.25].forEach((p) => {
    const r0 = 8.7, r1 = 25.2, len = r1 - r0, rm = (r0 + r1) / 2;
    const tr = (g) => g.rotateY(p).translate(rm * Math.sin(p), 0, rm * Math.cos(p));
    add('CAST', C.runner, tr(new THREE.BoxGeometry(1.1, 0.4, len).translate(0, 14.2, 0)));
    add('CAST', C.iron, tr(new THREE.BoxGeometry(0.55, 0.05, len - 0.3).translate(0, 14.42, 0)));
  });
  [[-6.5, 15.5], [6.5, 15.5], [0, 24.5]].forEach(([x, z]) => add('CAST', C.steel, box(0.8, 7.7, 0.8, x, 17.85, z)));
  [-6.5, 6.5].forEach((x) => add('CAST', C.steel, box(0.4, 0.5, 9, x, 21.45, 20)));

  // ═══ STOVE: 띠·플랫폼·사다리 ═══
  [-12, 0, 12].forEach((z) => {
    for (let y = 4; y < 41; y += 7) add('STOVE', C.steel, new THREE.TorusGeometry(4.38, 0.12, 4, 32).rotateX(Math.PI / 2).translate(-42, y, z));
    [20, 36].forEach((y) => {
      add('STOVE', C.concrete, slabRing(y, 4.3, 5.8, 0.25, 32).translate(-42, 0, z));
      railRing('STOVE', y + 0.25, 5.7, -42, z);
    });
    ladder('STOVE', -42 + 4.95, z, 0, 42);
  });

  // ═══ GAS: 제진기 보행로 + 사다리 ═══
  [20, 34].forEach((y) => {
    add('GAS', C.concrete, slabRing(y, 5.0, 6.6, 0.25, 32).translate(36, 0, -6));
    railRing('GAS', y + 0.25, 6.5, 36, -6);
  });
  ladder('GAS', 36 - 6.1, -6, 0, 34.3);

  // ═══ 장식(구역 아님): 계단탑·컨베이어·부지·도로·현장사무소 ═══
  const D = 'decor';
  {
    const tx = -20, tz = 20, h = 2, top = 48 + RAIL_H;
    const cn = [[-h, -h], [h, -h], [h, h], [-h, h]];
    cn.forEach(([dx, dz]) => add(D, C.steel, pipe([tx + dx, 0, tz + dz], [tx + dx, top, tz + dz], 0.12, 6)));
    for (let y = 0, b = 0; y < 48; y += 4, b++) {
      for (let f = 0; f < 4; f++) {
        const [ax, az] = cn[f], [bx, bz] = cn[(f + 1) % 4];
        add(D, C.steel, pipe([tx + ax, y + 4, tz + az], [tx + bx, y + 4, tz + bz], 0.07, 4));
        const flip = (b + f) & 1;
        add(D, C.steel, pipe([tx + ax, y + (flip ? 4 : 0), tz + az], [tx + bx, y + (flip ? 0 : 4), tz + bz], 0.05, 4));
      }
      // 계단 (층마다 지그재그)
      const s = b & 1 ? 1 : -1;
      add(D, C.concrete, beam([tx - 1.3 * s, y + 0.2, tz - 0.8], [tx + 1.3 * s, y + 3.9, tz - 0.8], 1.1, 0.15));
    }
    const phi = Math.atan2(tx, tz), rT = Math.hypot(tx, tz) - h;
    [[14, 26], [19, 17], [24, 16], [31.5, 15.5], [39.5, 14], [48, 16]].forEach(([y, rOut]) => {
      add(D, C.concrete, box(4.4, 0.25, 4.4, tx, y - 0.125, tz));
      const r0 = rOut - 0.3, len = rT - r0;
      if (len > 0.2) {   // 작업대로 건너가는 연결 다리
        const rm = (rT + r0) / 2;
        add('decor-bridge', C.concrete, new THREE.BoxGeometry(1.6, 0.2, len).rotateY(phi).translate(rm * Math.sin(phi), y - 0.1, rm * Math.cos(phi)));
      }
    });
  }
  {
    // 장입 컨베이어 갤러리 (지상 → 노정)
    const A = [55, 1.2, -30], B = [8, 55, -4];
    add(D, C.roof, beam(A, B, 2.4, 2.2));
    add(D, C.concrete, box(6, 5, 6, 57, 2.5, -31.5));   // 하부 전환탑
    const d = new THREE.Vector3(B[0] - A[0], 0, B[2] - A[2]).normalize(), px = -d.z * 1.2, pz = d.x * 1.2;
    [0.2, 0.4, 0.6, 0.8].forEach((t) => {
      const x = A[0] + (B[0] - A[0]) * t, y = A[1] + (B[1] - A[1]) * t - 1.1, z = A[2] + (B[2] - A[2]) * t;
      add(D, C.steel, pipe([x + px, 0, z + pz], [x + px, y, z + pz], 0.22, 6));
      add(D, C.steel, pipe([x - px, 0, z - pz], [x - px, y, z - pz], 0.22, 6));
      for (let yy = 6; yy < y; yy += 8) add(D, C.steel, pipe([x + px, yy, z + pz], [x - px, yy, z - pz], 0.1, 4));
      add(D, C.steel, pipe([x + px, y, z + pz], [x - px, y, z - pz], 0.15, 4));
    });
  }
  {
    // 부지 바닥 + 경계 + 도로
    add(D, C.ground, box(170, 0.2, 140, 0, -0.12, 5));
    [[0, -65, 170, 0.3], [0, 75, 170, 0.3], [-85, 5, 0.3, 140], [85, 5, 0.3, 140]].forEach(([x, z, w, dd]) => add(D, C.edge, box(w, 0.35, dd, x, 0.15, z)));
    add(D, C.road, box(160, 0.06, 7, 0, 0.0, 54));
    add(D, C.road, box(7, 0.06, 112, 64, 0.0, -2));
    for (let x = -76; x < 78; x += 6) add(D, C.dash, box(2.5, 0.02, 0.25, x, 0.04, 54));
    for (let z = -56; z < 50; z += 6) add(D, C.dash, box(0.25, 0.02, 2.5, 64, 0.04, z));
  }
  {
    // 현장 사무소 컨테이너 (전기실 옆) — 사람 기준 크기
    const L = PH * 3, H = PH * 1.3, W = PH * 1.2;
    [[18.5, 0, 35, C.cont1], [18.5, 0, 38.2, C.cont2], [18.5, 1, 35, C.cont2], [-19, 0, 40, C.cont1], [-19, 0, 43.2, C.cont1]].forEach(([x, lv, z, c]) => {
      const y = H / 2 + lv * H;
      add(D, c, box(L, H, W, x, y, z));
      add(D, C.door, box(L * 0.7, H * 0.3, 0.05, x, y + H * 0.1, z + W / 2 + 0.03));   // 창 띠
    });
    add(D, C.steel, beam([18.5 + L / 2 + 0.6, 0, 35 + W / 2 + 0.6], [18.5 + L / 2 + 0.6 - 2.6, H, 35 + W / 2 + 0.6], 0.9, 0.12));   // 2층 계단
  }

  // ── 합치기 → 메시 ──
  const zoneItems = [], decorItems = [], bridgeItems = [];
  const noRay = () => {};
  buckets.forEach((geos, k) => {
    const [zone, color] = k.split('|');
    const list = geos.map((g) => { const n = g.index ? g.toNonIndexed() : g; if (n !== g) g.dispose(); return n; });
    const merged = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    if (!merged) return;
    const isDecor = zone.startsWith('decor');
    const parent = isDecor ? group : furnace.zoneGroup(zone);
    if (!parent) { merged.dispose(); return; }
    const m = new THREE.Mesh(merged, mat(color));
    m.raycast = noRay; m.userData.detailZone = zone; m.name = 'detail:' + k;
    parent.add(m);
    (zone === 'decor-bridge' ? bridgeItems : isDecor ? decorItems : zoneItems).push(m);
  });

  const ZONE_IDS = Object.keys(ZONE_INFO);
  // 상태 변경(층 따로 보기·분해) 뒤 호출
  function refresh() {
    const anyIso = ZONE_IDS.some((id) => furnace.isGhosted(id));
    const top = furnace.zoneGroup('TOP');
    const exploded = !!top && top.position.y > 0.01;
    zoneItems.forEach((m) => { m.visible = !furnace.isGhosted(m.userData.detailZone); });
    group.visible = !anyIso;
    bridgeItems.forEach((m) => { m.visible = !exploded; });
  }
  function dispose() {
    [...zoneItems, ...decorItems, ...bridgeItems].forEach((m) => { m.removeFromParent(); m.geometry.dispose(); });
    mats.forEach((m) => m.dispose());
    group.removeFromParent();
  }
  refresh();
  return { refresh, dispose, group };
}
