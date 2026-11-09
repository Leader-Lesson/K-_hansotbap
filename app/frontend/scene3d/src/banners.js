/* 한솥밥 3D · 구역 배너 (화면 좌우 가장자리 + 지시선)
   입력: setData({byZone}) 구역별 작업·판정 / setBarriers(list) 그 시각 출입 제한(app.js barrierList(t))
   → 출입 제한 구역 배너 아래에 빨간 꼬리표 「북·동 출입 금지 · HH:MM까지」 (권한과 무관하게 모두에게 보임) */
import * as THREE from 'three';
import { barrierText } from './theme.js';

// 판정별 배너 색
const STYLE = {
  PROHIBITED: { bg: '#c62828', fg: '#ffffff', line: '#c62828', mark: '◆', label: '금지' },
  CONDITIONAL: { bg: '#e67e00', fg: '#ffffff', line: '#e67e00', mark: '▲', label: '조건부' },
  DEFECT: { bg: '#6a4db2', fg: '#ffffff', line: '#4e3790', mark: '△', label: '결함' },
};
const NONE = { bg: 'rgba(250,248,244,0.94)', fg: '#3d3a36', line: '#8a857e', bar: '#9a958e' };

// 충돌 유형 짧은 이름
const SHORT_TYPE = {
  SAME_ZONE_TIME: '같은 시간·구역', VERTICAL: '위아래', HOT_GAS: '화기×가스',
  SEQUENCE: '순서 위반', STANDARD: '단계 누락',
};

const EDGE = 16, W = 228, TOP = 60, BOTTOM = 40, GAP = 8, ELBOW = 26;
const SVGNS = 'http://www.w3.org/2000/svg';

const CSS = `
.bn-layer{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5}
.bn-svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.bn-svg polyline{fill:none;stroke-width:1.6;stroke-linejoin:round;transition:stroke-width .15s,opacity .2s}
.bn-svg circle{transition:r .15s,opacity .2s;stroke:#fff;stroke-width:1.5}
.bn-svg .bn-hot polyline{stroke-width:3.2}
.bn-svg .bn-hot circle{r:7}
.bn{position:absolute;left:0;top:0;width:${W}px;box-sizing:border-box;pointer-events:auto;cursor:pointer;
  font-family:"Malgun Gothic",system-ui,sans-serif;border-radius:8px;padding:7px 10px 7px 16px;
  box-shadow:0 2px 8px rgba(0,0,0,.18);will-change:transform;transition:opacity .2s,box-shadow .15s;
  overflow:hidden;user-select:none;line-height:1.35}
.bn::before{content:"";position:absolute;left:0;top:0;bottom:0;width:6px;background:var(--bn-bar)}
.bn:hover{box-shadow:0 4px 14px rgba(0,0,0,.28)}
.bn-l1{display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden}
.bn-chip{flex:none;font-size:12px;font-weight:700;padding:1px 6px;border-radius:5px;background:rgba(255,255,255,.25)}
.bn-name{font-size:16px;font-weight:700;overflow:hidden;text-overflow:ellipsis}
.bn-l2{font-size:13px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.95}
.bn-l2 b{font-size:15px}
.bn-ban{display:block;margin:5px 0 1px;padding:2px 7px;border-radius:5px;background:#c62828;color:#fff;
  font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bn-ban::before{content:"";display:inline-block;width:8px;height:8px;margin-right:5px;border-radius:50%;background:currentColor;vertical-align:1px}
.bn-ban-inv{background:#fff;color:#c62828}
.bn-sel{outline:3px solid #222;outline-offset:2px;z-index:2}
.bn-dim{opacity:.25}
.bn-pulse{animation:bn-glow 1.6s ease-in-out infinite}
@keyframes bn-glow{0%,100%{box-shadow:0 2px 8px rgba(198,40,40,.35)}50%{box-shadow:0 0 0 4px rgba(198,40,40,.28),0 0 16px rgba(198,40,40,.55)}}
`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function buildBanners({ container, camera, renderer, furnace, zones, onZoneClick }) {
  // 스타일 1회 주입
  let styleEl = document.getElementById('bn-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'bn-style';
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }

  const layer = document.createElement('div');
  layer.className = 'bn-layer';
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'bn-svg');
  layer.appendChild(svg);
  container.appendChild(layer);

  const zoneName = new Map((zones || []).map((z) => [z.id, z.name]));
  const items = new Map(); // zoneId → {el, g, line, dot, key, h, ...}
  let byZone = new Map();
  let barByZone = new Map(); // zoneId → 출입 제한 한 항목 {blocked, center, until, …}
  let visible = new Set();
  let focus = null;
  let enabled = true;
  const v = new THREE.Vector3();
  const axisV = new THREE.Vector3();

  function getItem(id) {
    let it = items.get(id);
    if (it) return it;
    const el = document.createElement('div');
    el.className = 'bn';
    el.dataset.zone = id;
    const g = document.createElementNS(SVGNS, 'g');
    const line = document.createElementNS(SVGNS, 'polyline');
    const dot = document.createElementNS(SVGNS, 'circle');
    dot.setAttribute('r', '4.5');
    g.append(line, dot);
    el.style.display = 'none';
    g.style.display = 'none';
    svg.appendChild(g);
    layer.appendChild(el);
    // 클릭 · 호버
    el.addEventListener('click', (e) => { e.stopPropagation(); onZoneClick && onZoneClick(id); });
    el.addEventListener('pointerenter', () => g.classList.add('bn-hot'));
    el.addEventListener('pointerleave', () => g.classList.remove('bn-hot'));
    it = { el, g, line, dot, key: '', h: 52, cls: '', shown: false };
    items.set(id, it);
    return it;
  }

  // 내용이 바뀔 때만 innerHTML 갱신
  function render(id, it) {
    const d = byZone.get(id) || {};
    const st = STYLE[d.worst] || null;
    const name = d.name || zoneName.get(id) || id;
    const type = d.topType ? (SHORT_TYPE[d.topType] || d.topType) : '';
    const ban = barrierText(barByZone.get(id));
    const key = [name, d.crew, d.taskCount, d.worst, type, ban].join('|');
    if (key === it.key) return;
    it.key = key;
    const c = st || NONE;
    it.el.style.background = c.bg;
    it.el.style.color = c.fg;
    it.el.style.setProperty('--bn-bar', st ? 'rgba(0,0,0,.22)' : NONE.bar);
    it.color = c.line;
    it.line.setAttribute('stroke', c.line);
    it.dot.setAttribute('fill', c.line);
    it.pulse = d.worst === 'PROHIBITED';
    const chip = st ? `<span class="bn-chip">${st.mark} ${st.label}</span>` : '';
    const crewTxt = d.crew == null ? (d.crewHidden ? '인원 비공개' : '인원 미기재') : `인원 <b>${d.crew}</b>명`;   // 권한 밖(다른 업체) 작업은 인원 숨김
    const l2 = `작업 ${d.taskCount ?? 0}건 · ${crewTxt}${type ? ` · ${esc(type)}` : ''}`;
    // 출입 금지 꼬리표: 빨간 배너(금지) 위에서는 흰 바탕·빨간 글자로 뒤집어 보이게
    const banHtml = ban ? `<div class="bn-ban${d.worst === 'PROHIBITED' ? ' bn-ban-inv' : ''}">${esc(ban)}</div>` : '';
    it.el.innerHTML = `<div class="bn-l1">${chip}<span class="bn-name">${esc(name)}</span></div><div class="bn-l2">${l2}</div>${banHtml}`;
    it.el.title = ban ? `${name} · ${ban}` : name;
    it.hdirty = true; // 높이는 보일 때 다시 잼
  }

  function setShown(it, on) {
    if (it.shown === on) return;
    it.shown = on;
    it.el.style.display = on ? '' : 'none';
    it.g.style.display = on ? '' : 'none';
  }

  // 겹침 해소: 위→아래로 밀고, 넘치면 아래→위로 밀기
  function stack(col, H) {
    col.sort((a, b) => a.ay - b.ay);
    let y = TOP;
    for (const c of col) {
      c.top = Math.max(c.ay - c.h / 2, y);
      y = c.top + c.h + GAP;
    }
    let lim = H - BOTTOM;
    for (let i = col.length - 1; i >= 0; i--) {
      const c = col[i];
      if (c.top + c.h > lim) c.top = lim - c.h;
      lim = c.top - GAP;
    }
    for (const c of col) c.top = Math.max(TOP, c.top);
  }

  function update() {
    if (!enabled) return;
    const W0 = container.clientWidth, H0 = container.clientHeight;
    if (!W0 || !H0) return;
    furnace.root?.updateMatrixWorld?.(true);
    const many = visible.size > 6;
    const related = new Set(focus?.relatedIds || []);
    const left = [], right = [];

    for (const [id, it] of items) {
      if (!visible.has(id)) { setShown(it, false); continue; }
      const p = furnace.zoneAnchor(id);
      if (!p) { setShown(it, false); continue; }
      v.copy(p).project(camera);
      if (v.z > 1 || v.z < -1) { setShown(it, false); continue; } // 카메라 뒤
      // 포커스 상태
      let cls = 'bn';
      let hide = false;
      if (focus && focus.zoneId) {
        if (id === focus.zoneId) cls += ' bn-sel';
        else if (!related.has(id)) { if (many) hide = true; else cls += ' bn-dim'; }
      }
      if (hide) { setShown(it, false); continue; }
      if (it.pulse && !cls.includes('bn-dim')) cls += ' bn-pulse';
      if (cls !== it.cls) {
        it.cls = cls;
        it.el.className = cls;
        it.g.style.opacity = cls.includes('bn-dim') ? '0.25' : '1';
      }
      setShown(it, true);
      if (it.hdirty) { it.h = it.el.offsetHeight || 52; it.hdirty = false; }
      const ax = (v.x * 0.5 + 0.5) * W0, ay = (-v.y * 0.5 + 0.5) * H0;
      // 고로 축(x=0,z=0) 투영 기준으로 좌우 배정
      axisV.set(0, p.y, 0).project(camera);
      const cx = (axisV.x * 0.5 + 0.5) * W0;
      const mid = Number.isFinite(cx) && cx > W0 * 0.2 && cx < W0 * 0.8 ? cx : W0 / 2;
      (ax < mid ? left : right).push({ id, it, ax, ay, h: it.h, dx: ax - mid });
    }
    // 한쪽에 몰리면 가운데에 가까운 것부터 반대편으로 옮겨 좌우 개수를 고르게
    while (Math.abs(left.length - right.length) > 1) {
      const [from, to] = left.length > right.length ? [left, right] : [right, left];
      let k = 0;
      from.forEach((b, i) => { if (Math.abs(b.dx) < Math.abs(from[k].dx)) k = i; });
      to.push(from.splice(k, 1)[0]);
    }

    stack(left, H0);
    stack(right, H0);

    const place = (col, isLeft) => {
      for (const c of col) {
        const bx = isLeft ? EDGE : W0 - EDGE - W;
        c.it.el.style.transform = `translate(${bx}px,${c.top}px)`;
        // 지시선: 배너 옆 → 꺾임 → 앵커
        const ex = isLeft ? EDGE + W : W0 - EDGE - W;
        const ey = c.top + Math.min(c.h / 2, 22);
        const kx = isLeft ? ex + ELBOW : ex - ELBOW;
        c.it.line.setAttribute('points', `${ex},${ey} ${kx},${ey} ${c.ax.toFixed(1)},${c.ay.toFixed(1)}`);
        c.it.dot.setAttribute('cx', c.ax.toFixed(1));
        c.it.dot.setAttribute('cy', c.ay.toFixed(1));
      }
    };
    place(left, true);
    place(right, false);
  }

  return {
    setData({ byZone: m }) {
      byZone = m instanceof Map ? m : new Map(Object.entries(m || {}));
      for (const id of byZone.keys()) render(id, getItem(id));
      for (const id of visible) render(id, getItem(id));
    },
    /* 그 시각 출입 제한 목록 [{zoneId, blocked:['N',…], center, until:'HH:MM', …}] — 바뀐 구역만 다시 그림(render가 key로 비교) */
    setBarriers(list) {
      const prev = barByZone;
      barByZone = new Map((list || []).map((b) => [b.zoneId, b]));
      for (const id of new Set([...prev.keys(), ...barByZone.keys()])) render(id, getItem(id));
    },
    setVisibleZones(ids) {
      visible = new Set(ids || []);
      for (const id of visible) render(id, getItem(id));
    },
    setFocus(f) {
      focus = f && f.zoneId ? f : null;
    },
    setEnabled(b) {
      enabled = !!b;
      layer.style.display = enabled ? '' : 'none';
    },
    update,
    dispose() {
      layer.remove();
      items.clear();
    },
  };
}
