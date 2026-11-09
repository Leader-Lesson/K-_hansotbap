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

export function renderFloorPlan(container, opts = {}) {
  const {
    level = 0, zones = [], tasks = [], conflicts = [], companies = [],
    selectedZoneId = null, onZoneClick, onConflictClick,
  } = opts;
  const uid = 'p2d' + (++UID);
  container.innerHTML = '';

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

  // 제목 / 태그
  txt(svg, 24, 40, `${level}층 · ${FLOOR_NAME[level] || ''} 평면`, { 'font-size': 24, 'font-weight': 700 });
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
  txt(ng, 84, 540, '출선구 방향 ↑', { 'font-size': 15, 'font-weight': 700 });
  txt(ng, 84, 560, '개략도 · 축척 없음', { 'font-size': 15, fill: SUB });

  container.appendChild(svg);
  return {
    destroy() {
      cleanups.forEach((f) => f());
      cleanups.length = 0;
      if (svg.parentNode) svg.parentNode.removeChild(svg);
    },
  };
}
