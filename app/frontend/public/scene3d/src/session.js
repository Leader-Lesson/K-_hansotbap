/* 한솥밥 3D · 보는 사람(역할) 전환 + 긴급 변경 알림함 + 승인 창
   SPEC_v2 §2 역할, §4 긴급 변경·승인. 프레임워크 없음, 스타일은 ss- 접두어로 직접 주입 */

import { SEV, WORK_TYPE_NAME, fmtDateTime } from './theme.js';

const NAVY = '#14294b';
const STATUS = {
  pending: { label: '승인 대기', bg: '#fff3d6', fg: '#8a5a00', bd: '#e0a400' },
  approved: { label: '승인됨', bg: '#e3f4e6', fg: '#1d6b2f', bd: '#3a9a50' },
  rejected: { label: '반려', bg: '#eceef0', fg: '#59626c', bd: '#a3abb4' },
};
const LEVEL_KO = { manager: '관리자', lead: '파트장', worker: '작업자' };
const KIND_KO = { ADD: '작업 추가', MOVE: '작업 변경', CANCEL: '작업 취소' };

const CSS = `
.ss-wrap{display:flex;align-items:center;gap:10px;margin-left:14px;flex-shrink:0}
.ss-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;color:#fff;font-weight:700;font-size:15px;white-space:nowrap}
.ss-role{display:flex;align-items:center;gap:6px;font-size:15px;color:#1f2933}
.ss-role label{font-weight:700;color:#5b6672}
.ss-role select{font-size:16px;padding:6px 8px;border:1px solid #b9c0c8;border-radius:8px;background:#fff;min-height:38px}
.ss-bellbox{position:relative}
.ss-bell{position:relative;width:44px;height:40px;border:1px solid #b9c0c8;border-radius:10px;background:#fff;font-size:20px;cursor:pointer}
.ss-bell:hover{background:#f3f5f7}
.ss-badge{position:absolute;top:-7px;right:-7px;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:#c62828;color:#fff;font-size:13px;font-weight:700;line-height:22px;text-align:center}
.ss-badge[hidden]{display:none}
.ss-drop{position:absolute;right:0;top:48px;width:420px;max-height:70vh;overflow:auto;background:#fff;border:1px solid #c9cfd6;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.18);z-index:1200;padding:10px}
.ss-drop[hidden]{display:none}
.ss-drop h4{margin:4px 6px 10px;font-size:17px}
.ss-item{display:block;width:100%;text-align:left;border:1px solid #e1e5ea;border-radius:10px;background:#fff;padding:10px 12px;margin-bottom:8px;cursor:pointer;font-size:15px;color:#1f2933}
.ss-item:hover{background:#f6f8fa}
.ss-item.ss-pend{border-left:6px solid #e0a400}
.ss-item b{display:block;font-size:16px;margin:4px 0 2px}
.ss-item small{color:#5b6672;font-size:14px}
.ss-st{display:inline-block;padding:2px 10px;border-radius:999px;font-size:13px;font-weight:700;border:1px solid}
.ss-empty{padding:16px;color:#5b6672;font-size:15px;text-align:center}
.ss-sim{width:100%;margin-top:6px;padding:10px;font-size:15px;font-weight:700;border:1px dashed #8a96a3;border-radius:10px;background:#f7f8fa;cursor:pointer;color:#33404d}
.ss-banner{position:fixed;left:0;right:0;z-index:1100;background:#c62828;color:#fff;display:flex;align-items:center;gap:14px;padding:12px 20px;font-size:18px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.25);transform:translateY(-120%);transition:transform .35s ease}
.ss-banner:not(.ss-show){visibility:hidden;transition:transform .35s ease,visibility 0s .35s}
.ss-banner.ss-show{transform:translateY(0)}
.ss-banner .ss-btxt{flex:1}
.ss-banner button{font-size:16px;font-weight:700;padding:8px 16px;border-radius:8px;border:2px solid #fff;cursor:pointer}
.ss-bview{background:#fff;color:#c62828}
.ss-bclose{background:transparent;color:#fff}
.ss-toast{position:fixed;right:20px;bottom:90px;z-index:1300;background:#1f2933;color:#fff;padding:12px 18px;border-radius:10px;font-size:16px;box-shadow:0 6px 20px rgba(0,0,0,.25);opacity:0;transition:opacity .3s}
.ss-toast.ss-show{opacity:1}
.ss-ov{position:fixed;inset:0;background:rgba(15,23,32,.5);z-index:1400;display:flex;align-items:center;justify-content:center;padding:16px}
.ss-ov[hidden]{display:none}
.ss-modal{background:#fff;border-radius:14px;width:min(640px,100%);max-height:90vh;overflow:auto;padding:22px 24px;font-size:16px;color:#1f2933;box-shadow:0 20px 50px rgba(0,0,0,.3)}
.ss-modal h3{margin:0 0 6px;font-size:21px}
.ss-modal h5{margin:18px 0 8px;font-size:17px}
.ss-kv{display:grid;grid-template-columns:96px 1fr;gap:6px 12px;margin-top:12px}
.ss-kv dt{color:#5b6672;font-weight:700}
.ss-kv dd{margin:0}
.ss-risk{border-left:6px solid;padding:8px 12px;margin-bottom:8px;background:#fafafa;border-radius:6px}
.ss-risk b{display:block}
.ss-risk span{color:#4a5560;font-size:15px}
.ss-guide{margin:0;padding-left:20px}
.ss-guide li{margin-bottom:4px}
.ss-none{color:#5b6672}
.ss-acts{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}
.ss-acts button{font-size:17px;font-weight:700;padding:12px 18px;border-radius:10px;cursor:pointer;border:1px solid #b9c0c8;background:#fff;min-height:48px}
.ss-acts .ss-ok{background:#1d6b2f;border-color:#1d6b2f;color:#fff}
.ss-acts .ss-no{background:#59626c;border-color:#59626c;color:#fff}
.ss-acts button:disabled{background:#e5e8eb;border-color:#d0d5da;color:#8a939c;cursor:not-allowed}
.ss-need{margin-top:10px;padding:10px 12px;background:#fff3d6;border:1px solid #e0a400;border-radius:8px;color:#8a5a00;font-weight:700}
.ss-audit{margin-top:18px;border-top:1px solid #e1e5ea;padding-top:10px;font-size:14px;color:#4a5560}
.ss-audit ul{margin:4px 0 0;padding-left:18px}
@media (max-width:700px){.ss-drop{width:calc(100vw - 32px);right:-60px}.ss-role label{display:none}}
`;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nowIso = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const fdt = iso => { try { return iso ? fmtDateTime(iso) : '-'; } catch { return iso || '-'; } };

/* 변경 종류 이름: 잔업 계획서는 긴급 변경과 같은 승인 절차를 타지만 이름을 구분 */
const kindName = (ch) => (ch && ch.kind === 'OVERTIME' ? '잔업 계획서' : '긴급 작업 변경');

export function buildSession({ topbar, zones = [], companies = [], onRoleChange, onDecision, onSimulate, previewRisks, previewGuidance } = {}) {
  const coById = Object.fromEntries(companies.map(c => [c.id, c]));
  const zoneName = id => (zones.find(z => z.id === id) || {}).name || id;
  const coName = id => (coById[id] || {}).name || id || '-';

  /* 역할 목록: 원청 + 업체별 파트장/작업자 */
  const ROLES = [{ id: 'PRIME', level: 'manager', name: '원청 · 직영 관리자' }];
  companies.forEach(c => {
    ROLES.push({ id: c.id, level: 'lead', name: `${c.name} 파트장` });
    ROLES.push({ id: c.id, level: 'worker', name: `${c.name} 작업자` });
  });
  const key = r => `${r.id}|${r.level}`;
  const findRole = (id, level) => ROLES.find(r => r.id === id && r.level === level);

  let role = ROLES[0];
  try {
    const q = new URLSearchParams(location.search);
    const r = findRole(q.get('role'), q.get('level') || 'lead');
    if (r) role = r;
  } catch { /* 주소 해석 실패 시 원청 */ }

  const list = [];          // Change[]
  const audit = [];         // { changeId, action, who, at }
  let unseen = 0, notifAsked = false, bannerTimer = 0, toastTimer = 0, openId = null;

  /* 스타일 */
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  /* 상단 바: 역할 칩 + 선택 + 종 */
  const wrap = document.createElement('div');
  wrap.className = 'ss-wrap';
  wrap.innerHTML = `
    <span class="ss-chip"></span>
    <div class="ss-role"><label for="ss-role-sel">보는 사람</label>
      <select id="ss-role-sel" aria-label="보는 사람 선택">${ROLES.map(r => `<option value="${key(r)}">${esc(r.name)}</option>`).join('')}</select></div>
    <div class="ss-bellbox">
      <button type="button" class="ss-bell" aria-label="긴급 변경 알림함">🔔<span class="ss-badge" hidden>0</span></button>
      <div class="ss-drop" hidden role="dialog" aria-label="긴급 변경 알림함"></div>
    </div>`;
  (topbar || document.body).appendChild(wrap);
  const chip = wrap.querySelector('.ss-chip');
  const sel = wrap.querySelector('select');
  const bell = wrap.querySelector('.ss-bell');
  const badge = wrap.querySelector('.ss-badge');
  const drop = wrap.querySelector('.ss-drop');

  /* 빨간 띠 · 토스트 · 승인 창 */
  const banner = document.createElement('div');
  banner.className = 'ss-banner';
  banner.setAttribute('role', 'alert');
  banner.innerHTML = `<span>⚠</span><span class="ss-btxt"></span><button type="button" class="ss-bview">내용 보기</button><button type="button" class="ss-bclose" aria-label="띠 닫기">✕</button>`;
  const toast = document.createElement('div');
  toast.className = 'ss-toast';
  toast.setAttribute('aria-live', 'polite');
  const ov = document.createElement('div');
  ov.className = 'ss-ov';
  ov.hidden = true;
  ov.innerHTML = `<div class="ss-modal" role="dialog" aria-modal="true"></div>`;
  const modal = ov.firstElementChild;
  document.body.append(banner, toast, ov);

  /* 권한 (SPEC §4) */
  function canApprove(r, ch) {
    if (!r || !ch) return false;
    if (r.id === 'PRIME' && r.level === 'manager') return true;
    if (r.level !== 'lead') return false;
    const own = ch.task?.company_id ?? ch.requested_by?.company_id;
    return own === r.id || (ch.affected_company_ids || []).includes(r.id);
  }

  function renderRole() {
    sel.value = key(role);
    const co = coById[role.id];
    chip.style.background = role.id === 'PRIME' ? NAVY : (co?.color || NAVY);
    chip.textContent = role.id === 'PRIME' ? '원청 관리자' : `${co?.name || role.id} ${LEVEL_KO[role.level] || ''}`;
  }

  function stChip(s) {
    const t = STATUS[s] || STATUS.pending;
    return `<span class="ss-st" style="background:${t.bg};color:${t.fg};border-color:${t.bd}">${t.label}</span>`;
  }

  function sorted() {
    return list.slice().sort((a, b) => ((a.status === 'pending') - (b.status === 'pending')) * -1 || String(b.at).localeCompare(String(a.at)));
  }

  function renderBadge() {
    const pend = list.filter(c => c.status === 'pending').length;
    const n = Math.max(unseen, 0) || pend;
    badge.textContent = n;
    badge.hidden = n === 0;
  }

  function renderDrop() {
    const items = sorted().map(c => `
      <button type="button" class="ss-item ${c.status === 'pending' ? 'ss-pend' : ''}" data-id="${esc(c.id)}">
        ${stChip(c.status)} <small>${esc(fdt(c.at))} · ${esc(coName(c.requested_by?.company_id || c.task?.company_id))}</small>
        <b>${esc(c.title || c.task?.title || '긴급 변경')}</b>
        <small>${esc((c.task?.zone_ids || []).map(zoneName).join(', '))}${c.task ? ` · ${esc(fdt(c.task.start))}~${esc(fdt(c.task.end).split(' ').pop())}` : ''}</small>
      </button>`).join('');
    drop.innerHTML = `<h4>긴급 변경 · 잔업 계획서 알림</h4>${items || '<div class="ss-empty">들어온 긴급 변경이 없습니다</div>'}
      ${onSimulate ? '<button type="button" class="ss-sim">▶ 긴급 변경 시뮬레이션 (시연용)</button>' : ''}`;
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('ss-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('ss-show'), 4000);
  }

  function placeBanner() {
    const b = topbar?.getBoundingClientRect?.();
    banner.style.top = `${b ? Math.max(0, b.bottom) : 0}px`;
  }

  function showBanner(ch) {
    placeBanner();
    banner.dataset.id = ch.id;
    banner.querySelector('.ss-btxt').textContent =
      `${kindName(ch)} — ${coName(ch.requested_by?.company_id || ch.task?.company_id)} ${ch.title || ch.task?.title || ''} · 승인 전 착수 불가`;
    banner.classList.add('ss-show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(hideBanner, 20000);
  }
  function hideBanner() { banner.classList.remove('ss-show'); }

  function sysNotify(ch) {
    try {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const n = new Notification(`${kindName(ch)} — 승인 필요`, {
        body: `${coName(ch.requested_by?.company_id || ch.task?.company_id)} ${ch.title || ch.task?.title || ''} · 승인 전 착수 불가`,
        tag: `ss-${ch.id}`,
      });
      n.onclick = () => { try { window.focus(); } catch { } openChange(ch.id); n.close(); };
    } catch { /* 알림 실패는 무시 */ }
  }

  function renderModal() {
    const ch = list.find(c => c.id === openId);
    if (!ch) { ov.hidden = true; return; }
    const t = ch.task || {};
    const allowed = canApprove(role, ch);
    const pending = ch.status === 'pending';
    let risks = [], guide = [];
    try { risks = previewRisks?.(ch) || []; } catch (e) { console.warn('previewRisks', e); }
    try { guide = previewGuidance?.(ch) || []; } catch (e) { console.warn('previewGuidance', e); }
    const sevOf = s => SEV[s] || { color: '#5b6672', label: s || '' };
    const logs = audit.filter(a => a.changeId === ch.id);

    modal.innerHTML = `
      <div>${stChip(ch.status)} <small style="color:#5b6672">${esc(KIND_KO[ch.kind] || '')} · 접수 ${esc(fdt(ch.at))}</small></div>
      <h3>${kindName(ch)} — ${esc(ch.title || t.title || '')}</h3>
      <dl class="ss-kv">
        <dt>업체</dt><dd>${esc(coName(t.company_id))}${ch.requested_by?.name ? ` (요청: ${esc(ch.requested_by.name)})` : ''}</dd>
        <dt>작업</dt><dd>${esc(t.title || '-')}</dd>
        <dt>구역</dt><dd>${esc((t.zone_ids || []).map(zoneName).join(', ') || '-')}</dd>
        <dt>시간</dt><dd>${esc(fdt(t.start))} ~ ${esc(fdt(t.end))}</dd>
        <dt>인원</dt><dd>${t.crew != null ? `${esc(t.crew)}명` : '-'}</dd>
        <dt>작업 유형</dt><dd>${esc((t.work_types || []).map(w => WORK_TYPE_NAME[w] || w).join(' · ') || '-')}</dd>
      </dl>
      <h5>승인 시 생길 위험</h5>
      ${risks.length ? risks.map(r => { const s = sevOf(r.severity); return `
        <div class="ss-risk" style="border-color:${s.color}"><b style="color:${s.color}">${esc(s.mark || '')} ${esc(s.label)} · ${esc(r.title)}</b><span>${esc(r.reason || '')}</span></div>`; }).join('')
        : '<div class="ss-none">새로 생기는 위험이 없습니다</div>'}
      <h5>바뀌는 안전 안내</h5>
      ${guide.length ? `<ul class="ss-guide">${guide.map(g => `<li>${esc(g)}</li>`).join('')}</ul>` : '<div class="ss-none">바뀌는 안내가 없습니다</div>'}
      ${pending && !allowed ? '<div class="ss-need">승인 대기 — 파트장 또는 원청 관리자 승인 필요</div>' : ''}
      <div class="ss-acts">
        <button type="button" class="ss-ok" ${pending && allowed ? '' : 'disabled'}>승인 — 착수 허용</button>
        <button type="button" class="ss-no" ${pending && allowed ? '' : 'disabled'}>반려</button>
        <button type="button" class="ss-x">닫기</button>
      </div>
      <div class="ss-audit"><b>감사 기록</b>
        ${logs.length ? `<ul>${logs.map(a => `<li>${esc(fdt(a.at))} · ${esc(a.who)} · ${a.action === 'approved' ? '승인' : a.action === 'rejected' ? '반려' : '접수'}</li>`).join('')}</ul>` : '<div>기록 없음</div>'}
      </div>`;
    ov.hidden = false;
    modal.querySelector('.ss-ok').onclick = () => decide(ch, 'approved');
    modal.querySelector('.ss-no').onclick = () => decide(ch, 'rejected');
    modal.querySelector('.ss-x').onclick = closeModal;
    (pending && allowed ? modal.querySelector('.ss-ok') : modal.querySelector('.ss-x')).focus();
  }

  function decide(ch, action) {
    if (!canApprove(role, ch) || ch.status !== 'pending') return;
    const at = nowIso();
    ch.status = action;
    ch.decided_by = { role: { id: role.id, level: role.level }, name: role.name, at };
    if (ch.task) {
      ch.task.status = action === 'approved' ? 'active' : 'rejected';
      if (action === 'approved') ch.task.approved_by = { role: role.id, name: role.name, at };
    }
    audit.push({ changeId: ch.id, action, who: role.name, at });
    try { onDecision?.(ch, action, role); } catch (e) { console.error('onDecision', e); }
    if (banner.dataset.id === ch.id) hideBanner();
    showToast(action === 'approved' ? `승인됨 — ${ch.title || ''} 착수 허용` : `반려됨 — ${ch.title || ''}`);
    renderBadge(); renderDrop(); renderModal();
    setTimeout(closeModal, 900);   // 결정 결과를 잠깐 보여 주고 닫아 3D 안내가 보이게
  }

  function closeModal() { ov.hidden = true; openId = null; }

  function openChange(id) {
    if (!list.some(c => c.id === id)) return;
    openId = id;
    drop.hidden = true;
    hideBanner();
    renderModal();
  }

  function pushChange(change) {
    const ch = { urgent: true, status: 'pending', at: nowIso(), ...change };
    if (!ch.id) ch.id = `CH-${Date.now()}`;
    if (ch.task && ch.status === 'pending') ch.task.status = 'pending';
    const i = list.findIndex(c => c.id === ch.id);
    if (i >= 0) list[i] = ch; else list.push(ch);
    audit.push({ changeId: ch.id, action: 'received', who: ch.requested_by?.name || coName(ch.requested_by?.company_id || ch.task?.company_id), at: ch.at });
    unseen++;
    renderBadge(); renderDrop();
    showBanner(ch);
    showToast(`${kindName(ch)} 도착 — ${ch.title || ''}`);
    sysNotify(ch);
    if (openId === ch.id) renderModal();
    return ch;
  }

  function updateChange(id, patch = {}) {
    const ch = list.find(c => c.id === id);
    if (!ch) return null;
    Object.assign(ch, patch);
    if (patch.task && ch.status === 'pending') ch.task.status = ch.task.status || 'pending';
    renderBadge(); renderDrop();
    if (openId === id) renderModal();
    return ch;
  }

  function setRole(r) {
    if (!r) return;
    role = findRole(r.id, r.level) || { ...r, name: r.name || `${coName(r.id)} ${LEVEL_KO[r.level] || ''}` };
    api.role = role;
    renderRole();
    if (openId) renderModal();
  }

  /* 이벤트 */
  const onSel = () => {
    const [id, level] = sel.value.split('|');
    setRole(findRole(id, level));
    try { onRoleChange?.(role); } catch (e) { console.error('onRoleChange', e); }
  };
  const onBell = e => {
    e.stopPropagation();
    if (!notifAsked) {
      notifAsked = true;
      try { if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().catch?.(() => { }); } catch { }
    }
    drop.hidden = !drop.hidden;
    if (!drop.hidden) { unseen = 0; renderDrop(); renderBadge(); }
  };
  const onDrop = e => {
    e.stopPropagation();
    const it = e.target.closest('.ss-item');
    if (it) return openChange(it.dataset.id);
    if (e.target.closest('.ss-sim')) { try { onSimulate?.(); } catch (er) { console.error('onSimulate', er); } }
  };
  const onDoc = e => { if (!wrap.contains(e.target)) drop.hidden = true; };
  const onKey = e => { if (e.key === 'Escape') { if (!ov.hidden) closeModal(); else drop.hidden = true; } };
  const onOv = e => { if (e.target === ov) closeModal(); };
  const onResize = () => placeBanner();

  sel.addEventListener('change', onSel);
  bell.addEventListener('click', onBell);
  drop.addEventListener('click', onDrop);
  document.addEventListener('click', onDoc);
  document.addEventListener('keydown', onKey);
  ov.addEventListener('click', onOv);
  window.addEventListener('resize', onResize);
  banner.querySelector('.ss-bview').onclick = () => openChange(banner.dataset.id);
  banner.querySelector('.ss-bclose').onclick = hideBanner;

  renderRole(); renderBadge(); renderDrop();

  const api = {
    role,
    setRole,
    pushChange,
    updateChange,
    changes: () => list.slice(),
    canApprove,
    openChange,
    dispose() {
      clearTimeout(bannerTimer); clearTimeout(toastTimer);
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      wrap.remove(); banner.remove(); toast.remove(); ov.remove(); style.remove();
    },
  };
  return api;
}
