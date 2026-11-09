/* 한솥밥 3D · 교대(주간조·야간조) · 인계 문서 · 잔업 계획서
   고로 개수는 24시간 2교대: 주간조 07:00–19:00, 야간조 19:00–07:00.
   각 조 마지막 30분(18:30–19:00, 06:30–07:00)은 인계 시간 — 나가는 조가 인계 문서를 정리하고,
   들어오는 조 책임자가 확인한 뒤 교대합니다. 주간 작업이 덜 끝나면 잔업 계획서를 내고 승인받아야 합니다.
   프레임워크 없음, 스타일은 sh- 접두어로 직접 주입 */

export const SHIFTS = {
  day: { id: 'day', name: '주간조', start: '07:00', end: '19:00' },
  night: { id: 'night', name: '야간조', start: '19:00', end: '07:00' },
  handoverMin: 30,
};

const SEV_COLOR = { PROHIBITED: '#c62828', CONDITIONAL: '#e67e00', DEFECT: '#6a4db2' };
const SEV_LABEL = { PROHIBITED: '금지', CONDITIONAL: '조건부', DEFECT: '결함' };
const DIR_KO = { N: '북쪽', E: '동쪽', S: '남쪽', W: '서쪽' };
const KIND = {
  unfinished: { icon: '⏳', label: '미완료', color: '#8a5a00' },
  overtime: { icon: '🕘', label: '잔업', color: '#1f5fbf' },
  restriction: { icon: '⛔', label: '출입 제한', color: '#8a1c1c' },
  conflict: { icon: '⚠', label: '겹침 판정', color: '#e67e00' },
  correction: { icon: '✎', label: '수정 사항', color: '#2f6f5e' },
  next: { icon: '▶', label: '다음 조 착수', color: '#2f3d5c' },
};
const ORDER = ['conflict', 'restriction', 'unfinished', 'overtime', 'correction', 'next'];

/* ---------- 시간 도우미 ---------- */
const pad = (n) => String(n).padStart(2, '0');
const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
const fromMin = (m) => { m = ((m % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
const hhmmOf = (iso) => String(iso || '').slice(11, 16);
function parseIso(iso) {
  const [d, t = '00:00'] = String(iso).split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, da, h, mi || 0));
}
function fmtIso(dt) {
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}`;
}
const addMin = (iso, m) => fmtIso(new Date(parseIso(iso).getTime() + m * 60000));
const diffMin = (a, b) => (parseIso(b) - parseIso(a)) / 60000;
const shortDate = (iso) => { const d = parseIso(iso); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* 'YYYY-MM-DDTHH:MM' → 그 시각의 조 */
export function shiftAt(iso) {
  const m = toMin(hhmmOf(iso) || '00:00');
  const dayS = toMin(SHIFTS.day.start), dayE = toMin(SHIFTS.day.end);
  const id = m >= dayS && m < dayE ? 'day' : 'night';
  const s = SHIFTS[id];
  const changeAt = s.end;
  const handoverStart = fromMin(toMin(changeAt) - SHIFTS.handoverMin);
  const hs = toMin(handoverStart), ce = toMin(changeAt);
  const handover = hs <= ce ? m >= hs && m < ce : m >= hs || m < ce;
  return { id, name: s.name, handover, handoverStart, changeAt, next: id === 'day' ? 'night' : 'day' };
}

/* 이 시각 다음에 오는 교대 시각 (ISO) */
function nextChangeIso(iso) {
  const sh = shiftAt(iso);
  let c = `${String(iso).slice(0, 10)}T${sh.changeAt}`;
  if (c <= iso) c = addMin(c, 1440);
  return c;
}

/* ---------- 스타일 ---------- */
const CSS = `
.sh-bands{position:absolute;left:0;right:0;top:-12px;height:30px;pointer-events:none;z-index:0}
.sh-band{position:absolute;top:0;height:10px;border-radius:3px;overflow:visible}
.sh-band span{position:absolute;top:11px;left:4px;font-size:12px;font-weight:700;white-space:nowrap;line-height:1}
.sh-b-day{background:#f3ead8;border:1px solid #e2d3b2}
.sh-b-day span{color:#7a5a1c}
.sh-b-night{background:#2f3d5c}
.sh-b-night span{color:#fff;background:#2f3d5c;border-radius:4px;padding:2px 6px}
.sh-b-ho{background:repeating-linear-gradient(135deg,#f0b84a 0 4px,#fbe2a8 4px 8px);border:1px solid #d99a1e;z-index:1}
.sh-b-ho span{color:#8a5a00;left:50%;transform:translateX(-50%);top:-14px}
.sh-ov{position:fixed;inset:0;background:rgba(15,23,32,.5);z-index:1450;display:flex;align-items:center;justify-content:center;padding:16px}
.sh-modal{background:#fff;border-radius:14px;width:min(720px,100%);max-height:90vh;overflow:auto;padding:22px 24px;font-size:16px;line-height:1.55;color:#1f2933;box-shadow:0 20px 50px rgba(0,0,0,.3)}
.sh-modal h3{margin:0 0 4px;font-size:21px}
.sh-sub{color:#5b6672;font-size:15px;margin-bottom:14px}
.sh-tot{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.sh-tot span{border:1px solid #d6dadf;border-radius:999px;padding:3px 12px;font-size:15px;background:#f7f8fa}
.sh-tot b{margin-left:4px}
.sh-card{border:1px solid #d6dadf;border-radius:10px;margin-bottom:12px;overflow:hidden;break-inside:avoid}
.sh-card-h{display:flex;align-items:center;gap:8px;padding:8px 14px;background:#f5f6f7;border-bottom:1px solid #d6dadf;font-weight:700;font-size:17px}
.sh-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0}
.sh-card-h small{margin-left:auto;font-weight:400;color:#5b6672;font-size:14px}
.sh-row{display:flex;gap:10px;padding:8px 14px;border-bottom:1px solid #eef0f2;font-size:16px}
.sh-row:last-child{border-bottom:0}
.sh-ic{width:24px;text-align:center;flex-shrink:0}
.sh-tag{display:inline-block;font-size:13px;font-weight:700;border:1px solid;border-radius:999px;padding:0 8px;margin-right:6px;vertical-align:1px}
.sh-empty{padding:18px;text-align:center;color:#5b6672}
.sh-acts{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:18px}
.sh-btn{font-size:16px;font-weight:700;padding:10px 18px;border-radius:10px;border:1px solid #b9c0c8;background:#fff;color:#1f2933;cursor:pointer;min-height:44px}
.sh-btn:hover{background:#f3f5f7}
.sh-pri{background:#2f6f5e;border-color:#2f6f5e;color:#fff}
.sh-pri:hover{background:#255c4b}
.sh-btn:disabled{background:#e6e9ec;border-color:#d0d5da;color:#8a939c;cursor:not-allowed}
.sh-note{flex-basis:100%;font-size:15px;color:#5b6672}
.sh-kv{display:grid;grid-template-columns:110px 1fr;gap:6px 12px;margin:10px 0 16px}
.sh-kv dt{color:#5b6672;font-weight:700}
.sh-kv dd{margin:0}
.sh-f{margin-bottom:14px}
.sh-f>label{display:block;font-weight:700;margin-bottom:6px}
.sh-seg{display:flex;gap:8px}
.sh-seg button{flex:1;font-size:17px;font-weight:700;padding:10px;border-radius:10px;border:1px solid #b9c0c8;background:#fff;cursor:pointer;min-height:46px}
.sh-seg button.sh-on{background:#1f5fbf;border-color:#1f5fbf;color:#fff}
.sh-modal input[type=number],.sh-modal select,.sh-modal textarea{font-size:16px;padding:8px 10px;border:1px solid #b9c0c8;border-radius:8px;font-family:inherit;min-height:42px}
.sh-modal input[type=number]{width:110px}
.sh-modal textarea{width:100%;box-sizing:border-box;min-height:64px;margin-top:8px}
.sh-win{font-size:22px;font-weight:700;color:#1f5fbf}
.sh-warn{background:#fff8e6;border:1px solid #f0d48a;border-radius:8px;padding:10px 12px;color:#5a4a1a;font-size:15px}
.sh-banner{position:absolute;left:12px;top:64px;z-index:20;display:flex;align-items:center;gap:12px;background:#fff4dc;border:1px solid #f0b84a;border-left:6px solid #f0b84a;border-radius:10px;padding:8px 10px 8px 14px;font-size:16px;color:#5a3d00;box-shadow:0 4px 14px rgba(0,0,0,.12);max-width:calc(100% - 24px)}
.sh-banner b{font-weight:700}
.sh-banner button{font-size:15px;font-weight:700;padding:6px 12px;border-radius:8px;border:1px solid #d99a1e;background:#fff;color:#7a4f00;cursor:pointer;min-height:36px}
.sh-banner .sh-x{border:0;background:transparent;font-size:18px;padding:4px 8px;color:#7a4f00}
@media print{
  body *{visibility:hidden}
  .sh-ov,.sh-ov *{visibility:visible}
  .sh-ov{position:absolute;inset:0;background:#fff;display:block;padding:0}
  .sh-modal{box-shadow:none;max-height:none;width:100%}
  .sh-acts{display:none}
}
`;
function injectCss() {
  if (typeof document === 'undefined' || document.getElementById('sh-style')) return;
  const st = document.createElement('style');
  st.id = 'sh-style';
  st.textContent = CSS;
  document.head.appendChild(st);
}

/* ---------- 시간 막대 위 교대 띠 ---------- */
export function renderShiftBands(container, { windowStart, windowEnd }) {
  if (!container) return;
  injectCss();
  container.querySelector(':scope > .sh-bands')?.remove();
  const total = diffMin(windowStart, windowEnd);
  if (!(total > 0)) return;
  const wrap = document.createElement('div');
  wrap.className = 'sh-bands';
  wrap.setAttribute('aria-hidden', 'true');
  const pct = (iso) => Math.max(0, Math.min(100, (diffMin(windowStart, iso) / total) * 100));
  const add = (cls, a, b, label) => {
    if (b <= windowStart || a >= windowEnd) return;
    const l = pct(a), r = pct(b);
    const el = document.createElement('div');
    el.className = `sh-band ${cls}`;
    el.style.left = `${l}%`;
    el.style.width = `${r - l}%`;
    el.innerHTML = label ? `<span>${esc(label)}</span>` : '';
    wrap.appendChild(el);
  };
  // 창 시작 이전의 교대 경계부터 차례로
  let cur = `${windowStart.slice(0, 10)}T${SHIFTS.night.start}`;
  cur = addMin(cur, -1440);
  let guard = 0;
  while (cur < windowEnd && guard++ < 20) {
    const sh = shiftAt(cur);
    const end = addMin(cur, 720);
    const hoStart = addMin(end, -SHIFTS.handoverMin);
    const showLabel = diffMin(cur < windowStart ? windowStart : cur, end > windowEnd ? windowEnd : end) >= 120;
    add(sh.id === 'day' ? 'sh-b-day' : 'sh-b-night', cur, hoStart, showLabel ? sh.name : '');
    add('sh-b-ho', hoStart, end, '인계');
    cur = end;
  }
  container.appendChild(wrap);
}

/* ---------- 인계 문서 (순수 데이터) ---------- */
function restrictionZones(r) { return r.zone_ids || (r.zoneId ? [r.zoneId] : r.zone_id ? [r.zone_id] : []); }
function dirLabel(blocked = []) {
  const b = [...new Set(blocked)];
  if (b.length >= 4) return '전 방향';
  return b.map((k) => DIR_KO[k] || k).join('·');
}

export function buildHandoverDoc({ t, fromShift, toShift, tasks = [], conflicts = [], restrictions = [], corrections = [], overtime = [], companies = [], zoneName } = {}) {
  const sh = shiftAt(t);
  const fromId = fromShift || sh.id;
  const toId = toShift || (fromId === 'day' ? 'night' : 'day');
  const changeIso = nextChangeIso(t);
  const hoIso = addMin(changeIso, -SHIFTS.handoverMin);
  const zn = (z) => (typeof zoneName === 'function' ? zoneName(z) : z) || z;
  const coName = (id) => companies.find((c) => c.id === id)?.name || `${id}사`;
  const sameShift = (task, id) => (task.shift ? task.shift === id : shiftAt(task.start).id === id);
  const zonesText = (ids = []) => ids.map(zn).join('·');

  const by = new Map();
  const push = (cid, item) => {
    if (!cid) return;
    if (!by.has(cid)) by.set(cid, []);
    by.get(cid).push(item);
  };
  const otByTask = new Map(overtime.map((o) => [o.taskId || o.task_id, o]));

  // 미완료: 나가는 조 작업 중 교대 시각에도 진행 중이거나 그 뒤에 끝나는 것
  for (const task of tasks) {
    if (!sameShift(task, fromId)) continue;
    if (task.start < changeIso && task.end >= changeIso) {
      const ot = otByTask.get(task.id);
      let tail = '';
      if (ot) {
        const st = ot.status === 'approved' ? '잔업 승인' : ot.status === 'rejected' ? '잔업 반려' : '잔업 승인 대기';
        tail = ` — ${st} ${hhmmOf(ot.start)}–${hhmmOf(ot.end)}`;
      } else if (task.end > changeIso) {
        tail = ` — ${hhmmOf(task.end)}까지 이어짐`;
      }
      push(task.company_id, { kind: 'unfinished', taskId: task.id, text: `미완료 · ${task.title} (${zonesText(task.zone_ids)}, ${task.crew}명)${tail}` });
    }
  }
  // 잔업 계획서
  for (const ot of overtime) {
    const task = tasks.find((x) => x.id === (ot.taskId || ot.task_id));
    const cid = ot.company_id || task?.company_id;
    const st = ot.status === 'approved' ? '승인됨' : ot.status === 'rejected' ? '반려' : '승인 대기';
    push(cid, { kind: 'overtime', taskId: task?.id, text: `잔업 · ${task?.title || ot.taskId} ${hhmmOf(ot.start)}–${hhmmOf(ot.end)}, ${ot.crew}명 (${st}${ot.reason ? ' · ' + ot.reason : ''})` });
  }
  // 다음 조: 교대 후 2시간 안에 시작
  const nextLimit = addMin(changeIso, 120);
  for (const task of tasks) {
    if (!sameShift(task, toId)) continue;
    if (task.start >= changeIso && task.start <= nextLimit) {
      push(task.company_id, { kind: 'next', taskId: task.id, text: `다음 조 착수 · ${hhmmOf(task.start)} ${task.title} (${zonesText(task.zone_ids)}, ${task.crew}명)` });
    }
  }
  // 출입 제한: 인계 시각에 걸려 있거나 다음 조 안에 시작 → 회사 작업 구역과 겹치면
  const toEnd = addMin(changeIso, 720);
  const companyZones = new Map();
  for (const task of tasks) {
    if (task.end <= hoIso || task.start >= toEnd) continue;
    if (!companyZones.has(task.company_id)) companyZones.set(task.company_id, new Set());
    task.zone_ids.forEach((z) => companyZones.get(task.company_id).add(z));
  }
  for (const r of restrictions) {
    const until = r.end || r.until || '';
    const rs = r.start || '';
    if (rs && rs >= toEnd) continue;
    if (until && until.length > 5 && until <= hoIso) continue;
    const zones = restrictionZones(r);
    const where = r.where || dirLabel(r.blocked);
    const untilTxt = until ? (until.length > 5 ? hhmmOf(until) : until) : '';
    for (const [cid, zs] of companyZones) {
      if (!zones.some((z) => zs.has(z))) continue;
      push(cid, { kind: 'restriction', text: `출입 제한 · ${zonesText(zones)}${where ? ' ' + where : ''}${untilTxt ? ' · ' + untilTxt + '까지' : ''}${r.reason ? ` (${r.reason})` : ''}` });
    }
  }
  // 겹침 판정: 아직 닫히지 않은 것 중 회사 작업과 관련
  for (const c of conflicts) {
    if (c.status && ['resolved', 'closed', 'dismissed'].includes(c.status)) continue;
    if (c.end && c.end <= hoIso) continue;
    const cids = new Set(c.company_ids || []);
    (c.task_ids || []).forEach((id) => { const tk = tasks.find((x) => x.id === id); if (tk) cids.add(tk.company_id); });
    const when = c.start ? ` · ${hhmmOf(c.start)}–${hhmmOf(c.end)}` : '';
    for (const cid of cids) {
      push(cid, { kind: 'conflict', severity: c.severity, text: `${SEV_LABEL[c.severity] || '판정'} · ${c.title}${when}` });
    }
  }
  // 수정 사항
  for (const cr of corrections) {
    if (typeof cr === 'string') { push('_', { kind: 'correction', text: `수정 · ${cr}` }); continue; }
    push(cr.company_id || '_', { kind: 'correction', text: `수정 · ${cr.text || cr.title || ''}` });
  }

  const sections = [...by.entries()]
    .map(([cid, items]) => ({
      company_id: cid,
      companyName: cid === '_' ? '공통' : coName(cid),
      color: companies.find((c) => c.id === cid)?.color || '#8a939c',
      items: items.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)),
    }))
    .sort((a, b) => (a.company_id === '_' ? 1 : b.company_id === '_' ? -1 : a.company_id.localeCompare(b.company_id)));

  const totals = { companies: sections.length };
  ORDER.forEach((k) => { totals[k] = 0; });
  sections.forEach((s) => s.items.forEach((it) => { totals[it.kind]++; }));

  return {
    title: `${SHIFTS[fromId].name} → ${SHIFTS[toId].name} 인계 (${shortDate(hoIso)} ${hhmmOf(hoIso)})`,
    from: fromId, to: toId, handoverStart: hoIso, changeAt: changeIso,
    sections, totals,
  };
}

/* ---------- 모달 공통 ---------- */
function openOverlay(id, html, onClose) {
  injectCss();
  document.getElementById(id)?.remove();
  const ov = document.createElement('div');
  ov.id = id;
  ov.className = 'sh-ov';
  ov.innerHTML = html;
  const close = () => {
    ov.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);
  return { ov, close };
}

/* ---------- 인계 문서 모달 ---------- */
export function openHandoverModal(doc, { canConfirm = false, onConfirm, onClose } = {}) {
  const tot = doc.totals || {};
  const totHtml = ORDER.filter((k) => tot[k]).map((k) => `<span>${KIND[k].icon} ${esc(KIND[k].label)}<b>${tot[k]}</b></span>`).join('');
  const cards = (doc.sections || []).map((s) => `
    <section class="sh-card">
      <div class="sh-card-h"><span class="sh-dot" style="background:${esc(s.color || '#8a939c')}"></span>${esc(s.companyName)}<small>${s.items.length}건</small></div>
      ${s.items.map((it) => {
        const k = KIND[it.kind] || KIND.correction;
        const col = it.kind === 'conflict' ? (SEV_COLOR[it.severity] || k.color) : k.color;
        return `<div class="sh-row"><span class="sh-ic" style="color:${col}">${k.icon}</span><span>${esc(it.text)}</span></div>`;
      }).join('')}
    </section>`).join('');
  const toName = SHIFTS[doc.to]?.name || '다음 조';
  const html = `
    <div class="sh-modal" role="dialog" aria-modal="true" aria-label="${esc(doc.title)}">
      <h3>${esc(doc.title)}</h3>
      <div class="sh-sub">${esc(hhmmOf(doc.handoverStart))}–${esc(hhmmOf(doc.changeAt))} 인계 시간 · 나가는 조가 정리하고 들어오는 조 책임자가 확인합니다</div>
      <div class="sh-tot">${totHtml || '<span>넘길 사항 없음</span>'}</div>
      ${cards || '<div class="sh-empty">넘길 사항이 없습니다.</div>'}
      <div class="sh-acts">
        <button class="sh-btn sh-pri" data-act="ok" ${canConfirm ? '' : 'disabled'}>인계 확인 — ${esc(toName)} 책임자</button>
        <button class="sh-btn" data-act="print">인쇄</button>
        <button class="sh-btn" data-act="close">닫기</button>
        ${canConfirm ? '' : '<div class="sh-note">들어오는 조 파트장 또는 원청 관리자만 확인할 수 있습니다</div>'}
      </div>
    </div>`;
  const { ov, close } = openOverlay('sh-handover', html, onClose);
  ov.querySelector('[data-act=close]').onclick = close;
  ov.querySelector('[data-act=print]').onclick = () => window.print();
  const ok = ov.querySelector('[data-act=ok]');
  if (canConfirm) ok.onclick = () => { onConfirm?.(doc); close(); };
}

/* ---------- 잔업 계획서 ---------- */
const REASONS = ['작업 지연', '자재 도착 지연', '설비 이상', '기타'];

export function openOvertimeForm(task, { companies = [], canSubmit = true, onSubmit, onClose, zoneName } = {}) {
  const co = companies.find((c) => c.id === task.company_id);
  const zn = (z) => (typeof zoneName === 'function' ? zoneName(z) : z) || z;
  const baseEnd = task.end;
  const crewDefault = Math.max(2, Math.ceil((task.crew || 0) * 0.5));
  let hours = 2;
  const html = `
    <div class="sh-modal" role="dialog" aria-modal="true" aria-label="잔업 계획서">
      <h3>잔업 계획서</h3>
      <div class="sh-sub">주간 작업이 교대 시각까지 끝나지 않을 때 냅니다</div>
      <dl class="sh-kv">
        <dt>업체</dt><dd>${esc(co?.name || task.company_id)}${co?.trade ? ' · ' + esc(co.trade) : ''}</dd>
        <dt>작업</dt><dd>${esc(task.title)}</dd>
        <dt>구역</dt><dd>${esc((task.zone_ids || []).map(zn).join('·'))}</dd>
        <dt>원래 종료</dt><dd>${esc(shortDate(baseEnd))} ${esc(hhmmOf(baseEnd))} (${esc(task.crew)}명)</dd>
      </dl>
      <div class="sh-f"><label>늘릴 시간</label>
        <div class="sh-seg">${[1, 2, 3].map((h) => `<button type="button" data-h="${h}" class="${h === hours ? 'sh-on' : ''}">+${h} 시간</button>`).join('')}</div>
      </div>
      <div class="sh-f"><label for="sh-crew">남는 인원</label>
        <input id="sh-crew" type="number" min="2" max="${esc(task.crew || 99)}" value="${crewDefault}"> 명
      </div>
      <div class="sh-f"><label for="sh-reason">사유</label>
        <select id="sh-reason">${REASONS.map((r) => `<option>${esc(r)}</option>`).join('')}</select>
        <textarea id="sh-text" placeholder="자세한 사유 (예: 카본블록 3단 중 2단까지 완료)"></textarea>
      </div>
      <div class="sh-f"><label>잔업 시간</label><div class="sh-win" id="sh-win"></div></div>
      <div class="sh-warn">승인 전에는 착수할 수 없습니다 · 야간조 작업과 다시 판정합니다</div>
      <div class="sh-acts">
        <button class="sh-btn sh-pri" data-act="ok" ${canSubmit ? '' : 'disabled'}>잔업 계획서 제출</button>
        <button class="sh-btn" data-act="close">닫기</button>
        ${canSubmit ? '' : '<div class="sh-note">해당 업체 파트장만 제출할 수 있습니다</div>'}
      </div>
    </div>`;
  const { ov, close } = openOverlay('sh-overtime', html, onClose);
  const win = ov.querySelector('#sh-win');
  const range = () => ({ start: baseEnd, end: addMin(baseEnd, hours * 60) });
  const paint = () => {
    const r = range();
    win.textContent = `${hhmmOf(r.start)}–${hhmmOf(r.end)}`;
    ov.querySelectorAll('[data-h]').forEach((b) => b.classList.toggle('sh-on', Number(b.dataset.h) === hours));
  };
  ov.querySelectorAll('[data-h]').forEach((b) => { b.onclick = () => { hours = Number(b.dataset.h); paint(); }; });
  paint();
  ov.querySelector('[data-act=close]').onclick = close;
  if (canSubmit) {
    ov.querySelector('[data-act=ok]').onclick = () => {
      const crewIn = ov.querySelector('#sh-crew');
      const crew = Math.max(2, Math.round(Number(crewIn.value) || crewDefault));
      const sel = ov.querySelector('#sh-reason').value;
      const txt = ov.querySelector('#sh-text').value.trim();
      const r = range();
      onSubmit?.({ taskId: task.id, hours, crew, reason: txt ? `${sel} · ${txt}` : sel, start: r.start, end: r.end });
      close();
    };
  }
}

/* ---------- 인계 시간 배너 ---------- */
export function renderHandoverBanner(container, { t, onOpen, onDismiss } = {}) {
  if (!container) return;
  injectCss();
  container.querySelector(':scope > .sh-banner')?.remove();
  const sh = shiftAt(t);
  if (!sh.handover) return;
  const nextName = SHIFTS[sh.next].name;
  const el = document.createElement('div');
  el.className = 'sh-banner';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>⏱ <b>인계 시간 ${esc(sh.handoverStart)}–${esc(sh.changeAt)}</b> · ${esc(sh.changeAt)} ${esc(nextName)} 교대</span>
    <button type="button" data-act="open">인계 문서 보기</button>
    <button type="button" class="sh-x" data-act="x" aria-label="닫기">✕</button>`;
  el.querySelector('[data-act=open]').onclick = () => onOpen?.();
  el.querySelector('[data-act=x]').onclick = () => { el.remove(); onDismiss?.(); };
  container.appendChild(el);
}
