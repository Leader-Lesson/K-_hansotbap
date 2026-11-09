/* 한솥밥 3D · 왼쪽 작업 목록 + 오른쪽 상세 패널 (v2)
   HTML 문자열만 돌려줌. 클릭 속성은 app.js와 같음: data-zone / data-conflict / data-task / data-alt / data-back
   글자 단계: 20 / 17 / 15 / 13px. 빨강은 위험 표시에만. 클래스는 모두 p2- 로 시작 (style.css "panels v2" 구역) */

import { SEV, SEV_ORDER, TYPE_NAME, WORK_TYPE_NAME, LEVEL_NAME, fmtTime, fmtDateTime } from './theme.js';
import { contactFor, HQ_CONTACTS } from './contacts.js';

// ---------- 공통 도구 ----------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SIDE_ORDER = { in: 0, out: 1, aux: 2 };
const SIDE_NAME = { in: '노 안', out: '노 밖', aux: '부대설비' };
const sevOf = (s) => SEV[s] || { color: '#7a8590', label: s || '-', mark: '•', score: 0 };
const sevRank = (s) => { const i = SEV_ORDER.indexOf(s); return i < 0 ? 9 : i; };
const LV = { STOP: { cls: 'stop', label: '멈춤' }, CAUTION: { cls: 'caution', label: '주의' }, OK: { cls: 'ok', label: '작업 가능' } };

/* 업체 이름·색: data.js COMPANIES를 쓰되 없으면 'A사' 식으로 */
const CO_COLOR = { A: '#2e6fd0', B: '#8a3fa0', C: '#1f8a8a', D: '#b08300', E: '#a0522d', PRIME: '#2f3a44' };
const coName = (cid) => (cid ? (cid === 'PRIME' ? '원청' : /^[A-Z]$/.test(cid) ? `${cid}사` : String(cid).replace(/^가상-/, '')) : '-');
const coChip = (cid) => `<span class="p2-co"><i style="background:${CO_COLOR[cid] || '#8a939c'}"></i>${esc(coName(cid))}</span>`;

const zoneMap = (zones) => new Map((zones || []).map((z) => [z.id, z]));
const zName = (zm, id) => zm.get(id)?.name || id || '지상·기타';

/* 시간: 기준일(t의 날짜)과 다음날 새벽이면 시:분만, 그 밖이면 날짜도 */
function tm(iso, t) {
  if (!iso) return '';
  if (!t) return fmtTime(iso);
  const d0 = t.slice(0, 10);
  const next = new Date(d0 + 'T00:00:00'); next.setDate(next.getDate() + 1);
  const d1 = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
  const d = iso.slice(0, 10);
  return d === d0 || (d === d1 && iso.slice(11, 16) <= '12:00') ? fmtTime(iso) : fmtDateTime(iso);
}
const range = (a, b, t) => `<span class="p2-time">${esc(tm(a, t))}–${esc(tm(b, t))}</span>`;
const isNow = (x, t) => !!t && x.start <= t && t < x.end;
const shortTitle = (s) => String(s || '').replace(/\s*\([^)]*\)\s*/g, ' ').trim();

/* <details> 열림 상태 기억 (app.js가 다시 그려도 사용자가 연/닫은 상태 유지) */
const openMemo = new Map();
if (typeof document !== 'undefined') {
  document.addEventListener('toggle', (e) => {
    const k = e.target?.dataset?.p2key;
    if (k) openMemo.set(k, e.target.open);
  }, true);
}
const openAttr = (key, dflt) => ((openMemo.has(key) ? openMemo.get(key) : dflt) ? ' open' : '');

/* 판정 → 걸린 작업 */
const tasksOf = (c, tasks) => (c.task_ids || []).map((id) => (tasks || []).find((t) => t.id === id)).filter(Boolean);

/* 판정의 핵심 한 줄: "B사 16명 · 노저 / A사 8명 · 풍구 층 외부" */
function keyLine(c, tasks, zm) {
  const ts = tasksOf(c, tasks);
  if (!ts.length) return (c.zone_ids || []).map((z) => esc(zName(zm, z))).join(' · ');
  return ts.map((t) => {
    const crew = t.acc === 'limited' || t.crew == null ? '' : ` <b>${esc(t.crew)}</b>명`;
    const where = (t.zone_ids || []).map((z) => esc(zName(zm, z))).join('·') || '지상';
    return `<span class="p2-who">${esc(coName(t.company_id))}${crew} · ${where}</span>`;
  }).join('<span class="p2-sep">/</span>');
}

/* "지금 할 조치" 목록 (주어지지 않으면 판정에서 만듦) */
function deriveActions(conflicts, tasks, alternatives, t) {
  const seen = new Set();
  return (conflicts || [])
    .filter((c) => (c.severity === 'PROHIBITED' || c.severity === 'CONDITIONAL') && (!t || !c.end || c.end > t))
    .sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || String(a.start).localeCompare(String(b.start)))
    .map((c) => {
      const main = tasksOf(c, tasks)[0];
      const what = shortTitle(main?.title || c.title);
      const pro = c.severity === 'PROHIBITED';
      return {
        severity: c.severity, conflictId: c.id, time: c.start,
        text: pro ? `${what} 보류` : what,
        need: pro ? (alternatives?.[c.id] ? '조정안 선택 필요' : '작업 조정 필요') : '조건 지키고 진행',
      };
    })
    .filter((a) => { const k = a.time + a.text; if (seen.has(k)) return false; seen.add(k); return true; })  // 같은 작업 중복 줄 제거
    .reduce((out, a) => {
      // 경고가 너무 많지 않게: 금지는 한 줄씩, 조건부는 한 줄로 묶음 (현장 조치는 3D의 안전띠·러버콘으로 보여 줌)
      if (a.severity !== 'CONDITIONAL') out.push(a);
      else {
        const g = out.find((x) => x.group);
        if (g) { g.n += 1; g.text = `조건부 ${g.n}건`; if (a.time < g.time) g.time = a.time; }
        else out.push({ ...a, group: true, n: 1, conflictId: '', text: '조건부 1건', need: '안전띠·러버콘 밖에서 조건 지키고 진행' });
      }
      return out;
    }, []);
}

function actionBox(actions, t) {
  if (!actions.length) return `<div class="p2-actions p2-actions-none"><div class="p2-act-head">지금 할 조치</div><div class="p2-act-ok">✓ 지금 처리할 위험이 없습니다</div></div>`;
  return `<div class="p2-actions">
    <div class="p2-act-head">지금 할 조치 <b>${actions.length}</b>건</div>
    ${actions.map((a) => {
      const s = sevOf(a.severity);
      return `<button type="button" class="p2-act" data-conflict="${esc(a.conflictId || '')}" style="--sev:${s.color}">
        <span class="p2-act-mark" style="color:${s.color}">${s.mark}</span>
        <span class="p2-act-txt"><span class="p2-time">${esc(tm(a.time, t))}</span> ${esc(a.text)} <span class="p2-act-need">— ${esc(a.need || '')}</span></span>
      </button>`;
    }).join('')}
  </div>`;
}

// ---------- 조정안 ----------
function canChoose(role) { return !role || (role.id === 'PRIME' && role.level === 'manager'); }

function altItem(a, i, g, role) {
  const saved = g.stopAll.ph - a.idlePh;
  return `<div class="p2-alt">
    <div class="p2-alt-top"><span class="p2-alt-no">${i + 1}</span><span class="p2-alt-title">${esc(a.title)}</span></div>
    ${a.tag ? `<span class="p2-tag">${esc(a.tag)}</span>` : ''}
    <ul class="p2-alt-steps">${(a.steps || []).slice(0, 3).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <div class="p2-metrics">
      <span class="p2-m ${a.idlePh ? 'p2-m-amber' : 'p2-m-green'}">대기 <b>${esc(a.idlePh)}</b>인시${saved > 0 ? ` <span class="p2-m-sub">(−${esc(saved)})</span>` : ''}</span>
      ${a.residual ? `<span class="p2-m p2-m-amber">조건부</span>` : `<span class="p2-m p2-m-green">남는 위험 없음</span>`}
    </div>
    ${a.residual ? `<div class="p2-alt-res">남는 조건: ${esc(a.residual)}</div>` : ''}
    ${canChoose(role)
      ? `<button type="button" class="p2-apply" data-alt="${esc(a.id)}">${i + 1}번 조정안 적용</button>`
      : `<div class="p2-apply-off">원청 관리자가 선택합니다</div>`}
  </div>`;
}

function altSection(c, alternatives, role) {
  const g = alternatives?.[c.id];
  if (!g || !g.list?.length) {
    return c.suggestion?.text ? `<div class="p2-line p2-line-pro"><b>조정 방향</b> — ${esc(c.suggestion.text)}</div>` : '';
  }
  const key = `alts:${c.id}`;
  return `<details class="p2-fold p2-alts" data-p2key="${esc(key)}"${openAttr(key, true)}>
    <summary>조정안 ${g.list.length}개 보기</summary>
    <div class="p2-alts-loss">모두 멈추면 <b>${esc(g.stopAll.ph)}</b>인시 손실 — 멈추지 않고 하나를 고르세요</div>
    ${g.list.map((a, i) => altItem(a, i, g, role)).join('')}
  </details>`;
}

// ---------- 판정 카드 ----------
function conflictCard(c, ctx) {
  const { tasks, zm, alternatives, role, t, selectedConflictId } = ctx;
  const s = sevOf(c.severity);
  const pro = c.severity === 'PROHIBITED';
  const detKey = `why:${c.id}`;
  const pend = c.pending ? '<span class="p2-pend">승인 시 생길 위험</span>' : '';
  return `<article class="p2-card${c.id === selectedConflictId ? ' p2-on' : ''}" style="--sev:${s.color}">
    <div class="p2-click" data-conflict="${esc(c.id)}">
      <div class="p2-strip">${s.mark} ${esc(s.label)} · ${esc(TYPE_NAME[c.type] || c.type || '')} · ${esc(tm(c.start, t))}–${esc(tm(c.end, t))}</div>
      <div class="p2-card-in">
        <div class="p2-title">${esc(c.title)}</div>
        <div class="p2-chips">${(c.company_ids || []).map(coChip).join('')}${pend}</div>
        <div class="p2-key">${keyLine(c, tasks, zm)}</div>
      </div>
    </div>
    <div class="p2-card-in p2-card-more">
      ${pro ? '' : `<div class="p2-line"><b>알림 · 작업 계속</b>${c.suggestion?.text ? ` — 조치: ${esc(c.suggestion.text)}` : ''}</div>`}
      ${peopleBlock(c, tasks, role)}
      ${evidenceFold(c, tasks, detKey)}
      ${pro ? altSection(c, alternatives, role) : ''}
    </div>
  </article>`;
}

const sortConf = (list) => [...(list || [])].sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || String(a.start).localeCompare(String(b.start)));
const conflictList = (list, ctx, empty) => (list.length ? list.map((c) => conflictCard(c, ctx)).join('') : `<div class="p2-empty">${esc(empty)}</div>`);

// ---------- 작업 카드 / 안전 안내 ----------
function taskCard(tk, t, selectedTaskId, conflicts) {
  const lim = tk.acc === 'limited';
  const worst = (conflicts || []).filter((c) => (c.task_ids || []).includes(tk.id)).sort((a, b) => sevRank(a.severity) - sevRank(b.severity))[0];
  const s = worst ? sevOf(worst.severity) : null;
  return `<button type="button" class="p2-task${tk.id === selectedTaskId ? ' p2-on' : ''}${lim ? ' p2-lim' : ''}" data-task="${esc(tk.id)}">
    <span class="p2-task-row">${coChip(tk.company_id)}${range(tk.start, tk.end, t)}${s ? `<span class="p2-task-sev" style="color:${s.color}">${s.mark} ${esc(s.label)}</span>` : ''}</span>
    <span class="p2-task-title">${esc(tk.title)}</span>
    <span class="p2-task-sub">${lim ? '다른 업체 작업 (영향)' : `인원 <b>${esc(tk.crew ?? '-')}</b>명`}${(tk.work_types || []).length ? ' · ' + esc(tk.work_types.map((w) => WORK_TYPE_NAME[w] || w).join(', ')) : ''}${tk.status === 'pending' ? ' <span class="p2-pend">승인 대기</span>' : ''}</span>
  </button>`;
}

function guidanceBlock(guidance, t, zoneLabel) {
  const slots = guidance?.slots || [];
  if (!slots.length) return `<h3 class="p2-h3">위치별 안전 안내</h3><div class="p2-empty">${esc(zoneLabel || '이 구역')}에 따로 안내할 위험이 없습니다.</div>`;
  return `<h3 class="p2-h3">위치별 안전 안내</h3>
  <ol class="p2-tl">
    ${slots.map((sl) => {
      const lv = LV[sl.level] || LV.OK;
      const cur = isNow(sl, t);
      return `<li class="p2-tl-item p2-tl-${lv.cls}${cur ? ' p2-now' : ''}">
        <div class="p2-tl-head">${range(sl.start, sl.end, t)}<span class="p2-lv p2-lv-${lv.cls}">${esc(lv.label)}</span>${cur ? '<span class="p2-nowtag">지금</span>' : ''}</div>
        <div class="p2-tl-text">${esc(sl.text || '')}</div>
      </li>`;
    }).join('')}
  </ol>`;
}

// ---------- 왼쪽: 위치별 작업 목록 ----------
export function renderLeft({ zones, tasks, conflicts, selectedZoneId, selectedTaskId, t }) {
  const zm = zoneMap(zones);
  const list = (tasks || []).filter((x) => x.status !== 'rejected');
  const groups = new Map();
  for (const tk of list) {
    const ids = (tk.zone_ids || []).length ? tk.zone_ids : [''];
    for (const z of ids) { if (!groups.has(z)) groups.set(z, []); groups.get(z).push(tk); }
  }
  const order = [...groups.keys()].sort((a, b) => {
    const A = zm.get(a), B = zm.get(b);
    if (!A || !B) return A ? -1 : B ? 1 : 0;
    return B.level - A.level || (SIDE_ORDER[A.side] ?? 3) - (SIDE_ORDER[B.side] ?? 3);
  });
  const worstIn = (zid) => (conflicts || []).filter((c) => (c.zone_ids || []).includes(zid)).sort((a, b) => sevRank(a.severity) - sevRank(b.severity))[0]?.severity;
  const taskWorst = (id) => (conflicts || []).filter((c) => (c.task_ids || []).includes(id)).sort((a, b) => sevRank(a.severity) - sevRank(b.severity))[0]?.severity;

  const crewAll = list.filter((x) => x.acc !== 'limited').reduce((s, x) => s + (x.crew || 0), 0);
  const nP = (conflicts || []).filter((c) => c.severity === 'PROHIBITED').length;
  const nC = (conflicts || []).filter((c) => c.severity === 'CONDITIONAL').length;

  const rows = order.map((zid) => {
    const z = zm.get(zid);
    const items = groups.get(zid).sort((a, b) => String(a.start).localeCompare(String(b.start)));
    const w = zid ? worstIn(zid) : null;
    const head = `<button type="button" class="p2-grp-head${zid && zid === selectedZoneId ? ' p2-on' : ''}" ${zid ? `data-zone="${esc(zid)}"` : 'disabled'}>
      <i class="p2-dot" style="background:${w ? sevOf(w).color : '#b9c1c8'}"></i>
      <span class="p2-grp-name">${esc(z ? z.name : '지상·기타')}${z ? `<small>${esc(LEVEL_NAME[z.level] ?? '')}</small>` : ''}</span>
      <span class="p2-count">${items.length}</span>
    </button>`;
    const body = items.map((tk) => {
      const lim = tk.acc === 'limited';
      const ended = t && tk.end <= t;
      const ts = taskWorst(tk.id);
      return `<button type="button" class="p2-row${lim ? ' p2-lim' : ''}${ended ? ' p2-ended' : ''}${tk.id === selectedTaskId ? ' p2-on' : ''}" data-task="${esc(tk.id)}">
        <i class="p2-bar" style="background:${CO_COLOR[tk.company_id] || '#8a939c'}"></i>
        <span class="p2-row-main">
          <span class="p2-row-title">${ts ? `<span style="color:${sevOf(ts).color}">${sevOf(ts).mark}</span> ` : ''}${esc(coName(tk.company_id))} · ${esc(shortTitle(tk.title))}</span>
          <span class="p2-row-sub">${range(tk.start, tk.end, t)}${lim ? '<span class="p2-limtxt">다른 업체 작업 (영향)</span>' : ` <b>${esc(tk.crew ?? '-')}</b>명`}${tk.status === 'pending' ? '<span class="p2-pend">승인 대기</span>' : ''}</span>
        </span>
      </button>`;
    }).join('');
    return `<section class="p2-grp">${head}${body}</section>`;
  }).join('');

  return `<div class="p2-left">
    <div class="p2-left-title">위치별 작업</div>
    <button type="button" class="p2-all${!selectedZoneId ? ' p2-on' : ''}" data-zone="">
      <span class="p2-all-name">전체 보기</span>
      <span class="p2-all-sub">작업 <b>${list.length}</b>건 · <b>${crewAll}</b>명${nP ? ` · <span style="color:${SEV.PROHIBITED.color}">${SEV.PROHIBITED.mark} ${nP}</span>` : ''}${nC ? ` · <span style="color:${SEV.CONDITIONAL.color}">${SEV.CONDITIONAL.mark} ${nC}</span>` : ''}</span>
    </button>
    <div class="p2-groups">${rows || '<div class="p2-empty">이 시간에는 작업이 없습니다.</div>'}</div>
  </div>`;
}

// ---------- 담당자 연락처 · 근거 ----------
const telA = (p) => `<a class="db-tel" href="tel:${esc(p.tel.replace(/-/g, ''))}">${esc(p.tel)}</a>`;
function peopleBlock(c, tasks, role, hqKey) {
  const ids = [...new Set([...(c.company_ids || []), ...tasksOf(c, tasks).map((x) => x.company_id)].filter(Boolean))];
  const rows = ids.map((cid) => {
    const p = contactFor(cid, role);
    if (!p) return '';
    if (p.masked) return `<li><span class="db-co">타사</span><span class="db-mut">담당자 연락은 원청을 통해</span></li>`;
    return `<li><span class="db-co">${coChip(cid)}<small>${esc(p.trade)}</small></span><span>${esc(p.lead.name)} ${telA(p.lead)}</span><span>${esc(p.part.name)} ${telA(p.part)}</span></li>`;
  }).join('');
  const hq = HQ_CONTACTS[hqKey || (c.severity === 'PROHIBITED' ? 'safety' : 'schedule')];
  return `<div class="db-people"><div class="db-lbl">담당자</div><ul>${rows}<li class="db-hq"><span class="db-co">원청</span><span>${esc(hq.team)} ${esc(hq.name)} ${telA(hq)}</span></li></ul></div>`;
}
function evidenceFold(c, tasks, key, open = false) {
  const src = tasksOf(c, tasks).filter((x) => x.source && x.source.text);
  if (!c.reason && !c.law_ref && !src.length && !c.rule_id) return '';
  return `<details class="p2-fold db-ev" data-p2key="${esc(key)}"${openAttr(key, open)}>
    <summary>근거 보기</summary>
    ${c.reason ? `<div class="db-ev-row"><span class="db-lbl">왜 문제인가</span><p>${esc(c.reason)}</p></div>` : ''}
    ${c.rule_id ? `<div class="db-ev-row"><span class="db-lbl">판정 규칙</span><p><code>${esc(c.rule_id)}</code> · ${esc(TYPE_NAME[c.type] || c.type || '')}</p></div>` : ''}
    ${c.law_ref ? `<div class="db-ev-row"><span class="db-lbl">법 근거</span><p>${esc(c.law_ref)}</p></div>` : ''}
    ${src.map((x) => `<div class="db-ev-row"><span class="db-lbl">계획서 원문</span><p><small>${esc(x.source.file || coName(x.company_id))}${x.source.locator ? ` · ${esc(x.source.locator)}` : ''}</small><br>“${esc(x.source.text)}”</p></div>`).join('')}
  </details>`;
}

// ---------- 오른쪽: 전체 = 위험 대시보드 ----------
/* 정보 나열 대신: 숫자 타일 → 지금 해결할 문제(담당자·근거) → 나머지는 한 줄씩 */
function whenTxt(c, t) {
  if (!t) return range(c.start, c.end, t);
  if (c.start <= t && t < c.end) return `<b class="db-live">지금 진행 중</b> · ~${esc(tm(c.end, t))}`;
  if (c.start > t) return `${esc(tm(c.start, t))} 시작 예정`;
  return `${esc(tm(c.end, t))} 종료`;
}
function needTxt(c, alternatives) {
  if (c.severity === 'PROHIBITED') return alternatives?.[c.id] ? '해야 할 일: 조정안 하나를 골라 겹침 없애기 (모두 멈추지 않음)' : '해야 할 일: 시간·위치를 조정해 겹침 없애기';
  if (c.severity === 'CONDITIONAL') return `조건 지키고 진행${c.suggestion?.text ? ` — ${c.suggestion.text}` : ''}`;
  return `계획서 보완${c.suggestion?.text ? ` — ${c.suggestion.text}` : ''}`;
}
function probCard(c, ctx, opts = {}) {
  const { tasks, zm, alternatives, role, t } = ctx, s = sevOf(c.severity);
  return `<article class="db-prob${opts.on ? ' db-on' : ''}" style="--sev:${s.color}">
    <div class="db-prob-top"><span class="db-pill">${s.mark} ${esc(s.label)}</span><span class="db-type">${esc(TYPE_NAME[c.type] || '')}</span><span class="db-when">${whenTxt(c, t)}</span></div>
    <button type="button" class="db-prob-title" data-conflict="${esc(c.id)}">${esc(c.title)}</button>
    <div class="db-prob-key">${keyLine(c, tasks, zm)}</div>
    <div class="db-need">${esc(needTxt(c, alternatives))}</div>
    ${peopleBlock(c, tasks, role)}
    ${evidenceFold(c, tasks, 'ev:' + c.id, !!opts.on)}
    ${opts.on && c.severity === 'PROHIBITED' ? altSection(c, alternatives, role) : ''}
    <div class="db-btns"><button type="button" class="db-btn" data-conflict="${esc(c.id)}">${opts.on ? '3D 강조 끄기' : '3D에서 보기'}</button></div>
  </article>`;
}
function violCard(v, role, t) {
  const p = contactFor(v.company, role), hq = HQ_CONTACTS.safety;
  return `<article class="db-prob db-viol" style="--sev:${SEV.PROHIBITED.color}">
    <div class="db-prob-top"><span class="db-pill">⚠ 출입 제한 위반</span><span class="db-when"><b class="db-live">지금</b></span></div>
    <button type="button" class="db-prob-title" data-task="${esc(v.taskId)}">${esc(coName(v.company))} ${esc(shortTitle(v.title))}</button>
    <div class="db-prob-key">${esc(v.zoneName || '')} · 안전띠·러버콘으로 막힌 ${esc((v.hit || v.dirs || []).map((d) => ({ N: '북', E: '동', S: '남', W: '서' }[d] || d)).join('·'))}쪽 안에서 작업</div>
    <div class="db-need">해야 할 일: 사고 전에 시정 명령 (작업 위치 이동 또는 일시 중지)</div>
    <div class="db-people"><div class="db-lbl">담당자</div><ul>${p && !p.masked ? `<li><span class="db-co">${coChip(v.company)}</span><span>${esc(p.lead.name)} ${telA(p.lead)}</span><span>${esc(p.part.name)} ${telA(p.part)}</span></li>` : ''}<li class="db-hq"><span class="db-co">원청</span><span>${esc(hq.team)} ${esc(hq.name)} ${telA(hq)}</span></li></ul></div>
  </article>`;
}
export function renderRightIntro({ title, t, conflicts, tasks, alternatives, zones, role, selectedConflictId, violations = [], pending = 0 }) {
  const zm = zoneMap(zones);
  const list = sortConf(conflicts).filter((c) => !t || !c.end || c.end > t);
  const ctx = { tasks, zm, alternatives, role, t, selectedConflictId };
  const n = (k) => list.filter((c) => c.severity === k).length;
  const live = (c) => !t || (c.start <= t && t < c.end);
  // 지금 해결할 문제: 고른 것 → 금지 → 지금 걸린 조건부 (최대 3개)
  const sel = list.find((c) => c.id === selectedConflictId);
  const top = [];
  if (sel) top.push(sel);
  for (const c of list) { if (top.length >= 3) break; if (top.includes(c)) continue; if (c.severity === 'PROHIBITED' || (c.severity === 'CONDITIONAL' && live(c) && top.length < 2)) top.push(c); }
  const rest = list.filter((c) => !top.includes(c));
  const nStop = n('PROHIBITED') + violations.length;
  const tile = (k, label, v, sub) => `<div class="db-tile${v ? ' db-hot' : ''}" style="--sev:${k}"><b>${v}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  return `<div class="p2 db">
    <div class="p2-head"><h2 class="p2-h2">${esc(title || '전체')} 위험 현황</h2><span class="p2-time p2-big">${esc(tm(t, t))} 기준</span></div>
    <div class="db-status ${nStop ? 'bad' : list.length ? 'warn' : 'ok'}">${nStop ? `멈추기 전에 풀어야 할 문제 <b>${nStop}</b>건` : list.length ? '멈출 문제는 없음 · 조건 지키며 진행' : '✓ 지금 걸린 위험이 없습니다'}</div>
    <div class="db-tiles">
      ${tile(SEV.PROHIBITED.color, '금지', n('PROHIBITED'), '조정 필요')}
      ${tile('#c62828', '구역 위반', violations.length, '시정 명령')}
      ${tile(SEV.CONDITIONAL.color, '조건부', n('CONDITIONAL'), '알림만')}
      ${tile(SEV.DEFECT.color, '결함', n('DEFECT'), '계획 보완')}
      ${pending ? tile('#2e6fd0', '승인 대기', pending, '착수 전') : ''}
    </div>
    ${violations.length || top.length ? `<h3 class="p2-h3">지금 해결할 문제</h3>` : ''}
    ${violations.slice(0, 2).map((v) => violCard(v, role, t)).join('')}
    ${top.map((c) => probCard(c, ctx, { on: c.id === selectedConflictId })).join('')}
    ${rest.length ? `<details class="p2-fold db-rest" data-p2key="db-rest"${openAttr('db-rest', false)}><summary>다른 위험 ${rest.length}건</summary><ul>${rest.map((c) => { const s = sevOf(c.severity); return `<li><button type="button" data-conflict="${esc(c.id)}"><span style="color:${s.color}">${s.mark}</span><span class="p2-time">${esc(tm(c.start, t))}</span><span class="db-rest-t">${esc(c.title)}</span></button></li>`; }).join('')}</ul></details>` : ''}
  </div>`;
}

// ---------- 오른쪽: 구역 ----------
export function renderRightZone({ zone, zones, t, tasks, conflicts, alternatives, guidance, selectedTaskId, role, selectedConflictId }) {
  if (!zone) return renderRightIntro({ title: '전체', t, conflicts, tasks, alternatives, zones, role });
  const zm = zoneMap(zones);
  const zt = (tasks || []).filter((x) => (x.zone_ids || []).includes(zone.id) && x.status !== 'rejected');
  const now = zt.filter((x) => isNow(x, t));
  const later = zt.filter((x) => !isNow(x, t) && (!t || x.end > t));
  const zc = sortConf((conflicts || []).filter((c) => (c.zone_ids || []).includes(zone.id)));
  const crew = now.filter((x) => x.acc !== 'limited').reduce((s, x) => s + (x.crew || 0), 0);
  const ctx = { tasks, zm, alternatives, role, t, selectedConflictId };
  const g = guidance && (!guidance.zoneId || guidance.zoneId === zone.id) ? guidance : null;
  return `<div class="p2">
    <button type="button" class="p2-back" data-back="1">‹ 전체로</button>
    <div class="p2-head"><h2 class="p2-h2">${esc(zone.name)}</h2></div>
    ${zone.plain ? `<p class="p2-plain">${esc(zone.plain)}</p>` : ''}
    <div class="p2-chips">
      <span class="p2-chip">${esc(LEVEL_NAME[zone.level] ?? zone.level)}</span>
      ${zone.side ? `<span class="p2-chip">${esc(SIDE_NAME[zone.side] || zone.side)}</span>` : ''}
      ${zone.cap ? `<span class="p2-chip">정원 <b>${esc(zone.cap)}</b>명</span>` : ''}
      ${zone.confined ? '<span class="p2-chip p2-chip-warn">밀폐공간</span>' : ''}
    </div>
    ${actionBox(deriveActions(zc, tasks, alternatives, t), t)}
    <h3 class="p2-h3">지금 작업 <b>${now.length}</b>건 · <b>${crew}</b>명</h3>
    ${now.length ? now.map((x) => taskCard(x, t, selectedTaskId, conflicts)).join('') : '<div class="p2-empty">지금은 이 구역에 작업이 없습니다.</div>'}
    ${later.length ? `<details class="p2-fold" data-p2key="later:${esc(zone.id)}"${openAttr('later:' + zone.id, false)}><summary>다음 작업 ${later.length}건</summary>${later.map((x) => taskCard(x, t, selectedTaskId, conflicts)).join('')}</details>` : ''}
    ${guidanceBlock(g, t, zone.name)}
    <h3 class="p2-h3">걸린 위험 <b>${zc.length}</b>건</h3>
    ${conflictList(zc, ctx, '이 구역에 걸린 위험이 없습니다.')}
  </div>`;
}

// ---------- 오른쪽: 작업 하나 ----------
export function renderRightTask({ task, zones, t, conflicts, guidance, alternatives, role, tasks, selectedConflictId }) {
  if (!task) return renderRightIntro({ title: '전체', t, conflicts, tasks, alternatives, zones, role });
  const zm = zoneMap(zones);
  const lim = task.acc === 'limited';
  const tc = sortConf((conflicts || []).filter((c) => (c.task_ids || []).includes(task.id)));
  const allTasks = tasks || [task];
  // 영향받는 사람: 이 작업과 판정으로 엮인 다른 작업
  const others = new Map();
  for (const c of tc) for (const id of c.task_ids || []) {
    if (id === task.id || others.has(id)) continue;
    const o = allTasks.find((x) => x.id === id);
    others.set(id, { o, sev: c.severity });
  }
  const ctx = { tasks: allTasks, zm, alternatives, role, t, selectedConflictId };
  const g = guidance && (!guidance.zoneId || (task.zone_ids || []).includes(guidance.zoneId)) ? guidance : null;
  const firstZone = task.zone_ids?.[0];
  return `<div class="p2">
    <button type="button" class="p2-back" ${firstZone ? `data-zone="${esc(firstZone)}"` : 'data-back="1"'}>‹ ${esc(firstZone ? zName(zm, firstZone) : '전체')}로</button>
    <div class="p2-head"><h2 class="p2-h2">${esc(task.title)}</h2></div>
    <div class="p2-chips">${coChip(task.company_id)}${range(task.start, task.end, t)}${task.status === 'pending' ? '<span class="p2-pend">승인 대기 · 착수 불가</span>' : ''}${task.urgent ? '<span class="p2-chip p2-chip-warn">긴급 변경</span>' : ''}</div>
    <dl class="p2-facts">
      <dt>위치</dt><dd>${(task.zone_ids || []).map((z) => `<button type="button" class="p2-zlink" data-zone="${esc(z)}">${esc(zName(zm, z))}</button>`).join(' ') || '지상 (노 밖)'}</dd>
      ${lim ? '<dt>구분</dt><dd class="p2-limtxt">다른 업체 작업 (영향) — 인원·장비 정보는 숨김</dd>' : `<dt>인원</dt><dd><b>${esc(task.crew ?? '-')}</b>명</dd>`}
      ${(task.work_types || []).length ? `<dt>작업 유형</dt><dd>${esc(task.work_types.map((w) => WORK_TYPE_NAME[w] || w).join(', '))}</dd>` : ''}
      ${!lim && (task.equipment || []).length ? `<dt>장비</dt><dd>${esc(task.equipment.join(', '))}</dd>` : ''}
      ${task.requested_by ? `<dt>요청</dt><dd>${esc(coName(task.requested_by.company_id))} ${esc(task.requested_by.name || '')}</dd>` : ''}
      ${task.approved_by ? `<dt>승인</dt><dd>${esc(task.approved_by.name || task.approved_by.role || '')} · ${esc(tm(task.approved_by.at, t))}</dd>` : ''}
    </dl>
    ${(task.preconditions || []).length ? `<h3 class="p2-h3">시작 조건</h3><ul class="p2-pre">${task.preconditions.map((p) => `<li>${esc(p.text)}</li>`).join('')}</ul>` : ''}
    <h3 class="p2-h3">영향받는 사람</h3>
    ${others.size ? `<ul class="p2-aff">${[...others.entries()].map(([id, { o, sev }]) => {
      const s = sevOf(sev);
      return `<li><button type="button" class="p2-aff-row" data-task="${esc(id)}" style="--sev:${s.color}">
        <span style="color:${s.color}">${s.mark}</span>
        <span>${o ? `${esc(coName(o.company_id))}${o.acc === 'limited' || o.crew == null ? '' : ` <b>${esc(o.crew)}</b>명`} · ${esc(shortTitle(o.title))} <span class="p2-sub">${esc((o.zone_ids || []).map((z) => zName(zm, z)).join('·'))}</span>` : esc(id)}</span>
      </button></li>`;
    }).join('')}</ul>` : '<div class="p2-empty">이 작업과 엮인 다른 작업이 없습니다.</div>'}
    ${guidanceBlock(g, t, firstZone ? zName(zm, firstZone) : '')}
    <h3 class="p2-h3">걸린 위험 <b>${tc.length}</b>건</h3>
    ${conflictList(tc, ctx, '이 작업에 걸린 위험이 없습니다.')}
  </div>`;
}
