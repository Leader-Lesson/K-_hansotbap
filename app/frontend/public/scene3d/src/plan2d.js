// 층별 2D 평면도 (SVG) — 라이브러리 없음
// theme.js 가 아직 없을 수 있으므로 동적 import + 기본값으로 대체
let THEME = {};
try { THEME = await import('./theme.js'); } catch (e) { THEME = {}; }

const SEV_DEFAULT = {
  PROHIBITED: { color: '#c62828', label: '금지', mark: '◆' },
  CONDITIONAL: { color: '#e08a00', label: '조건부', mark: '▲' },
  DEFECT: { color: '#6a4db2', label: '결함', mark: '△' },
};
const SEV = { ...SEV_DEFAULT, ...(THEME.SEV || {}) };
const ZONE_COLOR = THEME.ZONE_COLOR || {};
const SEV_ORDER = ['PROHIBITED', 'CONDITIONAL', 'DEFECT'];
const FALLBACK_FILL = ['#dfe9f3', '#e6f0e1', '#f3eadb', '#ece3f1', '#e2eeee', '#f2e2e2'];

const FLOOR_NAME = {
  6: '노정', 5: '상부(노흉)', 4: '중부(벨리·보시)', 3: '풍구',
  2: '노저', 1: '주상', 0: '부대설비',
};

const NS = 'http://www.w3.org/2000/svg';
const INK = '#263238';
const SUB = '#5f6b73';
const FONT = "'Pretendard','Malgun Gothic','Apple SD Gothic Neo',sans-serif";
let UID = 0;

function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function txt(parent, x, y, s, attrs = {}) {
  const t = el('text', { x, y, 'font-family': FONT, fill: INK, 'font-size': 16, ...attrs }, parent);
  t.textContent = s;
  return t;
}
// 링(도넛) 경로
function ringPath(cx, cy, r1, r2) {
  const c = (r) => `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0 Z`;
  return c(r2) + ' ' + c(r1);
}

// 층별 도형 정의: 구역 id → { shapes:[{tag,attrs}], card:{x,y,w,center?}, leader? }
function layoutFor(level) {
  const cx = 400, cy = 330;
  const deco = []; // 비구역 장식 (클릭 없음)
  const Z = {};
  const inCard = { x: cx - 90, y: cy - 62, w: 180, center: true };
  const outCard = { x: 612, y: 120, w: 176 };
  if (level === 6) {
    Z.TOP = {
      shapes: [
        { tag: 'rect', attrs: { x: 210, y: 150, width: 360, height: 360, rx: 6 } },
      ],
      card: { x: 612, y: 150, w: 176 },
      leader: [570, 200],
      center: [390, 330],
    };
    deco.push(['circle', { cx: 390, cy: 330, r: 82, fill: '#ffffff', stroke: SUB, 'stroke-width': 2 }]);
    deco.push(['circle', { cx: 390, cy: 330, r: 34, fill: 'none', stroke: SUB, 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }]);
    deco.push(['label', 390, 326, '노정 장입설비', { 'text-anchor': 'middle', 'font-size': 15, fill: SUB }]);
    deco.push(['label', 390, 346, '(벨리스 탑)', { 'text-anchor': 'middle', 'font-size': 15, fill: SUB }]);
  } else if (level >= 3 && level <= 5) {
    const ids = { 5: ['IN-UP', 'EX-UP'], 4: ['IN-MID', 'EX-MID'], 3: ['IN-TUY', 'EX-TUY'] }[level];
    Z[ids[1]] = {
      shapes: [{ tag: 'path', attrs: { d: ringPath(cx, cy, 112, 205), 'fill-rule': 'evenodd' } }],
      card: outCard,
      leader: [cx + 150 * Math.cos(-0.6), cy + 150 * Math.sin(-0.6)],
    };
    Z[ids[0]] = { shapes: [{ tag: 'circle', attrs: { cx, cy, r: 112 } }], card: inCard };
    if (level === 3) {
      // 환상관(bustle pipe) + 풍구 20개
      deco.push(['circle', { cx, cy, r: 178, fill: 'none', stroke: '#7d8a92', 'stroke-width': 6, opacity: 0.55 }]);
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        deco.push(['line', {
          x1: cx + 112 * Math.cos(a), y1: cy + 112 * Math.sin(a),
          x2: cx + 172 * Math.cos(a), y2: cy + 172 * Math.sin(a),
          stroke: '#5f6b73', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.7,
        }]);
      }
      deco.push(['label', cx, cy + 228, '환상관 · 풍구 20개', { 'text-anchor': 'middle', 'font-size': 15, fill: SUB }]);
    }
  } else if (level === 2) {
    Z['IN-HEARTH'] = { shapes: [{ tag: 'circle', attrs: { cx, cy, r: 160 } }], card: inCard };
    // 출선구 표시
    [Math.PI * 0.75, Math.PI * 0.25, -Math.PI * 0.5].forEach((a, i) => {
      const x = cx + 172 * Math.cos(a), y = cy + 172 * Math.sin(a);
      deco.push(['rect', { x: x - 9, y: y - 9, width: 18, height: 18, fill: '#455a64', transform: `rotate(45 ${x} ${y})` }]);
      deco.push(['label', x, y + (Math.sin(a) > 0 ? 32 : -18), `출선구 ${i + 1}`, { 'text-anchor': 'middle', 'font-size': 15, fill: SUB }]);
    });
  } else if (level === 1) {
    Z.CAST = {
      shapes: [{ tag: 'rect', attrs: { x: 90, y: 110, width: 620, height: 440, rx: 6 } }],
      card: { x: 112, y: 132, w: 186 },
      center: [470, 300],   // 출입 제한 방위는 고로 기초 중심 기준
    };
    const bx = 470, by = 300;
    deco.push(['circle', { cx: bx, cy: by, r: 95, fill: '#ffffff', stroke: SUB, 'stroke-width': 2 }]);
    deco.push(['label', bx, by + 5, '고로 기초', { 'text-anchor': 'middle', 'font-size': 15, fill: SUB }]);
    // 출선구 → 탕도 2줄
    [[bx - 67, by + 67, 220, 530], [bx + 67, by + 67, 690, 530]].forEach(([x1, y1, x2, y2], i) => {
      deco.push(['polyline', { points: `${x1},${y1} ${x1 + (x2 > x1 ? 40 : -40)},${y1 + 60} ${x2},${y2}`, fill: 'none', stroke: '#8d6e63', 'stroke-width': 8, 'stroke-linejoin': 'round', opacity: 0.75 }]);
      deco.push(['rect', { x: x1 - 8, y: y1 - 8, width: 16, height: 16, fill: '#455a64' }]);
      deco.push(['label', x2 + (i ? -60 : 60), y2 - 12, `탕도 ${i + 1}`, { 'text-anchor': 'middle', 'font-size': 15, fill: SUB }]);
    });
  } else if (level === 0) {
    Z.STOVE = {
      shapes: [70, 160, 250].map((x) => ({ tag: 'circle', attrs: { cx: x + 10, cy: 210, r: 40 } })),
      card: { x: 40, y: 285, w: 200 },
    };
    Z.GAS = {
      shapes: [
        { tag: 'circle', attrs: { cx: 430, cy: 210, r: 58 } },
        { tag: 'rect', attrs: { x: 300, y: 202, width: 72, height: 16 } }, // 배관
      ],
      card: { x: 330, y: 300, w: 200 },
    };
    Z.ELEC = {
      shapes: [{ tag: 'rect', attrs: { x: 570, y: 150, width: 190, height: 120, rx: 4 } }],
      card: { x: 570, y: 300, w: 190 },
    };
  }
  return { Z, deco };
}

/* 화면 각도: 위=북(-90°), 오른쪽=동, 아래=남, 왼쪽=서 — 3D(x=r·sinφ, z=r·cosφ, 남=+z)를 위에서 본 것과 같음 */
const DIR_SCREEN = { N: -90, E: 0, S: 90, W: 180 };
const DIR_ONE = { N: '북', E: '동', S: '남', W: '서' };
const DIR_KO = { N: '북쪽', E: '동쪽', S: '남쪽', W: '서쪽' };
function shapeGeom(sh) {
  const a = sh.attrs;
  if (sh.tag === 'circle') return { x: +a.cx, y: +a.cy, r: +a.r };
  if (sh.tag === 'rect') return { x: +a.x + a.width / 2, y: +a.y + a.height / 2, r: Math.min(a.width, a.height) / 2 };
  return { x: 400, y: 330, r: 205 };   // 링(path)은 노 중심
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const whereOf = (r) => (r.blocked.length === 4 ? '전 구역' : r.blocked.length ? r.blocked.map((d) => DIR_KO[d]).join('·') : r.center ? '중앙부' : '');
function sideHtml(now, restr, tl) {
  let h = `<h3>${esc(now)} · 지금 이 층에서 하면 안 되는 곳</h3>`;
  if (!restr.length) h += '<p class="p2-ok">지금은 출입 제한이 없습니다. 아래 시간표에서 다른 시간대를 눌러 보세요.</p>';
  restr.forEach((r) => {
    const ban = r.items.some((i) => i.level === 'ban');
    h += `<div class="p2-card ${ban ? 'ban' : 'cau'}"><div class="p2-hd" data-z="${esc(r.zoneId)}"><b>${esc(r.zoneName)}</b><span class="p2-tag">${ban ? `${esc(whereOf(r))} 출입 금지` : '주의'}</span><span class="p2-until">~${esc(r.until)}</span></div>`;
    r.items.forEach((i) => {
      h += `<div class="p2-it"><div class="p2-why"><span class="p2-k">${i.level === 'ban' ? '금지 이유' : '주의'}</span> ${esc(i.who)} 작업 중${i.why ? ` — ${esc(i.why)}` : ''}</div>`;
      if (i.accident) h += `<div class="p2-acc"><span class="p2-k">사고</span> <b>${esc(i.accident.name)}</b> · ${esc(i.accident.text)}</div>`;
      h += '</div>';
    });
    h += `<div class="p2-adv">→ ${esc(r.advice)}</div></div>`;
  });
  h += '<h3>오늘 시간대별 출입 제한 <small>(누르면 그 시각으로)</small></h3>';
  if (!tl.length) h += '<p class="p2-ok">이 층은 오늘 출입 제한이 없습니다.</p>';
  else h += '<ol class="p2-tl">' + tl.map((r) => `<li class="${r.active ? 'on' : ''}" data-t="${esc(r.start)}"><span class="p2-t">${esc(r.startLabel)}–${esc(r.endLabel)}</span><span><b>${esc(r.zoneName)}</b> ${esc(whereOf(r))} 금지<br><small>${esc(r.who)}${r.accidentName ? ` · ${esc(r.accidentName)} 위험` : ''}</small></span></li>`).join('') + '</ol>';
  return h;
}
let styled = false;
function ensureStyle() {
  if (styled) return; styled = true;
  const st = document.createElement('style');
  st.textContent = `.p2-grid{display:flex;height:100%;min-height:0}.p2-svg{flex:1;min-width:0}
.p2-side{width:360px;flex:none;overflow:auto;border-left:1px solid #dde2e6;background:#fff;padding:12px 14px;font-size:14px;line-height:1.5;color:#263238}
.p2-side h3{font-size:15px;margin:14px 0 8px}.p2-side h3:first-child{margin-top:2px}.p2-side h3 small{font-weight:400;color:#5f6b73}
.p2-ok{color:#5f6b73;margin:0 0 8px}
.p2-card{border:1px solid #e3e7ea;border-left:5px solid #c62828;border-radius:8px;padding:8px 10px;margin-bottom:10px}.p2-card.cau{border-left-color:#e67e00}
.p2-hd{display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:4px;flex-wrap:wrap}.p2-tag{background:#c62828;color:#fff;border-radius:999px;padding:1px 8px;font-size:12.5px;font-weight:700}.p2-card.cau .p2-tag{background:#e67e00}
.p2-until{margin-left:auto;color:#5f6b73;font-size:13px}
.p2-it{padding:4px 0;border-top:1px dashed #e3e7ea}.p2-k{display:inline-block;font-size:12px;font-weight:700;color:#5f6b73;border:1px solid #cfd6db;border-radius:4px;padding:0 4px;margin-right:2px}
.p2-acc{margin-top:3px}.p2-acc b{color:#b71c1c}.p2-adv{margin-top:6px;font-weight:700;color:#1b5e20}
.p2-tl{list-style:none;margin:0;padding:0}.p2-tl li{display:flex;gap:10px;padding:6px;border-radius:6px;cursor:pointer}.p2-tl li:hover{background:#f3f5f7}.p2-tl li.on{background:#fdecea}
.p2-t{font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:700;min-width:92px}.p2-tl small{color:#5f6b73}
.p2-grid.narrow{flex-direction:column;height:auto}.p2-grid.narrow .p2-svg{height:420px;flex:none}.p2-grid.narrow .p2-side{width:auto;border-left:0;border-top:1px solid #dde2e6}
@media (max-width:900px){.p2-grid{flex-direction:column}.p2-side{width:auto;border-left:0;border-top:1px solid #dde2e6;max-height:45%}}`;
  document.head.appendChild(st);
}

export function renderFloorPlan(container, opts = {}) {
  const {
    level = 0, zones = [], tasks = [], conflicts = [], companies = [],
    selectedZoneId = null, onZoneClick, onConflictClick,
    now = '', restrictions = [], timeline = [], onTimeClick,
  } = opts;
  const uid = 'p2d' + (++UID);
  container.innerHTML = '';
  ensureStyle();
  const grid = document.createElement('div'); grid.className = 'p2-grid';
  const host = document.createElement('div'); host.className = 'p2-svg';
  const aside = document.createElement('aside'); aside.className = 'p2-side';
  grid.append(host, aside);

  const svg = el('svg', {
    viewBox: '0 0 800 600', width: '100%', height: '100%',
    preserveAspectRatio: 'xMidYMid meet', role: 'img',
    'aria-label': `${level}층 평면도`, style: 'display:block;background:#fafaf7',
  });
  const defs = el('defs', {}, svg);
  // 심각도별 빗금 패턴
  for (const k of SEV_ORDER) {
    const p = el('pattern', { id: `${uid}-h-${k}`, width: 12, height: 12, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('rect', { width: 12, height: 12, fill: SEV[k].color, opacity: 0.08 }, p);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 12, stroke: SEV[k].color, 'stroke-width': 3, opacity: 0.45 }, p);
  }

  {
    const p = el('pattern', { id: `${uid}-ban`, width: 10, height: 10, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-45)' }, defs);
    el('rect', { width: 10, height: 10, fill: '#c62828', opacity: 0.16 }, p);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 10, stroke: '#c62828', 'stroke-width': 4, opacity: 0.55 }, p);
  }

  // 제목 / 태그
  txt(svg, 24, 40, `${level}층 · ${FLOOR_NAME[level] || ''} 평면`, { 'font-size': 24, 'font-weight': 700 });
  if (now) txt(svg, 24, 66, `${now} 기준 출입 제한`, { 'font-size': 16, fill: SUB });
  const tg = el('g', {}, svg);
  el('rect', { x: 690, y: 18, width: 90, height: 28, rx: 14, fill: '#eceff1' }, tg);
  txt(tg, 735, 38, '합성 데이터', { 'text-anchor': 'middle', 'font-size': 15, fill: SUB });

  const { Z, deco } = layoutFor(level);
  const levelZones = zones.filter((z) => Number(z.level) === Number(level));
  const compById = Object.fromEntries(companies.map((c) => [c.id, c]));

  const zoneLayer = el('g', {}, svg);
  const decoLayer = el('g', { 'pointer-events': 'none' }, svg);
  const cardLayer = el('g', {}, svg);

  const cleanups = [];
  const on = (node, ev, fn) => { node.addEventListener(ev, fn); cleanups.push(() => node.removeEventListener(ev, fn)); };

  levelZones.forEach((z, zi) => {
    const L = Z[z.id];
    if (!L) return;
    const fill = ZONE_COLOR[z.id] || FALLBACK_FILL[zi % FALLBACK_FILL.length];
    const zt = tasks.filter((t) => (t.zone_ids || []).includes(z.id));
    const zc = conflicts.filter((c) => (c.zone_ids || []).includes(z.id));
    const worst = SEV_ORDER.find((k) => zc.some((c) => c.severity === k));
    const selected = selectedZoneId === z.id;

    const g = el('g', { style: 'cursor:pointer', 'data-zone': z.id }, zoneLayer);
    const ttl = el('title', {}, g); ttl.textContent = z.name;
    for (const s of L.shapes) {
      el(s.tag, { ...s.attrs, fill, stroke: '#90a4ae', 'stroke-width': 1.5 }, g);
      if (worst) el(s.tag, { ...s.attrs, fill: `url(#${uid}-h-${worst})`, stroke: SEV[worst].color, 'stroke-width': 4 }, g);
      if (selected) el(s.tag, { ...s.attrs, fill: 'none', stroke: '#1b1b1b', 'stroke-width': 6 }, g);
    }
    on(g, 'click', () => onZoneClick && onZoneClick(z.id));

    // 정보 카드
    const crew = zt.reduce((a, t) => a + (Number(t.crew) || 0), 0);
    const byComp = new Map();
    zt.forEach((t) => byComp.set(t.company_id, (byComp.get(t.company_id) || 0) + (Number(t.crew) || 0)));
    const chips = [...byComp.entries()].sort((a, b) => b[1] - a[1]);
    const shown = chips.slice(0, 4);
    const more = chips.length - shown.length;
    const rows = shown.length + (more > 0 ? 1 : 0);
    const { x, y, w, center } = L.card;
    const h = 62 + rows * 22 + 8;

    if (L.leader) {
      el('line', { x1: L.leader[0], y1: L.leader[1], x2: x, y2: y + 20, stroke: '#78909c', 'stroke-width': 1.5, 'stroke-dasharray': '4 3', 'pointer-events': 'none' }, cardLayer);
    }
    const cg = el('g', { style: 'cursor:pointer' }, cardLayer);
    on(cg, 'click', () => onZoneClick && onZoneClick(z.id));
    el('rect', {
      x, y, width: w, height: h, rx: 8, fill: '#ffffff', 'fill-opacity': center ? 0.88 : 0.96,
      stroke: selected ? '#1b1b1b' : '#b0bec5', 'stroke-width': selected ? 3 : 1,
    }, cg);
    const tx = x + 12;
    txt(cg, tx, y + 24, z.name, { 'font-size': 17, 'font-weight': 700 });
    const ct = txt(cg, tx, y + 50, '', { 'font-size': 16 });
    const b = el('tspan', { 'font-weight': 700, 'font-size': 18 }, ct); b.textContent = `${crew}명`;
    const r = el('tspan', { fill: SUB }, ct); r.textContent = z.cap != null ? ` / 적정 ${z.cap}` : '';
    shown.forEach(([cid, n], i) => {
      const c = compById[cid] || { name: cid, color: '#9e9e9e' };
      const yy = y + 66 + i * 22;
      el('rect', { x: tx, y: yy + 3, width: 13, height: 13, rx: 2, fill: c.color || '#9e9e9e' }, cg);
      txt(cg, tx + 20, yy + 15, `${c.name} ${n}명`, { 'font-size': 15 });
    });
    if (more > 0) txt(cg, tx, y + 66 + shown.length * 22 + 15, `+${more}개사`, { 'font-size': 15, fill: SUB });

    // 위험 배지 (심각도별 1개, 클릭 → 해당 심각도의 첫 충돌)
    let bx = x;
    SEV_ORDER.forEach((k) => {
      const list = zc.filter((c) => c.severity === k);
      if (!list.length) return;
      const label = `${SEV[k].mark} ${SEV[k].label} ${list.length}`;
      const bw = 18 + label.length * 13;
      const bg = el('g', { style: 'cursor:pointer' }, cardLayer);
      const bt = el('title', {}, bg); bt.textContent = list.map((c) => c.title).join('\n');
      el('rect', { x: bx, y: y - 34, width: bw, height: 28, rx: 14, fill: SEV[k].color }, bg);
      txt(bg, bx + bw / 2, y - 14, label, { 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, fill: '#ffffff' });
      on(bg, 'click', (e) => { e.stopPropagation(); onConflictClick && onConflictClick(list[0].id); });
      bx += bw + 6;
    });
  });

  // 출입 제한 (막힌 방위 부채꼴 + 경계 안전띠)
  const banLayer = el('g', { 'pointer-events': 'none' }, svg);
  svg.insertBefore(banLayer, decoLayer);
  const banLabels = el('g', { 'pointer-events': 'none' }, svg);   // 글씨는 카드·장식 위
  restrictions.forEach((r, ri) => {
    const L = Z[r.zoneId];
    if (!L || (!r.blocked.length && !r.center)) return;
    L.shapes.forEach((sh, si) => {
      const gm = shapeGeom(sh), [ox, oy] = L.center && L.shapes.length === 1 ? L.center : [gm.x, gm.y], rad = gm.r;
      const cid = `${uid}-c${ri}-${si}`, cp = el('clipPath', { id: cid }, defs);
      el(sh.tag, { ...sh.attrs, 'clip-rule': 'evenodd' }, cp);
      const g = el('g', { 'clip-path': `url(#${cid})` }, banLayer);
      const R = 900;
      r.blocked.forEach((d) => {
        const a = DIR_SCREEN[d], p = (deg) => [ox + R * Math.cos(deg * Math.PI / 180), oy + R * Math.sin(deg * Math.PI / 180)];
        const [x0, y0] = p(a - 45), [x1, y1] = p(a + 45);
        el('path', { d: `M${ox},${oy} L${x0},${y0} L${x1},${y1} Z`, fill: `url(#${uid}-ban)` }, g);
      });
      if (r.center) el('circle', { cx: ox, cy: oy, r: rad * 0.45, fill: `url(#${uid}-ban)` }, g);
      // 허용·금지 경계 = 안전띠
      ['N', 'E', 'S', 'W'].forEach((d, i, A) => {
        const nx = A[(i + 1) % 4];
        if (r.blocked.includes(d) === r.blocked.includes(nx)) return;
        const deg = (DIR_SCREEN[d] + 45) * Math.PI / 180, x2 = ox + R * Math.cos(deg), y2 = oy + R * Math.sin(deg);
        el('line', { x1: ox, y1: oy, x2, y2, stroke: '#ffffff', 'stroke-width': 7 }, g);
        el('line', { x1: ox, y1: oy, x2, y2, stroke: '#d32f2f', 'stroke-width': 7, 'stroke-dasharray': '10 8' }, g);
      });
      r.blocked.forEach((d) => {
        const a = DIR_SCREEN[d] * Math.PI / 180, rr = sh.tag === 'path' ? 160 : rad * 0.66;
        const lx = ox + rr * Math.cos(a), ly = oy + rr * Math.sin(a);
        el('rect', { x: lx - 30, y: ly - 13, width: 60, height: 24, rx: 12, fill: '#c62828' }, banLabels);
        txt(banLabels, lx, ly + 5, `${DIR_ONE[d]} 금지`, { 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, fill: '#fff' });
      });
    });
  });

  // 장식
  for (const d of deco) {
    if (d[0] === 'label') txt(decoLayer, d[1], d[2], d[3], d[4]);
    else el(d[0], d[1], decoLayer);
  }

  if (!levelZones.some((z) => Z[z.id])) {
    txt(svg, 400, 320, '이 층에 표시할 구역이 없습니다', { 'text-anchor': 'middle', 'font-size': 18, fill: SUB });
  }

  // 출선구 방향 표시 + 축척 안내
  const ng = el('g', { 'pointer-events': 'none' }, svg);
  el('circle', { cx: 50, cy: 545, r: 24, fill: '#ffffff', stroke: '#90a4ae' }, ng);
  el('path', { d: 'M50,527 L60,553 L50,547 L40,553 Z', fill: INK }, ng);
  txt(ng, 50, 517, '북', { 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700 });
  txt(ng, 84, 540, '위쪽이 북 (3D 방위와 같음)', { 'font-size': 15, 'font-weight': 700 });
  txt(ng, 84, 560, '개략도 · 축척 없음', { 'font-size': 15, fill: SUB });
  const lg = el('g', { 'pointer-events': 'none' }, svg);
  el('rect', { x: 560, y: 546, width: 26, height: 18, fill: `url(#${uid}-ban)`, stroke: '#c62828' }, lg);
  txt(lg, 592, 560, '출입 금지', { 'font-size': 14 });
  el('line', { x1: 672, y1: 555, x2: 700, y2: 555, stroke: '#d32f2f', 'stroke-width': 6, 'stroke-dasharray': '8 5' }, lg);
  txt(lg, 706, 560, '안전띠·콘', { 'font-size': 14 });

  host.appendChild(svg);
  aside.innerHTML = sideHtml(now, restrictions, timeline);
  const onAside = (e) => {
    const t = e.target.closest('[data-t]'); if (t && onTimeClick) { onTimeClick(t.dataset.t); return; }
    const z = e.target.closest('[data-z]'); if (z && onZoneClick) onZoneClick(z.dataset.z);
  };
  aside.addEventListener('click', onAside); cleanups.push(() => aside.removeEventListener('click', onAside));
  container.appendChild(grid);
  grid.classList.toggle('narrow', container.clientWidth < 820);   // 화면이 좁으면 설명을 도면 아래로
  return {
    destroy() {
      cleanups.forEach((f) => f());
      cleanups.length = 0;
      if (grid.parentNode) grid.parentNode.removeChild(grid);
    },
  };
}
