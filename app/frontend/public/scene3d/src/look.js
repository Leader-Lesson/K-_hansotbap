// look.js — 화면 분위기 레이어 (톤매핑·환경광·하늘·안개·주야간·투광등·절차 텍스처)
// 저사양 PC 기준: 그림자맵/후처리 없음, 포인트 조명 4개 고정(켜고 끄지 않고 세기만 조절 → 셰이더 재컴파일 방지)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const K = 1.5; // 모형 단위 → 월드 (furnace.js MODEL_SCALE 과 동일)

// ---------- 공용 유틸 ----------
function rand(seed) {
  // 고정 시드 난수 (매번 같은 무늬)
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function toTexture(canvas, repeat = [1, 1]) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
function speckle(g, w, h, n, r, alpha, seed, colors) {
  const R = rand(seed);
  for (let i = 0; i < n; i++) {
    g.globalAlpha = alpha * (0.4 + R() * 0.6);
    g.fillStyle = colors[(R() * colors.length) | 0];
    g.fillRect(R() * w, R() * h, 1 + R() * r, 1 + R() * r);
  }
  g.globalAlpha = 1;
}

// ---------- 절차 텍스처: 콘크리트 (줄눈·얼룩·흐린 노란 보행선) ----------
let _concreteCanvas = null;
export function makeConcreteTexture(repeat = [1, 1]) {
  if (!_concreteCanvas) {
    const S = 512;
    const [c, g] = makeCanvas(S, S);
    const R = rand(7);
    g.fillStyle = '#bdb9b2'; g.fillRect(0, 0, S, S);
    speckle(g, S, S, 9000, 2, 0.18, 11, ['#a9a59e', '#cfccc6', '#9c9891', '#d8d5cf']);
    // 얼룩 (기름·물 자국)
    for (let i = 0; i < 14; i++) {
      const x = R() * S, y = R() * S, r = 20 + R() * 70;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const dark = R() < 0.7;
      gr.addColorStop(0, dark ? 'rgba(80,74,66,0.16)' : 'rgba(235,232,226,0.18)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // 슬래브 줄눈 (4×4 판)
    g.strokeStyle = 'rgba(70,66,60,0.45)'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      const p = i * S / 4;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const p = i * S / 4 + 2;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
    }
    // 흐린 노란 보행선 (두 줄, 군데군데 벗겨짐)
    for (const y of [S * 0.62, S * 0.62 + 34]) {
      for (let x = 0; x < S; x += 4) {
        g.globalAlpha = 0.35 + R() * 0.25;
        if (R() < 0.12) continue;
        g.fillStyle = '#d9b43a'; g.fillRect(x, y, 4, 6);
      }
    }
    g.globalAlpha = 1;
    // 미세 균열
    g.strokeStyle = 'rgba(60,56,50,0.25)'; g.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      let x = R() * S, y = R() * S;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 30; y += (R() - 0.5) * 30; g.lineTo(x, y); }
      g.stroke();
    }
    _concreteCanvas = c;
  }
  return toTexture(_concreteCanvas, repeat);
}

// ---------- 절차 텍스처: 강판 외피 (용접선·녹물 자국) ----------
let _steelCanvas = null;
export function makeSteelTexture(repeat = [1, 1]) {
  if (!_steelCanvas) {
    const W = 256, H = 512;
    const [c, g] = makeCanvas(W, H);
    const R = rand(23);
    g.fillStyle = '#8d9196'; g.fillRect(0, 0, W, H);
    // 판마다 미세한 톤 차이
    const rows = 4, cols = 2, ph = H / rows, pw = W / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * pw / 2; // 엇갈린 이음
      for (let k = -1; k < cols + 1; k++) {
        const v = 128 + (R() - 0.5) * 18;
        g.fillStyle = `rgba(${v | 0},${(v + 4) | 0},${(v + 9) | 0},0.35)`;
        g.fillRect(k * pw + off, r * ph, pw, ph);
      }
    }
    speckle(g, W, H, 5000, 1.5, 0.12, 31, ['#7a7e83', '#a3a7ac', '#6f7378']);
    // 녹물 줄 (용접선 아래로 흘러내림)
    for (let i = 0; i < 26; i++) {
      const x = R() * W, y0 = Math.floor(R() * rows) * ph + 3, len = 30 + R() * 110;
      const gr = g.createLinearGradient(0, y0, 0, y0 + len);
      gr.addColorStop(0, 'rgba(140,78,40,0.32)');
      gr.addColorStop(1, 'rgba(140,78,40,0)');
      g.fillStyle = gr; g.fillRect(x, y0, 1 + R() * 3, len);
    }
    // 용접선 (가로 + 엇갈린 세로)
    const seam = (x0, y0, x1, y1) => {
      g.strokeStyle = 'rgba(55,58,62,0.75)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.strokeStyle = 'rgba(200,204,208,0.35)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x0 + 1, y0 - 2); g.lineTo(x1 + 1, y1 - 2); g.stroke();
    };
    for (let r = 0; r <= rows; r++) seam(0, r * ph, W, r * ph);
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * pw / 2;
      for (let k = 0; k <= cols; k++) { const x = (k * pw + off) % W; seam(x, r * ph, x, (r + 1) * ph); }
    }
    _steelCanvas = c;
  }
  return toTexture(_steelCanvas, repeat);
}

// ---------- 하늘 셰이더 (안쪽 구) ----------
const SKY_VS = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
}`;
const SKY_FS = `
uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom;
varying vec3 vDir;
void main() {
  float h = vDir.y;
  vec3 c = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.75, h), 0.8))
                   : mix(horizon, bottom, smoothstep(0.0, 0.25, -h));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------- 시간대 키프레임: [시, 야간 0..1, 노을 0..1] ----------
const KEYS = [
  [0, 1, 0], [5.5, 1, 0], [6.5, 0.5, 0.7], [7, 0, 0.25], [7.5, 0, 0],
  [16.5, 0, 0], [17.5, 0.15, 0.8], [18.5, 0.55, 1], [19.2, 0.95, 0.3], [20, 1, 0], [24, 1, 0],
];
function hourOf(t) {
  const m = /T(\d{1,2}):(\d{2})/.exec(t || '');
  return m ? (+m[1] + +m[2] / 60) % 24 : 12;
}
function sampleKeys(h) {
  for (let i = 1; i < KEYS.length; i++) {
    const [h1, n1, w1] = KEYS[i];
    if (h <= h1) {
      const [h0, n0, w0] = KEYS[i - 1];
      const a = (h - h0) / Math.max(1e-6, h1 - h0);
      return [n0 + (n1 - n0) * a, w0 + (w1 - w0) * a];
    }
  }
  return [1, 0];
}

// 팔레트 (주간 / 노을 / 야간)
const PAL = {
  top: ['#b9d2ea', '#7d86b0', '#0a1328'],
  horizon: ['#eef0f2', '#f3c79e', '#1c2942'],
  bottom: ['#d9dcdf', '#b9a597', '#121a2c'],
  hemiSky: ['#ffffff', '#ffe2c4', '#9fb2d6'],
  hemiGround: ['#b8bec4', '#a99c90', '#3a4255'],
  sun: ['#ffffff', '#ffb27a', '#a9bcff'],
};
const PALC = {};
for (const k in PAL) PALC[k] = PAL[k].map((h) => new THREE.Color(h));
const _ca = new THREE.Color();
function mix3(key, warm, night, out) {
  const [d, w, n] = PALC[key];
  out.copy(d).lerp(w, warm);
  return out.lerp(n, night);
}
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- 본체 ----------
export function buildLook({ scene, renderer, camera, furnace }) {
  const group = new THREE.Group(); group.name = 'look';
  scene.add(group);
  const disposables = [];

  // 이전 상태 저장 (dispose 때 복구)
  const prev = {
    toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure,
    outputColorSpace: renderer.outputColorSpace, background: scene.background,
    fog: scene.fog, environment: scene.environment,
  };

  // 1) 렌더러: ACES + sRGB
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // 환경광: RoomEnvironment 를 어둡게 낮춘 버전으로 PMREM (주간/야간 두 장)
  // (r160 에는 scene.environmentIntensity 가 없어 원본 씬 밝기를 직접 낮춤)
  const pmrem = new THREE.PMREMGenerator(renderer);
  function makeEnv(k) {
    const room = new RoomEnvironment(renderer);
    room.traverse((o) => {
      if (o.isLight) o.intensity *= k;
      if (o.material && o.material.color) o.material.color.multiplyScalar(k);
    });
    const rt = pmrem.fromScene(room, 0.04);
    room.dispose?.();
    disposables.push(rt);
    return rt.texture;
  }
  let envDay = null, envNight = null;
  try { envDay = makeEnv(0.35); envNight = makeEnv(0.12); scene.environment = envDay; }
  catch (e) { console.warn('[look] 환경맵 생성 실패', e); }
  pmrem.dispose();

  // 기존 조명 찾기 (복제하지 않고 조절)
  let hemi = null, sun = null;
  scene.traverse((o) => {
    if (!hemi && o.isHemisphereLight) hemi = o;
    if (!sun && o.isDirectionalLight) sun = o;
  });
  const prevLights = {
    hemi: hemi && { i: hemi.intensity, c: hemi.color.clone(), g: hemi.groundColor.clone() },
    sun: sun && { i: sun.intensity, c: sun.color.clone(), p: sun.position.clone() },
  };
  const sunBasePos = sun ? sun.position.clone() : new THREE.Vector3(80, 160, 100);

  // 2) 하늘 구 + 안개
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
    vertexShader: SKY_VS, fragmentShader: SKY_FS,
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMat);
  sky.scale.setScalar(1500); sky.renderOrder = -1000; sky.frustumCulled = false;
  sky.raycast = () => {};
  group.add(sky);
  disposables.push(sky.geometry, skyMat);

  // 별 (야간에만 서서히)
  const starGeo = new THREE.BufferGeometry();
  {
    const R = rand(99), pos = [];
    for (let i = 0; i < 350; i++) {
      const u = R() * Math.PI * 2, v = 0.08 + R() * 0.9; // 지평선 위쪽만
      const y = v, r = Math.sqrt(1 - y * y);
      pos.push(Math.cos(u) * r * 1400, y * 1400, Math.sin(u) * r * 1400);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  }
  const starMat = new THREE.PointsMaterial({ color: 0xdfe8ff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -999; stars.frustumCulled = false; stars.raycast = () => {};
  group.add(stars);
  disposables.push(starGeo, starMat);

  const fog = new THREE.Fog(0xeef0f2, 420, 1600);
  scene.fog = fog;
  const bgColor = new THREE.Color(0xeef0f2);
  scene.background = bgColor; // 하늘 구 뒤 대체색

  // 4a) 바닥 (부지 슬래브 아래 넓은 콘크리트)
  const groundTex = makeConcreteTexture([600 / 40, 600 / 40]);
  try { groundTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); } catch (e) { /* 무시 */ }
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, color: 0xe4e1dc, roughness: 0.95, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.name = 'look:ground';
  ground.raycast = () => {};
  group.add(ground);
  disposables.push(ground.geometry, groundMat, groundTex);

  // details.js 부지 슬래브(색 #ebe8e2)를 찾으면 콘크리트 무늬 입힘 (details 는 나중에 생성되므로 refresh 에서 시도)
  let slabDone = false, slabTex = null;
  function tryTextureSlab() {
    if (slabDone || !furnace?.decor) return;
    let found = null;
    furnace.root.traverse((o) => { if (!found && o.isMesh && /\|#ebe8e2$/i.test(o.name || '')) found = o; });
    if (!found) return;
    slabDone = true;
    const m = found.material;
    if (m && !m.map) {
      slabTex = makeConcreteTexture([170 * K / 40, 140 * K / 40]);
      slabTex.anisotropy = groundTex.anisotropy;
      m.map = slabTex; m.needsUpdate = true;
      disposables.push(slabTex);
    }
  }

  // 3) 작업 투광등 (포인트 조명 4개 + 발광 헤드 + 가산 빛기둥)
  const LAMPS = [
    // [위치(월드), 조준점] — 카메라 쪽(+x,+z) 작업대 위주
    [new THREE.Vector3(44, 20, 40), new THREE.Vector3(0, 4, 0)],          // 지상 조명탑
    [new THREE.Vector3(18, 41, 19), new THREE.Vector3(0, 30, 0)],         // 중단 작업대 (EX-MID)
    [new THREE.Vector3(-22, 52, 14), new THREE.Vector3(0, 42, 0)],        // 상부 작업대 (EX-UP)
    [new THREE.Vector3(12, 78, -14), new THREE.Vector3(0, 70, 0)],        // 노정 데크 (TOP)
  ];
  const headGeo = new THREE.BoxGeometry(2.6, 1.4, 0.7);
  const lensGeo = new THREE.PlaneGeometry(2.2, 1.0);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x5d6166, roughness: 0.7, metalness: 0.3 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x3f4347, roughness: 0.6, metalness: 0.4 });
  const lensMat = new THREE.MeshStandardMaterial({ color: 0xfff3dc, emissive: 0xfff0d2, emissiveIntensity: 0, roughness: 0.3 });
  disposables.push(headGeo, lensGeo, poleMat, headMat, lensMat);

  // 빛기둥: 꼭짓점 색으로 끝으로 갈수록 검정 → 가산혼합에서 자연스럽게 사라짐
  const CONE_H = 34;
  const coneGeo = new THREE.ConeGeometry(10, CONE_H, 24, 1, true);
  coneGeo.translate(0, -CONE_H / 2, 0); // 꼭짓점을 원점에
  {
    const p = coneGeo.attributes.position, col = [];
    for (let i = 0; i < p.count; i++) { const a = 1 + p.getY(i) / CONE_H; col.push(a, a * 0.95, a * 0.85); }
    coneGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }
  const coneMat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: true, toneMapped: false,
  });
  disposables.push(coneGeo, coneMat);

  const lights = [], cones = [];
  const DOWN = new THREE.Vector3(0, -1, 0);
  for (const [pos, aim] of LAMPS) {
    const g = new THREE.Group(); g.position.copy(pos); group.add(g);
    // 지상 조명탑이면 기둥
    if (pos.y < 25) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, pos.y, 8), poleMat);
      pole.position.y = -pos.y / 2; g.add(pole); disposables.push(pole.geometry);
    } else {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 6), poleMat);
      arm.position.y = -1.5; g.add(arm); disposables.push(arm.geometry);
    }
    const head = new THREE.Group(); g.add(head);
    head.lookAt(aim); // 조준 (월드 좌표)
    const box = new THREE.Mesh(headGeo, headMat); head.add(box);
    const lens = new THREE.Mesh(lensGeo, lensMat); lens.position.z = 0.36; head.add(lens);

    const L = new THREE.PointLight(0xfff0d6, 0, 120, 1.5); // 그림자 없음
    L.position.copy(aim.clone().sub(pos).normalize().multiplyScalar(2)); // 헤드 살짝 앞
    g.add(L); lights.push(L);

    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.quaternion.setFromUnitVectors(DOWN, aim.clone().sub(pos).normalize());
    cone.visible = false; cone.renderOrder = 5; g.add(cone); cones.push(cone);
    g.traverse((o) => { o.raycast = () => {}; });
  }

  // ---------- 상태 / 보간 ----------
  const target = { night: 0, warm: 0 };
  const cur = { night: 0, warm: 0 };
  let first = true;

  function apply() {
    const n = cur.night, w = cur.warm * (1 - n * 0.6);
    // 하늘·안개
    mix3('top', w, n, skyMat.uniforms.top.value);
    mix3('horizon', w, n, skyMat.uniforms.horizon.value);
    mix3('bottom', w, n, skyMat.uniforms.bottom.value);
    fog.color.copy(skyMat.uniforms.horizon.value);
    bgColor.copy(fog.color);
    fog.near = lerp(420, 320, n); fog.far = lerp(1600, 1150, n);
    starMat.opacity = Math.max(0, (n - 0.6) / 0.4) * 0.85;
    stars.visible = starMat.opacity > 0.01;
    // 반구광: 야간에도 원래의 45% 이상 유지 (충돌 색 가독성)
    if (hemi) {
      const base = prevLights.hemi.i;
      hemi.intensity = base * lerp(lerp(0.78, 0.7, w), 0.46, n);
      mix3('hemiSky', w, n, hemi.color);
      mix3('hemiGround', w, n, hemi.groundColor);
    }
    // 태양 → 노을 때 낮게, 밤엔 달빛
    if (sun) {
      const base = prevLights.sun.i;
      sun.intensity = base * lerp(lerp(0.9, 0.65, w), 0.12, n);
      mix3('sun', w, n, sun.color);
      sun.position.set(sunBasePos.x, lerp(sunBasePos.y, sunBasePos.y * 0.35, w * (1 - n)), sunBasePos.z);
    }
    renderer.toneMappingExposure = lerp(1.0, 1.08, n);
    // 환경맵: 반 넘으면 야간용으로 교체
    if (envDay && envNight) {
      const want = n > 0.5 ? envNight : envDay;
      if (scene.environment !== want && (scene.environment === envDay || scene.environment === envNight)) scene.environment = want;
    }
    // 투광등
    const on = Math.max(0, Math.min(1, (n - 0.25) / 0.6));
    for (const L of lights) L.intensity = 260 * on;
    lensMat.emissiveIntensity = 2.2 * on;
    coneMat.opacity = 0.16 * on;
    for (const c of cones) c.visible = on > 0.02;
  }

  function setActive({ t } = {}) {
    const [n, w] = sampleKeys(hourOf(t));
    target.night = n; target.warm = w;
    if (first) { cur.night = n; cur.warm = w; first = false; apply(); }
  }

  let pulse = 0;
  function update(sec = 0.016) {
    // 하늘 구·별은 카메라를 따라감 (항상 무한 원경)
    sky.position.copy(camera.position);
    stars.position.copy(camera.position);
    const k = 1 - Math.exp(-Math.min(0.1, sec) * 3);
    const dn = target.night - cur.night, dw = target.warm - cur.warm;
    if (Math.abs(dn) > 1e-4 || Math.abs(dw) > 1e-4) {
      cur.night += dn * k; cur.warm += dw * k; apply();
    }
    // 빛기둥 미세 일렁임 (값싼 연출)
    if (cones[0]?.visible) {
      pulse += sec;
      coneMat.opacity = 0.16 * Math.max(0, Math.min(1, (cur.night - 0.25) / 0.6)) * (0.92 + 0.08 * Math.sin(pulse * 1.7));
    }
  }

  function refresh() { tryTextureSlab(); }

  function dispose() {
    scene.remove(group);
    renderer.toneMapping = prev.toneMapping; renderer.toneMappingExposure = prev.exposure;
    renderer.outputColorSpace = prev.outputColorSpace;
    scene.background = prev.background; scene.fog = prev.fog; scene.environment = prev.environment;
    if (hemi && prevLights.hemi) { hemi.intensity = prevLights.hemi.i; hemi.color.copy(prevLights.hemi.c); hemi.groundColor.copy(prevLights.hemi.g); }
    if (sun && prevLights.sun) { sun.intensity = prevLights.sun.i; sun.color.copy(prevLights.sun.c); sun.position.copy(prevLights.sun.p); }
    for (const d of disposables) d.dispose?.();
  }

  apply(); // 첫 실제 시간이 오면 즉시 맞춤(first)
  tryTextureSlab();

  return {
    setActive, refresh, update, dispose,
    isNight: () => cur.night > 0.5,
    nightLevel: () => cur.night,
  };
}
