/* 한솥밥 3D · 충돌 효과 레이어
   충돌 종류별로 3D 표시를 붙임 (차분하게, 현장 어르신도 한눈에)
   - 위아래(VERTICAL): 낙하 위험 기둥 + 매달린 짐
   - 화기×가스(HOT_GAS): 불티 + 가스 안개 + 점선 연결
   - 순서 위반(SEQUENCE): 질소 배관 빛 + 「순서 위반」 표지판
   - 같은 시간·구역(SAME_ZONE_TIME): 바닥 테두리 깜빡임
   - 표준서 누락(STANDARD): 파란 서류 아이콘
   - 모든 충돌: 클릭 가능한 배지 (화면 크기 고정) */
import * as THREE from 'three';
import { ZONE_INFO, MODEL_SCALE, PERSON_H_MODEL } from './furnace.js';
import { SEV, TYPE_NAME } from './theme.js';

const P = PERSON_H_MODEL;          // 사람 키 (모형 단위)
const DIM = 0.3;                   // 선택 안 된 충돌 흐림 정도
const BADGE_H = 0.026;             // 배지 높이 (화면 비율)
const SPOT_PHI = Math.PI / 4;      // 절개면 가운데 각도

/* 시간 → ms (문자열·숫자·Date 모두) */
function toMs(x) {
  if (x === null || x === undefined || x === '') return NaN;
  if (x instanceof Date) return x.getTime();
  if (typeof x === 'number') return x;
  return Date.parse(x);
}

/* 구역 안 대표 지점 (구역 그룹 기준, 모형 단위) */
function zoneSpot(id) {
  const z = ZONE_INFO[id];
  if (!z) return new THREE.Vector3();
  if (z.kind === 'ground') return new THREE.Vector3(z.center[0], z.floorY, z.center[2]);
  if (z.kind === 'in') return new THREE.Vector3(0, z.floorY, 0);
  const r = (z.rIn + z.rOut) / 2;
  return new THREE.Vector3(r * Math.sin(SPOT_PHI), z.floorY, r * Math.cos(SPOT_PHI));
}
/* 배지·표지판 띄울 높이 */
function zoneTop(id) {
  const z = ZONE_INFO[id];
  if (!z) return 0;
  if (z.kind === 'in') return Math.min(z.y1 ?? z.floorY + 4 * P, z.floorY + 3.2 * P);
  return z.floorY + 2.2 * P;
}

/* ---------- 캔버스 그림 ---------- */
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const FONT = '"Pretendard","Noto Sans KR","Malgun Gothic",sans-serif';

function badgeTexture(sevKey, typeKey) {
  const sev = SEV[sevKey] || SEV.CONDITIONAL;
  const text = `${sev.label} · ${TYPE_NAME[typeKey] || typeKey}`;
  const c = document.createElement('canvas'); const g = c.getContext('2d');
  g.font = `bold 52px ${FONT}`;
  const tw = g.measureText(text).width;
  const H = 96, markW = 92, W = Math.ceil(markW + tw + 40);
  c.width = W; c.height = H;
  g.font = `bold 52px ${FONT}`; g.textBaseline = 'middle';
  roundRect(g, 3, 3, W - 6, H - 6, 18); g.fillStyle = '#ffffff'; g.fill();
  g.lineWidth = 6; g.strokeStyle = sev.color; g.stroke();
  roundRect(g, 3, 3, markW, H - 6, 18); g.fillStyle = sev.color; g.fill();
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.fillText(sev.mark, 3 + markW / 2, H / 2 + 2);
  g.fillStyle = '#222222'; g.textAlign = 'left'; g.fillText(text, markW + 20, H / 2 + 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { tex, aspect: W / H };
}

/* 팔각 금지 표지판 + 한글 */
function stopSignTexture(color, title, sub) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 640;
  const g = c.getContext('2d');
  const cx = 256, cy = 230, R = 200;
  g.beginPath();
  for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a)); }
  g.closePath(); g.fillStyle = color; g.fill(); g.lineWidth = 14; g.strokeStyle = '#ffffff'; g.stroke();
  g.fillStyle = '#ffffff'; roundRect(g, cx - 130, cy - 26, 260, 52, 10); g.fill();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  roundRect(g, 46, 460, 420, 160, 22); g.fillStyle = 'rgba(255,255,255,0.95)'; g.fill();
  g.lineWidth = 6; g.strokeStyle = color; g.stroke();
  g.fillStyle = color; g.font = `bold 72px ${FONT}`; g.fillText(title, cx, 515);
  g.fillStyle = '#333333'; g.font = `bold 36px ${FONT}`; g.fillText(sub, cx, 583);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: 512 / 640 };
}

/* 파란 서류(클립보드) 아이콘 + 「단계 누락」 */
function clipboardTexture(color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 320;
  const g = c.getContext('2d');
  roundRect(g, 40, 30, 176, 220, 16); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 10; g.strokeStyle = color; g.stroke();
  roundRect(g, 92, 14, 72, 34, 8); g.fillStyle = color; g.fill();
  g.fillStyle = color;
  for (let i = 0; i < 4; i++) { const y = 80 + i * 40; g.fillRect(70, y, 22, 22); g.fillRect(104, y + 6, i === 2 ? 50 : 82, 10); }
  // 빠진 단계 표시 (빈칸 + 물음표)
  g.clearRect(72, 162, 18, 18); g.font = `bold 34px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 180, 170);
  roundRect(g, 8, 262, 240, 52, 12); g.fill();
  g.fillStyle = '#ffffff'; g.font = `bold 34px ${FONT}`; g.fillText('단계 누락', 128, 290);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: 256 / 320 };
}

/* 점선 고리 (수평, 반지름 1 기준) */
function dashedRingGeo(rIn = 0.9, rOut = 1, dashes = 16, fill = 0.55) {
  const pos = [], idx = [];
  const segPer = 4;
  for (let d = 0; d < dashes; d++) {
    const a0 = (d / dashes) * Math.PI * 2, a1 = a0 + (fill / dashes) * Math.PI * 2;
    const base = pos.length / 3;
    for (let s = 0; s <= segPer; s++) {
      const a = a0 + (a1 - a0) * s / segPer, sx = Math.sin(a), cz = Math.cos(a);
      pos.push(rIn * sx, 0, rIn * cz, rOut * sx, 0, rOut * cz);
    }
    for (let s = 0; s < segPer; s++) { const i = base + s * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
  return geo;
}

/* ---------- 본체 ---------- */
export function buildEffects(furnace, { showBadges = true } = {}) {   // showBadges=false: 3D 배지 대신 좌우 배너(banners.js)를 씀
  const pickables = [];
  let effects = [];          // { id, c, zones, f, mats:[{m,base}], objs, disposables, tick, badge }
  let selectedId = null;
  let activeKey = '';
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();

  const zg = (id) => furnace.zoneGroup?.(id);
  /* 구역 그룹 지점 → decor 좌표 */
  function toDecor(id, local, out) {
    const g = zg(id); out.copy(local);
    if (!g) return out;
    g.localToWorld(out); return furnace.decor.worldToLocal(out);
  }

  function makeEffect(c) {
    const eff = { id: c.id, c, zones: (c.zone_ids || []).filter((z) => ZONE_INFO[z]), f: 1, mats: [], objs: [], disposables: [], ticks: [], badge: null };
    const sevKey = SEV[c.severity] ? c.severity : 'CONDITIONAL';
    eff.color = new THREE.Color(SEV[sevKey].color);
    eff.add = (parent, obj) => { if (!parent) return obj; parent.add(obj); eff.objs.push(obj); return obj; };
    eff.mat = (m, base = m.opacity ?? 1) => { m.transparent = true; m.depthWrite = false; eff.mats.push({ m, base }); eff.disposables.push(m); return m; };
    eff.geo = (g) => { eff.disposables.push(g); return g; };
    return eff;
  }

  /* 배지 (모든 충돌) */
  function addBadge(eff, zoneId, stack) {
    const { tex, aspect } = badgeTexture(eff.c.severity, eff.c.type);
    eff.disposables.push(tex);
    const m = eff.mat(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false }), 1);
    const s = new THREE.Sprite(m);
    s.scale.set((BADGE_H * aspect) / MODEL_SCALE, BADGE_H / MODEL_SCALE, 1);
    s.center.set(0.5, -stack * 1.2);           // 같은 구역 여러 개면 화면에서 위로 쌓음
    const p = zoneSpot(zoneId); p.y = zoneTop(zoneId) + 0.6 * P;
    s.position.copy(p); s.renderOrder = 30;
    s.userData.conflictId = eff.id; s.userData.isBadge = true;
    eff.add(zg(zoneId), s); eff.badge = s; eff.badgeMat = m;
  }

  /* 위아래: 낙하 위험 기둥 */
  function buildVertical(eff) {
    const ids = [...eff.zones].sort((a, b) => ZONE_INFO[b].floorY - ZONE_INFO[a].floorY);
    const upper = ids[0], lowers = ids.slice(1);
    if (!upper || !lowers.length) return;
    const lowest = lowers[lowers.length - 1];
    // 노정 → 노 안이면 중심축, 아니면 위 구역 대표 지점
    const axis = ZONE_INFO[upper].kind === 'deck' && lowers.some((z) => ZONE_INFO[z].kind === 'in');
    const liftLocal = axis ? new THREE.Vector3(0, ZONE_INFO[upper].floorY, 0) : zoneSpot(upper);
    liftLocal.y += 1.2 * P;
    const xz = liftLocal.clone();

    const grp = eff.add(furnace.decor, new THREE.Group());
    const coneGeo = eff.geo(new THREE.CylinderGeometry(1.4, 3.6, 1, 40, 1, true)); coneGeo.translate(0, -0.5, 0);
    const cone = new THREE.Mesh(coneGeo, eff.mat(new THREE.MeshBasicMaterial({ color: eff.color, opacity: 0.18, side: THREE.DoubleSide }), 0.18));
    cone.renderOrder = 5; grp.add(cone);
    const ringGeo = eff.geo(dashedRingGeo(0.86, 1, 18, 0.55));
    const rings = [];
    for (let i = 0; i < 4; i++) {
      const m = eff.mat(new THREE.MeshBasicMaterial({ color: eff.color, opacity: 0.55, side: THREE.DoubleSide }), 0.55);
      const r = new THREE.Mesh(ringGeo, m); r.renderOrder = 6; grp.add(r); rings.push({ r, m, ph: i / 4 });
    }
    // 매달린 짐 + 훅 줄
    const hang = new THREE.Group(); grp.add(hang);
    const lineGeo = eff.geo(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -2.4 * P, 0)]));
    hang.add(new THREE.Line(lineGeo, eff.mat(new THREE.LineBasicMaterial({ color: '#333333', opacity: 0.9 }), 0.9)));
    const hook = new THREE.Mesh(eff.geo(new THREE.TorusGeometry(0.35, 0.09, 6, 16, Math.PI * 1.4)),
      eff.mat(new THREE.MeshBasicMaterial({ color: '#444444', opacity: 1 }), 1));
    hook.position.y = -2.4 * P; hang.add(hook);
    const load = new THREE.Mesh(eff.geo(new THREE.BoxGeometry(2.6, 1.1, 2.6)),
      eff.mat(new THREE.MeshBasicMaterial({ color: '#7a6a58', opacity: 0.95 }), 0.95));
    load.position.y = -2.4 * P - 0.9; hang.add(load);
    const loadEdge = new THREE.LineSegments(eff.geo(new THREE.EdgesGeometry(load.geometry)),
      eff.mat(new THREE.LineBasicMaterial({ color: eff.color, opacity: 1 }), 1));
    load.add(loadEdge);

    eff.ticks.push((t) => {
      const top = toDecor(upper, liftLocal, _a);
      const botLocal = new THREE.Vector3(xz.x, ZONE_INFO[lowest].floorY, xz.z);
      const bot = toDecor(lowest, botLocal, _b);
      const h = Math.max(1, top.y - bot.y);
      // 짐 아래부터 바닥까지 기둥
      const coneTop = top.y - 2.4 * P - 1.5;
      const ch = Math.max(1, coneTop - bot.y);
      cone.position.set(bot.x, coneTop, bot.z); cone.scale.set(1, ch, 1);
      hang.position.set(top.x, top.y + 1.6 * P, top.z);
      hang.rotation.z = Math.sin(t * 0.9) * 0.04; hang.rotation.x = Math.cos(t * 0.7) * 0.03;
      for (const o of rings) {
        const k = (t * 0.12 + o.ph) % 1;               // 천천히 아래로
        const rad = 1.4 + (3.6 - 1.4) * k;
        o.r.position.set(bot.x, coneTop - ch * k, bot.z); o.r.scale.set(rad, 1, rad);
        o.m.opacity = 0.55 * eff.f * Math.sin(Math.PI * k);
      }
      void h;
    });
    eff.vertical = true;
  }

  /* 화기 × 가스 */
  function buildHotGas(eff, tasks) {
    const byId = new Map((tasks || []).map((t) => [t.id, t]));
    const ts = (eff.c.task_ids || []).map((id) => byId.get(id)).filter(Boolean);
    const inC = (z) => eff.zones.includes(z);
    const hotT = ts.find((t) => (t.work_types || []).includes('HOT'));
    const gasT = ts.find((t) => t !== hotT && ((t.work_types || []).includes('GAS') || (t.systems || []).some((s) => ['N2', 'BFG', 'O2'].includes(s))));
    const hotZ = (hotT && hotT.zone_ids.find(inC)) || eff.zones[0];
    const gasZ = (gasT && gasT.zone_ids.find((z) => inC(z) && z !== hotZ)) || eff.zones.find((z) => z !== hotZ) || hotZ;
    eff.hotZ = hotZ; eff.gasZ = gasZ;

    // 불티 (Points)
    const N = 48, hotP = zoneSpot(hotZ); hotP.y += 0.9;
    const pos = new Float32Array(N * 3), vel = [], life = new Float32Array(N);
    const reset = (i) => {
      pos[i * 3] = hotP.x; pos[i * 3 + 1] = hotP.y; pos[i * 3 + 2] = hotP.z;
      const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * 1.6;
      vel[i] = [Math.cos(a) * s, 1.2 + Math.random() * 2.2, Math.sin(a) * s];
      life[i] = 0;
    };
    for (let i = 0; i < N; i++) { reset(i); life[i] = Math.random(); }
    const pg = eff.geo(new THREE.BufferGeometry()); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pm = eff.mat(new THREE.PointsMaterial({ color: '#ffb347', size: 5, sizeAttenuation: false, opacity: 0.9, blending: THREE.AdditiveBlending }), 0.9);
    const pts = new THREE.Points(pg, pm); pts.frustumCulled = false; pts.renderOrder = 8;
    eff.add(zg(hotZ), pts);
    // 불꽃 바닥 원
    const glow = new THREE.Mesh(eff.geo(new THREE.CircleGeometry(1.2, 24).rotateX(-Math.PI / 2)),
      eff.mat(new THREE.MeshBasicMaterial({ color: '#ff8a3d', opacity: 0.35, blending: THREE.AdditiveBlending }), 0.35));
    glow.position.copy(hotP).setY(hotP.y - 0.8); eff.add(zg(hotZ), glow);

    // 가스 안개
    const gasP = zoneSpot(gasZ); gasP.y += 1.0 * P;
    const haze = new THREE.Mesh(eff.geo(new THREE.SphereGeometry(3.4, 24, 16)),
      eff.mat(new THREE.MeshBasicMaterial({ color: '#8fb3c9', opacity: 0.14 }), 0.14));
    haze.position.copy(gasP); eff.add(zg(gasZ), haze);
    const hazeRing = new THREE.Mesh(eff.geo(dashedRingGeo(0.9, 1, 20, 0.6)),
      eff.mat(new THREE.MeshBasicMaterial({ color: '#5f8aa6', opacity: 0.5, side: THREE.DoubleSide }), 0.5));
    hazeRing.position.copy(gasP).setY(ZONE_INFO[gasZ].floorY + 0.15); hazeRing.scale.setScalar(4.2); eff.add(zg(gasZ), hazeRing);

    // 연결 점선 호
    const NA = 40;
    const arcGeo = eff.geo(new THREE.BufferGeometry()); arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NA * 3), 3));
    const arc = new THREE.Line(arcGeo, eff.mat(new THREE.LineDashedMaterial({ color: eff.color, dashSize: 1.0, gapSize: 0.7, opacity: 0.9 }), 0.9));
    arc.frustumCulled = false; arc.renderOrder = 7; eff.add(furnace.decor, arc);
    const hp = hotP.clone(), gp = gasP.clone(), mid = new THREE.Vector3(), q = new THREE.Vector3();

    let last = 0;
    eff.ticks.push((t) => {
      const dt = Math.min(0.05, Math.max(0, t - last)); last = t;
      for (let i = 0; i < N; i++) {
        life[i] += dt * 0.9;
        if (life[i] >= 1) { reset(i); continue; }
        vel[i][1] -= 6 * dt;
        pos[i * 3] += vel[i][0] * dt; pos[i * 3 + 1] += vel[i][1] * dt; pos[i * 3 + 2] += vel[i][2] * dt;
      }
      pg.attributes.position.needsUpdate = true;
      pm.opacity = 0.9 * eff.f * (0.6 + 0.4 * Math.abs(Math.sin(t * 2.3)));
      const b = 1 + 0.06 * Math.sin(t * 0.8); haze.scale.setScalar(b);
      hazeRing.rotation.y = t * 0.1;
      // 호 위치 (분해 따라감)
      const A = toDecor(hotZ, hp, _a), B = toDecor(gasZ, gp, _b);
      mid.addVectors(A, B).multiplyScalar(0.5);
      const d = A.distanceTo(B); const out = new THREE.Vector3(mid.x, 0, mid.z);
      if (out.lengthSq() < 1e-4) out.set(1, 0, 1); out.normalize().multiplyScalar(d * 0.35); mid.add(out);
      const arr = arcGeo.attributes.position.array;
      for (let i = 0; i < NA; i++) {
        const u = i / (NA - 1), w = 1 - u;
        q.set(w * w * A.x + 2 * w * u * mid.x + u * u * B.x, w * w * A.y + 2 * w * u * mid.y + u * u * B.y, w * w * A.z + 2 * w * u * mid.z + u * u * B.z);
        arr[i * 3] = q.x; arr[i * 3 + 1] = q.y; arr[i * 3 + 2] = q.z;
      }
      arcGeo.attributes.position.needsUpdate = true; arc.computeLineDistances();
    });
  }

  /* 순서 위반: 질소 배관 + 표지판 */
  function buildSequence(eff) {
    const ringZ = eff.zones.find((z) => ZONE_INFO[z].kind === 'ring') || eff.zones[0];
    const inZ = eff.zones.find((z) => ZONE_INFO[z].kind === 'in') || ringZ;
    const zi = ZONE_INFO[ringZ];
    const R = (zi.kind === 'ring' ? zi.rIn + 0.9 : (zi.rOut || 6) * 0.8), y = zi.floorY + 1;
    const pipe = new THREE.Mesh(eff.geo(new THREE.TorusGeometry(R, 0.42, 10, 96)),
      eff.mat(new THREE.MeshBasicMaterial({ color: eff.color, opacity: 0.55 }), 0.55));
    pipe.rotation.x = Math.PI / 2; pipe.position.y = y; pipe.renderOrder = 6; eff.add(zg(ringZ), pipe);
    const halo = new THREE.Mesh(eff.geo(new THREE.TorusGeometry(R, 0.9, 8, 96)),
      eff.mat(new THREE.MeshBasicMaterial({ color: eff.color, opacity: 0.12, blending: THREE.AdditiveBlending }), 0.12));
    halo.rotation.x = Math.PI / 2; halo.position.y = y; eff.add(zg(ringZ), halo);
    // 흐름 표시 (흰 알갱이가 배관 따라 이동)
    const beadGeo = eff.geo(new THREE.CapsuleGeometry(0.3, 1.1, 3, 6)); beadGeo.rotateX(Math.PI / 2);
    const beadMat = eff.mat(new THREE.MeshBasicMaterial({ color: '#ffffff', opacity: 0.9 }), 0.9);
    const beads = [];
    for (let i = 0; i < 14; i++) { const b = new THREE.Mesh(beadGeo, beadMat); eff.add(zg(ringZ), b); beads.push(b); }
    // 표지판
    const { tex, aspect } = stopSignTexture(SEV[eff.c.severity]?.color || '#c62828', '순서 위반', '축조 완료 후 연결');
    eff.disposables.push(tex);
    const sm = eff.mat(new THREE.SpriteMaterial({ map: tex, depthTest: false }), 1);
    const sign = new THREE.Sprite(sm); const hS = 3.4 * P;
    sign.scale.set(hS * aspect, hS, 1); sign.renderOrder = 25;
    const sp = zoneSpot(inZ); sp.y = (ZONE_INFO[inZ].kind === 'in' ? ZONE_INFO[inZ].floorY + 1.2 * P : zoneTop(inZ)) + hS / 2;
    sign.position.copy(sp); eff.add(zg(inZ), sign);
    eff.ticks.push((t) => {
      beads.forEach((b, i) => {
        const a = t * 0.35 + (i / beads.length) * Math.PI * 2;
        b.position.set(R * Math.sin(a), y, R * Math.cos(a)); b.rotation.y = a + Math.PI / 2;
      });
      pipe.material.opacity = (0.45 + 0.15 * Math.sin(t * 1.6)) * eff.f;
      sign.position.y = sp.y + Math.sin(t * 0.8) * 0.25;
    });
    eff.badgeZone = inZ;
  }

  /* 같은 시간·구역: 바닥 테두리 */
  function buildSameZone(eff) {
    for (const z of eff.zones) {
      const zi = ZONE_INFO[z];
      const grp = new THREE.Group(); eff.add(zg(z), grp);
      const ms = [];
      const mk = (geo) => {
        const m = eff.mat(new THREE.MeshBasicMaterial({ color: eff.color, opacity: 0.7, side: THREE.DoubleSide }), 0.7);
        const mesh = new THREE.Mesh(eff.geo(geo), m); mesh.renderOrder = 6; grp.add(mesh); ms.push(m);
      };
      if (zi.kind === 'ground') {
        const [w, d] = zi.size; const [cx, , cz] = zi.center; const th = 0.5;
        const bar = (bw, bd, x, zz) => mk(new THREE.PlaneGeometry(bw, bd).rotateX(-Math.PI / 2).translate(x, 0, zz));
        bar(w, th, cx, cz - d / 2); bar(w, th, cx, cz + d / 2); bar(th, d, cx - w / 2, cz); bar(th, d, cx + w / 2, cz);
      } else {
        const rO = zi.rOut, rI = zi.rIn;
        mk(new THREE.RingGeometry(rO - 0.5, rO, 96).rotateX(-Math.PI / 2));
        if (rI > 0.5) mk(new THREE.RingGeometry(rI, rI + 0.5, 96).rotateX(-Math.PI / 2));
      }
      grp.position.y = zi.floorY + 0.2;
      eff.ticks.push((t) => { const k = 0.4 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2.4)); ms.forEach((m) => { m.opacity = k * eff.f; }); });
    }
  }

  /* 표준서 누락: 서류 아이콘 */
  function buildStandard(eff) {
    const z = eff.zones[0]; if (!z) return;
    const { tex, aspect } = clipboardTexture(SEV.DEFECT.color);
    eff.disposables.push(tex);
    const m = eff.mat(new THREE.SpriteMaterial({ map: tex, depthTest: false }), 1);
    const s = new THREE.Sprite(m); const h = 1.9 * P;
    s.scale.set(h * aspect, h, 1); s.renderOrder = 20;
    const p = zoneSpot(z); p.y = ZONE_INFO[z].floorY + 0.8 * P + h / 2;
    // 옆으로 살짝 비켜서 다른 표시와 안 겹치게
    const side = new THREE.Vector3(p.x, 0, p.z); if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize(); p.add(new THREE.Vector3(side.z, 0, -side.x).multiplyScalar(2.6));
    s.position.copy(p); eff.add(zg(z), s);
    eff.ticks.push((t) => { s.position.y = p.y + Math.sin(t * 1.1) * 0.2; });
  }

  /* 배지 붙일 구역 고르기 */
  function badgeZoneOf(eff) {
    if (eff.badgeZone) return eff.badgeZone;
    const c = eff.c;
    if (c.type === 'VERTICAL') return [...eff.zones].sort((a, b) => ZONE_INFO[a].floorY - ZONE_INFO[b].floorY)[0];
    if (c.type === 'HOT_GAS') return eff.hotZ || eff.zones[0];
    return eff.zones[0];
  }

  function disposeEffect(eff) {
    for (const o of eff.objs) o.removeFromParent();
    for (const d of eff.disposables) d.dispose?.();
  }
  function clear() { effects.forEach(disposeEffect); effects = []; pickables.length = 0; }

  function isActiveAt(c, t) {
    const tm = toMs(t); if (isNaN(tm)) return true;
    const s = toMs(c.start), e = toMs(c.end);
    if (isNaN(s) || isNaN(e)) return true;
    return s <= tm && tm < e;
  }

  function setActive({ conflicts = [], tasks = [], t = null } = {}) {
    const list = (conflicts || []).filter((c) => c && isActiveAt(c, t));
    const key = list.map((c) => c.id).sort().join('|');
    if (key === activeKey) return;        // 같은 묶음이면 다시 안 만듦
    activeKey = key; clear();
    const stack = new Map();
    for (const c of list) {
      const eff = makeEffect(c);
      if (!eff.zones.length) continue;
      try {
        if (c.type === 'VERTICAL') buildVertical(eff);
        else if (c.type === 'HOT_GAS') buildHotGas(eff, tasks);
        else if (c.type === 'SEQUENCE') buildSequence(eff);
        else if (c.type === 'SAME_ZONE_TIME') buildSameZone(eff);
        else if (c.type === 'STANDARD') buildStandard(eff);
      } catch (e) { console.warn('[effects]', c.id, e); }
      const bz = badgeZoneOf(eff);
      const n = stack.get(bz) || 0; stack.set(bz, n + 1);
      addBadge(eff, bz, n);
      effects.push(eff);
    }
    applyDim(); refresh();
  }

  function applyDim() {
    for (const eff of effects) {
      eff.f = selectedId === null || selectedId === undefined || eff.id === selectedId ? 1 : DIM;
      for (const { m, base } of eff.mats) m.opacity = base * eff.f;
      if (eff.badgeMat) eff.badgeMat.opacity = Math.max(0.45, eff.f);
      if (eff.badge) eff.badge.renderOrder = eff.id === selectedId ? 40 : 30;
    }
  }
  function setSelected(id) { selectedId = id || null; applyDim(); }

  /* 구역이 모두 흐림(층 고립)이면 숨김 + 클릭 목록 갱신 */
  function refresh() {
    pickables.length = 0;
    for (const eff of effects) {
      const hidden = furnace.isGhosted ? eff.zones.every((z) => furnace.isGhosted(z)) : false;
      for (const o of eff.objs) o.visible = !hidden;
      if (eff.badge && !showBadges) eff.badge.visible = false;
      else if (!hidden && eff.badge) pickables.push(eff.badge);
    }
  }

  function update(timeSec = 0) {
    if (!effects.length) return;
    furnace.root?.updateMatrixWorld?.(true);
    for (const eff of effects) {
      if (eff.objs.length && !eff.objs[0].visible) continue;
      for (const fn of eff.ticks) fn(timeSec);
    }
  }

  function dispose() { clear(); activeKey = ''; }

  return { setActive, setSelected, pickables, refresh, update, dispose };
}
