// 고로 플랜트 배관 — 고로가스·질소·산소·냉각수·열풍·증기 + 파이프랙 (점토 무광, 계통 색상 코드)
// 좌표는 '모형 단위'. 소유자(구역 id 또는 decor)·재질별로 지오메트리를 합친다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MODEL_SCALE, PERSON_H_MODEL, ZONE_INFO } from './furnace.js';
import { TASKS } from './data.js';

const PH = PERSON_H_MODEL;
const H = 4 * PH;            // 파이프랙 높이 (≈8m 상당)
const H2 = H + 3;            // 가스 본관용 높은 랙
const TAU = Math.PI * 2;
const pol = (r, phi, y) => [r * Math.sin(phi), y, r * Math.cos(phi)];   // x = r·sinφ, z = r·cosφ

// 계통 색 (무광 산업 색상 코드)
const SYS_COL = { BFG: '#c9a227', N2: '#8fa7b8', O2: '#6f9a6a', WTR: '#4f7fa8', HB: '#8a4b3a', STEAM: '#9a9893' };
// 재질 정의: key → [색, 계통]
const MATS = {
  BFG: ['#c9a227', 'BFG'], N2: ['#8fa7b8', 'N2'], N2band: ['#5d7383', 'N2'], O2: ['#6f9a6a', 'O2'],
  WTR: ['#4f7fa8', 'WTR'], HB: ['#8a4b3a', 'HB'], HBband: ['#b08573', 'HB'], STEAM: ['#9a9893', 'STEAM'],
  BFG_w: ['#9a3b30', 'BFG'], N2_w: ['#9a3b30', 'N2'], O2_w: ['#9a3b30', 'O2'], WTR_w: ['#9a3b30', 'WTR'],
  HB_w: ['#9a3b30', 'HB'], STEAM_w: ['#9a3b30', 'STEAM'],
  steel: ['#8f8c86', null], equip: ['#bdb8b0', null], roof: ['#7f8a90', null], pad: ['#cfcbc4', null], dark: ['#5f5c58', null],
};
const LABEL = { BFG: '고로가스(BFG·CO)', N2: '질소', O2: '산소', WTR: '냉각수', HB: '열풍', STEAM: '증기' };

const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const V = (a) => (a.isVector3 ? a.clone() : new THREE.Vector3(...a));
// 축(from)을 dir로 돌려 pos에 놓기
function orient(g, from, dir, pos) {
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(from, dir.clone().normalize()));
  return g.translate(pos.x, pos.y, pos.z);
}
function cyl(a, b, r, seg = 12) {
  const A = V(a), B = V(b), d = B.clone().sub(A);
  return orient(new THREE.CylinderGeometry(r, r, d.length(), seg), Y, d, A.add(B).multiplyScalar(0.5));
}
function beam(a, b, w, h) {
  const A = V(a), B = V(b), d = B.clone().sub(A);
  return orient(new THREE.BoxGeometry(w, h, d.length()), Z, d, A.add(B).multiplyScalar(0.5));
}

export function buildPiping(furnace) {
  const group = new THREE.Group(); group.name = 'piping';
  furnace.decor.add(group);
  const noRay = () => {};
  const buckets = new Map();     // owner|matKey → geos
  const mats = new Map();
  const labels = [];             // sprite
  const textures = [];
  const meshes = [];

  function mat(key) {
    if (!mats.has(key)) {
      const [c, sys] = MATS[key];
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0, emissive: '#000000' });
      m.userData.sys = sys; mats.set(key, m);
    }
    return mats.get(key);
  }
  function add(owner, key, g) {
    const k = owner + '|' + key;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(g.index ? g.toNonIndexed() : g);
  }

  // ── 부품 ──
  function flange(owner, key, pos, dir, r) {
    add(owner, key, orient(new THREE.CylinderGeometry(r * 1.4, r * 1.4, Math.max(0.12, r * 0.3), 12), Y, dir, pos));
  }
  function band(owner, key, pos, dir, r) {
    add(owner, key, orient(new THREE.TorusGeometry(r * 1.03, Math.max(0.05, r * 0.08), 4, 12), Z, dir, pos));
  }
  // 꺾인 배관: 직관 + 엘보(구) + 플랜지 / 띠
  function line(owner, sys, pts, r, { fl = 7, bandKey = null, bandEvery = 2.5 } = {}) {
    const P = pts.map(V);
    for (let i = 0; i < P.length - 1; i++) {
      const A = P[i], B = P[i + 1], d = B.clone().sub(A), L = d.length();
      if (L < 1e-3) continue;
      add(owner, sys, cyl(A, B, r));
      const u = d.clone().normalize();
      if (fl) for (let s = fl * 0.5; s < L - 0.8; s += fl) flange(owner, sys, A.clone().addScaledVector(u, s), u, r);
      if (bandKey) for (let s = bandEvery * 0.5; s < L - 0.3; s += bandEvery) band(owner, bandKey, A.clone().addScaledVector(u, s), u, r);
      if (i > 0) add(owner, sys, new THREE.SphereGeometry(r * 1.02, 10, 6).translate(A.x, A.y, A.z));
    }
  }
  // 고리 헤더
  function ringH(owner, sys, R, y, r, { cx = 0, cz = 0, fl = 8, bandKey = null } = {}) {
    add(owner, sys, new THREE.TorusGeometry(R, r, 10, 72).rotateX(Math.PI / 2).translate(cx, y, cz));
    for (let i = 0; i < fl; i++) {
      const phi = (i + 0.5) * TAU / fl, p = V(pol(R, phi, y)).add(new THREE.Vector3(cx, 0, cz));
      flange(owner, sys, p, new THREE.Vector3(Math.cos(phi), 0, -Math.sin(phi)), r);
    }
    if (bandKey) for (let i = 0; i < 24; i++) {
      const phi = i * TAU / 24, p = V(pol(R, phi, y)).add(new THREE.Vector3(cx, 0, cz));
      band(owner, bandKey, p, new THREE.Vector3(Math.cos(phi), 0, -Math.sin(phi)), r);
    }
  }
  // 밸브: 몸통 + 양쪽 플랜지 + 스템 + 핸들휠(토러스)
  function valve(owner, sys, pos, dir, r) {
    const p = V(pos), u = V(dir).normalize();
    add(owner, sys, new THREE.SphereGeometry(r * 1.45, 10, 6).translate(p.x, p.y, p.z));
    flange(owner, sys, p.clone().addScaledVector(u, r * 1.5), u, r * 1.05);
    flange(owner, sys, p.clone().addScaledVector(u, -r * 1.5), u, r * 1.05);
    const up = Math.abs(u.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : Y;
    const top = p.clone().addScaledVector(up, r * 1.4 + Math.max(0.5, r * 1.6));
    add(owner, 'steel', cyl(p, top, Math.max(0.05, r * 0.12), 6));
    add(owner, sys + '_w', orient(new THREE.TorusGeometry(Math.max(0.32, r * 1.1), Math.max(0.06, r * 0.1), 5, 14), Z, up, top));
  }
  // 라벨 스프라이트 (화면상 일정 크기). sub가 있으면 위에 계통명을 작게 한 줄 더
  function label(owner, sys, text, pos, sub) {
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    const fs = 44, fsS = 30;
    ctx.font = `700 ${fs}px sans-serif`;
    let tw = ctx.measureText(text).width;
    if (sub) { ctx.font = `600 ${fsS}px sans-serif`; tw = Math.max(tw, ctx.measureText(sub).width); }
    const w = Math.ceil(tw) + 56, h = sub ? 100 : 64;
    cv.width = w; cv.height = h;
    ctx.fillStyle = 'rgba(250,248,244,0.92)'; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(0, 0, w, h, 14); else ctx.rect(0, 0, w, h); ctx.fill();
    ctx.fillStyle = SYS_COL[sys] || '#8f8c86'; ctx.fillRect(10, 12, 12, h - 24);
    ctx.textBaseline = 'middle';
    if (sub) { ctx.font = `600 ${fsS}px sans-serif`; ctx.fillStyle = '#6b665f'; ctx.fillText(sub, 34, 30); }
    ctx.font = `700 ${fs}px sans-serif`; ctx.fillStyle = '#3d3a36';
    ctx.fillText(text, 34, sub ? 70 : h / 2 + 2);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; textures.push(tex);
    const m = new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, transparent: true });
    const s = new THREE.Sprite(m);
    const sh = 0.018 / MODEL_SCALE / 64;          // 모형 배율 보정 (캔버스 1px당)
    s.scale.set(sh * w, sh * h, 1);
    s.position.copy(V(pos)); s.renderOrder = 20; s.raycast = noRay;
    s.userData.sys = sys; s.userData.owner = owner;
    labels.push(s);
  }

  // ── 파이프랙 (기둥 + 보, 회색) ──
  function rack(along, c, a0, a1, w, h, step = 6) {
    const pt = (a, off, y) => (along === 'x' ? [a, y, c + off] : [c + off, y, a]);
    const n = Math.max(1, Math.round((a1 - a0) / step));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      for (const off of [-w / 2, w / 2]) {
        add('decor', 'steel', beam(pt(a, off, 0), pt(a, off, h), 0.4, 0.4));
        add('decor', 'pad', new THREE.BoxGeometry(0.9, 0.3, 0.9).translate(...pt(a, off, 0.15)));
      }
      for (const y of [h, h * 0.6]) add('decor', 'steel', beam(pt(a, -w / 2 - 0.3, y), pt(a, w / 2 + 0.3, y), 0.35, 0.4));
      if (i < n) {   // X 브레이스 (기둥 사이 한쪽만)
        const b = a0 + (a1 - a0) * (i + 1) / n;
        if (i % 3 === 0) add('decor', 'steel', beam(pt(a, -w / 2, 0.4), pt(b, -w / 2, h * 0.6), 0.2, 0.2));
      }
    }
    for (const off of [-w / 2, w / 2]) add('decor', 'steel', beam(pt(a0, off, h), pt(a1, off, h), 0.3, 0.45));
  }
  rack('x', -27, -34, 64, 5, H);           // 본 랙 (열풍로 ↔ 고로 ↔ 가스청정)
  rack('z', -34.6, -27, 13, 3, H);          // 열풍로 연소가스 랙
  rack('z', 46, -6, -34, 3, H2, 7);         // 제진기 → 청정설비 가스 본관 랙
  const yT = (r) => H + 0.22 + r, yT2 = (r) => H * 0.6 + 0.22 + r;

  // ═══ 1. 고로가스(BFG) ═══
  const UP = [3, 5, 7].map((k) => k * Math.PI / 4);   // 절개 사분면(0~π/2) 제외 3기
  const tops = [];
  UP.forEach((phi) => {
    const top = pol(9.5, phi, 64); tops.push(top);
    line('TOP', 'BFG', [pol(5.0, phi, 46.6), pol(9.5, phi, 51), top], 0.9, { fl: 5 });
    // 블리더: 작은 연돌 + 밸브 + 캡
    line('TOP', 'BFG', [top, [top[0], 68.4, top[2]]], 0.45, { fl: 0 });
    add('TOP', 'BFG_w', new THREE.SphereGeometry(0.75, 10, 6).translate(top[0], 68.4, top[2]));
    add('TOP', 'dark', new THREE.CylinderGeometry(0.08, 0.85, 0.7, 10).translate(top[0], 69.3, top[2]));
  });
  // 크로스오버 (y 64) → 하강관
  const J = [6.72, 64, -6.72];
  line('TOP', 'BFG', [tops[2], tops[1], J], 1.0, { fl: 5 });
  add('TOP', 'BFG', new THREE.SphereGeometry(1.1, 10, 6).translate(...J));
  line('TOP', 'BFG', [J, [J[0], 68.4, J[2]]], 0.5, { fl: 0 });
  add('TOP', 'dark', new THREE.CylinderGeometry(0.08, 0.9, 0.7, 10).translate(J[0], 69.2, J[2]));
  line('GAS', 'BFG', [J, [10, 64, -6.2], [17, 60, -5], [34, 40.5, -6], [36, 38.6, -6]], 1.4, { fl: 6 });
  // 제진기 → 가스 본관 (높은 랙) → 벤투리 → 스크러버
  const yG = H2 + 0.22 + 0.9;
  line('decor', 'BFG', [[40.5, 30, -6], [46, 30, -6], [46, yG, -6], [46, yG, -34], [53, yG, -34]], 0.9, { fl: 6 });
  valve('decor', 'BFG', [46, 26, -6], [0, 1, 0], 0.9);
  const ven = new THREE.LatheGeometry([[0.9, 0], [0.45, 1.3], [0.45, 1.7], [1.1, 3.4]].map(([r, y]) => new THREE.Vector2(r, y)), 12)
    .rotateZ(-Math.PI / 2).translate(53, yG, -34);
  add('decor', 'BFG', ven);
  line('decor', 'BFG', [[56.4, yG, -34], [57.6, yG, -34]], 1.1, { fl: 0 });
  // 가스청정·TRT 블록
  add('decor', 'equip', new THREE.LatheGeometry([[0, 0], [1.4, 0], [1.4, 2], [2.6, 3.5], [2.6, 14], [1.0, 16.5], [0.8, 17.2], [0, 17.2]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 14).translate(60, 0, -34));
  add('decor', 'pad', new THREE.BoxGeometry(7, 0.4, 7).translate(60, 0.2, -34));
  for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) add('decor', 'steel', beam([60 + dx, 0, -34 + dz], [60 + dx * 1.15, 3.5, -34 + dz * 1.15], 0.3, 0.3));
  add('decor', 'equip', new THREE.BoxGeometry(6, 5, 5).translate(68, 2.5, -31));          // TRT
  add('decor', 'roof', new THREE.BoxGeometry(6.4, 0.4, 5.4).translate(68, 5.2, -31));
  add('decor', 'dark', new THREE.BoxGeometry(3, 3, 3).translate(72.6, 1.5, -31));         // 발전기
  add('decor', 'dark', new THREE.CylinderGeometry(0.9, 0.9, 1.6, 12).rotateX(Math.PI / 2).translate(70.8, 1.5, -31));
  line('decor', 'BFG', [[60, 17, -34], [60, 18.5, -34], [67, 18.5, -34], [67, 18.5, -31], [67, 5.4, -31]], 0.8, { fl: 5 });
  // 청정가스 → 본 랙 → 열풍로 연소용
  const yB = yT(0.7);
  line('decor', 'BFG', [[65, 3, -30], [62, 3, -30], [62, 3, -28.6], [62, yB, -28.6], [-34.6, yB, -28.6], [-34.6, yB, 12]], 0.7, { fl: 8 });
  valve('decor', 'BFG', [62, 6, -28.6], [0, 1, 0], 0.7);
  [-12, 0, 12].forEach((z) => {
    line('STOVE', 'BFG', [[-34.6, yB, z], [-37.6, yB, z]], 0.5, { fl: 0 });
    valve('STOVE', 'BFG', [-36, yB, z], [1, 0, 0], 0.5);
  });

  // ═══ 2. 질소(N2) ═══
  const yN = 34.5;
  ringH('EX-UP', 'N2', 13.5, yN, 0.26, { bandKey: 'N2band' });
  for (let i = 0; i < 8; i++) {
    const phi = (i + 0.5) * Math.PI / 4;
    if (phi < Math.PI / 2) continue;                   // 절개 사분면 생략
    line('EX-UP', 'N2', [pol(13.5, phi, yN), pol(10.8, phi, yN), pol(10.8, phi, 33), pol(8.4, phi, 33)], 0.14, { fl: 0 });
    valve('EX-UP', 'N2', pol(10.8, phi, 33.8), [0, 1, 0], 0.14);
  }
  const yNr = yT(0.28);
  line('decor', 'N2', [pol(13.5, 1.25 * Math.PI, yN), [-12.73, yN, -12.73], [-12.73, H + 2.2, -12.73], [-12.73, H + 2.2, -25.4], [-12.73, yNr, -25.4]],
    0.26, { bandKey: 'N2band', bandEvery: 3 });
  valve('decor', 'N2', [-12.73, 20, -12.73], [0, 1, 0], 0.26);
  line('decor', 'N2', [[-30, yNr, -25.4], [62, yNr, -25.4]], 0.28, { bandKey: 'N2band', bandEvery: 3 });
  // 질소 탱크·기화기 스키드
  add('decor', 'pad', new THREE.BoxGeometry(8, 0.4, 5).translate(-20, 0.2, -34));
  add('decor', 'N2', new THREE.CylinderGeometry(1.6, 1.6, 6, 12).translate(-20, 3.6, -34.5));
  add('decor', 'N2', new THREE.SphereGeometry(1.6, 12, 6, 0, TAU, 0, Math.PI / 2).translate(-20, 6.6, -34.5));
  add('decor', 'N2band', new THREE.TorusGeometry(1.62, 0.1, 4, 16).rotateX(Math.PI / 2).translate(-20, 2.2, -34.5));
  for (let k = 0; k < 4; k++) add('decor', 'steel', new THREE.BoxGeometry(0.15, 3.5, 1.6).translate(-16.8 + k * 0.5, 2.15, -34.5));  // 기화기 핀
  line('decor', 'N2', [[-20, 5.5, -32.9], [-20, 5.5, -25.4], [-20, yNr - 0.1, -25.4]], 0.22, { fl: 0, bandKey: 'N2band', bandEvery: 2 });
  valve('decor', 'N2', [-20, 5.5, -30.6], [0, 0, 1], 0.22);

  // ═══ 3. 산소(O2) ═══
  const yO = 19.8, yOr = yT2(0.22);
  ringH('EX-TUY', 'O2', 16, yO, 0.18, { fl: 8 });
  for (let i = 0; i < 12; i++) {
    const phi = (i + 0.5) * TAU / 12;
    if (phi < Math.PI / 2) continue;
    line('EX-TUY', 'O2', [pol(16, phi, yO), pol(12.7, phi, yO)], 0.1, { fl: 0 });
  }
  line('decor', 'O2', [[0, yO, -16], [0, yO, -18.5], [0, yOr, -18.5], [0, yOr, -26], [14, yOr, -26]], 0.22, { fl: 6 });
  valve('decor', 'O2', [0, 15, -18.5], [0, 1, 0], 0.22);
  add('decor', 'pad', new THREE.BoxGeometry(5, 0.4, 5).translate(14, 0.2, -35));
  add('decor', 'O2', new THREE.CylinderGeometry(1.3, 1.3, 5, 12).translate(14, 2.9, -35));
  add('decor', 'O2', new THREE.SphereGeometry(1.3, 12, 6, 0, TAU, 0, Math.PI / 2).translate(14, 5.4, -35));
  line('decor', 'O2', [[14, 3, -33.7], [14, 3, -26], [14, yOr, -26]], 0.2, { fl: 0 });
  valve('decor', 'O2', [14, 3, -30], [0, 0, 1], 0.2);

  // ═══ 4. 냉각수(WTR) ═══
  ringH('EX-MID', 'WTR', 15.2, 25.0, 0.32);    // 급수
  ringH('EX-MID', 'WTR', 14.4, 26.2, 0.32);    // 환수
  ringH('EX-TUY', 'WTR', 14.2, 22.2, 0.28);
  ringH('EX-TUY', 'WTR', 14.9, 22.9, 0.28);
  for (let i = 0; i < 10; i++) {               // 스테이브 냉각 점퍼
    const phi = (i + 0.5) * TAU / 10;
    if (phi < Math.PI / 2) continue;
    line('EX-MID', 'WTR', [pol(15.2, phi, 25), pol(10.2, phi, 25)], 0.1, { fl: 0 });
    line('EX-MID', 'WTR', [pol(14.4, phi + 0.12, 26.2), pol(10.0, phi + 0.12, 26.2)], 0.1, { fl: 0 });
  }
  const yW = yT(0.45);
  line('decor', 'WTR', [[-30, yW, -27.4], [40, yW, -27.4]], 0.45);
  line('decor', 'WTR', [[-30, yW, -26.4], [40, yW, -26.4]], 0.45);
  // 상승관 + 풍구층 분기
  line('decor', 'WTR', [[6, yW, -27.4], [6, H + 3, -27.4], [6, H + 3, -19.5], [6, 25, -19.5], [6, 25, -13.97]], 0.4);
  line('decor', 'WTR', [[8, yW, -26.4], [8, H + 3.8, -26.4], [8, H + 3.8, -19.5], [8, 26.2, -19.5], [8, 26.2, -11.97]], 0.4);
  line('decor', 'WTR', [[6, 22.2, -19.5], [6, 22.2, -12.87]], 0.3, { fl: 0 });
  line('decor', 'WTR', [[8, 22.9, -19.5], [8, 22.9, -12.57]], 0.3, { fl: 0 });
  valve('decor', 'WTR', [6, 16, -19.5], [0, 1, 0], 0.4);
  valve('decor', 'WTR', [8, 17, -19.5], [0, 1, 0], 0.4);
  // 펌프장
  add('decor', 'pad', new THREE.BoxGeometry(11, 0.4, 8).translate(-7, 0.2, -42));
  add('decor', 'equip', new THREE.BoxGeometry(10, 6, 7).translate(-7, 3, -42));
  add('decor', 'roof', new THREE.BoxGeometry(10.6, 0.5, 7.6).translate(-7, 6.25, -42));
  line('decor', 'WTR', [[-8, 2.5, -38.5], [-8, 2.5, -31.5], [-8, H + 2.6, -31.5], [-8, H + 2.6, -27.4], [-8, yW, -27.4]], 0.6, { fl: 5 });
  line('decor', 'WTR', [[-5, 2.5, -38.5], [-5, 2.5, -31.5], [-5, H + 3.4, -31.5], [-5, H + 3.4, -26.4], [-5, yW, -26.4]], 0.6, { fl: 5 });
  valve('decor', 'WTR', [-8, 2.5, -35], [0, 0, 1], 0.6);
  valve('decor', 'WTR', [-5, 2.5, -35], [0, 0, 1], 0.6);

  // ═══ 5. 열풍(HB): 보온 본관 + 구스넥 + 열풍로 분기 ═══
  line('STOVE', 'HB', [[-37.6, 20.5, 0], [-15, 20.5, 0]], 1.3, { fl: 0, bandKey: 'HBband', bandEvery: 2.2 });
  valve('STOVE', 'HB', [-35.6, 20.5, 0], [1, 0, 0], 1.3);
  [-12, 12].forEach((z) => {
    const s = Math.sign(z);
    line('STOVE', 'HB', [[-37.6, 20.5, z], [-33, 20.5, z], [-33, 20.5, s * 1.2]], 1.0, { fl: 0, bandKey: 'HBband', bandEvery: 2.2 });
    valve('STOVE', 'HB', [-35.4, 20.5, z], [1, 0, 0], 1.0);
  });
  line('EX-TUY', 'HB', [[-15, 20.5, 0], [-15, 25.2, 0], [-11.6, 25.2, 0], [-11.6, 21.2, 0]], 1.2, { fl: 0, bandKey: 'HBband', bandEvery: 1.6 });

  // ═══ 증기(기타) ═══
  line('decor', 'STEAM', [[-34, yT2(0.32), -28.4], [62, yT2(0.32), -28.4]], 0.32, { fl: 9 });

  // ═══ 7. 라벨 ═══
  label('TOP', 'BFG', LABEL.BFG, pol(9.5, 1.25 * Math.PI, 70.5));
  label('GAS', 'BFG', LABEL.BFG, [24, 55, -5.5]);
  label('decor', 'BFG', LABEL.BFG, [20, yB + 1.6, -28.6]);
  label('decor', 'BFG', LABEL.BFG, [46, yG + 1.8, -20]);
  label('decor', 'BFG', '가스청정·TRT', [64, 21, -32]);
  label('EX-UP', 'N2', LABEL.N2, pol(13.5, Math.PI, yN + 1.3));
  label('decor', 'N2', LABEL.N2, [-20, 8.5, -34.5]);
  label('decor', 'N2', LABEL.N2, [36, yNr + 1.2, -25.4]);
  label('EX-TUY', 'O2', LABEL.O2, pol(16, 1.15 * Math.PI, yO + 1.1));
  label('decor', 'O2', LABEL.O2, [14, 7.4, -35]);
  label('EX-MID', 'WTR', LABEL.WTR, pol(15.2, 1.4 * Math.PI, 27.4));
  label('decor', 'WTR', LABEL.WTR, [-7, 8, -42]);
  label('decor', 'WTR', LABEL.WTR, [-20, yW + 1.4, -26.9]);
  label('STOVE', 'HB', LABEL.HB, [-26, 23.2, 0]);
  label('EX-TUY', 'HB', LABEL.HB, [-13.3, 27.6, 0]);
  label('decor', 'STEAM', LABEL.STEAM, [30, yT2(0.32) + 1.2, -28.4]);

  // ── 병합 → 메시 ──
  const ownerRoot = (owner) => (owner === 'decor' ? group : (furnace.zoneGroup(owner) || group));
  buckets.forEach((geos, k) => {
    const [owner, key] = k.split('|');
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) return;
    const m = new THREE.Mesh(merged, mat(key));
    m.raycast = noRay; m.name = 'pipe:' + k; m.userData.owner = owner;
    ownerRoot(owner).add(m); meshes.push(m);
  });
  labels.forEach((s) => ownerRoot(s.userData.owner).add(s));

  // ── 상태 ──
  const level = {};              // sys → 0 / 1(작업 중) / 2(충돌)
  let hiSys = null;
  const toMs = (v) => (v == null ? null : typeof v === 'number' ? v : v instanceof Date ? v.getTime() : Date.parse(v));
  const inWin = (o, now) => now == null || !o.start || !o.end || (Date.parse(o.start) <= now && now < Date.parse(o.end));

  function setActive({ tasks = [], conflicts = [], t } = {}) {
    const now = toMs(t);
    Object.keys(level).forEach((k) => { level[k] = 0; });
    (tasks || []).filter((k) => inWin(k, now)).forEach((k) => (k.systems || []).forEach((s) => { level[s] = Math.max(level[s] || 0, 1); }));
    const find = (id) => (tasks || []).find((k) => k.id === id) || TASKS.find((k) => k.id === id);
    (conflicts || []).filter((c) => inWin(c, now)).forEach((c) => (c.task_ids || []).forEach((id) => {
      (find(id)?.systems || []).forEach((s) => { level[s] = 2; });
    }));
  }

  function highlightSystem(sys) {
    hiSys = sys || null;
    const apply = (m) => {
      const s = m.userData.sys;
      const dim = hiSys && s && s !== hiSys;
      m.transparent = !!dim; m.opacity = dim ? 0.35 : 1; m.depthWrite = !dim; m.needsUpdate = true;
    };
    mats.forEach(apply);
    labels.forEach((l) => { const s = l.userData.sys; l.material.opacity = hiSys && s !== hiSys ? 0.35 : 1; });
  }

  function refresh() {
    const anyIso = Object.keys(ZONE_INFO).some((id) => furnace.isGhosted(id));
    group.visible = !anyIso;
    [...meshes, ...labels].forEach((o) => { if (o.userData.owner !== 'decor') o.visible = !furnace.isGhosted(o.userData.owner); });
  }

  const tmp = new THREE.Color();
  function update(timeSec) {
    const t = timeSec || 0;
    mats.forEach((m) => {
      const s = m.userData.sys;
      if (!s || !SYS_COL[s]) return;
      let lv = level[s] || 0;
      if (hiSys === s) lv = Math.max(lv, 1);
      if (!lv) { m.emissiveIntensity = 0; return; }
      m.emissive.copy(tmp.set(SYS_COL[s]));
      m.emissiveIntensity = lv === 2 ? 0.5 + 0.3 * Math.sin(t * 5) : 0.16 + 0.1 * Math.sin(t * 2.2);
    });
  }

  function dispose() {
    meshes.forEach((m) => { m.removeFromParent(); m.geometry.dispose(); });
    labels.forEach((s) => { s.removeFromParent(); s.material.dispose(); });
    textures.forEach((t) => t.dispose());
    mats.forEach((m) => m.dispose());
    group.removeFromParent();
    meshes.length = 0; labels.length = 0;
  }

  refresh();
  return { group, setActive, highlightSystem, refresh, update, dispose };
}
