/* 한솥밥 3D · 출입 통제선 (안전 테이프 + 라바콘) + 바닥 나침반
   글로 경고하는 대신 현장 조치 모습을 그대로 보여 줌:
   - 지금 막힌 방향(사분면)과 허용된 방향 사이 '경계'에만 테이프·라바콘을 둠
   - 전 방향 금지면 4개 경계 모두 + 큰 "전 구역 출입 금지" 표지
   - 중앙부(낙하물) 통제는 가운데를 둘러싸는 원형 통제선
   좌표: 모형 단위, x = r·sinφ, z = r·cosφ  (남 +z φ=0, 동 +x φ=π/2, 북 −z φ=π, 서 −x φ=3π/2) */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ZONE_INFO, MODEL_SCALE, PERSON_H_MODEL } from './furnace.js';

export const DIR_ANGLE = { S: 0, E: Math.PI / 2, N: Math.PI, W: 3 * Math.PI / 2 };
export const DIR_NAME = { N: '북쪽', E: '동쪽', S: '남쪽', W: '서쪽' };

const PH = PERSON_H_MODEL;
const TAU = Math.PI * 2;
const QUAD = ['S', 'E', 'N', 'W'];        // φ 증가 순서
const POST_GAP = 1.0 * PH;                // 기둥 간격
const POST_H = 0.55 * PH;
const TAPE_Y = 0.45 * PH, TAPE_W = 0.075 * PH;
const CONE_H = 0.42 * PH, CONE_B = 0.25 * PH;
const SIGN_H = 0.022, BIG_SIGN_H = 0.034;   // 화면 높이 비율
const FONT = '"Pretendard","Noto Sans KR","Malgun Gothic",sans-serif';
const noRay = () => {};

/* ---------- 경계 계산 (순수 함수) ----------
   blocked: ['N','E',...] → [{ phi, between:[허용, 금지], side }]
   side = +1 이면 금지 쪽이 φ 증가 방향. 전부 금지면 4개 경계 모두(허용 쪽 null). */
export function boundariesFor(blocked = []) {
  const B = new Set((blocked || []).filter((d) => QUAD.includes(d)));
  const out = [];
  if (B.size === 0) return out;
  const all = B.size === 4;
  for (let k = 0; k < 4; k++) {
    const lo = QUAD[k], hi = QUAD[(k + 1) % 4];
    const phi = Math.PI / 4 + k * Math.PI / 2;
    if (all) { out.push({ phi, between: [null, hi], side: 1 }); continue; }
    const bl = B.has(lo), bh = B.has(hi);
    if (bl === bh) continue;
    out.push(bh ? { phi, between: [lo, hi], side: 1 } : { phi, between: [hi, lo], side: -1 });
  }
  return out;
}

/* ---------- 텍스처 ---------- */
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tapeTexture() {   // 빨강/흰 사선 줄무늬
  const c = makeCanvas(128, 32), g = c.getContext('2d');
  g.fillStyle = '#f4f1ec'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#d42a1f';
  for (let x = -64; x < 160; x += 64) {
    g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 32, 32); g.lineTo(x + 64, 0); g.lineTo(x + 32, 0); g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
/* 표지판: 빨간 머리띠 "출입 금지" + 아래 흰 바탕 글 */
function signTexture(header, lines) {
  const c = makeCanvas(16, 16), g = c.getContext('2d');
  const HF = 56, BF = 44;
  g.font = `bold ${HF}px ${FONT}`;
  let tw = g.measureText(header).width || header.length * HF;
  g.font = `bold ${BF}px ${FONT}`;
  for (const t of lines) tw = Math.max(tw, g.measureText(t).width || t.length * BF);
  const W = Math.ceil(tw + 72), HH = 84, LH = 60, H = HH + lines.length * LH + 18;
  c.width = W; c.height = H;
  roundRect(g, 3, 3, W - 6, H - 6, 16); g.fillStyle = '#ffffff'; g.fill();
  g.lineWidth = 6; g.strokeStyle = '#c62828'; g.stroke();
  roundRect(g, 3, 3, W - 6, HH, 16); g.fillStyle = '#c62828'; g.fill();
  g.fillRect(3, HH - 14, W - 6, 17);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ffffff'; g.font = `bold ${HF}px ${FONT}`; g.fillText(header, W / 2, 3 + HH / 2 + 2);
  g.fillStyle = '#1f1f1f'; g.font = `bold ${BF}px ${FONT}`;
  lines.forEach((t, i) => g.fillText(t, W / 2, HH + 12 + LH * (i + 0.5)));
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { tex, aspect: W / H };
}

/* ---------- 공용 지오메트리 (바닥 y=0 기준) ---------- */
function colored(geo, hex) {
  const col = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
const ni = (g) => (g.index ? g.toNonIndexed() : g);
function postGeometry() {   // 노랑·검정 줄무늬 기둥 + 검정 받침
  const r = 0.032 * PH, parts = [];
  parts.push(colored(ni(new THREE.CylinderGeometry(0.1 * PH, 0.11 * PH, 0.05 * PH, 10).translate(0, 0.025 * PH, 0)), '#2e2c2a'));
  const n = 5, h0 = 0.05 * PH, seg = (POST_H - h0) / n;
  for (let i = 0; i < n; i++) {
    parts.push(colored(ni(new THREE.CylinderGeometry(r, r, seg, 8).translate(0, h0 + seg * (i + 0.5), 0)), i % 2 ? '#2e2c2a' : '#e8c31c'));
  }
  return mergeGeometries(parts);
}
function coneGeometry() {   // 라바콘 몸통(주황) + 고무 받침(검정)
  const bh = 0.035 * CONE_H, hb = CONE_H - bh;
  const base = colored(ni(new THREE.BoxGeometry(CONE_B, bh, CONE_B).translate(0, bh / 2, 0)), '#2b2a28');
  const body = colored(ni(new THREE.CylinderGeometry(0.018 * PH, 0.105 * PH, hb, 16).translate(0, bh + hb / 2, 0)), '#ff6a13');
  return mergeGeometries([base, body]);
}
function coneBandGeometry() {   // 흰 반사띠 2줄 (몸통보다 살짝 크게)
  const bh = 0.035 * CONE_H, hb = CONE_H - bh, rT = 0.018 * PH, rB = 0.105 * PH, e = 0.004 * PH;
  const rAt = (t) => rB + (rT - rB) * t;
  const band = (t0, t1) => new THREE.CylinderGeometry(rAt(t1) + e, rAt(t0) + e, (t1 - t0) * hb, 16, 1, true)
    .translate(0, bh + (t0 + t1) / 2 * hb, 0);
  return mergeGeometries([ni(band(0.40, 0.52)), ni(band(0.64, 0.74))]);
}

/* 꺾은선 기둥 위치 → 테이프 띠 (조금 처짐) */
function pushTape(T, pts, closed) {
  const n = pts.length, spans = closed ? n : n - 1, SUB = 4, sag = 0.035 * PH;
  let dist = T.dist || 0;
  for (let s = 0; s < spans; s++) {
    const a = pts[s], b = pts[(s + 1) % n];
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L, nz = dx / L;
    const k0 = T.pos.length / 3;
    for (let j = 0; j <= SUB; j++) {
      const t = j / SUB, x = a.x + dx * t, z = a.z + dz * t, y = a.y + TAPE_Y - sag * Math.sin(Math.PI * t);
      T.pos.push(x, y - TAPE_W / 2, z, x, y + TAPE_W / 2, z);
      T.nrm.push(nx, 0, nz, nx, 0, nz);
      const u = (dist + L * t) / (TAPE_W * 4);
      T.uv.push(u, 0, u, 1);
    }
    for (let j = 0; j < SUB; j++) { const k = k0 + j * 2; T.idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    dist += L;
  }
  T.dist = dist;
}

/* 구역 통제선 위치: 원점 O, 방향 u, t0..t1 (모형 단위) */
function lineFrame(info, phi, y) {
  const u = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));
  const n = new THREE.Vector3(Math.cos(phi), 0, -Math.sin(phi));   // φ 증가 방향
  if (info.kind === 'ground') {
    const [cx, , cz] = info.center || [0, 0, 0], [sx, sz] = info.size || [10, 10];
    const tx = Math.abs(u.x) > 1e-6 ? sx / 2 / Math.abs(u.x) : Infinity;
    const tz = Math.abs(u.z) > 1e-6 ? sz / 2 / Math.abs(u.z) : Infinity;
    return { O: new THREE.Vector3(cx, y, cz), u, n, t0: 0, t1: Math.min(tx, tz) - 0.2 };
  }
  const O = new THREE.Vector3(0, y, 0);
  if (info.kind === 'in') return { O, u, n, t0: 0.15 * info.rOut, t1: info.rOut - 0.1 };
  return { O, u, n, t0: info.rIn + 0.2, t1: info.rOut - 0.2 };
}
/* 중앙부 원 (구역 중심, 반지름) */
function centerFrame(info, frac, y) {
  const f = Math.max(0.05, Math.min(1, frac));
  if (info.kind === 'ground') {
    const [cx, , cz] = info.center || [0, 0, 0], [sx, sz] = info.size || [10, 10];
    return { C: new THREE.Vector3(cx, y, cz), R: f * Math.min(sx, sz) / 2, signAt: new THREE.Vector3(cx, y, cz) };
  }
  if (info.kind === 'in') return { C: new THREE.Vector3(0, y, 0), R: f * info.rOut, signAt: new THREE.Vector3(0, y, 0) };
  const R = info.rIn + (info.rOut - info.rIn) * f, rs = (info.rIn + R) / 2, a = Math.PI / 4;   // 절개면 쪽에 표지
  return { C: new THREE.Vector3(0, y, 0), R, signAt: new THREE.Vector3(rs * Math.sin(a), y, rs * Math.cos(a)) };
}
/* 전 구역 금지 표지 위치 */
function zoneMid(info, y) {
  if (info.kind === 'ground') { const c = info.center || [0, 0, 0]; return new THREE.Vector3(c[0], y, c[2]); }
  if (info.kind === 'in') return new THREE.Vector3(0, y, 0);
  const r = (info.rIn + info.rOut) / 2, a = Math.PI / 4;
  return new THREE.Vector3(r * Math.sin(a), y, r * Math.cos(a));
}

/* ---------- 본체 ---------- */
export function buildBarriers(furnace) {
  const tapeTex = tapeTexture();
  const geoPost = postGeometry(), geoCone = coneGeometry(), geoBand = coneBandGeometry();
  const matPost = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  const matCone = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  const matBand = new THREE.MeshStandardMaterial({ color: '#f6f6f2', roughness: 0.55, metalness: 0, emissive: '#ffffff', emissiveIntensity: 0 });
  const matTape = new THREE.MeshStandardMaterial({ map: tapeTex, roughness: 0.8, metalness: 0, side: THREE.DoubleSide,
    emissive: '#ffffff', emissiveMap: tapeTex, emissiveIntensity: 0 });

  let zones = [];       // [{ zoneId, group, lines, disposables[], signs[] }]
  let key = '';

  function clear() {
    for (const z of zones) { z.group.removeFromParent(); z.disposables.forEach((d) => d.dispose?.()); }
    zones = [];
  }

  function buildZone(item) {
    const info = ZONE_INFO[item.zoneId], parent = furnace.zoneGroup?.(item.zoneId);
    if (!info || !parent) return null;
    const bounds = boundariesFor(item.blocked);
    const hasCenter = !!(item.center && item.center.r > 0);
    if (!bounds.length && !hasCenter) return null;

    const group = new THREE.Group(); group.name = `barriers:${item.zoneId}`;
    const z = { zoneId: item.zoneId, group, lines: bounds.length + (hasCenter ? 1 : 0), disposables: [], signs: [] };
    const keep = (o) => { z.disposables.push(o); return o; };
    const posts = [], cones = [], T = { pos: [], nrm: [], uv: [], idx: [] };
    const until = item.until ? ` · ${item.until}까지` : '';
    const sub = item.label ? [item.label] : [];
    const allBlocked = bounds.length === 4 && bounds[0].between[0] === null;

    const addSign = (p, header, lines, h) => {
      const { tex, aspect } = signTexture(header, lines); keep(tex);
      const sm = keep(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, transparent: true }));
      const s = new THREE.Sprite(sm);
      s.scale.set((h * aspect) / MODEL_SCALE, h / MODEL_SCALE, 1);
      s.center.set(0.5, 0); s.position.copy(p); s.renderOrder = 30; s.raycast = noRay;
      s.userData.baseY = p.y; s.userData.ph = Math.random() * TAU;
      group.add(s); z.signs.push(s);
    };

    const floors = info.decks && info.decks.length ? info.decks : [info.floorY];
    floors.forEach((y, deckIdx) => {
      // 방향 경계선
      for (const b of bounds) {
        const F = lineFrame(info, b.phi, y), L = F.t1 - F.t0;
        if (L <= 0.2) continue;
        const nPost = Math.max(2, Math.ceil(L / POST_GAP) + 1), pts = [];
        for (let i = 0; i < nPost; i++) pts.push(F.O.clone().addScaledVector(F.u, F.t0 + L * i / (nPost - 1)));
        posts.push(...pts); pushTape(T, pts, false); T.dist = 0;
        const toBlocked = F.n.clone().multiplyScalar(b.side);
        // 라바콘: 허용 쪽 앞에 3~5개
        const nc = Math.max(3, Math.min(5, Math.round(L / (1.5 * PH))));
        for (let i = 0; i < nc; i++) {
          cones.push(F.O.clone().addScaledVector(F.u, F.t0 + L * (i + 0.5) / nc).addScaledVector(toBlocked, -0.55 * PH));
        }
        if (deckIdx === 0 && !allBlocked) {
          const p = F.O.clone().addScaledVector(F.u, F.t0 + L * 0.5).addScaledVector(toBlocked, 0.7 * PH);
          p.y = y + 0.95 * PH;
          addSign(p, '출입 금지', [`${DIR_NAME[b.between[1]]}${until}`, ...sub], SIGN_H);
        }
      }
      // 중앙부 원형 통제선
      if (hasCenter) {
        const C = centerFrame(info, item.center.r, y);
        const nPost = Math.max(8, Math.ceil(TAU * C.R / POST_GAP)), pts = [];
        for (let i = 0; i < nPost; i++) {
          const a = TAU * i / nPost; pts.push(new THREE.Vector3(C.C.x + C.R * Math.sin(a), y, C.C.z + C.R * Math.cos(a)));
        }
        posts.push(...pts); pushTape(T, pts, true); T.dist = 0;
        for (let i = 0; i < nPost; i += 2) {   // 원 바깥(허용 쪽)에 하나 걸러
          const a = TAU * (i + 0.5) / nPost, r = C.R + 0.5 * PH;
          cones.push(new THREE.Vector3(C.C.x + r * Math.sin(a), y, C.C.z + r * Math.cos(a)));
        }
        if (deckIdx === 0) {
          const p = C.signAt.clone(); p.y = y + 0.95 * PH;
          addSign(p, '출입 금지', ['중앙부 출입 금지' + until, ...sub], SIGN_H);
        }
      }
      if (allBlocked && deckIdx === 0) {
        const p = zoneMid(info, y); p.y = y + 1.3 * PH;
        addSign(p, '전 구역 출입 금지', [item.until ? `${item.until}까지` : '지금 작업 불가', ...sub], BIG_SIGN_H);
      }
    });

    // 인스턴스 (기둥·라바콘)
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), Yax = new THREE.Vector3(0, 1, 0);
    if (posts.length) {
      const im = keep(new THREE.InstancedMesh(geoPost, matPost, posts.length));
      posts.forEach((p, i) => im.setMatrixAt(i, m4.compose(p, q.identity(), one)));
      im.raycast = noRay; group.add(im);
    }
    if (cones.length) {
      const ic = keep(new THREE.InstancedMesh(geoCone, matCone, cones.length));
      const ib = keep(new THREE.InstancedMesh(geoBand, matBand, cones.length));
      cones.forEach((p, i) => {
        m4.compose(p, q.setFromAxisAngle(Yax, (i * 2.399) % TAU), one);
        ic.setMatrixAt(i, m4); ib.setMatrixAt(i, m4);
      });
      ic.raycast = ib.raycast = noRay; group.add(ic, ib);
    }
    // 테이프 (구역당 하나로 합침)
    if (T.idx.length) {
      const g = keep(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(T.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(T.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(T.uv, 2));
      g.setIndex(T.idx);
      const tm = new THREE.Mesh(g, matTape); tm.raycast = noRay; group.add(tm);
    }
    parent.add(group);
    return z;
  }

  /* 통제 목록 전체 교체 (같은 내용이면 그대로) */
  function set(list = []) {
    const norm = (list || []).map((it) => ({
      zoneId: it.zoneId, blocked: [...(it.blocked || [])].sort(),
      center: it.center && it.center.r > 0 ? { r: +it.center.r } : null, label: it.label || '', until: it.until || '',
    }));
    const k = JSON.stringify(norm);
    if (k === key) return;
    key = k; clear();
    for (const it of norm) { const z = buildZone(it); if (z) zones.push(z); }
    refresh();
  }

  /* 밤: 라바콘 반사띠·테이프가 살짝 빛남 */
  function setNight(level = 0) {
    const t = Math.max(0, Math.min(1, level));
    matBand.emissiveIntensity = 0.85 * t;
    matTape.emissiveIntensity = 0.3 * t;
  }

  /* 투명(다른 층 보기·집중 밖) 구역은 숨김 */
  function refresh() {
    for (const z of zones) z.group.visible = !(furnace.isGhosted && furnace.isGhosted(z.zoneId));
  }

  /* 표지판 살짝 흔들림 */
  function update(sec = 0) {
    for (const z of zones) {
      if (!z.group.visible) continue;
      for (const s of z.signs) s.position.y = s.userData.baseY + 0.05 * PH * Math.sin(sec * 1.6 + s.userData.ph);
    }
  }

  const count = () => zones.reduce((n, z) => n + (z.group.visible ? z.lines : 0), 0);

  function dispose() {
    clear(); key = '';
    [tapeTex, geoPost, geoCone, geoBand, matPost, matCone, matBand, matTape].forEach((d) => d.dispose());
  }

  return { set, setNight, refresh, update, count, dispose };
}

/* ---------- 바닥 나침반 (부지 모서리, 북 = −z) ---------- */
export function buildCompass(furnace) {
  const S = 512, c = makeCanvas(S, S), g = c.getContext('2d'), m = S / 2;
  g.clearRect(0, 0, S, S);
  g.beginPath(); g.arc(m, m, m * 0.92, 0, TAU); g.fillStyle = 'rgba(246,243,236,0.88)'; g.fill();
  g.lineWidth = 8; g.strokeStyle = '#5b5750'; g.stroke();
  g.beginPath(); g.arc(m, m, m * 0.62, 0, TAU); g.lineWidth = 3; g.stroke();
  // 별 모양 화살 (캔버스 위 = 북)
  const arm = (ang, len, w, col) => {
    const dx = Math.sin(ang), dy = -Math.cos(ang), px = -dy, py = dx;
    g.beginPath(); g.moveTo(m + dx * len, m + dy * len);
    g.lineTo(m + px * w, m + py * w); g.lineTo(m - px * w, m - py * w); g.closePath();
    g.fillStyle = col; g.fill();
  };
  for (let i = 0; i < 4; i++) arm(Math.PI / 4 + i * Math.PI / 2, m * 0.42, m * 0.06, '#a39d93');
  arm(Math.PI / 2, m * 0.6, m * 0.1, '#6f6a63'); arm(Math.PI, m * 0.6, m * 0.1, '#6f6a63'); arm(3 * Math.PI / 2, m * 0.6, m * 0.1, '#6f6a63');
  arm(0, m * 0.66, m * 0.12, '#c62828');
  g.font = `bold ${Math.round(S * 0.12)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const letter = (t, x, y, col) => { g.fillStyle = col; g.fillText(t, x, y); };
  letter('북', m, m - m * 0.78, '#c62828');
  letter('남', m, m + m * 0.78, '#3a3734');
  letter('동', m + m * 0.78, m, '#3a3734');
  letter('서', m - m * 0.78, m, '#3a3734');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;

  const SIZE = 16;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2);   // 텍스처 위 → −z (북)
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'compass'; mesh.position.set(60, 0.05, 55); mesh.renderOrder = 2; mesh.raycast = noRay;
  furnace.decor?.add(mesh);

  /* 층 따로 보기(어느 구역이든 투명)일 때는 숨김 */
  function refresh() {
    const iso = furnace.isGhosted ? Object.keys(ZONE_INFO).some((id) => furnace.isGhosted(id)) : false;
    mesh.visible = !iso;
  }
  function dispose() { mesh.removeFromParent(); geo.dispose(); mat.dispose(); tex.dispose(); }
  refresh();
  return { refresh, dispose };
}
