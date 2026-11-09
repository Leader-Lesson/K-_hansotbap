// 현장 소품 — 적치장·안전시설·조명탑·복지시설·작업대 소품·가설 펜스 (점토 무광, 저폴리)
// 좌표는 '모형 단위'. 크기는 실제 미터 × M (고로 110m = 67단위). 사람만 과장(고로/30).
// 손 소품(소화기·공구함)은 약간 키우고, 표지판은 글씨가 읽히도록 최대 2배까지 키움.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ZONE_INFO, OPEN_PHI } from './furnace.js';

const M = 67 / 110;          // 1m → 모형 단위
const HAND = 1.6;            // 손 소품 확대
const SIGN = 2.0;            // 표지판 확대
const TAU = Math.PI * 2;
const pol = (r, phi, y = 0) => [r * Math.sin(phi), y, r * Math.cos(phi)];
const noRay = () => {};

// 무광 점토 팔레트
const C = {
  yard: '#d3ccbf', wood: '#a88a62', woodD: '#7d6447', brick: '#b98a6c', wrap: '#e9e4da',
  carbon: '#4b4946', steel: '#9c978f', steelD: '#6f6a63', primer: '#a5604e', copper: '#b07a52',
  bag: '#c8b48a', red: '#b8413a', white: '#eeebe5', orange: '#d9773a', yellow: '#d6b84a',
  black: '#3a3734', green: '#3f7a4f', acet: '#7a3f2f', blue: '#5f87a8', tent: '#a9bccb',
  cont: '#8fa3ad', cont2: '#c4a874', gen: '#c9b25a', concrete: '#cfcac2', glass: '#5a6670',
  aspgreen: '#4f9a5c', welder: '#4f7f6a', blanket: '#d07a3a', bench: '#8c7a62',
};

// 캔버스 표지판 텍스처
function signTex(lines, { bg = '#ffffff', fg = '#c0302a', border = null, w = 512, h = 256, cross = null } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = border; g.lineWidth = h * 0.07; g.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1); }
  let x0 = 0;
  if (cross) {   // 녹십자
    const s = h * 0.5, cx = h * 0.5, cy = h / 2;
    g.fillStyle = cross; g.fillRect(cx - s / 6, cy - s / 2, s / 3, s); g.fillRect(cx - s / 2, cy - s / 6, s, s / 3);
    x0 = h * 0.45;
  }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = lines.length, lh = (h * 0.78) / n;
  lines.forEach((t, i) => {
    let fs = Math.floor(lh * 0.82);
    const maxW = (w - x0) * 0.88;
    do { g.font = `bold ${fs}px "Malgun Gothic","Noto Sans KR","Apple SD Gothic Neo",sans-serif`; fs -= 2; } while (g.measureText(t).width > maxW && fs > 10);
    g.fillText(t, x0 + (w - x0) / 2, h * 0.11 + lh * (i + 0.5));
  });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
function fenceTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 64, 64); g.strokeStyle = 'rgba(120,118,112,0.95)'; g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 61, 61);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(12, 7); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 기본 지오메트리 (바닥 y 기준)
const box = (w, h, d, x = 0, y = 0, z = 0, ry = 0) => new THREE.BoxGeometry(w, h, d).rotateY(ry).translate(x, y + h / 2, z);
const cyl = (r, h, x = 0, y = 0, z = 0, seg = 8, r2 = r) => new THREE.CylinderGeometry(r2, r, h, seg).translate(x, y + h / 2, z);
function pipe(a, b, r, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
}
const Y = new THREE.Vector3(0, 1, 0);
const M4 = (x, y, z, ry = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
  new THREE.Quaternion().setFromAxisAngle(Y, ry), typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s));
const merge = (list) => { const n = list.map((g) => (g.index ? g.toNonIndexed() : g)); const m = mergeGeometries(n, false); n.forEach((g) => g.dispose()); return m; };

export function buildSiteProps(furnace) {
  const group = new THREE.Group(); group.name = 'siteprops';
  (furnace.decor || furnace.model || furnace.root).add(group);

  const mats = new Map(), textures = [], extraGeos = [];
  const mat = (c) => {
    if (!mats.has(c)) mats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0 }));
    return mats.get(c);
  };
  // 소유자: 'G' = 지상(group), 그 외 = 구역 id (zoneGroup 아래 별도 그룹)
  const zoneRoots = new Map();
  const root = (owner) => {
    if (owner === 'G') return group;
    if (zoneRoots.has(owner)) return zoneRoots.get(owner);
    const zg = furnace.zoneGroup && furnace.zoneGroup(owner);
    if (!zg) return null;
    const r = new THREE.Group(); r.name = 'siteprops:' + owner; zg.add(r); zoneRoots.set(owner, r);
    return r;
  };

  // ── 재질별 합치기 버킷 ──
  const buckets = new Map();
  const add = (owner, color, geo) => {
    const k = owner + '|' + color;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(geo);
  };
  // 로컬 좌표로 만든 소품을 (x,y,z, ry)로 배치
  const at = (owner, x, y, z, ry, fn) => fn((color, geo) => add(owner, color, geo.rotateY(ry).translate(x, y, z)));

  // ── 인스턴스 ──
  const instDefs = new Map();
  const defInst = (key, geo, material) => instDefs.set(key, { geo, material, per: new Map() });
  const inst = (key, owner, m4) => {
    const d = instDefs.get(key); if (!d.per.has(owner)) d.per.set(owner, []);
    d.per.get(owner).push(m4);
  };

  // 공용 인스턴스 지오메트리 (실측 × M)
  defInst('coneBody', merge([new THREE.ConeGeometry(0.17 * M * HAND, 0.7 * M * HAND, 8).translate(0, (0.04 + 0.35) * M * HAND, 0),
    new THREE.BoxGeometry(0.4 * M * HAND, 0.04 * M * HAND, 0.4 * M * HAND).translate(0, 0.02 * M * HAND, 0)]), mat(C.orange));
  defInst('coneBand', new THREE.CylinderGeometry(0.078 * M * HAND, 0.106 * M * HAND, 0.12 * M * HAND, 8).translate(0, 0.38 * M * HAND, 0), mat(C.white));
  const barrierGeo = merge([box(2 * M, 0.55 * M, 0.55 * M), box(1.85 * M, 0.45 * M, 0.32 * M, 0, 0.55 * M, 0)]);
  defInst('barR', barrierGeo, mat(C.red));
  defInst('barW', barrierGeo.clone(), mat(C.white));
  defInst('palBase', box(1.1 * M, 0.15 * M, 1.1 * M), mat(C.wood));
  defInst('palBrick', box(1.0 * M, 0.85 * M, 1.0 * M, 0, 0.15 * M, 0), mat(C.brick));
  defInst('palWrap', merge([box(0.07 * M, 0.87 * M, 1.03 * M, -0.25 * M, 0.14 * M, 0), box(0.07 * M, 0.87 * M, 1.03 * M, 0.25 * M, 0.14 * M, 0),
    box(1.03 * M, 0.1 * M, 1.03 * M, 0, 0.9 * M, 0)]), mat(C.wrap));
  defInst('crate', box(2.4 * M, 0.9 * M, 0.9 * M), mat(C.wood));
  defInst('crateBand', merge([box(0.1 * M, 0.94 * M, 0.94 * M, -0.9 * M, -0.02 * M, 0), box(0.1 * M, 0.94 * M, 0.94 * M, 0.9 * M, -0.02 * M, 0)]), mat(C.woodD));
  defInst('sandbag', new THREE.SphereGeometry(0.5, 8, 4).scale(0.6 * M, 0.18 * M, 0.38 * M).translate(0, 0.09 * M, 0), mat(C.bag));
  defInst('chainPost', merge([cyl(0.03 * M * HAND, 1.0 * M), cyl(0.15 * M, 0.06 * M, 0, 0, 0, 8, 0.12 * M)]), mat(C.yellow));

  // 가설 펜스 패널 (3.5m × 2m, 반투명 메시 텍스처)
  const fTex = fenceTex(); textures.push(fTex);
  const PW = 3.5 * M, PHt = 2 * M;
  const fenceMat = new THREE.MeshStandardMaterial({ map: fTex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, roughness: 0.9, depthWrite: false, color: '#ffffff' });
  defInst('fencePanel', new THREE.PlaneGeometry(PW, PHt).translate(0, PHt / 2 + 0.1 * M, 0), fenceMat);
  defInst('fenceFrame', merge([pipe([-PW / 2, 0.1 * M, 0], [-PW / 2, PHt + 0.1 * M, 0], 0.025 * M * 2, 4),
    pipe([-PW / 2, PHt + 0.1 * M, 0], [PW / 2, PHt + 0.1 * M, 0], 0.025 * M * 2, 4), pipe([-PW / 2, 0.15 * M, 0], [PW / 2, 0.15 * M, 0], 0.025 * M * 2, 4)]), mat(C.steel));
  defInst('fenceFoot', box(0.6 * M, 0.15 * M, 0.25 * M), mat(C.concrete));

  // ── 헬퍼: 소품 ──
  const coneAt = (owner, x, z, y = 0) => { inst('coneBody', owner, M4(x, y, z)); inst('coneBand', owner, M4(x, y, z)); };
  function barrierLine(pts, owner = 'G') {   // 레드/화이트 교대 배치
    let k = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.floor(L / (2.05 * M)));
      const ry = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
      for (let j = 0; j < n; j++, k++) { const t = (j + 0.5) / n; inst(k % 2 ? 'barW' : 'barR', owner, M4(ax + (bx - ax) * t, 0, az + (bz - az) * t, ry)); }
    }
  }
  function chainLine(pts, closed = false, owner = 'G', y = 0) {   // 체인 기둥 + 체인
    const list = closed ? [...pts, pts[0]] : pts;
    for (let i = 0; i < list.length - 1; i++) {
      const [ax, az] = list[i], [bx, bz] = list[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / (2 * M)));
      for (let j = 0; j < n; j++) {
        const t0 = j / n, t1 = (j + 1) / n, p0 = [ax + (bx - ax) * t0, az + (bz - az) * t0], p1 = [ax + (bx - ax) * t1, az + (bz - az) * t1];
        inst('chainPost', owner, M4(p0[0], y, p0[1]));
        const mid = [(p0[0] + p1[0]) / 2, y + 0.75 * M, (p0[1] + p1[1]) / 2];
        add(owner, C.red, pipe([p0[0], y + 0.92 * M, p0[1]], mid, 0.02 * M * HAND, 4));
        add(owner, C.red, pipe(mid, [p1[0], y + 0.92 * M, p1[1]], 0.02 * M * HAND, 4));
      }
    }
    if (!closed) { const [x, z] = list[list.length - 1]; inst('chainPost', owner, M4(x, y, z)); }
  }
  // 표지판: 앞면 = 텍스처 평면 (법선 +z를 ry로 회전)
  const signMats = new Map();
  function sign(owner, x, y, z, ry, tex, w, h, postH, { own = false, posts = 2 } = {}) {
    const r = root(owner); if (!r) return null;
    at(owner, x, y, z, ry, (a) => {
      a(C.steelD, box(w + 0.06 * M, h + 0.06 * M, 0.04 * M, 0, postH, -0.03 * M));
      if (posts === 2) [-w * 0.35, w * 0.35].forEach((px) => a(C.steelD, cyl(0.04 * M * SIGN, postH + h * 0.6, px, 0, -0.07 * M, 6)));
      else a(C.steelD, cyl(0.05 * M * SIGN, postH + h * 0.6, 0, 0, -0.07 * M, 6));
      if (posts) a(C.concrete, box(w * 0.9, 0.12 * M, 0.4 * M, 0, 0, -0.07 * M));
    });
    let m;
    if (own) { m = new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0, roughness: 0.9 }); }
    else { if (!signMats.has(tex)) signMats.set(tex, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })); m = signMats.get(tex); }
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    face.position.set(x, y + postH + h / 2, z); face.rotation.y = ry; face.translateZ(0.002);
    face.raycast = noRay; r.add(face);
    return face;
  }
  // 소화기 거치대 (빨간 용기 2개)
  function extinguisher(owner, x, y, z, ry = 0) {
    const s = M * HAND;
    at(owner, x, y, z, ry, (a) => {
      a(C.steelD, box(0.7 * s, 0.05 * s, 0.35 * s));
      [-0.3, 0.3].forEach((px) => a(C.steelD, box(0.04 * s, 1.1 * s, 0.04 * s, px * s, 0, -0.12 * s)));
      a(C.red, box(0.7 * s, 0.25 * s, 0.03 * s, 0, 0.95 * s, -0.12 * s));      // 표시판
      [-0.15, 0.15].forEach((px) => { a(C.red, cyl(0.09 * s, 0.55 * s, px * s, 0.05 * s, 0, 8)); a(C.black, cyl(0.03 * s, 0.08 * s, px * s, 0.6 * s, 0, 5)); });
    });
  }

  // ═══ 1. 자재 적치장 ═══
  const yardPad = (x0, z0, x1, z1) => add('G', C.yard, box(x1 - x0, 0.05, z1 - z0, (x0 + x1) / 2, 0, (z0 + z1) / 2));
  function pallets(x0, z0, nx, nz, seed = 0) {   // 내화벽돌 팔레트 (랩 포장)
    const sp = 1.35 * M;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const lv = (i * 7 + j * 3 + seed) % 4 === 0 ? 1 : 2;
      for (let l = 0; l < lv; l++) {
        const x = x0 + i * sp, z = z0 + j * sp, y = 0.05 + l * 1.0 * M;
        inst('palBase', 'G', M4(x, y, z)); inst('palBrick', 'G', M4(x, y, z)); inst('palWrap', 'G', M4(x, y, z));
      }
    }
  }
  function crates(x0, z0, nx, nz, lv = 2) {     // 카본블록 상자
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) for (let l = 0; l < lv - ((i + j) % 2); l++) {
      const x = x0 + i * 2.6 * M, z = z0 + j * 1.1 * M, y = 0.05 + l * 0.92 * M;
      inst('crate', 'G', M4(x, y, z)); inst('crateBand', 'G', M4(x, y + 0.02 * M, z));
    }
  }
  function sandbags(x0, z0, len, courses = 3, ry = 0) {
    const n = Math.floor(len / (0.62 * M));
    for (let c = 0; c < courses; c++) for (let i = 0; i < n - c; i++) {
      const d = (i + c * 0.5) * 0.62 * M;
      inst('sandbag', 'G', M4(x0 + Math.cos(ry) * d, 0.05 + c * 0.16 * M, z0 - Math.sin(ry) * d, ry));
    }
  }
  function staveRack(x, z, ry = 0) {             // 스테이브·냉각판 A형 거치대
    at('G', x, 0.05, z, ry, (a) => {
      const L = 4 * M, H = 1.8 * M;
      a(C.steelD, box(L, 0.15 * M, 1.6 * M));
      [-L / 2 + 0.1 * M, 0, L / 2 - 0.1 * M].forEach((px) => {
        a(C.steelD, pipe([px, 0.15 * M, -0.7 * M], [px, H, 0], 0.05 * M, 4));
        a(C.steelD, pipe([px, 0.15 * M, 0.7 * M], [px, H, 0], 0.05 * M, 4));
      });
      a(C.steelD, pipe([-L / 2, H, 0], [L / 2, H, 0], 0.05 * M, 4));
      for (let k = 0; k < 5; k++) for (const s of [-1, 1]) {
        const g = new THREE.BoxGeometry(0.7 * M, 1.5 * M, 0.12 * M).rotateX(s * 0.35).translate(-L / 2 + 0.5 * M + k * 0.75 * M, 0.95 * M, s * (0.35 * M + 0.0));
        a(k % 2 ? C.copper : C.steelD, g);
      }
    });
  }
  function spools(x, z, len, ry = 0) {           // 배관 스풀 (3-2-1 적재, 플랜지)
    at('G', x, 0.05, z, ry, (a) => {
      const r = 0.3 * M;
      [-len * 0.35, len * 0.35].forEach((px) => a(C.woodD, box(0.2 * M, 0.2 * M, 2.4 * M, px, 0, 0)));
      for (let row = 0; row < 3; row++) for (let i = 0; i < 3 - row; i++) {
        const zz = (i - (2 - row) / 2) * 2.05 * r, yy = 0.2 * M + r + row * 1.75 * r;
        a(C.primer, pipe([-len / 2, yy, zz], [len / 2, yy, zz], r, 8));
        [-len / 2, len / 2].forEach((px) => a(C.steel, pipe([px - 0.05 * M, yy, zz], [px + 0.05 * M, yy, zz], r * 1.35, 8)));
      }
    });
  }
  function beams(x, z, len, ry = 0) {            // H형강 적재
    at('G', x, 0.05, z, ry, (a) => {
      const h = 0.4 * M, fw = 0.3 * M, t = 0.03 * M * 1.5;
      [-len * 0.35, 0, len * 0.35].forEach((px) => a(C.woodD, box(0.15 * M, 0.15 * M, 2.2 * M, px, 0, 0)));
      for (let l = 0; l < 3; l++) for (let i = 0; i < 4; i++) {
        const zz = (i - 1.5) * 0.45 * M, yy = 0.15 * M + l * (h + 0.15 * M);
        const c = l === 2 ? C.primer : C.steel;
        a(c, box(len, t, fw, 0, yy, zz)); a(c, box(len, t, fw, 0, yy + h - t, zz)); a(c, box(len, h, t, 0, yy, zz));
        if (l < 2 && i === 0) [-len * 0.35, len * 0.35].forEach((px) => a(C.woodD, box(0.12 * M, 0.15 * M, 2 * M, px, yy + h, 0.7 * M)));
      }
    });
  }
  // 적치장 A (서북, 열풍로 바깥)
  yardPad(-78, -53, -54, -35);
  pallets(-76, -51.5, 8, 3, 0); pallets(-76, -46, 8, 3, 2);
  crates(-62, -51.5, 3, 4); crates(-62, -45.5, 3, 3);
  sandbags(-76, -37, 12, 3); sandbags(-62, -37, 6, 2);
  extinguisher('G', -55, 0.05, -38.5, -Math.PI / 2);
  // 적치장 B (동쪽, 도로 바깥)
  yardPad(69, -12, 81, 22);
  staveRack(73, -8); staveRack(78, -8); staveRack(73, -3); staveRack(78, -3);
  spools(75, 3, 6.5 * M * 1.2); spools(75, 7.5, 5 * M * 1.2);
  beams(75, 13, 9 * M); beams(75, 18, 9 * M);
  sandbags(70, 21, 8, 2);
  // 적치장 C (남쪽, 도로 바깥)
  yardPad(-49, 59, -21, 69);
  pallets(-47.5, 60.5, 7, 2, 1); crates(-47, 66, 3, 2, 2);
  beams(-31, 61.5, 9 * M); spools(-32, 66, 6 * M * 1.2);
  sandbags(-25, 60, 3.5, 3, Math.PI / 2); sandbags(-23.5, 60, 3.5, 2, Math.PI / 2);

  // ═══ 2. 안전 시설 ═══
  const T = {
    no: signTex(['출입금지'], { bg: '#ffffff', fg: '#c0302a', border: '#c0302a' }),
    noStaff: signTex(['관계자 외', '출입금지'], { bg: '#ffffff', fg: '#c0302a', border: '#c0302a' }),
    hot: signTex(['화기작업 중'], { bg: '#f2c230', fg: '#1f1d1a', border: '#1f1d1a' }),
    lift: signTex(['인양 작업 중', '하부 출입금지'], { bg: '#f2c230', fg: '#c0302a', border: '#1f1d1a' }),
    assy: signTex(['비상 집결지'], { bg: '#2f8a4a', fg: '#ffffff', border: '#ffffff' }),
    aid: signTex(['응급처치'], { bg: '#ffffff', fg: '#2f8a4a', cross: '#2f8a4a' }),
    smoke: signTex(['흡연구역'], { bg: '#3d6d8f', fg: '#ffffff', border: '#ffffff' }),
    guard: signTex(['경비실'], { bg: '#ffffff', fg: '#2b4a66' }),
  };
  Object.values(T).forEach((t) => textures.push(t));
  const SW = 1.2 * M * SIGN, SH = 0.6 * M * SIGN, SP = 1.2 * M;   // 지상 표지판 크기

  // 워터 배리어
  barrierLine([[-12, 48.5], [12, 48.5]]);
  barrierLine([[50, -14], [50, 0]]);
  const big = new THREE.Vector3(...pol(37, 70 * Math.PI / 180)), phB = 70 * Math.PI / 180;
  const arc = (c, phi0, r, span, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const p = pol(r, phi0 - span + 2 * span * i / n); return [c.x + p[0], c.z + p[2]]; });
  barrierLine(arc(big, phB, 10, 1.05));
  const ringC = new THREE.Vector3(...pol(31, -35 * Math.PI / 180)), phR = -35 * Math.PI / 180;
  barrierLine(arc(ringC, phR, 9, 1.0));
  // 인양 하부 출입금지
  { const p = pol(10.8, phB); sign('G', big.x + p[0], 0, big.z + p[2], phB, T.lift, SW, SH, SP); }
  { const p = pol(9.8, phR); sign('G', ringC.x + p[0], 0, ringC.z + p[2], phR, T.lift, SW, SH, SP); }
  // 출입금지
  sign('G', 51.5, 0, 2, Math.PI / 2, T.no, SW, SH, SP);
  sign('G', -26, 0, -38, 0, T.no, SW, SH, SP);
  sign('G', 80, 0, 46, Math.PI / 2, T.no, SW, SH, SP);
  sign('G', 57, 0, -40, Math.PI / 2, T.no, SW, SH, SP);
  // 링블록 주변 체인 울타리
  { const c = [-27, 19], pts = Array.from({ length: 10 }, (_, i) => [c[0] + 3.6 * Math.sin(i / 10 * TAU), c[1] + 3.6 * Math.cos(i / 10 * TAU)]); chainLine(pts, true); }
  // 콘
  for (let x = 5; x <= 55; x += 5) coneAt('G', x, 58.5);
  for (let z = -52; z <= -40; z += 3) coneAt('G', 60, z);
  for (let z = -12; z <= 22; z += 4) coneAt('G', 68.3, z);
  for (let z = 49; z <= 58; z += 3) coneAt('G', -74, z + 0.2);
  [[-14, 47], [14, 47], [48.5, -15], [48.5, 1]].forEach(([x, z]) => coneAt('G', x, z));
  // 소화기 거치대
  [[-56, -34], [-48, 28], [-26, -41], [52, -22], [76, -40], [-70, 60], [10, 61], [24, 46], [40, 26], [-60, -2], [52, 4], [72, -14]]
    .forEach(([x, z], i) => extinguisher('G', x, 0, z, (i * 1.3) % TAU));
  // 가스 용기 보관함 (산소=녹색, 아세틸렌=적갈색)
  function gasCage(x, z, ry) {
    const W = 2.4 * M, D = 1.2 * M, H = 2 * M;
    at('G', x, 0, z, ry, (a) => {
      a(C.concrete, box(W + 0.3 * M, 0.12 * M, D + 0.3 * M));
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => a(C.steelD, box(0.06 * M, H, 0.06 * M, sx * W / 2, 0.12 * M, sz * D / 2)));
      a(C.steelD, box(W + 0.2 * M, 0.06 * M, D + 0.2 * M, 0, H + 0.12 * M, 0));
      for (let i = 0; i < 8; i++) {
        const px = -W / 2 + 0.2 * M + (i % 4) * 0.62 * M, pz = i < 4 ? -0.25 * M : 0.25 * M, c = i < 4 ? C.green : C.acet;
        a(c, cyl(0.12 * M * HAND * 0.8, 1.5 * M, px, 0.12 * M, pz, 8)); a(C.steel, cyl(0.06 * M, 0.12 * M, px, 1.62 * M, pz, 6));
      }
    });
    const r = root('G');
    const meshMat = new THREE.MeshStandardMaterial({ map: fTex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, roughness: 0.9, depthWrite: false });
    mats.set('cageMesh' + x, meshMat);
    const walls = merge([new THREE.PlaneGeometry(W, H).translate(0, H / 2 + 0.12 * M, D / 2), new THREE.PlaneGeometry(W, H).translate(0, H / 2 + 0.12 * M, -D / 2),
      new THREE.PlaneGeometry(D, H).rotateY(Math.PI / 2).translate(W / 2, H / 2 + 0.12 * M, 0), new THREE.PlaneGeometry(D, H).rotateY(Math.PI / 2).translate(-W / 2, H / 2 + 0.12 * M, 0)]);
    const wm = new THREE.Mesh(walls.rotateY(ry).translate(x, 0, z), meshMat); wm.raycast = noRay; r.add(wm);
  }
  gasCage(48, -47, 0); gasCage(-58, -18, Math.PI / 2);
  // 응급처치함 + 비상 집결지
  at('G', -64, 0, 62, 0.4, (a) => { a(C.white, box(1.2 * M * HAND, 1.8 * M, 0.6 * M * HAND)); a(C.aspgreen, box(1.3 * M * HAND, 0.08 * M, 0.7 * M * HAND, 0, 1.8 * M, 0)); });
  sign('G', -64 + Math.sin(0.4) * 0.6 * M * HAND * 0.5 + 0.01, 0, 62 + Math.cos(0.4) * 0.6 * M * HAND * 0.5 + 0.01, 0.4, T.aid, 1.0 * M * HAND, 0.5 * M * HAND, 1.1 * M, { posts: 0 });
  { const cx = -72, cz = 64, s = 6 * M; [[0, -s / 2, s, 0.25 * M], [0, s / 2, s, 0.25 * M], [-s / 2, 0, 0.25 * M, s], [s / 2, 0, 0.25 * M, s]]
      .forEach(([dx, dz, w, d]) => add('G', C.aspgreen, box(w, 0.04, d, cx + dx, 0.02, cz + dz)));
    sign('G', cx, 0, cz - s / 2 - 0.4, 0.6, T.assy, SW * 1.2, SH * 1.2, SP * 1.2, { posts: 1 }); }

  // ═══ 3. 조명탑 (트레일러 + 마스트 + 램프 4개) ═══
  const lampMat = new THREE.MeshStandardMaterial({ color: '#e8e4d0', emissive: '#fff1c2', emissiveIntensity: 0, roughness: 0.6 });
  const lampGeos = [];
  function lightTower(x, z) {
    const ry = Math.atan2(-x, -z);   // 램프가 고로를 향하도록
    at('G', x, 0, z, ry, (a) => {
      a(C.gen, box(1.6 * M, 1.3 * M, 3.2 * M, 0, 0.5 * M, 0));                    // 본체(발전기 포함)
      a(C.steelD, box(0.08 * M, 0.08 * M, 1.2 * M, 0, 0.45 * M, -2.0 * M));        // 견인봉
      [-1, 1].forEach((s) => { a(C.black, pipe([s * 0.75 * M, 0.35 * M, 0.3 * M], [s * 0.95 * M, 0.35 * M, 0.3 * M], 0.35 * M, 10)); });
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {                 // 아웃리거
        a(C.steelD, box(1.2 * M, 0.12 * M, 0.12 * M, sx * 1.2 * M, 0.55 * M, sz * 1.3 * M));
        a(C.steelD, box(0.3 * M, 0.06 * M, 0.3 * M, sx * 1.75 * M, 0, sz * 1.3 * M));
      });
      a(C.steel, cyl(0.1 * M, 7.5 * M, 0, 1.8 * M, -0.8 * M, 8, 0.07 * M));        // 마스트(총 ~9m)
      a(C.steelD, box(1.6 * M, 0.1 * M, 0.1 * M, 0, 9.0 * M, -0.8 * M));
    });
    const q = new THREE.Matrix4().makeRotationY(ry);
    [[-0.55, 9.3], [0.55, 9.3], [-0.55, 8.7], [0.55, 8.7]].forEach(([px, py]) => {
      const g = new THREE.BoxGeometry(0.55 * M, 0.45 * M, 0.22 * M).rotateX(0.35).translate(px * M, py * M, -0.6 * M).applyMatrix4(q).translate(x, 0, z);
      lampGeos.push(g);
    });
  }
  [[-54, -26], [54, -55], [74, 32], [-44, 46], [24, 68], [-62, 8]].forEach(([x, z]) => lightTower(x, z));
  const lamps = new THREE.Mesh(merge(lampGeos), lampMat); lamps.raycast = noRay; group.add(lamps);

  // ═══ 4. 복지 시설 (남쪽 도로 바깥) ═══
  // 휴게 텐트
  at('G', 16, 0, 64, 0, (a) => {
    const W = 6 * M, D = 4 * M, H = 2.4 * M;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => a(C.steel, cyl(0.04 * M * 1.5, H, sx * W / 2, 0, sz * D / 2, 5)));
    [-1, 1].forEach((s) => a(C.tent, new THREE.BoxGeometry(W + 0.3 * M, 0.06 * M, D / 2 + 0.35 * M).rotateX(s * 0.3).translate(0, H + 0.35 * M, s * D / 4)));
    for (let i = 0; i < 2; i++) {
      const px = (i - 0.5) * 2.6 * M;
      a(C.white, box(1.8 * M, 0.05 * M, 0.8 * M, px, 0.72 * M, 0)); a(C.steelD, box(0.05 * M, 0.72 * M, 0.6 * M, px, 0, 0));
      [-1, 1].forEach((s) => a(C.bench, box(1.8 * M, 0.45 * M, 0.3 * M, px, 0, s * 0.65 * M)));
    }
    a(C.blue, box(0.5 * M, 0.9 * M, 0.5 * M, W / 2 - 0.4 * M, 0, -D / 2 + 0.4 * M));   // 정수기
  });
  // 이동식 화장실 3동
  for (let i = 0; i < 3; i++) at('G', 29 + i * 1.5 * M * 1.05, 0, 66, Math.PI, (a) => {
    a(C.blue, box(1.2 * M, 2.2 * M, 1.2 * M)); a(C.white, box(1.3 * M, 0.12 * M, 1.3 * M, 0, 2.2 * M, 0));
    a(C.white, box(0.75 * M, 1.8 * M, 0.03 * M, 0, 0.15 * M, 0.61 * M));
  });
  // 흡연구역
  { const cx = 41, cz = 64, s = 2.6;
    chainLine([[cx - s, cz - s], [cx + s, cz - s], [cx + s, cz + s], [cx - s, cz + s]], false);
    at('G', cx, 0, cz, 0, (a) => { [-1, 1].forEach((k) => a(C.bench, box(1.8 * M, 0.45 * M, 0.4 * M, k * 1.2, 0, 0.8))); a(C.red, cyl(0.25 * M * HAND, 0.8 * M, 0, 0, -0.6, 8)); });
    sign('G', cx, 0, cz - s - 0.2, 0, T.smoke, SW, SH, SP, { posts: 1 });
    extinguisher('G', cx + s + 0.6, 0, cz, Math.PI / 2); }
  // 공구 컨테이너 (20ft: 6 × 2.4 × 2.6m)
  function container(x, z, ry, c) {
    at('G', x, 0, z, ry, (a) => {
      a(c, box(6 * M, 2.6 * M, 2.4 * M));
      for (let k = -5; k <= 5; k++) a(c, box(0.06 * M, 2.4 * M, 2.45 * M, k * 0.52 * M, 0.1 * M, 0));   // 골판 느낌
      a(C.steelD, box(0.04 * M, 2.4 * M, 2.3 * M, 3 * M, 0.1 * M, 0));
    });
  }
  container(51, 66, 0, C.cont); container(51, 62.2, 0, C.cont2); container(76, -24, Math.PI / 2, C.cont);
  // 발전기 + 고로까지 케이블
  function generator(x, z, ry) {
    at('G', x, 0, z, ry, (a) => {
      a(C.gen, box(3.2 * M, 1.8 * M, 1.3 * M, 0, 0.15 * M, 0)); a(C.steelD, box(3.4 * M, 0.15 * M, 1.4 * M));
      a(C.black, box(2.4 * M, 0.2 * M, 1.05 * M, 0, 1.95 * M, 0)); a(C.black, cyl(0.06 * M, 0.5 * M, 1.2 * M, 1.95 * M, 0.3 * M, 6));
      a(C.steelD, box(0.5 * M, 0.6 * M, 0.06 * M, 1.0 * M, 0.6 * M, 0.66 * M));   // 계기판
    });
  }
  function cable(pts) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0.08, z)), false, 'catmullrom', 0.2);
    add('G', C.black, new THREE.TubeGeometry(curve, pts.length * 12, 0.06, 4, false));
    const [ex, ez] = pts[pts.length - 1];
    add('G', C.steelD, box(0.6 * M * HAND, 0.8 * M, 0.4 * M, ex, 0, ez, Math.atan2(ex, ez)));   // 분전함
  }
  generator(-38, 32, 0); generator(-38, 35.5, 0); generator(5, -48, Math.PI / 2);
  cable([[-36, 32.4], [-33, 24], [-31.5, 14], [-20, 8], [-12.4, 5.2]]);
  cable([[-36, 35.9], [-34.5, 26], [-32.3, 14.5], [-21, 9.4], [-13, 6.8]]);
  cable([[5, -46], [5.2, -36], [5, -24], [3.5, -17], [1.6, -13]]);

  // ═══ 5. 작업대 소품 (구역 링, 바깥쪽 절반·절개 사분면 밖) ═══
  const inOpen = (phi) => { const p = ((phi % TAU) + TAU) % TAU; return p >= OPEN_PHI[0] - 0.25 && p <= OPEN_PHI[1] + 0.25; };
  const RING = { 'EX-TUY': [2.2, 3.4, 4.3], 'EX-MID': [1.95, 3.0, 4.6], 'EX-UP': [2.5, 3.8, 5.0], CAST: [2.0, 2.9, 3.9, 4.8] };
  const hotSigns = [];
  function ringCluster(id, phi, k) {
    const z = ZONE_INFO[id]; if (!z || inOpen(phi)) return;
    const r = z.rOut - 1.0 * Math.max(1, (z.rOut - z.rIn) / 6), y = z.floorY;
    if (r < (z.rIn + z.rOut) / 2) return;
    const [x, , zz] = pol(r, phi, y), s = M * HAND;
    at(id, x, y, zz, phi, (a) => {   // 로컬 +z = 바깥, x = 접선
      a(C.red, box(0.8 * s, 0.45 * s, 0.45 * s, -1.2 * s, 0, 0)); a(C.black, box(0.5 * s, 0.06 * s, 0.06 * s, -1.2 * s, 0.45 * s, 0));          // 공구함
      a(C.welder, box(0.7 * s, 0.6 * s, 0.5 * s, 0, 0.08 * s, 0)); a(C.steelD, box(0.72 * s, 0.08 * s, 0.52 * s, 0, 0.68 * s, 0));          // 용접기
      a(C.black, pipe([-0.35 * s, 0.08 * s, 0.2 * s], [0.35 * s, 0.08 * s, 0.2 * s], 0.08 * s, 6));
      [0, 1, 2].slice(0, 2 + (k % 2)).forEach((i) => a(C.bag, box(0.6 * s, 0.25 * s, 0.4 * s, 1.0 * s + i * 0.2 * s, i === 2 ? 0.25 * s : 0, (i - 0.5) * 0.45 * s, 0.1 * i)));   // 자재 포대
      a(C.blanket, box(0.8 * s, 0.1 * s, 0.6 * s, -0.4 * s, 0, -0.55 * s));                                                                  // 방화포
      a(C.red, cyl(0.09 * s, 0.55 * s, 0.75 * s, 0, -0.5 * s, 8));                                                                          // 소화기
    });
  }
  Object.entries(RING).forEach(([id, list]) => {
    list.forEach((phi, k) => ringCluster(id, phi, k));
    const z = ZONE_INFO[id]; if (!z) return;
    const phi = list[0] + 0.28; if (inOpen(phi)) return;
    const [x, , zz] = pol(z.rOut - 0.45, phi, z.floorY);
    const face = sign(id, x, z.floorY, zz, phi, T.hot, 0.9 * M * SIGN, 0.45 * M * SIGN, 0.9 * M, { own: true });
    if (face) hotSigns.push({ zone: id, face, beacon: null });
  });
  // 지상 화기 표지 (가스 설비)
  { const face = sign('G', 51.5, 0, -16, Math.PI / 2, T.hot, SW, SH, SP, { own: true }); if (face) hotSigns.push({ zone: 'GAS', face }); }
  // 화기 표지 위 경광등
  const beaconMat = new THREE.MeshStandardMaterial({ color: '#f0a020', emissive: '#ffa21a', emissiveIntensity: 1.6, roughness: 0.5 });
  const beaconGeo = new THREE.SphereGeometry(0.12 * M * SIGN, 8, 6); extraGeos.push(beaconGeo);
  hotSigns.forEach((h) => {
    const b = new THREE.Mesh(beaconGeo, beaconMat); b.position.copy(h.face.position); b.position.y += h.face.geometry.parameters.height / 2 + 0.15 * M * SIGN;
    b.visible = false; b.raycast = noRay; h.face.parent.add(b); h.beacon = b;
  });

  // ═══ 6. 가설 펜스 + 정문·경비실 ═══
  const FX0 = -82, FX1 = 82, FZ0 = -62, FZ1 = 72;
  function fenceRun(ax, az, bx, bz, gaps = []) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / PW), ry = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
    const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, c = alongX ? x : z;
      if (gaps.some(([g0, g1]) => c > g0 - PW / 2 && c < g1 + PW / 2)) continue;
      inst('fencePanel', 'G', M4(x, 0, z, ry)); inst('fenceFrame', 'G', M4(x, 0, z, ry));
      const t0 = i / n; inst('fenceFoot', 'G', M4(ax + (bx - ax) * t0, 0, az + (bz - az) * t0, ry));
      const t1 = (i + 1) / n; inst('fenceFoot', 'G', M4(ax + (bx - ax) * t1, 0, az + (bz - az) * t1, ry));
    }
  }
  fenceRun(FX0, FZ0, FX1, FZ0, [[59, 69]]);
  fenceRun(FX0, FZ1, FX1, FZ1);
  fenceRun(FX0, FZ0, FX0, FZ1, [[49, 59]]);
  fenceRun(FX1, FZ0, FX1, FZ1, [[49, 59]]);
  // 정문 (서쪽 x=-82, 도로 z=54)
  [48.6, 59.4].forEach((z) => add('G', C.steelD, box(0.4 * M, 3 * M, 0.4 * M, FX0, 0, z)));
  [0, 1, 2].forEach((i) => {   // 열어 둔 슬라이딩 문짝 (울타리 바깥쪽에 겹쳐 둠)
    const z = 61.5 + i * PW * 0.95;
    inst('fencePanel', 'G', M4(FX0 - 0.35, 0, z, Math.PI / 2)); inst('fenceFrame', 'G', M4(FX0 - 0.35, 0, z, Math.PI / 2));
    add('G', C.black, cyl(0.12 * M, 0.1 * M, FX0 - 0.35, 0, z, 6));
  });
  sign('G', FX0 + 0.5, 0, 47.4, Math.PI / 2, T.noStaff, SW, SH, SP, { posts: 1 });
  // 경비실 + 차단기
  at('G', -77.5, 0, 61.5, 0, (a) => {
    a(C.white, box(2.4 * M, 2.5 * M, 2.4 * M)); a(C.steelD, box(2.9 * M, 0.15 * M, 2.9 * M, 0, 2.5 * M, 0));
    a(C.glass, box(2.42 * M, 0.8 * M, 1.6 * M, 0, 1.2 * M, 0)); a(C.glass, box(1.6 * M, 0.8 * M, 2.42 * M, 0, 1.2 * M, 0));
  });
  sign('G', -77.5, 0, 61.5 - 1.25 * M, Math.PI, T.guard, 1.2 * M * 1.5, 0.4 * M * 1.5, 2.0 * M, { posts: 0 });
  add('G', C.yellow, box(0.4 * M, 1.1 * M, 0.4 * M, -79, 0, 49.4));
  for (let i = 0; i < 6; i++) add('G', i % 2 ? C.white : C.red, box(0.12 * M, 0.12 * M, 1.3 * M, -79, 1.0 * M, 49.4 + 0.5 + (i + 0.5) * 1.3 * M));
  extinguisher('G', -76, 0, 63.5, 0);

  // ── 합치기 → 메시 ──
  const meshes = [];
  buckets.forEach((geos, k) => {
    const [owner, color] = k.split('|');
    const r = root(owner); if (!r) { geos.forEach((g) => g.dispose()); return; }
    const merged = merge(geos); if (!merged) return;
    const m = new THREE.Mesh(merged, mat(color)); m.raycast = noRay; m.name = 'siteprops:' + k;
    r.add(m); meshes.push(m);
  });
  instDefs.forEach((d) => {
    d.per.forEach((list, owner) => {
      const r = root(owner); if (!r || !list.length) return;
      const im = new THREE.InstancedMesh(d.geo, d.material, list.length);
      list.forEach((m4, i) => im.setMatrixAt(i, m4));
      im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.raycast = noRay;
      r.add(im); meshes.push(im);
    });
    extraGeos.push(d.geo);
  });

  // ── 활성화: 밤 조명 + 화기 표지 점멸 ──
  const toMs = (v) => (v == null ? null : typeof v === 'number' ? v : v instanceof Date ? v.getTime() : Date.parse(v));
  let hotZones = new Set(), night = false;
  function setActive({ tasks = [], conflicts = [], t } = {}) {   // eslint-disable-line no-unused-vars
    const now = toMs(t);
    if (now != null && !Number.isNaN(now)) { const h = new Date(now).getHours(); night = h >= 19 || h < 7; }
    hotZones = new Set();
    (tasks || []).forEach((k) => {
      if (!(k.work_types || []).includes('HOT')) return;
      if (now != null && k.start && k.end && !(Date.parse(k.start) <= now && now < Date.parse(k.end))) return;
      (k.zone_ids || []).forEach((z) => hotZones.add(z));
    });
    lampMat.emissiveIntensity = night ? 2.6 : 0;
    lampMat.color.set(night ? '#fff6dc' : '#e8e4d0');
    hotSigns.forEach((h) => {
      const on = hotZones.has(h.zone);
      h.face.material.emissiveIntensity = on ? 0.35 : 0; h.beacon.visible = on;
    });
  }
  function update(sec = 0) {
    const k = 0.5 + 0.5 * Math.sin(sec * 4.2);
    hotSigns.forEach((h, i) => {
      if (!hotZones.has(h.zone)) return;
      h.face.material.emissiveIntensity = 0.12 + 0.38 * k;   // 은은한 점멸
      h.beacon.visible = Math.sin(sec * 6 + i) > -0.3;
    });
  }
  const ZONE_IDS = Object.keys(ZONE_INFO);
  function refresh() {
    const anyIso = ZONE_IDS.some((id) => furnace.isGhosted(id));
    group.visible = !anyIso;
    zoneRoots.forEach((r, id) => { r.visible = !furnace.isGhosted(id); });
  }
  function dispose() {
    meshes.forEach((m) => { m.removeFromParent(); if (!m.isInstancedMesh) m.geometry.dispose(); else m.dispose?.(); });
    lamps.removeFromParent(); lamps.geometry.dispose();
    hotSigns.forEach((h) => { h.face.removeFromParent(); h.face.geometry.dispose(); h.face.material.dispose(); h.beacon.removeFromParent(); });
    group.traverse((o) => { if (o.isMesh && o.geometry && o.material?.map) o.geometry.dispose(); });
    new Set(extraGeos).forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose()); signMats.forEach((m) => m.dispose());
    fenceMat.dispose(); lampMat.dispose(); beaconMat.dispose();
    textures.forEach((t) => t.dispose());
    zoneRoots.forEach((r) => r.removeFromParent()); zoneRoots.clear();
    group.removeFromParent();
  }

  setActive({});
  refresh();
  return { group, setActive, refresh, update, dispose };
}
