// 개수 현장 장비 (점토 로우폴리) — 점토모형_relining/design/clay-equip.js 형상을 옮겨 우리 구역 좌표(ZONE_INFO)에 다시 배치
// 단위: 모형 단위. 구역 장비는 furnace.zoneGroup(id)에, 지상 대형 장비(SITE)는 furnace.decor에 붙인다.
// 크기 규칙(사용자 결정): 사람만 고로 높이 1/30로 과장. 장비는 실물 크기(M = 67/110 모형단위/m). 비계는 사람이 서므로 사람 기준.
import * as THREE from 'three';
import { ZONE_INFO, PERSON_H_MODEL, OPEN_PHI, radiusAt } from './furnace.js';

const P = PERSON_H_MODEL;          // 사람 키(≈2.23) — 사람만 과장
const M = 67 / 110;                // 실제 1 m → 모형 단위 (고로 110 m = 67). 장비는 실물 크기
const C = {
  body: '#cfcbc4', beige: '#d9ccb4', dark: '#8f8a83', steel: '#a9a59e', crane: '#c9a548',
  o2: '#6f8499', lpg: '#a8675d', wood: '#b99d78', brick: '#c6a487', brick2: '#b3917a',
  box: '#a3ab9d', lamp: '#efe7d2', frame: '#77818a', truck: '#b98f5e', green: '#8fa08a', blue: '#7f93a3',
};

// ── 공용 단위 지오메트리(스케일로 크기 조절) ──
const G_BOX = new THREE.BoxGeometry(1, 1, 1);
const G_CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
const G_SPH = new THREE.SphereGeometry(1, 10, 8);
const UP = new THREE.Vector3(0, 1, 0);

export function buildEquipment(furnace, { tasks } = {}) {
  const mats = new Map();
  const MAT = (hex) => {
    if (!mats.has(hex)) mats.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.95, metalness: 0, flatShading: true }));
    return mats.get(hex);
  };
  const beaconMat = new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ff9a1f', emissiveIntensity: 2, roughness: 0.6 });

  // ── 부품 헬퍼 (y는 바닥 기준) ──
  const mesh = (g, geo, hex) => { const m = new THREE.Mesh(geo, MAT(hex)); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  const box = (g, w, h, d, x, y, z, hex, ry = 0) => { const m = mesh(g, G_BOX, hex); m.scale.set(w, h, d); m.position.set(x, y + h / 2, z); m.rotation.y = ry; return m; };
  const cyl = (g, r, h, x, y, z, hex) => { const m = mesh(g, G_CYL, hex); m.scale.set(r, h, r); m.position.set(x, y + h / 2, z); return m; };
  const cylX = (g, r, len, x, y, z, hex) => { const m = mesh(g, G_CYL, hex); m.scale.set(r, len, r); m.position.set(x, y, z); m.rotation.z = Math.PI / 2; return m; };
  const cylZ = (g, r, len, x, y, z, hex) => { const m = mesh(g, G_CYL, hex); m.scale.set(r, len, r); m.position.set(x, y, z); m.rotation.x = Math.PI / 2; return m; };
  const beam = (g, a, b, t, hex) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
    if (len < 1e-4) return null;
    const m = mesh(g, G_BOX, hex); m.scale.set(t, len, t);
    m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); return m;
  };
  const beacon = (g, x, y, z, r = 0.1 * P) => { const m = new THREE.Mesh(G_SPH, beaconMat); m.scale.setScalar(r); m.position.set(x, y, z); m.visible = false; g.add(m); return m; };

  // fit: 만든 형상을 실물 치수(m: 길이 L(z)·높이 H(y)·폭 W(x))에 맞춰 안쪽 그룹을 스케일, 바닥 y=0·중심 정렬
  function fit(built, L, H, W) {
    const g = built.g; g.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(g), sz = bb.getSize(new THREE.Vector3());
    const inner = new THREE.Group(); while (g.children.length) inner.add(g.children[0]);
    const s = new THREE.Vector3(W * M / sz.x, H * M / sz.y, L * M / sz.z);
    inner.scale.copy(s); inner.position.set(-(bb.min.x + bb.max.x) / 2 * s.x, -bb.min.y * s.y, -(bb.min.z + bb.max.z) / 2 * s.z);
    g.add(inner);
    if (built.door) built.door = built.door.clone().multiply(s).add(inner.position);
    built.top = H * M; built.len = L * M; built.wid = W * M;
    return built;
  }
  // ── 장비 형상 (로컬: 바닥 y=0, +z = 앞) — 실물 크기 ──
  // 대형 크롤러 크레인 — 실물 치수(m)를 M으로 환산. sp: 트랙·상부·카운터웨이트·붐 단면(m). boomLen은 모형 단위
  function crawlerCrane(boomLen, angDeg, sp) {
    const g = new THREE.Group(), m = (v) => v * M;
    const { trackL, trackGap, trackW, trackH, bodyL, bodyW, bodyH, cw, sec } = sp;
    [-1, 1].forEach((sx) => {
      const x = sx * m(trackGap / 2);
      box(g, m(trackW), m(trackH), m(trackL), x, 0, 0, C.dark);
      cylX(g, m(trackH / 2), m(trackW), x, m(trackH / 2), m(trackL / 2), C.dark); cylX(g, m(trackH / 2), m(trackW), x, m(trackH / 2), -m(trackL / 2), C.dark);
    });
    box(g, m(trackGap - trackW), m(1.2), m(bodyW * 0.7), 0, m(trackH * 0.4), 0, C.steel);   // 카베디
    const upY = m(trackH + 0.3);
    const upper = new THREE.Group(); upper.position.y = upY; g.add(upper);
    cyl(upper, m(bodyW * 0.4), m(0.5), 0, 0, 0, C.dark);                                  // 선회 링
    box(upper, m(bodyW), m(bodyH), m(bodyL), 0, m(0.5), -m(bodyL * 0.15), C.crane);       // 상부 본체
    box(upper, m(cw[0]), m(cw[2]), m(cw[1]), 0, m(0.5), -m(bodyL * 0.65 + cw[1] / 2), C.dark);  // 카운터웨이트 (폭×깊이×높이)
    box(upper, m(1.6), m(2.4), m(2.2), -m(bodyW / 2 + 0.8), m(0.5), m(bodyL * 0.3), C.body);   // 운전실
    const ang = angDeg * Math.PI / 180, pv = [0, m(bodyH * 0.6), m(bodyL * 0.35)];
    const tip = [0, pv[1] + Math.sin(ang) * boomLen, pv[2] + Math.cos(ang) * boomLen];
    const hs = m(sec / 2), ch = m(sec * 0.12);                                             // 격자 붐: 4개 현재 + 띠
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
      const off = (v) => [v[0] + sx * hs, v[1] + sy * hs * Math.cos(ang), v[2] - sy * hs * Math.sin(ang)];
      beam(upper, off(pv), off(tip), ch, C.crane);
    });
    const nTie = Math.max(4, Math.floor(boomLen / (sec * M * 2.5)));
    for (let i = 1; i < nTie; i++) {
      const f = i / nTie, y = pv[1] + (tip[1] - pv[1]) * f, z2 = pv[2] + (tip[2] - pv[2]) * f;
      beam(upper, [-hs, y, z2], [hs, y, z2], ch * 0.6, C.crane);
    }
    box(upper, m(sec), m(sec * 0.8), m(sec), 0, tip[1] - m(sec * 0.4), tip[2], C.dark);    // 붐 헤드
    const mast = [0, m(bodyH + 12), -m(bodyL * 0.45)];                                     // A프레임·지지 로프
    beam(upper, [-m(bodyW * 0.35), m(bodyH), -m(bodyL * 0.3)], mast, ch * 2, C.steel);
    beam(upper, [m(bodyW * 0.35), m(bodyH), -m(bodyL * 0.3)], mast, ch * 2, C.steel);
    beam(upper, mast, tip, m(0.25), C.dark);
    // 후크 (로프 길이 스케일로 승강)
    const hook = new THREE.Group(); hook.position.set(0, tip[1], tip[2] + m(sec * 0.6)); upper.add(hook);
    const rope = mesh(hook, G_BOX, C.dark); rope.scale.set(m(0.15), 1, m(0.15));
    const block = new THREE.Group(); hook.add(block);
    box(block, m(1.6), m(2.4), m(1.0), 0, -m(2.4), 0, C.crane);
    const setDrop = (d) => { rope.scale.y = Math.max(0.1, d); rope.position.y = -d / 2; block.position.y = -d; };
    const cab = new THREE.Vector3(-m(bodyW / 2 + 2.2), upY, m(bodyL * 0.3));              // 운전실 옆 지상 아닌 탑승 위치
    const tipW = new THREE.Vector3(tip[0], tip[1] + upY, tip[2] + m(sec * 0.6));
    return { g, upper, hook, setDrop, tip: tipW, cab, pivot: new THREE.Vector3(0, pv[1] + upY, pv[2]), sp };
  }
  // 덤프트럭 — 9×2.5×3.5 m
  function dumpTruck(hex = C.truck) {
    const g = new THREE.Group(), u = P / 2.2;
    const wr = 0.45 * u;
    [-1.6, 0.4, 1.4].forEach((z) => [-0.9, 0.9].forEach((x) => cylX(g, wr, 0.4 * u, x * u, wr, z * u, C.dark)));
    box(g, 1.9 * u, 0.4 * u, 4.4 * u, 0, 0.55 * u, -0.1 * u, C.frame);
    box(g, 1.9 * u, 1.5 * u, 1.3 * u, 0, 0.95 * u, 1.55 * u, hex);                 // 운전실
    box(g, 1.7 * u, 0.5 * u, 0.05 * u, 0, 1.8 * u, 2.21 * u, C.dark);              // 앞유리
    box(g, 2.1 * u, 1.3 * u, 2.9 * u, 0, 0.95 * u, -0.75 * u, hex);                 // 적재함
    box(g, 1.8 * u, 0.3 * u, 2.6 * u, 0, 2.1 * u, -0.75 * u, C.brick);              // 짐
    return fit({ g, door: new THREE.Vector3(1.2 * u, 0, 1.55 * u) }, 9, 3.5, 2.5);
  }
  // 휠로더 8×3.5 m / 미니(스키드) 로더 3×2 m
  function loader(mini = false) {
    const g = new THREE.Group(), u = (mini ? 0.8 : 1.3) * P / 2.6;
    [-1.1, 1.1].forEach((z) => [-0.95, 0.95].forEach((x) => cylX(g, 0.6 * u, 0.5 * u, x * u, 0.6 * u, z * u, C.dark)));
    box(g, 1.6 * u, 0.9 * u, 3.2 * u, 0, 0.6 * u, -0.2 * u, C.crane);
    box(g, 1.3 * u, 1.1 * u, 1.2 * u, 0, 1.5 * u, -0.3 * u, C.body);
    box(g, 1.6 * u, 0.7 * u, 1.0 * u, 0, 1.0 * u, -1.6 * u, C.crane);
    beam(g, [-0.6 * u, 1.3 * u, 0.6 * u], [-0.6 * u, 0.6 * u, 2.1 * u], 0.25 * u, C.crane);
    beam(g, [0.6 * u, 1.3 * u, 0.6 * u], [0.6 * u, 0.6 * u, 2.1 * u], 0.25 * u, C.crane);
    box(g, 2.2 * u, 0.8 * u, 0.7 * u, 0, 0.15 * u, 2.3 * u, C.dark);                // 버킷
    return mini ? fit({ g }, 3, 2, 1.6) : fit({ g }, 8, 3.5, 2.8);
  }
  // 지게차 3.5×2.2 m, 포크 승강
  function forklift() {
    const g = new THREE.Group(), u = 1.1 * P / 2.2;
    [-0.7, 0.7].forEach((z) => [-0.55, 0.55].forEach((x) => cylX(g, 0.3 * u, 0.25 * u, x * u, 0.3 * u, z * u, C.dark)));
    box(g, 1.1 * u, 0.7 * u, 2.0 * u, 0, 0.3 * u, 0, C.crane);
    box(g, 1.1 * u, 0.6 * u, 0.5 * u, 0, 0.5 * u, -0.85 * u, C.dark);
    [-0.5, 0.5].forEach((x) => { beam(g, [x * u, 1.0 * u, -0.5 * u], [x * u, 2.0 * u, -0.5 * u], 0.07 * u, C.dark); beam(g, [x * u, 1.0 * u, 0.4 * u], [x * u, 2.0 * u, 0.4 * u], 0.07 * u, C.dark); });
    box(g, 1.1 * u, 0.06 * u, 1.0 * u, 0, 2.0 * u, 0, C.dark);
    [-0.35, 0.35].forEach((x) => box(g, 0.1 * u, 2.2 * u, 0.12 * u, x * u, 0.1 * u, 1.05 * u, C.steel));
    const fork = new THREE.Group(); fork.position.set(0, 0.1 * u, 1.2 * u); g.add(fork);
    [-0.3, 0.3].forEach((x) => box(fork, 0.12 * u, 0.06 * u, 1.0 * u, x * u, 0, 0.5 * u, C.dark));
    box(fork, 0.9 * u, 0.4 * u, 0.8 * u, 0, 0.06 * u, 0.5 * u, C.wood);
    return fit({ g, fork, forkMax: 1.2 * u }, 3.5, 2.2, 1.2);
  }
  // 고소작업대(시저리프트) — 차체 약 2.5 m, 작업대 최대 약 10 m
  function scissorLift() {
    const g = new THREE.Group(), u = 1.15 * M;
    [-0.8, 0.8].forEach((z) => [-0.45, 0.45].forEach((x) => cylX(g, 0.18 * u, 0.15 * u, x * u, 0.18 * u, z * u, C.dark)));
    box(g, 1.0 * u, 0.5 * u, 2.1 * u, 0, 0.15 * u, 0, C.crane);
    const mast = new THREE.Group(); mast.position.y = 0.65 * u; g.add(mast);
    const xs = [beam(mast, [0, -0.5, -0.9 * u], [0, 0.5, 0.9 * u], 0.08 * u, C.dark), beam(mast, [0, 0.5, -0.9 * u], [0, -0.5, 0.9 * u], 0.08 * u, C.dark)];
    xs.forEach((m) => { m.position.y = 0; });
    const plat = new THREE.Group(); g.add(plat);
    box(plat, 1.1 * u, 0.12 * u, 2.2 * u, 0, 0, 0, C.crane);
    [[-0.5, -1], [0.5, -1], [-0.5, 1], [0.5, 1]].forEach(([x, z]) => beam(plat, [x * u, 0.12 * u, z * 1.05 * u], [x * u, 1.0 * u, z * 1.05 * u], 0.04 * u, C.dark));
    beam(plat, [-0.5 * u, 1.0 * u, -1.05 * u], [-0.5 * u, 1.0 * u, 1.05 * u], 0.05 * u, C.dark);
    beam(plat, [0.5 * u, 1.0 * u, -1.05 * u], [0.5 * u, 1.0 * u, 1.05 * u], 0.05 * u, C.dark);
    const setH = (h) => { plat.position.y = 0.65 * u + h; mast.scale.y = Math.max(0.1, h); mast.position.y = 0.65 * u + h / 2; };
    setH(0.25 * u);
    return { g, plat, setH, hMin: 0.25 * u, hMax: 8 * u, top: 0.8 * u };
  }
  // 용접기 3×1.2×1.5 m / 발전기 4×1.8×2.2 m
  function generator(hex = C.green, big = false) {
    const g = new THREE.Group(), u = 1;
    [-0.55, 0.55].forEach((x) => cylX(g, 0.22 * u, 0.15 * u, x * u, 0.22 * u, -0.4 * u, C.dark));
    box(g, 1.0 * u, 0.85 * u, 1.4 * u, 0, 0.25 * u, 0, hex);
    box(g, 0.9 * u, 0.06 * u, 1.3 * u, 0, 1.1 * u, 0, C.dark);
    cyl(g, 0.05 * u, 0.3 * u, 0.3 * u, 1.1 * u, -0.5 * u, C.dark);                  // 배기관
    beam(g, [0, 0.35 * u, 0.7 * u], [0, 0.25 * u, 1.1 * u], 0.08 * u, C.dark);     // 견인봉
    return big ? fit({ g }, 4, 2.2, 1.8) : fit({ g }, 3, 1.5, 1.2);
  }
  // 가스 용기 랙 (O2·LPG)
  function gasRack(n = 4) {   // 용기 높이 1.5 m
    const g = new THREE.Group(), u = 1.25 * M;
    box(g, n * 0.32 * u + 0.1 * u, 0.06 * u, 0.5 * u, 0, 0, 0, C.dark);
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.32 * u, hex = i % 2 ? C.lpg : C.o2;
      cyl(g, 0.12 * u, 1.2 * u, x, 0.06 * u, 0, hex); cyl(g, 0.06 * u, 0.12 * u, x, 1.26 * u, 0, C.dark);
    }
    beam(g, [-(n * 0.16 + 0.05) * u, 0.9 * u, -0.22 * u], [(n * 0.16 + 0.05) * u, 0.9 * u, -0.22 * u], 0.05 * u, C.frame);
    [-1, 1].forEach((sx) => beam(g, [sx * (n * 0.16 + 0.05) * u, 0, -0.22 * u], [sx * (n * 0.16 + 0.05) * u, 1.3 * u, -0.22 * u], 0.06 * u, C.frame));
    return { g, top: 1.4 * u };
  }
  // 송풍기 + 덕트 (팬 회전)
  function blower(ductLen = 4 * M) {   // 팬 지름 약 2 m
    const g = new THREE.Group(), u = 2.6 * M;
    box(g, 0.8 * u, 0.15 * u, 0.6 * u, 0, 0, 0, C.dark);
    cylZ(g, 0.38 * u, 0.5 * u, 0, 0.55 * u, 0, C.blue);
    const fan = new THREE.Group(); fan.position.set(0, 0.55 * u, 0.27 * u); g.add(fan);
    box(fan, 0.65 * u, 0.1 * u, 0.03 * u, 0, -0.05 * u, 0, C.dark); box(fan, 0.1 * u, 0.65 * u, 0.03 * u, 0, -0.325 * u, 0, C.dark);
    cylZ(g, 0.22 * u, ductLen, 0, 0.55 * u, -0.25 * u - ductLen / 2, C.lamp);       // 덕트(뒤로)
    return { g, fan, top: 1.0 * u };
  }
  // 비계 (층수 n, 폭 w)
  function scaffold(n = 2, w = 1.6 * P / 1.8) {
    const g = new THREE.Group(), h = 0.95 * P, d = 0.8 * P / 1.8;
    const cs = [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]];
    cs.forEach(([x, z]) => beam(g, [x, 0, z], [x, n * h + 0.5 * h, z], 0.05, C.frame));
    for (let i = 1; i <= n; i++) {
      box(g, w, 0.06, d, 0, i * h, 0, C.wood);
      beam(g, [-w / 2, (i - 1) * h, d / 2], [w / 2, i * h, d / 2], 0.04, C.frame);
      beam(g, [-w / 2, i * h + 0.5 * h, -d / 2], [w / 2, i * h + 0.5 * h, -d / 2], 0.04, C.frame);
    }
    return { g, top: (n + 0.5) * h };
  }
  // 내화벽돌 팔레트
  function brickPallet(layers = 3) {
    const g = new THREE.Group(), u = 1.1 * M;   // 1.1×1.1×~1 m
    box(g, 1.1 * u, 0.14 * u, 1.1 * u, 0, 0, 0, C.wood);
    for (let i = 0; i < layers; i++) box(g, 1.0 * u, 0.18 * u, 1.0 * u, 0, 0.14 * u + i * 0.18 * u, 0, i % 2 ? C.brick2 : C.brick);
    return { g, top: (0.14 + layers * 0.18) * u };
  }
  // 파이프 랙
  function pipeRack(len = 6 * M, hex = C.steel) {
    const g = new THREE.Group(), u = 1.5 * M;
    [-len / 2 + 0.2, len / 2 - 0.2].forEach((x) => { box(g, 0.1 * u, 0.9 * u, 1.0 * u, x, 0, 0, C.frame); });
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) cylX(g, 0.13 * u, len, 0, 0.35 * u + j * 0.3 * u, (i - 1) * 0.3 * u, hex);
    return { g, top: 0.95 * u };
  }
  // 호이스트 (A형 프레임 + 체인 + 후크, 후크 승강)
  function hoist(h = 3.5 * M, span = 3 * M) {
    const g = new THREE.Group();
    [-1, 1].forEach((sx) => { beam(g, [sx * span / 2, 0, -1.2 * M], [sx * span / 2, h, 0], 0.2 * M, C.crane); beam(g, [sx * span / 2, 0, 1.2 * M], [sx * span / 2, h, 0], 0.2 * M, C.crane); });
    beam(g, [-span / 2 - 0.1, h, 0], [span / 2 + 0.1, h, 0], 0.25 * M, C.crane);
    box(g, 0.6 * M, 0.5 * M, 0.5 * M, 0, h - 0.6 * M, 0, C.dark);                  // 체인블록
    const chain = mesh(g, G_BOX, C.dark); chain.scale.set(0.06, 1, 0.06);
    const hk = new THREE.Group(); g.add(hk); box(hk, 0.4 * M, 0.3 * M, 0.3 * M, 0, -0.3 * M, 0, C.crane);
    const top = h - 0.6 * M;
    const setDrop = (d) => { chain.scale.y = Math.max(0.05, d); chain.position.set(0, top - d / 2, 0); hk.position.set(0, top - d, 0); };
    setDrop(0.4 * h);
    return { g, setDrop, dMin: 0.2 * h, dMax: 0.75 * h, top: h + 0.2 * M };
  }
  // 조명탑
  function lightTower(h = 8 * M) {
    const g = new THREE.Group(), u = 1.2 * M;
    box(g, 0.9 * u, 0.6 * u, 1.4 * u, 0, 0.2 * u, 0, C.crane);
    [-0.4, 0.4].forEach((x) => cylX(g, 0.2 * u, 0.1 * u, x * u, 0.2 * u, 0, C.dark));
    cyl(g, 0.05 * u, h, 0, 0.8 * u, 0, C.steel);
    box(g, 0.9 * u, 0.35 * u, 0.15 * u, 0, 0.8 * u + h, 0, C.lamp);
    return { g, top: 1.2 * u + h };
  }
  // 컨테이너 (사무실/자재)
  function container(hex = C.box) {   // 약 6×2.4×2.6 m
    const g = new THREE.Group(), u = 1.15 * M;
    box(g, 2.4 * u, 2.4 * u, 5.0 * u, 0, 0, 0, hex);
    box(g, 0.9 * u, 1.8 * u, 0.05 * u, 0.6 * u, 0.1 * u, 2.51 * u, C.dark);
    return { g, top: 2.4 * u };
  }
  // 노정 장입설비 부품 (벨리스 탑 링·슈트 받침)
  function chargeParts() {
    const g = new THREE.Group();
    box(g, 2.2 * 2 * M, 0.25, 2.2 * 2 * M, 0, 0, 0, C.wood);
    const ring = mesh(g, new THREE.TorusGeometry(0.9 * 2 * M, 0.35 * M, 6, 16), C.steel); ring.rotation.x = Math.PI / 2; ring.position.y = 0.6 * M;
    cyl(g, 0.4 * 2 * M, 0.9 * 2 * M, 0, 0.25, 0, C.frame);
    return { g, top: 2 * M };
  }
  // 케이블 릴
  function cableReel() {
    const g = new THREE.Group(), u = 1.3 * M;
    cylX(g, 0.5 * u, 0.08 * u, -0.3 * u, 0.5 * u, 0, C.wood); cylX(g, 0.5 * u, 0.08 * u, 0.3 * u, 0.5 * u, 0, C.wood);
    cylX(g, 0.3 * u, 0.55 * u, 0, 0.5 * u, 0, C.dark);
    return { g, top: 1.0 * u };
  }

  // ── 등록 ──
  const site = new THREE.Group(); site.name = 'equip-site'; furnace.decor.add(site);
  const zoneRoots = new Map();      // zoneId → 이 모듈 전용 그룹
  const rootOf = (zoneId) => {
    if (!zoneId) return site;
    if (!zoneRoots.has(zoneId)) {
      const r = new THREE.Group(); r.name = 'equip-' + zoneId;
      const zg = furnace.zoneGroup(zoneId); (zg || site).add(r); zoneRoots.set(zoneId, r);
    }
    return zoneRoots.get(zoneId);
  };
  const items = [];
  const spots = [];
  const polar = (r, phi, y = 0) => new THREE.Vector3(r * Math.sin(phi), y, r * Math.cos(phi));
  const spot = (zoneId, kind, pos, facing, label) => spots.push({ zoneId, kind, pos: pos.clone(), facing, label });

  // add: 형상을 pos에 yaw로 놓고 매칭 규칙 등록. match = { zones, types, names } (types null → 그 구역 작업이면 모두)
  function add(zoneId, name, built, pos, yaw, opt = {}) {
    const g = built.g; g.name = name; g.position.copy(pos); g.rotation.y = yaw;
    rootOf(zoneId).add(g);
    const it = {
      zoneId, name, built, g, yaw0: yaw, active: false, phase: Math.random() * 6,
      zones: opt.zones || (zoneId ? [zoneId] : []), types: opt.types === undefined ? (opt.machine === false ? [] : null) : opt.types, names: opt.names || [],   // 비기계(팔레트·비계 등)는 활성 안 됨
      beacon: opt.machine === false ? null : beacon(g, 0, (built.top || P) + 0.15 * P, 0),
      anim: opt.anim || null,
    };
    items.push(it);
    return it;
  }
  // 로컬 오프셋 → 부모 좌표 (스팟 계산용)
  const local = (pos, yaw, v) => v.clone().applyAxisAngle(UP, yaw).add(pos);
  const faceCenter = (phi) => phi + Math.PI;         // +z가 고로 중심을 향하게
  const faceOut = (phi) => phi;
  const PHI0 = OPEN_PHI[0], PHI1 = OPEN_PHI[1], PHIM = (PHI0 + PHI1) / 2;
  const inOpen = (f) => PHI0 + (PHI1 - PHI0) * f;     // 절개 범위 안 비율 f(0~1) 각도

  // ── 노 내부(IN-*) : 절개 범위 OPEN_PHI 안에만 ──
  function inZone(id, list) {
    const z = ZONE_INFO[id]; if (!z) return;
    const rMax = z.rOut;
    list.forEach(([kind, f, rf, extra]) => {
      const phi = inOpen(f), r = rMax * rf, pos = polar(r, phi, z.floorY), yaw = faceCenter(phi);
      if (kind === 'pallet') { add(id, '내화벽돌 팔레트', brickPallet(extra || 3), pos, yaw, { machine: false }); spot(id, 'pallet', local(pos, yaw, new THREE.Vector3(0, 0, 0.45 * P)), yaw + Math.PI, '벽돌 팔레트'); }
      if (kind === 'blower') {
        const b = blower(Math.min(4 * M, r * 0.6)); const it = add(id, '송풍기·덕트', b, pos, faceOut(phi), { types: ['CONFINED'] });
        it.anim = (t, on) => { b.fan.rotation.z += on ? 0.35 : 0.04; };
        spot(id, 'blower', local(pos, faceOut(phi), new THREE.Vector3(0.5 * P, 0, 0)), faceCenter(phi), '송풍기');
      }
      if (kind === 'hoist') {
        const h = hoist(extra || 3.5 * M); const it = add(id, '호이스트', h, pos, yaw, { types: ['LIFT', 'CONFINED'] });
        it.anim = (t, on) => { if (on) h.setDrop(h.dMin + (h.dMax - h.dMin) * (0.5 + 0.5 * Math.sin(t * 0.6 + it.phase))); };
        spot(id, 'hoist', local(pos, yaw, new THREE.Vector3(0, 0, 0.55 * P)), yaw + Math.PI, '호이스트');
      }
      if (kind === 'scaffold') { add(id, '비계', scaffold(extra || 2), pos, yaw, { machine: false }); spot(id, 'scaffold', local(pos, yaw, new THREE.Vector3(0, 0, 0.6 * P)), yaw + Math.PI, '비계'); }
      if (kind === 'miniloader') {
        const l = loader(true); add(id, '미니 로더', l, pos, yaw + Math.PI / 2, { types: null });
        spot(id, 'loader', local(pos, yaw, new THREE.Vector3(0.6 * P, 0, 0)), yaw, '미니 로더');
      }
      if (kind === 'lamp') add(id, '조명', lightTower(extra || 3 * M), pos, yaw, { machine: false });
      if (kind === 'gas') { add(id, '가스 용기', gasRack(2), pos, yaw, { types: ['HOT', 'GAS'] }); }
    });
  }
  inZone('IN-HEARTH', [['miniloader', 0.45, 0.45], ['pallet', 0.15, 0.7], ['pallet', 0.85, 0.7], ['hoist', 0.5, 0.12, 3.5 * M], ['blower', 0.95, 0.8], ['lamp', 0.3, 0.85]]);
  inZone('IN-TUY', [['pallet', 0.2, 0.6, 2], ['pallet', 0.75, 0.55, 2], ['blower', 0.5, 0.8]]);
  inZone('IN-MID', [['pallet', 0.15, 0.65], ['pallet', 0.85, 0.6], ['scaffold', 0.45, 0.72, 2], ['hoist', 0.55, 0.15, 4 * M], ['blower', 0.95, 0.8]]);
  inZone('IN-UP', [['pallet', 0.2, 0.6], ['pallet', 0.8, 0.55], ['scaffold', 0.35, 0.75, 4], ['scaffold', 0.7, 0.75, 4], ['hoist', 0.5, 0.1, 8 * M], ['blower', 0.95, 0.8], ['gas', 0.05, 0.75]]);

  // ── 고리 작업대(EX-*, CAST) ──
  function ringPos(id, rf, phi, y) { const z = ZONE_INFO[id]; return polar(z.rIn + (z.rOut - z.rIn) * rf, phi, y ?? z.floorY); }
  function welderAt(id, phi, rf = 0.55, y) {
    const pos = ringPos(id, rf, phi, y), yaw = faceCenter(phi);
    add(id, '용접기', generator(C.green), pos, yaw, { types: ['HOT'] });
    spot(id, 'welder', local(pos, yaw, new THREE.Vector3(0, 0, 0.65 * P)), yaw, '용접 작업 위치');
  }
  function gasAt(id, phi, rf = 0.8, y) { const pos = ringPos(id, rf, phi, y); add(id, '가스 용기 랙', gasRack(4), pos, faceCenter(phi), { types: ['HOT', 'GAS'] }); }
  function rackAt(id, phi, rf = 0.75, y, hex) { const pos = ringPos(id, rf, phi, y); add(id, '파이프 랙', pipeRack(6 * M, hex), pos, phi + Math.PI / 2, { machine: false }); }
  function scaffAt(id, phi, n = 2, y) {
    const pos = ringPos(id, 0.12, phi, y), yaw = faceCenter(phi);
    add(id, '비계', scaffold(n), pos, phi + Math.PI / 2, { machine: false });
    spot(id, 'scaffold', local(pos, yaw, new THREE.Vector3(0, 0, -0.9 * P)), yaw, '비계 하부');
  }
  function awpAt(id, phi, rf = 0.4, y) {
    const pos = ringPos(id, rf, phi, y), yaw = faceCenter(phi), s = scissorLift();
    const it = add(id, '고소작업대', s, pos, phi + Math.PI / 2, { types: ['HEIGHT'] });
    it.anim = (t, on) => { const k = on ? 0.5 + 0.5 * Math.sin(t * 0.35 + it.phase) : 0; s.setH(s.hMin + (s.hMax - s.hMin) * k); };
    spot(id, 'awp', local(pos, yaw, new THREE.Vector3(0, 0, -0.6 * P)), yaw, '고소작업대');
  }
  function hoistAt(id, phi, rf = 0.2, y, h = 3.5 * M) {
    const pos = ringPos(id, rf, phi, y), yaw = faceCenter(phi), hh = hoist(h);
    const it = add(id, '체인블록 호이스트', hh, pos, phi + Math.PI / 2, { types: ['LIFT'] });
    it.anim = (t, on) => { if (on) hh.setDrop(hh.dMin + (hh.dMax - hh.dMin) * (0.5 + 0.5 * Math.sin(t * 0.6 + it.phase))); };
    spot(id, 'hoist', local(pos, yaw, new THREE.Vector3(0, 0, -0.55 * P)), yaw, '호이스트');
  }
  const OFF = (f) => PHI1 + (Math.PI * 2 - (PHI1 - PHI0)) * f;   // 절개 밖 각도(대형 장비용)

  // EX-UP (두 층 데크)
  const up2 = ZONE_INFO['EX-UP'].decks?.[1] ?? 39.5;
  welderAt('EX-UP', inOpen(0.3)); gasAt('EX-UP', inOpen(0.45)); rackAt('EX-UP', OFF(0.3)); scaffAt('EX-UP', inOpen(0.7), 3);
  welderAt('EX-UP', inOpen(0.6), 0.55, up2); gasAt('EX-UP', inOpen(0.8), 0.8, up2); hoistAt('EX-UP', OFF(0.6), 0.25, up2);
  // EX-MID
  welderAt('EX-MID', inOpen(0.25)); welderAt('EX-MID', OFF(0.5)); gasAt('EX-MID', inOpen(0.4)); rackAt('EX-MID', OFF(0.2), 0.75, undefined, C.blue);
  scaffAt('EX-MID', inOpen(0.65), 2); awpAt('EX-MID', inOpen(0.9));
  // EX-TUY
  welderAt('EX-TUY', inOpen(0.2)); welderAt('EX-TUY', OFF(0.35)); gasAt('EX-TUY', inOpen(0.35)); rackAt('EX-TUY', OFF(0.15), 0.8);
  hoistAt('EX-TUY', inOpen(0.6)); scaffAt('EX-TUY', inOpen(0.85), 1);
  { const pos = ringPos('EX-TUY', 0.85, OFF(0.6)); add('EX-TUY', '발전기', generator(C.box, true), pos, faceCenter(OFF(0.6)), { types: null }); }
  // CAST (넓은 주상 바닥) — 대형은 절개 밖
  {
    const id = 'CAST';
    [0.25, 0.75].forEach((f, i) => {
      const phi = inOpen(f), pos = ringPos(id, 0.45, phi), yaw = phi + Math.PI / 2, fl = forklift();
      const it = add(id, '지게차', fl, pos, yaw, { types: null });
      it.anim = (t, on) => { fl.fork.position.y = 0.1 + (on ? fl.forkMax * (0.5 + 0.5 * Math.sin(t * 0.5 + i)) : 0); };
      spot(id, 'forklift', local(pos, yaw, new THREE.Vector3(0.4 * P, 0, 0)), yaw, '지게차 운전석');
    });
    awpAt(id, inOpen(0.5), 0.15);
    [0.15, 0.35].forEach((f) => { const phi = OFF(f), pos = ringPos(id, 0.7, phi); add(id, '컨테이너', container(), pos, phi + Math.PI / 2, { machine: false }); });
    [0.1, 0.9].forEach((f) => { const phi = inOpen(f), pos = ringPos(id, 0.8, phi); add(id, '내화벽돌 팔레트', brickPallet(4), pos, faceCenter(phi), { machine: false }); spot(id, 'pallet', local(pos, faceCenter(phi), new THREE.Vector3(0, 0, 0.45 * P)), faceOut(phi), '벽돌 팔레트'); });
    { const phi = OFF(0.55), pos = ringPos(id, 0.55, phi); add(id, '휠로더', loader(false), pos, phi + Math.PI / 2, { types: ['LIFT', 'HOT'] }); }
    { const phi = OFF(0.75), pos = ringPos(id, 0.3, phi); add(id, '개공기 부품', pipeRack(7 * M, C.dark), pos, phi + Math.PI / 2, { machine: false }); }
    gasAt(id, OFF(0.85), 0.5);
  }
  // TOP 노정 데크 — 호이스트 프레임·장입설비 부품
  {
    const id = 'TOP', z = ZONE_INFO[id];
    [inOpen(0.3), OFF(0.5)].forEach((phi, i) => {
      const pos = polar(z.rIn + 2.2, phi, z.floorY), h = hoist(4 * M, 4 * M);
      const it = add(id, '노정 호이스트', h, pos, phi + Math.PI / 2, { types: ['LIFT'] });
      it.anim = (t, on) => { if (on) h.setDrop(h.dMin + (h.dMax - h.dMin) * (0.5 + 0.5 * Math.sin(t * 0.5 + i))); };
      spot(id, 'hoist', polar(z.rIn + 3.6, phi, z.floorY), faceCenter(phi), '노정 호이스트');
    });
    [inOpen(0.65), OFF(0.25)].forEach((phi) => { const pos = polar(z.rIn + (z.rOut - z.rIn) * 0.55, phi, z.floorY); add(id, '장입설비 부품', chargeParts(), pos, phi, { machine: false }); });
    { const phi = inOpen(0.85), pos = polar(z.rOut - 2, phi, z.floorY); add(id, '윈치', generator(C.crane), pos, faceCenter(phi), { types: ['LIFT'] }); }
    { const phi = OFF(0.75), pos = polar(z.rOut - 2, phi, z.floorY); add(id, '윈치', generator(C.crane), pos, faceCenter(phi), { types: ['LIFT'] }); }
    gasAt(id, inOpen(0.05), 0.85); welderAt(id, OFF(0.1), 0.6);
    { const phi = OFF(0.9), pos = polar(z.rOut - 1, phi, z.floorY); add(id, '조명탑', lightTower(), pos, faceCenter(phi), { machine: false }); }
  }
  // 지상 구역 (STOVE·GAS·ELEC) — center/size 기준
  function groundZone(id, list) {
    const z = ZONE_INFO[id]; if (!z) return;
    const [cx, , cz] = z.center, [sx, sz] = z.size;
    list.forEach(([kind, fx, fz, yaw = 0]) => {
      const pos = new THREE.Vector3(cx + fx * sx / 2, z.floorY, cz + fz * sz / 2);
      if (kind === 'awp') {
        const s = scissorLift(); const it = add(id, '고소작업대', s, pos, yaw, { types: null });
        it.anim = (t, on) => { const k = on ? 0.5 + 0.5 * Math.sin(t * 0.35 + it.phase) : 0; s.setH(s.hMin + (s.hMax - s.hMin) * k); };
        spot(id, 'awp', local(pos, yaw, new THREE.Vector3(0.6 * P, 0, 0)), yaw, '고소작업대');
      }
      if (kind === 'gen') add(id, '발전기', generator(C.box, true), pos, yaw, { types: null });
      if (kind === 'welder') { add(id, '용접기', generator(C.green), pos, yaw, { types: ['HOT'] }); spot(id, 'welder', local(pos, yaw, new THREE.Vector3(0, 0, 0.65 * P)), yaw + Math.PI, '용접 작업 위치'); }
      if (kind === 'gas') add(id, '가스 용기 랙', gasRack(4), pos, yaw, { types: ['HOT', 'GAS'] });
      if (kind === 'lamp') add(id, '조명탑', lightTower(), pos, yaw, { machine: false });
      if (kind === 'fork') add(id, '지게차', forklift(), pos, yaw, { types: null });
      if (kind === 'reel') add(id, '케이블 릴', cableReel(), pos, yaw, { machine: false });
      if (kind === 'cont') add(id, '컨테이너', container(C.blue), pos, yaw, { machine: false });
      if (kind === 'blower') { const b = blower(4 * M); const it = add(id, '송풍기', b, pos, yaw, { types: ['CONFINED'] }); it.anim = (t, on) => { b.fan.rotation.z += on ? 0.35 : 0.04; }; spot(id, 'blower', local(pos, yaw, new THREE.Vector3(0.5 * P, 0, 0)), yaw, '송풍기'); }
    });
  }
  groundZone('STOVE', [['awp', 0.6, 0.3, 0], ['gen', 0.6, -0.4, Math.PI / 2], ['gas', 0.7, 0.75, -Math.PI / 2], ['lamp', 0.8, -0.8], ['blower', 0.55, 0.0, Math.PI / 2]]);
  groundZone('GAS', [['awp', -0.4, 0.4, 0.5], ['gen', 0.5, 0.6, 0], ['welder', -0.3, -0.5, Math.PI], ['gas', 0.1, -0.7, 0], ['lamp', 0.8, -0.8]]);
  groundZone('ELEC', [['gen', -0.6, 0.3, 0], ['gen', -0.2, 0.3, 0], ['reel', 0.3, -0.4], ['lamp', 0.8, 0.8], ['cont', 0.6, 0.4, Math.PI / 2]]);

  // ── SITE (지상, decor 좌표) ──
  // 대형 크롤러 크레인: 실물 크기. 고로 축에서 충분히 떨어져(절개 시야 밖) 배치, 붐 길이·각도는 목표점에서 역산
  const topZ = ZONE_INFO.TOP;
  const cranes = [];
  // opt: { tipH } (팁 높이 고정 → 붐 길이 산출) 또는 { boomLen } (붐 길이 고정 → 각도 산출), 모두 모형 단위
  function placeCrane(name, at, target, opt, sp, match) {
    const dx = target.x - at.x, dz = target.z - at.z, horiz = Math.hypot(dx, dz);
    const upY = (sp.trackH + 0.3) * M, pivY = upY + sp.bodyH * 0.6 * M, pivZ = sp.bodyL * 0.35 * M, hookOff = sp.sec * 0.6 * M;
    const run = horiz - pivZ - hookOff;
    let L, rise;
    if (opt.boomLen) { L = opt.boomLen; rise = Math.sqrt(Math.max(1, L * L - run * run)); } else { rise = opt.tipH - pivY; L = Math.hypot(run, rise); }
    const ang = Math.atan2(rise, run) * 180 / Math.PI;
    const cr = crawlerCrane(L, ang, sp), yaw = Math.atan2(dx, dz);
    const it = add(null, name, cr, at, yaw, { ...match, machine: false });
    it.beacon = beacon(cr.upper, 0, (sp.bodyH + 1.2) * M, -sp.bodyL * 0.15 * M, 0.12 * P);
    const tipY = cr.tip.y, blockH = 2.4 * M;
    const dropIdle = Math.max(2, tipY - target.y - 0.4 * (tipY - target.y)), dropWork = Math.max(2, tipY - target.y - blockH - 0.1);
    cr.setDrop(dropIdle);
    it.anim = (t, on) => {
      const tgtYaw = on ? 0.05 * Math.sin(t * 0.15 + it.phase) : 0;
      cr.upper.rotation.y += (tgtYaw - cr.upper.rotation.y) * 0.05;
      const d = on ? dropIdle + (dropWork - dropIdle) * (0.5 + 0.5 * Math.sin(t * 0.4)) : dropIdle;
      cr.setDrop(d);
    };
    cranes.push(it);
    spot(null, 'crane-cab', local(at, yaw, cr.cab), yaw, name + ' 운전실');
    spot(null, 'crane-hook', local(at, yaw, new THREE.Vector3(0, target.y, cr.tip.z)), yaw + Math.PI, name + ' 후크 착지점');
    spot(null, 'signal', local(at, yaw, new THREE.Vector3((sp.trackGap / 2 + 4) * M, 0, (sp.trackL / 2 + 4) * M)), yaw, name + ' 지상 신호수');
    it.dims = { boomLen: L, boomAngDeg: ang, tipY, at: at.clone() };
    return { it, cr, yaw };
  }
  // LR1750급 (노정 인양): 트랙 13×12 m, 상부 10 m, 붐 단면 2.8 m, 카운터웨이트 10×4×3 m, 후크 높이 약 115 m
  const SP_BIG = { trackL: 13, trackGap: 10.4, trackW: 1.6, trackH: 1.8, bodyL: 10, bodyW: 6, bodyH: 3.5, cw: [10, 4, 3], sec: 2.8 };
  // 400 t급 (링블록): 트랙 9 m, 붐 70 m
  const SP_RING = { trackL: 9, trackGap: 7, trackW: 1.2, trackH: 1.4, bodyL: 7, bodyW: 4.5, bodyH: 3, cw: [6, 2.5, 2.5], sec: 2.0 };
  const phiBig = 125 * Math.PI / 180;                      // +x 쪽, 절개(OPEN_PHI) 시야 밖, GAS 구역과 겹치지 않음
  const bigTarget = polar(topZ.rIn + 3, phiBig, topZ.floorY);
  const big = placeCrane('크롤러 크레인', polar(52, phiBig, 0), bigTarget, { tipH: 115 * M }, SP_BIG,
    { zones: ['TOP'], types: ['LIFT'], names: ['크롤러 크레인'] });
  spot('TOP', 'signal', polar(topZ.rIn + 5, phiBig + 0.25, topZ.floorY), faceCenter(phiBig), '노정 인양 신호수');
  const phiRing = -35 * Math.PI / 180, tuy = ZONE_INFO['EX-TUY'];
  const ring = placeCrane('대형 크롤러 크레인(링블록)', polar(36, phiRing, 0), polar(tuy.rOut - 0.9, phiRing, tuy.floorY), { boomLen: 70 * M }, SP_RING,
    { zones: ['EX-TUY', 'CAST'], types: ['LIFT'], names: ['대형 크롤러 크레인'] });
  spot('EX-TUY', 'signal', polar(tuy.rOut - 1, phiRing + 0.2, tuy.floorY), faceCenter(phiRing), '링블록 인양 신호수');
  spot('CAST', 'signal', polar(ZONE_INFO.CAST.rOut - 2, phiRing - 0.15, ZONE_INFO.CAST.floorY), faceCenter(phiRing), '주상 신호수');
  // 링블록(인양물, 지름 약 12 m) — 지상 대기
  { const g = new THREE.Group(); const tor = mesh(g, new THREE.TorusGeometry(6 * M, 0.7 * M, 6, 20), C.steel); tor.rotation.x = Math.PI / 2; tor.position.y = 0.7 * M;
    const rb = polar(33, phiRing - 0.35, 0);
    add(null, '링블록', { g, top: 1.4 * M }, rb, 0, { machine: false });
    spot(null, 'signal', rb.clone().add(new THREE.Vector3(6 * M + 0.6 * P, 0, 0)), -Math.PI / 2, '링블록 줄걸이 신호수'); }

  // 도로(고로 뒤쪽 z=-30) + 덤프트럭
  const road = new THREE.Mesh(G_BOX, MAT('#bdb6aa')); road.scale.set(70, 0.08, 5); road.position.set(-2, 0.04, -30); road.receiveShadow = true; site.add(road);
  [[-22, 1], [-6, -1], [12, 1]].forEach(([x, dir], i) => {
    const tr = dumpTruck(i === 1 ? C.box : C.truck), yaw = dir * Math.PI / 2, pos = new THREE.Vector3(x, 0.08, -30 + dir * 1.2);
    add(null, '덤프트럭', tr, pos, yaw, { zones: ['CAST', 'IN-HEARTH', 'TOP'], types: ['LIFT'] });
    spot(null, 'truck-door', local(pos, yaw, tr.door), yaw + Math.PI / 2, '덤프트럭 운전석');
  });
  { const pos = new THREE.Vector3(26, 0, -34); add(null, '휠로더', loader(false), pos, -Math.PI / 2, { zones: ['CAST'], types: ['LIFT'] }); }
  // 적치장(레이다운 야드): 벽돌 팔레트·파이프·비계재
  {
    const yard = new THREE.Mesh(G_BOX, MAT('#cdc6b8')); yard.scale.set(16, 0.06, 9); yard.position.set(-14, 0.03, -39); yard.receiveShadow = true; site.add(yard);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) add(null, '내화벽돌 팔레트', brickPallet(3 + ((i + j) % 2)), new THREE.Vector3(-20 + i * 2, 0.06, -37 - j * 2), 0, { machine: false });
    spot(null, 'pallet', new THREE.Vector3(-17, 0.06, -34.8), Math.PI, '적치장 팔레트');
    add(null, '파이프 적치', pipeRack(9 * M), new THREE.Vector3(-9, 0.06, -37), 0, { machine: false });
    add(null, '비계재 적치', pipeRack(9 * M, C.frame), new THREE.Vector3(-9, 0.06, -41), 0, { machine: false });
    add(null, '지게차', forklift(), new THREE.Vector3(-13, 0.06, -42), Math.PI / 2, { zones: ['IN-UP', 'IN-MID', 'IN-HEARTH'], types: ['CONFINED'] });
  }

  // ── 활성화 ──
  const toMs = (v) => (v == null ? null : typeof v === 'number' ? v : v instanceof Date ? v.getTime() : Date.parse(v));
  function setActive({ tasks: list = [], t } = {}) {
    const now = toMs(t);
    const act = (list || []).filter((k) => {
      if (now == null || !k.start || !k.end) return true;
      return Date.parse(k.start) <= now && now < Date.parse(k.end);
    });
    items.forEach((it) => {
      it.active = act.some((k) => {
        if (it.names.length && (k.equipment || []).some((n) => it.names.includes(n))) return true;
        if (!(k.zone_ids || []).some((z) => it.zones.includes(z))) return false;
        if (!it.types) return true;
        return (k.work_types || []).some((w) => it.types.includes(w));
      });
      if (it.beacon && !it.active) it.beacon.visible = false;
    });
  }

  function refresh() {
    zoneRoots.forEach((r, id) => { r.visible = !furnace.isGhosted(id); });
  }

  function update(time) {
    const t = time || 0;
    items.forEach((it) => {
      if (it.anim) it.anim(t, it.active);
      if (it.beacon && it.active) it.beacon.visible = Math.sin(t * 6 + it.phase) > -0.2;
    });
  }

  function dispose() {
    site.parent?.remove(site);
    zoneRoots.forEach((r) => r.parent?.remove(r));
    const geos = new Set();
    [site, ...zoneRoots.values()].forEach((r) => r.traverse((o) => { if (o.geometry && ![G_BOX, G_CYL, G_SPH].includes(o.geometry)) geos.add(o.geometry); }));
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose()); beaconMat.dispose();
    items.length = 0; spots.length = 0;
  }

  if (tasks) setActive({ tasks });
  refresh();
  return { site, spots, items, dims: { M, bigCrane: big.it.dims, ringCrane: ring.it.dims }, setActive, refresh, update, dispose };
}
