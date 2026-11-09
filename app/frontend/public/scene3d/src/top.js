// 노정(TOP) 디테일 — 벨리스 탑 장입설비 + 탑 하우스 철골 + 정비 크레인 (점토 무광, 재질별 병합)
// 모두 모형 단위, furnace.zoneGroup('TOP')에 붙임 → 분해·층 따로 보기 그대로 따라감
// 축척 규칙: 구조물·기계는 실제 크기(고로 110 m = 67 모형 단위). 사람만 과장(PERSON_H_MODEL) — 여기엔 사람 없음
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const M = 67 / 110;                // 1 m → 모형 단위 (≈0.609)
const m = (v) => v * M;            // 실치수(m) → 모형 단위
const RAIL_H = m(1.1);             // 난간 1.1 m
const C = {
  frame: '#b3ada3', grate: '#8f8a83', steel: '#a9a59e', dark: '#7d7871', bin: '#cfcbc4',
  gear: '#9c978f', rail: '#c9a548', crane: '#c9a548', n2: '#a9b8c4', hpu: '#d9ccb4', crate: '#c4a77d',
};
// 층 높이(모형): 데크 48 · 2층 55 · 3층 62(기존 상자 윗면) · 상부 지붕 68.2  (층고 ≈ 11.5 m / 10 m)
const Y0 = 48, Y1 = 55, Y2 = 62, YR = 68.2;
const F = 8, U = 6.2;              // 하부 철골 반폭(≈13 m) · 상부 빈 받침 반폭(≈10 m)
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UPV = V(0, 1, 0);
const noRay = () => {};

// ── 기본 형상 ──
function box(w, h, d, x, y, z) { return new THREE.BoxGeometry(w, h, d).translate(x, y, z); }
function orient(g, a, b) {
  const A = V(...a), B = V(...b), d = B.clone().sub(A);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UPV, d.normalize()));
  return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
}
const len = (a, b) => V(...a).distanceTo(V(...b));
function beam(a, b, t) { return orient(new THREE.BoxGeometry(t, len(a, b), t), a, b); }          // 사각 각재
function pipe(a, b, r, seg = 8) { return orient(new THREE.CylinderGeometry(r, r, len(a, b), seg), a, b); }
function cyl(rt, rb, h, x, y, z, seg = 16) { return new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z); }
function slabRing(y, rIn, rOut, t) {
  return new THREE.LatheGeometry([[rIn, y], [rOut, y], [rOut, y + t], [rIn, y + t], [rIn, y]].map(([r, yy]) => new THREE.Vector2(r, yy)), 48);
}

export function buildTop(furnace) {
  const parent = furnace.zoneGroup('TOP');
  const group = new THREE.Group(); group.name = 'top-detail';
  if (parent) parent.add(group);

  const bins = {};   // 재질 키 → 형상 목록
  const add = (k, g) => { (bins[k] || (bins[k] = [])).push(g); };
  const mats = [], geos = [];
  const mat = (color, extra = {}) => { const o = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...extra }); mats.push(o); return o; };
  const mesh = (geo, mt, p = group) => { const o = new THREE.Mesh(geo, mt); o.raycast = noRay; geos.push(geo); p.add(o); return o; };
  const mergeNI = (list) => { const g = mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x))); list.forEach((x) => x.dispose()); return g; };

  // 난간(꺾은선): 상·중간 레일 + 기둥 1.5 m 간격
  function rail(pts) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0, z0] = pts[i], [x1, y1, z1] = pts[i + 1];
      add('rail', pipe([x0, y0 + RAIL_H, z0], [x1, y1 + RAIL_H, z1], m(0.05), 4));
      add('rail', pipe([x0, y0 + RAIL_H / 2, z0], [x1, y1 + RAIL_H / 2, z1], m(0.035), 4));
      const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / m(1.5)));
      for (let j = 0; j <= n; j++) {
        const t = j / n;
        add('rail', box(m(0.08), RAIL_H, m(0.08), x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + RAIL_H / 2, z0 + (z1 - z0) * t));
      }
    }
  }
  function railCircle(y, r) {
    add('rail', new THREE.TorusGeometry(r, m(0.05), 4, 64).rotateX(Math.PI / 2).translate(0, y + RAIL_H, 0));
    add('rail', new THREE.TorusGeometry(r, m(0.035), 4, 64).rotateX(Math.PI / 2).translate(0, y + RAIL_H / 2, 0));
    const n = Math.round(2 * Math.PI * r / m(1.5));
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; add('rail', box(m(0.08), RAIL_H, m(0.08), r * Math.cos(a), y + RAIL_H / 2, r * Math.sin(a))); }
  }
  // 그레이팅 바닥(사각 고리, 두께 0.15 m): 판 + 1 m 간격 줄무늬
  function grateRing(y, rin, rout) {
    const w = rout - rin, c = (rin + rout) / 2, t = m(0.15), b = m(0.06);
    add('grate', box(rout * 2, t, w, 0, y, c)); add('grate', box(rout * 2, t, w, 0, y, -c));
    add('grate', box(w, t, rin * 2, c, y, 0)); add('grate', box(w, t, rin * 2, -c, y, 0));
    for (let s = -rout + m(0.5); s < rout; s += m(1.0)) {
      add('steel', box(b, b, w, s, y + t / 2 + b / 2, c)); add('steel', box(b, b, w, s, y + t / 2 + b / 2, -c));
      if (Math.abs(s) < rin) { add('steel', box(w, b, b, c, y + t / 2 + b / 2, s)); add('steel', box(w, b, b, -c, y + t / 2 + b / 2, s)); }
    }
  }
  // 수직 사다리 (폭 0.45 m, 가로대 0.3 m, 등받이 고리 1 m 간격), (ax,az) = 바깥 방향
  function ladder(x, z, yA, yB, ax, az) {
    const px = -az * m(0.23), pz = ax * m(0.23);
    add('steel', pipe([x + px, yA, z + pz], [x + px, yB + RAIL_H, z + pz], m(0.05), 4));
    add('steel', pipe([x - px, yA, z - pz], [x - px, yB + RAIL_H, z - pz], m(0.05), 4));
    for (let y = yA + m(0.3); y < yB; y += m(0.3)) add('steel', pipe([x + px, y, z + pz], [x - px, y, z - pz], m(0.02), 3));
    const yaw = Math.atan2(ax, az);   // 반원 고리를 바깥쪽으로
    for (let y = yA + m(2.4); y < yB + RAIL_H; y += m(1.0)) {
      add('steel', new THREE.TorusGeometry(m(0.38), m(0.03), 3, 8, Math.PI).rotateX(Math.PI / 2).rotateY(yaw).translate(x, y, z));
    }
  }
  // 계단 한 경간 (폭 1 m, 단 높이 0.2 m), x 방향으로 오름
  function stair(xA, yA, xB, yB, zc, w = m(1.0)) {
    const n = Math.round((yB - yA) / m(0.2));
    [zc - w / 2, zc + w / 2].forEach((z) => { add('frame', beam([xA, yA, z], [xB, yB, z], m(0.25))); rail([[xA, yA, z], [xB, yB, z]]); });
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      add('grate', box(Math.abs(xB - xA) / n * 1.05, m(0.05), w, xA + (xB - xA) * t, yA + (yB - yA) * t, zc));
    }
  }

  // ═══ 1. 탑 하우스 철골 (기존 상자를 감싸는 기둥·X브레이스·층바닥·지붕) ═══
  const grid = [-F, 0, F];
  grid.forEach((x) => grid.forEach((z) => { if (x || z) add('frame', box(m(0.6), Y2 - Y0 + 0.3, m(0.6), x, (Y0 + Y2) / 2, z)); }));   // H형강 기둥 0.6 m
  [Y1, Y2].forEach((y) => {   // 층 보 0.7 m + 그레이팅
    [-F, F].forEach((s) => { add('frame', box(F * 2, m(0.7), m(0.35), 0, y - m(0.35), s)); add('frame', box(m(0.35), m(0.7), F * 2, s, y - m(0.35), 0)); });
    grateRing(y, 6.05, F);
  });
  // X 브레이스(0.3 m): 면마다 칸 × 두 층, +x 면 -z 칸은 컨베이어 진입이라 비움
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([nx, nz]) => {
    [[-F, 0], [0, F]].forEach(([s0, s1]) => [[Y0, Y1], [Y1, Y2]].forEach(([ya, yb]) => {
      if (nx === 1 && s0 === -F) return;
      const p = (s, y) => (nx ? [nx * F, y, s] : [s, y, nz * F]);
      add('frame', beam(p(s0, ya + 0.3), p(s1, yb - 0.5), m(0.3)));
      add('frame', beam(p(s1, ya + 0.3), p(s0, yb - 0.5), m(0.3)));
    }));
  });
  rail([[-F, Y2, -F], [F, Y2, -F], [F, Y2, F], [-5, Y2, F]]);
  rail([[-F, Y1, -F], [-F, Y1, F]]); rail([[F, Y1, F], [F, Y1, 0.4]]);
  // 상부층(빈 받침대): 기둥 0.5 m + 지붕보 + 경사 브레이스 + 지붕판 + 지붕 난간
  [-U, 0, U].forEach((x) => [-U, U].forEach((z) => add('frame', box(m(0.5), YR - Y2, m(0.5), x, (Y2 + YR) / 2, z))));
  [-U, U].forEach((s) => {
    add('frame', beam([-U, YR - 0.3, s], [U, YR - 0.3, s], m(0.6))); add('frame', beam([s, YR - 0.3, -U], [s, YR - 0.3, U], m(0.6)));
    add('frame', beam([-U, Y2 + 0.4, s], [0, YR - 0.7, s], m(0.25))); add('frame', beam([s, Y2 + 0.4, U], [s, YR - 0.7, 0], m(0.25)));
  });
  add('grate', box(U * 2 + 0.4, m(0.3), U * 2 + 0.4, 0, YR, 0));
  const yRf = YR + m(0.15);
  rail([[-U, yRf, -U], [U, yRf, -U], [U, yRf, U], [-U, yRf, U], [-U, yRf, -U]]);
  // 계단: 데크 → 2층 → 3층 (+z 면 바깥 지그재그), 3층 → 지붕은 사다리
  const ZS = F + m(1.0);
  stair(-5, Y0, 4.4, Y1, ZS); add('grate', box(2.4, m(0.15), m(1.2), 5.6, Y1, ZS));
  stair(4.4, Y1, -5, Y2, ZS + m(1.2)); add('grate', box(2.4, m(0.15), m(2.4), -6.2, Y2, ZS + m(0.6)));
  [0, 4].forEach((x) => add('frame', box(m(0.3), Y2 - Y0, m(0.3), x, (Y0 + Y2) / 2, ZS + m(1.8))));
  ladder(-U - m(0.6), -3, Y2, YR, -1, 0);

  // ═══ 2. 벨리스 탑 장입설비 (실치수) ═══
  // 쌍 저장조(탑 빈): 지름 6 m, 몸통 7 m, 하부 원추 2.5 m → 게이트 → 바지형 슈트
  const BR = m(3), BX = 3.0, yBin = YR + m(1.2);
  [-BX, BX].forEach((x) => {
    const sx = Math.sign(x);
    add('bin', cyl(BR, m(0.5), m(2.5), x, yBin + m(1.25), 0, 20));          // 하부 원추
    add('bin', cyl(BR, BR, m(7), x, yBin + m(2.5) + m(3.5), 0, 20));        // 몸통
    add('bin', cyl(m(1.2), BR, m(1.0), x, yBin + m(10), 0, 20));            // 지붕
    add('dark', cyl(BR + m(0.2), BR + m(0.2), m(0.3), x, yBin + m(2.5), 0, 20));  // 받침 플랜지
    add('dark', cyl(m(0.6), m(0.6), m(0.8), x, yBin + m(10.9), 0, 10));     // 투입구
    add('gear', box(m(1.6), m(1.0), m(1.6), x, yBin - m(0.5), 0));          // 재료 유량 게이트
    add('dark', box(m(0.35), m(0.6), m(2.0), x + sx * m(1.0), yBin - m(0.5), 0)); // 게이트 유압실린더
    add('steel', pipe([x, yBin - m(1.0), 0], [sx * 0.9, 67.2, 0], m(0.4), 10));  // 하부 슈트 → 중앙 호퍼
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => add('frame', box(m(0.4), m(2.6), m(0.4), x + a * m(2.2), yBin + m(1.3) - m(1.2) + m(0.1), b * m(2.2))));
  });
  [-1, 1].forEach((b) => add('dark', box(BX * 2 + BR * 2, m(0.6), m(0.4), 0, yBin + m(2.3), b * m(2.2))));   // 빈 받침보
  // 기어박스(중앙, 빈 아래): 지름 ≈ 5 m 플랜지 원통(기존 호퍼를 감쌈) + 구동 모터 2대
  const GR = m(2.6), gY = Y2 + m(1.5);
  add('gear', cyl(GR, GR, m(2.0), 0, gY, 0, 24));
  add('dark', cyl(GR + m(0.3), GR + m(0.3), m(0.25), 0, gY - m(1.0), 0, 24));
  add('dark', cyl(GR + m(0.3), GR + m(0.3), m(0.25), 0, gY + m(1.0), 0, 24));
  [0.3, Math.PI * 0.8].forEach((a) => {
    const ca = Math.cos(a), sa = Math.sin(a);
    add('gear', pipe([ca * GR, gY, sa * GR], [ca * (GR + m(2.2)), gY, sa * (GR + m(2.2))], m(0.5), 10));   // 모터 Ø1 m × 2.2 m
    add('dark', box(m(1.0), gY - Y2 - m(0.5), m(1.0), ca * (GR + m(1.1)), Y2 + (gY - Y2 - m(0.5)) / 2, sa * (GR + m(1.1))));
  });
  add('dark', new THREE.TorusGeometry(3.0, m(0.2), 4, 32).rotateX(Math.PI / 2).translate(0, 67, 0));   // 중앙 호퍼 상부 칼라
  add('steel', cyl(m(1.0), m(1.0), 1.4, 0, Y0 - 0.5, 0, 12));            // 중앙 장입관(돔 안)

  // 선회 슈트 (돔 안, 절개면으로 보임): 길이 4 m, 폭 1 m, 50° 기울임 — 피벗 그룹 천천히 회전
  const chutePivot = new THREE.Group(); chutePivot.position.set(0, 46.6, 0); group.add(chutePivot);
  {
    const L = m(4.2), tilt = 50 * Math.PI / 180;
    mesh(mergeNI([
      new THREE.CylinderGeometry(m(0.55), m(0.45), L, 12, 1, true, 0, Math.PI * 1.3).translate(0, -L / 2, 0).rotateZ(tilt),
      new THREE.TorusGeometry(m(0.9), m(0.15), 6, 20).rotateX(Math.PI / 2),
      new THREE.CylinderGeometry(m(0.8), m(0.8), m(0.6), 12),
    ]), mat(C.dark, { side: THREE.DoubleSide }), chutePivot);
  }

  // ═══ 3. 장입 컨베이어 헤드부 (details.js 갤러리 끝 B=[8,55,-4]) ═══
  {
    const A = [55, 1.2, -30], B = [8, 55, -4];
    const h = V(B[0] - A[0], 0, B[2] - A[2]).normalize(), px = -h.z, pz = h.x;
    const at = (f, s, y) => [B[0] + h.x * f + px * s, y, B[2] + h.z * f + pz * s];
    const yD = Y1 + 0.6, W = m(1.2);                                 // 드럼 높이 · 반폭
    [[-0.6, -1], [-0.6, 1], [1.2, -1], [1.2, 1]].forEach(([f, s]) => add('frame', beam(at(f, s * (W + m(0.4)), Y1 - 1.1), at(f, s * (W + m(0.4)), yD + m(2.4)), m(0.3))));
    [-1, 1].forEach((s) => add('frame', beam(at(-0.6, s * (W + m(0.4)), yD + m(2.4)), at(1.2, s * (W + m(0.4)), yD + m(2.4)), m(0.3))));
    add('gear', pipe(at(0.4, -W, yD), at(0.4, W, yD), m(0.65), 14));            // 헤드 풀리 Ø1.3 m × 벨트폭 2.4 m
    add('dark', pipe(at(0.4, -W - m(0.6), yD), at(0.4, W + m(0.6), yD), m(0.15), 6));
    [-1, 1].forEach((s) => add('dark', box(m(0.5), m(0.6), m(0.5), ...at(0.4, s * (W + m(0.45)), yD - m(0.3)))));   // 축받이
    const hood = new THREE.CylinderGeometry(m(0.95), m(0.95), W * 2 + m(0.3), 12, 1, true, 0, Math.PI);
    add('bin', hood.rotateX(Math.PI / 2).rotateY(Math.atan2(h.x, h.z) + Math.PI / 2).translate(...at(0.4, 0, yD)));
    add('dark', beam(at(-2.6, 0, yD - 2.2), at(0.4, 0, yD + m(0.65)), m(0.15)));   // 벨트 윗면 끝자락
    add('gear', box(m(1.2), m(1.0), m(1.4), ...at(0.4, W + m(1.6), yD)));            // 구동 모터·감속기
    add('steel', beam(at(1.0, 0, yD - m(0.4)), at(1.9, 0, yD - m(2.4)), m(1.2)));  // 배출 슈트
  }

  // ═══ 4. 노정 정비 크레인 (모노레일 외팔보 + 트롤리 + 훅 블록 + 인양물) ═══
  const ang = 25 * Math.PI / 180, dx = Math.cos(ang), dz = Math.sin(ang);
  const RY = YR - m(0.9);                       // 레일(H형강 0.6 m) 높이 — 지붕 밑
  const onR = (r, y) => [dx * r, y, dz * r];
  add('crane', beam(onR(3.2, RY), onR(17.5, RY), m(0.6)));
  add('crane', box(m(0.3), m(1.0), m(0.3), ...onR(17.4, RY - m(0.3))));        // 끝 스토퍼
  add('crane', box(m(0.5), m(5), m(0.5), ...onR(4.2, YR + m(2.5))));           // 마스트 5 m
  add('steel', pipe(onR(4.2, YR + m(4.8)), onR(16, RY + m(0.3)), m(0.05), 5)); // 백스테이 로드
  add('steel', pipe(onR(4.2, YR + m(4.8)), onR(10, RY + m(0.3)), m(0.05), 5));
  const trolley = new THREE.Group(), hook = new THREE.Group(), crate = new THREE.Group();
  group.add(trolley, hook, crate);
  const mCrane = mat(C.crane), mDark = mat(C.dark), mCrate = mat(C.crate), mSteel = mat(C.steel);
  // 전동 트롤리 호이스트 1.8×0.8×1.0 m
  mesh(mergeNI([box(m(1.8), m(0.8), m(1.0), 0, -m(0.7), 0), box(m(0.6), m(0.5), m(0.6), 0, -m(1.3), 0)]), mCrane, trolley);
  trolley.rotation.y = -ang;
  // 훅 블록 0.6×0.9 m + 훅
  mesh(new THREE.BoxGeometry(m(0.6), m(0.9), m(0.4)).translate(0, -m(0.45), 0), mCrane, hook);
  mesh(new THREE.TorusGeometry(m(0.25), m(0.08), 4, 10, Math.PI * 1.4).rotateZ(-Math.PI * 0.2).translate(0, -m(1.15), 0), mDark, hook);
  // 인양물: 벨리스 탑 부품 크레이트 2.6×2.0×2.6 m + 철 띠 + 4점 줄걸이
  const CW = m(2.6), CH = m(2.0), SL = m(2.2);
  mesh(new THREE.BoxGeometry(CW, CH, CW).translate(0, CH / 2, 0), mCrate, crate);
  mesh(mergeNI([box(CW + m(0.08), m(0.15), CW + m(0.08), 0, m(0.25), 0), box(CW + m(0.08), m(0.15), CW + m(0.08), 0, CH - m(0.25), 0)]), mDark, crate);
  const slings = mesh(mergeNI([[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => pipe([a * CW / 2.3, CH, b * CW / 2.3], [0, CH + SL, 0], m(0.03), 3))), mSteel, crate);
  crate.rotation.y = -ang;
  const crateH = CH + SL;
  const cable = mesh(new THREE.CylinderGeometry(m(0.03), m(0.03), 1, 4).translate(0, -0.5, 0), mDark);
  const CAB_TOP = RY - m(1.5);
  const HOOK_LEN = m(1.4);

  // ═══ 5. 블리더 밸브 플랫폼 (y 66, 폭 2.5 m) + 받침 + 사다리 ═══
  const YB = 66, BRi = 8.7, BRo = BRi + m(2.5);
  add('grate', slabRing(YB - m(0.15), BRi, BRo, m(0.15)));
  for (let i = 0; i < 12; i++) {
    const a = (i + 0.5) / 12 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    add('frame', beam([BRi * ca, YB - m(0.2), BRi * sa], [7.6 * ca, Y2, 7.6 * sa], m(0.25)));
  }
  railCircle(YB, BRo - m(0.1));
  [Math.PI, Math.PI * 1.5].forEach((a) => ladder((BRo - m(0.3)) * Math.cos(a), (BRo - m(0.3)) * Math.sin(a), Y0, YB, Math.cos(a), Math.sin(a)));

  // ═══ 6. 유압 유닛 · 질소 실(seal) 배관 · 경광등 ═══
  const hx = -4.0, hz = F - m(1.2);
  add('hpu', box(m(3.0), m(1.8), m(1.5), hx, Y2 + m(0.9) + 0.06, hz));       // 유압 유닛 3×1.5×1.8 m (3층 바닥)
  add('dark', box(m(3.1), m(0.15), m(1.6), hx, Y2 + m(1.8) + 0.1, hz));
  add('dark', cyl(m(0.35), m(0.35), m(1.2), hx - m(1.0), Y2 + m(2.4), hz, 8));  // 어큐뮬레이터
  add('n2', pipe([hx + m(1.5), Y2 + m(1.2), hz], [-GR * 0.6, gY, GR * 0.8], m(0.05), 5));   // 유압 → 기어박스
  // 질소 헤더(DN100) → 각 빈 상부·균압 라인(DN50), 기어박스 냉각
  const NX = -U - m(0.7), NZ = -U - m(0.7), yN = yBin + m(8), yE = yBin + m(4);
  add('n2', pipe([NX, Y1 + 1, NZ], [NX, yN, NZ], m(0.06), 6));
  add('n2', pipe([NX, yN, NZ], [BX, yN, NZ], m(0.06), 6));
  add('n2', pipe([NX, yE, NZ], [BX, yE, NZ], m(0.04), 5));
  [-BX, BX].forEach((x) => {
    add('n2', pipe([x, yN, NZ], [x, yN, -BR], m(0.05), 5));
    add('n2', box(m(0.4), m(0.4), m(0.4), x, yN, NZ + m(0.8)));                // 차단 밸브
    add('n2', pipe([x - m(0.8), yE, NZ], [x - m(0.8), yE, -BR + m(0.2)], m(0.035), 4));
  });
  add('n2', pipe([NX, gY, NZ], [-GR * 0.7, gY, -GR * 0.7], m(0.04), 4));

  // 재질별 병합
  Object.entries(bins).forEach(([k, list]) => { const g = mergeNI(list); if (g) mesh(g, mat(C[k])); });

  // 경광등 4개 (상부 지붕 모서리, Ø0.3 m) — 깜빡임용 별도 재질
  const mBeacon = mat('#ff9a1f', { emissive: new THREE.Color('#ff8a00'), emissiveIntensity: 0.15 });
  mesh(mergeNI([[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([a, b]) => [
    cyl(m(0.15), m(0.15), m(0.35), a * U, YR + m(0.33), b * U, 8),
    new THREE.SphereGeometry(m(0.15), 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(a * U, YR + m(0.5), b * U),
  ])), mBeacon);

  // ── 상태 ──
  const toMs = (v) => (v == null ? null : typeof v === 'number' ? v : v instanceof Date ? v.getTime() : Date.parse(v));
  const inWin = (o, now) => now != null && o.start && o.end && Date.parse(o.start) <= now && now < Date.parse(o.end);
  let topActive = false, liftActive = false, night = false, conflict = false;
  function setActive({ tasks = [], conflicts = [], t } = {}) {
    const now = toMs(t);
    const act = (tasks || []).filter((k) => (k.zone_ids || []).includes('TOP') && inWin(k, now));
    topActive = act.length > 0;
    liftActive = act.some((k) => (k.work_types || []).includes('LIFT'));
    conflict = (conflicts || []).some((c) => (c.zone_ids || []).includes('TOP') && inWin(c, now));
    const hr = now == null ? 12 : new Date(now).getHours();
    night = hr >= 19 || hr < 7;
    mBeacon.color.set(conflict ? '#ff4a3a' : '#ff9a1f'); mBeacon.emissive.set(conflict ? '#ff2a1a' : '#ff8a00');
  }

  // 트롤리·훅 현재값 (목표로 부드럽게)
  const PARK_R = 5, WORK_R = 14.2, CRATE_R = 14;
  let trR = PARK_R, hkY = CAB_TOP - m(1.0), carry = 0;
  function update(sec = 0) {
    chutePivot.rotation.y = sec * 0.15;
    // 인양 작업(LIFT) 중: 트롤리 바깥 + 훅 천천히 오르내림 / 아니면 주차
    const tgtR = liftActive ? WORK_R : PARK_R;
    const tgtY = liftActive ? 57 + 6.5 * Math.sin(sec * 0.25) : CAB_TOP - m(1.0);
    trR += (tgtR - trR) * 0.03; hkY += (tgtY - hkY) * 0.05;
    carry += ((liftActive ? 1 : 0) - carry) * 0.05;
    trolley.position.set(...onR(trR, RY));
    hook.position.set(dx * trR, hkY, dz * trR);
    cable.position.set(dx * trR, CAB_TOP, dz * trR); cable.scale.y = Math.max(0.05, CAB_TOP - hkY);
    // 인양물: 작업 중엔 훅에 매달림, 아니면 데크 위에 놓임
    const k = carry, r = CRATE_R * (1 - k) + trR * k;
    const hangY = Math.max(Y0, hkY - HOOK_LEN - crateH);
    crate.position.set(dx * r, Y0 * (1 - k) + hangY * k, dz * r);
    slings.visible = k > 0.5;
    // 경광등: 야간(19–07) 또는 노정 작업 중 깜빡임, 충돌이면 빨강·빠르게
    const blink = night || topActive;
    mBeacon.emissiveIntensity = blink ? (Math.sin(sec * (conflict ? 9 : 5)) > 0 ? 2.2 : 0.1) : 0.15;
  }
  function refresh() { group.visible = !furnace.isGhosted('TOP'); }
  function dispose() {
    group.removeFromParent();
    geos.forEach((g) => g.dispose());
    mats.forEach((o) => o.dispose());
  }
  update(0); refresh();
  return { group, setActive, refresh, update, dispose };
}
