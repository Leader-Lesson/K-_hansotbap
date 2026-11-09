/* 한솥밥 3D · 위험/안전 바닥 칠하기
   집중한 구역 바닥에 "지금 위험한 곳(빨강 빗금)" / "일해도 되는 곳(초록)"을 칠함
   - 영역(Area)은 SPEC_v2 §1 work_area 규칙: shape 'disc'|'sector'|'ring'|'all', phi·width(rad), r0·r1(0..1)
   - 반지름 0..1 은 구역의 쓸 수 있는 범위: 노 내부(in) 0..rOut / 고리·데크 rIn..rOut / 지상은 사각형 기준
   - 구역 그룹(zoneGroup)에 붙여서 분해·층 보기를 그대로 따라감 (모형 단위)
   - 규칙 계산은 안 함: 앱이 hazards / danger / safe 를 계산해서 넘겨 줌 */
import * as THREE from 'three';
import { ZONE_INFO, MODEL_SCALE, PERSON_H_MODEL } from './furnace.js';
import { SEV } from './theme.js';

const DANGER = SEV.PROHIBITED.color || '#c62828';
const SAFE = '#2e8b57';
const LABEL_H = 0.024;              // 라벨 높이 (화면 비율)
const Y_SAFE = 0.06, Y_DANGER = 0.08, Y_LINE = 0.11;   // 바닥 위 띄우는 높이 (겹침 방지)
const STEP_PHI = Math.PI / 60;      // 호 나누는 간격 (3°)
const LABEL_PHI = Math.PI / 4;      // 고리 영역 라벨은 절개면 가운데에
const UV_K = 1 / 2.5;               // 빗금 반복 간격 (모형 단위 2.5)
const FONT = '"Pretendard","Noto Sans KR","Malgun Gothic",sans-serif';
const TAU = Math.PI * 2;

/* ---------- 영역 → 바닥 모양 ---------- */
/* 구역 반지름 범위 [R0, R1] (모형 단위) + 중심 */
function zoneFrame(info) {
  if (info.kind === 'ground') {
    const [sx, sz] = info.size || [10, 10];
    return { cx: info.center?.[0] || 0, cz: info.center?.[2] || 0, R0: 0, R1: Math.min(sx, sz) / 2, sx, sz };
  }
  if (info.kind === 'in') return { cx: 0, cz: 0, R0: 0, R1: info.rOut };
  return { cx: 0, cz: 0, R0: info.rIn, R1: info.rOut };
}

/* 영역 정규화 → { rect } 또는 { a0, a1, ra, rb, full } */
function resolveArea(info, area = {}) {
  const f = zoneFrame(info);
  const shape = area.shape || 'all';
  if (info.kind === 'ground' && shape === 'all') return { rect: true, f };
  const lerp = (t) => f.R0 + (f.R1 - f.R0) * Math.max(0, Math.min(1, t));
  let r0 = area.r0 ?? 0, r1 = area.r1 ?? 1;
  if (shape === 'all') { r0 = 0; r1 = 1; }
  if (r1 < r0) [r0, r1] = [r1, r0];
  let a0 = 0, a1 = TAU, full = true;
  if (shape === 'sector') {
    const w = Math.min(TAU, Math.max(0.02, area.width ?? Math.PI / 2));
    const c = area.phi ?? 0;
    a0 = c - w / 2; a1 = c + w / 2; full = w >= TAU - 1e-6;
  }
  return { f, a0, a1, full, ra: lerp(r0), rb: Math.max(lerp(r1), lerp(r0) + 0.05) };
}

/* 극좌표 → 구역 좌표 (x = r·sinφ, z = r·cosφ) */
const pol = (f, r, a, y) => new THREE.Vector3(f.cx + r * Math.sin(a), y, f.cz + r * Math.cos(a));

/* 채움 면 (빗금 UV = 바닥 xz 기준이라 영역끼리 무늬가 이어짐) */
function fillGeo(R, y) {
  const pos = [], uv = [], idx = [];
  const push = (v) => { pos.push(v.x, v.y, v.z); uv.push(v.x * UV_K, v.z * UV_K); return pos.length / 3 - 1; };
  if (R.rect) {
    const { cx, cz, sx, sz } = R.f;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([i, j]) => push(new THREE.Vector3(cx + i * sx / 2, y, cz + j * sz / 2)));
    idx.push(0, 2, 1, 0, 3, 2);
  } else {
    const n = Math.max(4, Math.ceil((R.a1 - R.a0) / STEP_PHI));
    for (let i = 0; i <= n; i++) {
      const a = R.a0 + (R.a1 - R.a0) * i / n;
      push(pol(R.f, R.ra, a, y)); push(pol(R.f, R.rb, a, y));
    }
    for (let i = 0; i < n; i++) { const k = i * 2; idx.push(k, k + 1, k + 3, k, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

/* 테두리 꺾은선 목록 (닫힌 고리들) */
function outlineLoops(R, y) {
  const loops = [];
  if (R.rect) {
    const { cx, cz, sx, sz } = R.f;
    loops.push([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => new THREE.Vector3(cx + i * sx / 2, y, cz + j * sz / 2)));
    return loops;
  }
  const arc = (r, a0, a1) => {
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / STEP_PHI)), out = [];
    for (let i = 0; i <= n; i++) out.push(pol(R.f, r, a0 + (a1 - a0) * i / n, y));
    return out;
  };
  if (R.full) {
    loops.push(arc(R.rb, 0, TAU).slice(0, -1));
    if (R.ra > 0.05) loops.push(arc(R.ra, 0, TAU).slice(0, -1));
  } else {
    const outer = arc(R.rb, R.a0, R.a1);
    const inner = R.ra > 0.05 ? arc(R.ra, R.a1, R.a0) : [pol(R.f, 0, 0, y)];
    loops.push(outer.concat(inner));
  }
  return loops;
}

/* 꺾은선 → 바닥에 눕힌 띠 (WebGL 선은 1px 라 띠로 그림). dash>0 이면 점선 */
function ribbonGeo(loops, w, dash = 0) {
  const pos = [], idx = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), nrm = new THREE.Vector3();
  const quad = (p, q) => {
    d.subVectors(q, p); d.y = 0; if (d.lengthSq() < 1e-8) return;
    d.normalize(); nrm.set(-d.z, 0, d.x).multiplyScalar(w / 2);
    const k = pos.length / 3;
    pos.push(p.x + nrm.x, p.y, p.z + nrm.z, p.x - nrm.x, p.y, p.z - nrm.z, q.x - nrm.x, q.y, q.z - nrm.z, q.x + nrm.x, q.y, q.z + nrm.z);
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  };
  for (const loop of loops) {
    let dist = 0;
    for (let i = 0; i < loop.length; i++) {
      const p = loop[i], q = loop[(i + 1) % loop.length];
      const len = p.distanceTo(q);
      if (!dash) { quad(p, q); dist += len; continue; }
      // 점선: 작은 조각으로 쪼개서 짝수 칸만
      const n = Math.max(1, Math.ceil(len / (dash / 2)));
      for (let j = 0; j < n; j++) {
        a.lerpVectors(p, q, j / n); b.lerpVectors(p, q, (j + 1) / n);
        const mid = dist + len * (j + 0.5) / n;
        if (Math.floor(mid / dash) % 2 === 0) quad(a, b);
      }
      dist += len;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/* 라벨 놓을 자리 (영역 가운데, 고리면 절개면 쪽) */
function areaCentroid(R, y) {
  if (R.rect) return new THREE.Vector3(R.f.cx, y, R.f.cz);
  if (R.full) return R.ra < 0.05 ? new THREE.Vector3(R.f.cx, y, R.f.cz) : pol(R.f, (R.ra + R.rb) / 2, LABEL_PHI, y);
  return pol(R.f, R.ra < 0.05 ? R.rb * 0.55 : (R.ra + R.rb) / 2, (R.a0 + R.a1) / 2, y);
}
/* 면적 (가장 큰 영역에 라벨) */
function areaSize(R) {
  if (R.rect) return R.f.sx * R.f.sz;
  return 0.5 * (R.a1 - R.a0) * (R.rb * R.rb - R.ra * R.ra);
}

/* ---------- 캔버스 그림 ---------- */
function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
/* 빨강 빗금 (반투명 바탕 + 진한 사선) */
function stripeTexture() {
  const c = makeCanvas(128, 128), g = c.getContext('2d');
  g.fillStyle = 'rgba(198,40,40,0.30)'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(198,40,40,0.75)'; g.lineWidth = 22;
  for (let k = -128; k <= 256; k += 64) { g.beginPath(); g.moveTo(k, 128); g.lineTo(k + 128, 0); g.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
/* 굵은 한글 라벨 (흰 바탕 + 색 테두리 + 왼쪽 색 표시) */
function labelTexture(text, color, mark) {
  const c = makeCanvas(16, 16), g = c.getContext('2d');
  g.font = `bold 52px ${FONT}`;
  const tw = g.measureText(text).width || text.length * 48;
  const H = 96, markW = 84, W = Math.ceil(markW + tw + 44);
  c.width = W; c.height = H;
  roundRect(g, 3, 3, W - 6, H - 6, 18); g.fillStyle = 'rgba(255,255,255,0.96)'; g.fill();
  g.lineWidth = 6; g.strokeStyle = color; g.stroke();
  roundRect(g, 3, 3, markW, H - 6, 18); g.fillStyle = color; g.fill();
  g.textBaseline = 'middle'; g.font = `bold 52px ${FONT}`;
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.fillText(mark, 3 + markW / 2, H / 2 + 2);
  g.fillStyle = color; g.textAlign = 'left'; g.fillText(text, markW + 22, H / 2 + 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { tex, aspect: W / H };
}

/* 영역 키 (중복 제거용) */
const areaKey = (a = {}) => [a.shape, a.phi, a.width, a.r0, a.r1].map((v) => (typeof v === 'number' ? v.toFixed(3) : v ?? '')).join('|');
/* 위험 문구 짧게: '노정 인양 경로 아래 — 중앙부 낙하 위험' → '중앙부 낙하' */
function shortHazard(text = '') {
  const s = String(text).split(/—|-|·/).pop().trim().replace(/\s*위험$/, '');
  return s.length > 14 ? s.slice(0, 14) + '…' : s;
}

/* ---------- 본체 ---------- */
export function buildSafeZones(furnace) {
  const stripe = stripeTexture();
  let cur = null;      // { zoneId, group, disposables[], dangerMats[], fillMats[], dashMats[], input }

  function clear() {
    if (!cur) return;
    cur.group.removeFromParent();
    cur.disposables.forEach((d) => d.dispose?.());
    cur = null;
  }

  function show(input = {}) {
    clear();
    const { zoneId, hazards = [], danger = [], safe = [], labels = {} } = input;
    const info = ZONE_INFO[zoneId], parent = furnace.zoneGroup?.(zoneId);
    if (!info || !parent) return;
    const group = new THREE.Group(); group.name = `safezones:${zoneId}`;
    const st = { zoneId, group, disposables: [], dangerMats: [], fillMats: [], input };
    const keep = (o) => { st.disposables.push(o); return o; };
    const y0 = info.floorY;
    const noRay = () => {};
    const mesh = (geo, mat, order) => { const m = new THREE.Mesh(keep(geo), keep(mat)); m.renderOrder = order; m.raycast = noRay; group.add(m); return m; };
    const flat = (opt) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, ...opt });

    // 안전 먼저 (아래), 위험은 위에 → 겹치면 위험으로 읽힘
    const safeR = safe.map((a) => resolveArea(info, a));
    for (const R of safeR) {
      mesh(fillGeo(R, y0 + Y_SAFE), flat({ color: SAFE, opacity: 0.30 }), 3);
      mesh(ribbonGeo(outlineLoops(R, y0 + Y_LINE - 0.01), 0.22, 0.9), flat({ color: SAFE, opacity: 0.95 }), 5);
    }
    const dangerR = danger.map((a) => resolveArea(info, a));
    for (const R of dangerR) {
      const fm = flat({ map: stripe, color: '#ffffff', opacity: 1 });
      mesh(fillGeo(R, y0 + Y_DANGER), fm, 4); st.fillMats.push(fm);
      const om = flat({ color: DANGER, opacity: 0.9 });
      mesh(ribbonGeo(outlineLoops(R, y0 + Y_LINE), 0.3), om, 6); st.dangerMats.push(om);
    }

    // 라벨 (가장 큰 영역 가운데에 하나씩)
    const addLabel = (Rs, text, color, mark, lift) => {
      if (!Rs.length || !text) return null;
      const R = Rs.reduce((m, r) => (areaSize(r) > areaSize(m) ? r : m), Rs[0]);
      const { tex, aspect } = labelTexture(text, color, mark); keep(tex);
      const sm = keep(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, transparent: true }));
      const s = new THREE.Sprite(sm);
      s.scale.set((LABEL_H * aspect) / MODEL_SCALE, LABEL_H / MODEL_SCALE, 1);
      s.center.set(0.5, 0);
      s.position.copy(areaCentroid(R, y0 + lift)); s.renderOrder = 28; s.raycast = noRay;
      group.add(s); return s;
    };
    const myHz = hazards.filter((h) => !h.zoneId || h.zoneId === zoneId);
    const dText = labels.danger || (myHz[0] ? `위험 · ${shortHazard(myHz[0].text)}` : '위험');
    const sText = labels.safe || '안전 · 가장자리 작업 가능';
    const dLab = addLabel(dangerR, dText, DANGER, '!', 0.5);
    const sLab = addLabel(safeR, sText, SAFE, '✓', 0.5);
    if (dLab && sLab && dLab.position.distanceTo(sLab.position) < 2) sLab.center.set(0.5, 1.3);   // 겹치면 화면에서 아래로

    // 낙하(DROP): 위에서 내려오는 점선 + 아래 화살표
    if (info.kind !== 'ground') {
      const seen = new Set();
      for (const h of myHz) {
        if (h.kind !== 'DROP' || !h.area) continue;
        const k = areaKey(h.area); if (seen.has(k)) continue; seen.add(k);
        const p = areaCentroid(resolveArea(info, h.area), y0 + Y_LINE);
        const top = y0 + Math.max(6, Math.min(36, 48 - y0));
        const lg = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p.x, top, p.z), new THREE.Vector3(p.x, y0 + PERSON_H_MODEL * 0.6, p.z)]));
        const lm = keep(new THREE.LineDashedMaterial({ color: DANGER, dashSize: 0.8, gapSize: 0.6, transparent: true, opacity: 0.85, depthWrite: false }));
        const line = new THREE.Line(lg, lm); line.computeLineDistances(); line.renderOrder = 7; line.raycast = noRay; group.add(line);
        st.dangerMats.push(lm);
        const cone = mesh(new THREE.ConeGeometry(0.45, 1.1, 12), flat({ color: DANGER, opacity: 0.85 }), 7);
        cone.rotation.x = Math.PI; cone.position.set(p.x, y0 + PERSON_H_MODEL * 0.6 - 0.2, p.z);
        st.dangerMats.push(cone.material);
      }
    }

    parent.add(group);
    cur = st;
    refresh();
  }

  /* 구역이 투명(다른 층 보기·집중 밖)이면 숨김 */
  function refresh() {
    if (!cur) return;
    cur.group.visible = !(furnace.isGhosted && furnace.isGhosted(cur.zoneId));
  }

  /* 위험 테두리 천천히 깜빡 + 빗금 살짝 흐름 */
  function update(timeSec = 0) {
    if (!cur || !cur.group.visible) return;
    const k = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(timeSec * 2.4));
    for (const m of cur.dangerMats) m.opacity = k;
    stripe.offset.x = (timeSec * 0.06) % 1;
  }

  function dispose() { clear(); stripe.dispose(); }

  return { show, clear, refresh, update, dispose, get zoneId() { return cur?.zoneId ?? null; } };
}
