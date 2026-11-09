/* 한솥밥 3D · 규칙 엔진 (DOM·three.js 없음, 순수 계산)
   SPEC_v2 §1~3: 충돌 판정 · 영향 범위 · 권한(열람) · 위험/안전 안내
   시간은 'YYYY-MM-DDTHH:MM' 문자열 → 2027-01-01 기준 분(min)으로 바꿔 계산 (자정 넘어도 안전) */

/* ───────── 시간 도우미 ───────── */
const BASE = Date.UTC(2027, 0, 1);
export function toMin(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || '');
  if (!m) return NaN;
  return (Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - BASE) / 60000;
}
export function fromMin(min) {
  const d = new Date(BASE + Math.round(min) * 60000), p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
const hhmm = iso => (iso || '').slice(11, 16);

/* 작업이 실제로 하는 구간들 (중지 시간 pauses 를 뺀 조각) → [[s,e],...] 분 단위 */
export function activeIntervals(task) {
  let segs = [[toMin(task.start), toMin(task.end)]];
  for (const [ps, pe] of task.pauses || []) {
    const a = toMin(ps), b = toMin(pe), next = [];
    for (const [s, e] of segs) {
      if (b <= s || a >= e) { next.push([s, e]); continue; }
      if (a > s) next.push([s, a]);
      if (b < e) next.push([b, e]);
    }
    segs = next;
  }
  return segs.filter(([s, e]) => e > s);
}
/* 두 작업이 동시에 하는 구간들 */
function overlapIntervals(a, b) {
  const out = [];
  for (const [s1, e1] of activeIntervals(a)) for (const [s2, e2] of activeIntervals(b)) {
    const s = Math.max(s1, s2), e = Math.min(e1, e2);
    if (e > s) out.push([s, e]);
  }
  return out.sort((x, y) => x[0] - y[0]);
}
/* t(분)에 작업 중인가 */
const activeAt = (task, tm) => activeIntervals(task).some(([s, e]) => s <= tm && tm < e);

/* ───────── 공통 도우미 ───────── */
const GAS_SYS = ['N2', 'O2', 'BFG'];
const GAS_NAME = { N2: '질소', O2: '산소', BFG: '고로가스' };
const has = (t, w) => (t.work_types || []).includes(w);
const live = t => t && t.status !== 'rejected';
const isPending = t => t && t.status === 'pending';
const zmap = zones => new Map(zones.map(z => [z.id, z]));
const zname = (Z, id) => (Z.get(id) || { name: id }).name;
const inter = (a, b) => a.filter(x => b.includes(x));
const gasSys = t => inter(t.systems || [], GAS_SYS);
const coName = id => (/^[A-Z]$/.test(id) ? `${id}사` : String(id));   // A → A사, '가상-배관O' 는 그대로
/* 받침에 따라 조사: j('C사','이','가') → '가' */
const j = (w, a, b) => { const c = String(w).trim().slice(-1).charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? a : b; };

/* 구역이 밀폐인가 / 노 안인가 */
const confined = (Z, id) => !!(Z.get(id) || {}).confined;
const inside = (Z, id) => (Z.get(id) || {}).side === 'in';

/* below 를 끝까지 따라간 아래 구역들 */
function belowChain(Z, id, acc = new Set()) {
  for (const b of (Z.get(id) || {}).below || []) if (!acc.has(b)) { acc.add(b); belowChain(Z, b, acc); }
  return acc;
}
/* 가스가 흘러들 수 있는 노 안 구역: 인접한 노 안 구역 + 그 아래 줄줄이 (풍구 → 노 안 → 노저) */
function gasReach(Z, zoneId) {
  const out = new Set();
  for (const a of (Z.get(zoneId) || {}).adj || []) if (inside(Z, a)) { out.add(a); belowChain(Z, a, out); }
  return out;
}
/* 두 작업 구역이 엮였나 (같은 구역 · 위아래 · 인접 · 같은 계통) */
function related(Z, a, b) {
  for (const za of a.zone_ids) for (const zb of b.zone_ids) {
    if (za === zb) return true;
    if (belowChain(Z, za).has(zb) || belowChain(Z, zb).has(za)) return true;
    const A = Z.get(za) || {}, B = Z.get(zb) || {};
    if ((A.adj || []).includes(zb) || (B.adj || []).includes(za)) return true;
  }
  return inter(a.systems || [], b.systems || []).length > 0;
}

/* ───────── 1. 충돌 판정 ───────── */
const LAW_64_7 = '산업안전보건법 제64조 제1항 제7호';
const LAW_64_8 = '산업안전보건법 제64조 제1항 제8호';
const pairKey = (type, ids) => `${type}|${[...ids].sort().join('|')}`;

export function detectConflicts(tasks, zones, { seed = [] } = {}) {
  const Z = zmap(zones);
  const T = tasks.filter(live);
  const byId = new Map(T.map(t => [t.id, t]));
  const out = new Map(); // pairKey → conflict

  const add = (rule, type, severity, a, b, ivs, f) => {
    const key = pairKey(type, [a.id, b.id]);
    if (out.has(key)) return;
    const zs = [...new Set([...(f.zones || a.zone_ids), ...(f.zonesB || b.zone_ids)])];
    out.set(key, {
      id: `${rule}:${a.id}-${b.id}`, rule_id: rule, type, severity, title: f.title,
      task_ids: [a.id, b.id], company_ids: [...new Set([a.company_id, b.company_id])], zone_ids: zs,
      start: fromMin(ivs[0][0]), end: fromMin(ivs[ivs.length - 1][1]),
      reason: f.reason, law_ref: f.law, suggestion: f.sug ? { text: f.sug } : undefined,
      source: 'rule', ...(isPending(a) || isPending(b) ? { pending: true } : {}),
    });
  };

  for (const a of T) for (const b of T) {
    if (a === b) continue;
    const ivs = overlapIntervals(a, b);
    if (!ivs.length) continue;
    const ca = coName(a.company_id), cb = coName(b.company_id);

    /* VERTICAL: a 인양, b 가 a 구역의 below 에 있음 */
    if (has(a, 'LIFT')) {
      const za = a.zone_ids.find(z => ((Z.get(z) || {}).below || []).some(x => b.zone_ids.includes(x)));
      if (za) {
        const zb = b.zone_ids.find(x => Z.get(za).below.includes(x));
        const internal = confined(Z, za);           // 노 안 체인블록 인양: 중간 방호 데크 전제 → 조건부
        const prohibited = !internal && ((confined(Z, zb) && b.crew >= 10) || b.crew >= 15);
        add(internal ? 'VER-03' : 'VER-01', 'VERTICAL', prohibited ? 'PROHIBITED' : 'CONDITIONAL', a, b, ivs, {
          zones: [za], zonesB: [zb],
          title: `${zname(Z, za)} 인양 · 아래 ${zname(Z, zb)} 작업`,
          reason: `${ca}${j(ca, '이', '가')} ${zname(Z, za)}에서 인양하는 동안(${a.title}), 같은 수직축 아래 ${zname(Z, zb)}${confined(Z, zb) ? '(밀폐)' : ''}에서 ${cb} ${b.crew}명이 ${b.title} 작업을 합니다.${prohibited && confined(Z, zb) ? ' 떨어지면 피할 곳이 없습니다.' : ''}`,
          law: `${LAW_64_8} · 안전보건규칙 (낙하물 위험 방지)`,
          sug: prohibited ? '인양하는 동안만 아래 작업을 멈추는 「인양 정지 시간」을 둡니다.' : '인양 경로 아래 출입 통제·신호수 배치(방호 데크 확인)를 조건으로 진행합니다.',
        });
      }
    }

    /* HOT_GAS: a 화기, b 가스 개방 또는 가스 계통 */
    const bGas = has(b, 'GAS') || gasSys(b).length > 0;
    if (has(a, 'HOT') && bGas) {
      const aSys = [...(a.systems || []), ...a.zone_ids.flatMap(z => (Z.get(z) || {}).systems || [])];
      const near = a.zone_ids.some(za => b.zone_ids.some(zb => za === zb || ((Z.get(za) || {}).adj || []).includes(zb)))
        || inter(gasSys(b), aSys).length > 0;
      if (near) {
        const g = gasSys(b).map(s => GAS_NAME[s]).join('·') || '가스';
        add('HOT-02', 'HOT_GAS', 'CONDITIONAL', a, b, ivs, {
          title: `${zname(Z, a.zone_ids[0])} 화기 · ${zname(Z, b.zone_ids[0])} ${g} 계통 작업`,
          reason: `${ca}${j(ca, '이', '가')} ${zname(Z, a.zone_ids[0])}에서 ${a.title}(화기)를 하는 시간에 ${zname(Z, b.zone_ids[0])}에서 ${cb}${j(cb, '이', '가')} ${g} 계통 작업(${b.title})을 합니다. 가스 농도·산소 결핍을 확인해야 합니다.`,
          law: LAW_64_7, sug: '화기 작업 전 산소·가스 농도 측정·기록, 화기 감시자 배치를 조건으로 합니다.',
        });
      }
    }

    /* SAME_ZONE_TIME: 같은 구역, 한쪽만 화기 (a 가 화기 쪽) */
    const same = inter(a.zone_ids, b.zone_ids);
    if (same.length && has(a, 'HOT') && !has(b, 'HOT') && !out.has(pairKey('HOT_GAS', [a.id, b.id]))) {
      add('SZT-03', 'SAME_ZONE_TIME', 'CONDITIONAL', a, b, ivs, {
        zones: same, zonesB: same,
        title: `화기 작업 옆 ${b.title}`,
        reason: `같은 ${zname(Z, same[0])}에서 ${ca}${j(ca, '이', '가')} ${a.title}(화기)를 하고, 옆에서 ${cb}${j(cb, '이', '가')} ${b.title} 작업을 합니다. 불티가 옮겨붙을 수 있습니다.`,
        law: LAW_64_7, sug: `${b.title}${j(b.title, '을', '를')} 화기 작업이 끝난 ${hhmm(fromMin(ivs[ivs.length - 1][1]))} 이후로 옮기거나 불티 방지포를 칩니다.`,
      });
    }

    /* SEQUENCE(일반): 가스 라인 작업이 밀폐 축조 중인 노 안으로 흘러들 수 있음 */
    if (has(a, 'GAS') && gasSys(a).length && has(b, 'CONFINED')) {
      const reach = new Set(a.zone_ids.flatMap(z => [...gasReach(Z, z)]));
      const zb = b.zone_ids.find(z => reach.has(z) && confined(Z, z));
      if (zb) {
        const g = gasSys(a).map(s => GAS_NAME[s]).join('·');
        add('SEQ-01', 'SEQUENCE', 'PROHIBITED', a, b, ivs, {
          zonesB: [zb],
          title: `${zname(Z, zb)} 작업 완료 전 ${zname(Z, a.zone_ids[0])} ${g} 라인 작업`,
          reason: `${cb} ${b.crew}명이 ${zname(Z, zb)}(밀폐공간) 안에서 ${b.title} 중인데, ${ca}${j(ca, '이', '가')} ${zname(Z, a.zone_ids[0])}에서 ${a.title}${j(a.title, '을', '를')} 합니다. ${g}가 노 안으로 흘러들 수 있습니다.`,
          law: LAW_64_7 + '·8호 (혼재작업 확인·조정)',
          sug: `${g} 라인 작업을 「${zname(Z, zb)} 작업 완료·인원 철수 확인」 뒤로 옮깁니다.`,
        });
      }
    }
  }

  /* SEQUENCE(선행 조건): AFTER_TASK ref 가 끝나기 전에 시작 */
  for (const t of T) for (const p of t.preconditions || []) {
    if (p.kind !== 'AFTER_TASK') continue;
    const r = byId.get(p.ref);
    // 선행 작업으로 명시돼 있으면 구역이 떨어져 있어도 판정 (예: 노흉 축조 완료 전 풍구 레벨 질소 연결)
    if (!r || toMin(r.end) <= toMin(t.start)) continue;
    const s = Math.max(toMin(t.start), toMin(r.start)), e = Math.max(s + 1, Math.min(toMin(t.end), toMin(r.end)));
    // 노 안(밀폐)에 사람이 남은 작업이 선행이거나, 가스 계통을 여는 작업이거나, 구역이 이어지면 치명 → 금지
    const fatal = related(Z, t, r) || has(r, 'CONFINED') || has(t, 'GAS');
    const until = r.end.slice(0, 10) === t.start.slice(0, 10) ? hhmm(r.end) : `${+r.end.slice(5, 7)}/${+r.end.slice(8, 10)} ${hhmm(r.end)}`;
    add('SEQ-02', 'SEQUENCE', fatal ? 'PROHIBITED' : 'CONDITIONAL', t, r, [[s, e]], {
      title: `선행 작업 완료 전 착수 — ${t.title}`,
      reason: `${coName(t.company_id)} ${t.title}${j(t.title, '은', '는')} 「${p.text || r.title + ' 완료 후'}」 조건인데, ${coName(r.company_id)} ${r.title}${j(r.title, '이', '가')} ${until}까지 이어집니다.${has(r, 'CONFINED') && has(t, 'GAS') ? ' 노 안에 사람이 있는 동안 가스 라인을 연결하면 질식 위험이 있습니다.' : ''}`,
      law: LAW_64_7 + '·8호', sug: `${t.title} 시작을 ${until} 이후(선행 작업 완료·인원 철수 확인 후)로 옮깁니다.`,
    });
  }

  /* 인원 초과: 30분 칸마다 구역 인원 합계 > cap */
  for (const z of zones) {
    const ts = T.filter(t => t.zone_ids.includes(z.id));
    if (ts.length < 2) continue;
    for (let i = 0; i < ts.length; i++) for (let k = i + 1; k < ts.length; k++) {
      const ivs = overlapIntervals(ts[i], ts[k]);
      if (!ivs.length) continue;
      // 그 겹침 구간에서 같이 있는 모든 작업 인원 합
      const mid = (ivs[0][0] + ivs[0][1]) / 2;
      const sum = ts.filter(t => activeAt(t, mid)).reduce((n, t) => n + (t.crew || 0), 0);
      if (sum <= z.cap) continue;
      add('SZT-01', 'SAME_ZONE_TIME', 'CONDITIONAL', ts[i], ts[k], ivs, {
        zones: [z.id], zonesB: [z.id], title: `${z.name} 인원 초과`,
        reason: `${z.name}에 ${sum}명이 몰려 적정 ${z.cap}명을 넘습니다.`,
        law: LAW_64_8, sug: '인원이 적은 작업을 다른 시간으로 옮기고 대피로를 확보합니다.',
      });
    }
  }

  /* seed 병합: 같은 작업 쌍+유형이면 seed(다듬은 문구)가 이김 */
  const merged = new Map(out);
  for (const c of seed) {
    const ts = c.task_ids.map(id => byId.get(id));
    if (ts.some(x => !x)) continue;
    let start = c.start, end = c.end;
    if (ts.length >= 2 && c.type !== 'SEQUENCE') {
      const ivs = overlapIntervals(ts[0], ts[1]);
      if (!ivs.length) continue;                    // 시간 바뀌어 더는 안 겹침
      start = fromMin(ivs[0][0]); end = fromMin(ivs[ivs.length - 1][1]);
    }
    const sc = { ...c, start, end, source: 'seed' };
    if (ts.some(isPending)) sc.pending = true;
    merged.delete(pairKey(c.type, c.task_ids));
    merged.set('seed|' + c.id, sc);
  }
  const ord = { PROHIBITED: 0, CONDITIONAL: 1, DEFECT: 2 };
  return [...merged.values()].sort((x, y) => ord[x.severity] - ord[y.severity] || toMin(x.start) - toMin(y.start));
}

/* ───────── 2. 영향 범위 · 권한 ───────── */
export function influenceZones(task, zones) {
  const Z = zmap(zones), s = new Set(task.zone_ids);
  for (const id of task.zone_ids) {
    const z = Z.get(id) || {};
    if (has(task, 'LIFT')) (z.below || []).forEach(x => s.add(x));
    if (has(task, 'HOT')) {
      (z.adj || []).forEach(x => s.add(x));
      const g = inter([...(task.systems || []), ...(z.systems || [])], GAS_SYS);
      zones.forEach(o => { if (inter(o.systems || [], g).length) s.add(o.id); });
    }
    if (has(task, 'GAS')) {
      (z.adj || []).forEach(x => s.add(x));
      zones.forEach(o => { if (inter(o.systems || [], gasSys(task)).length) s.add(o.id); });
      gasReach(Z, id).forEach(x => s.add(x));       // 노 안으로 흘러드는 길
    }
  }
  return s;
}

/* 'full' | 'limited' | 'hidden'. opts.now 주면 "남은 작업"만 기준 */
export function accessOf(task, role, tasks, zones, conflicts = [], { now } = {}) {
  if (!role || role.id === 'PRIME' || task.company_id === role.id) return 'full';
  const nowM = now ? toMin(now) : -Infinity;
  const mine = tasks.filter(o => live(o) && o.company_id === role.id && toMin(o.end) > nowM);
  const inf = influenceZones(task, zones);
  for (const o of mine) {
    if (!overlapIntervals(o, task).length) continue;
    if (o.zone_ids.some(z => inf.has(z))) return 'limited';
    if (conflicts.some(c => c.task_ids.includes(o.id) && c.task_ids.includes(task.id))) return 'limited';
  }
  return 'hidden';
}

export function filterForRole({ tasks, conflicts = [], zones }, role, opts = {}) {
  if (!role || role.id === 'PRIME') return { tasks: tasks.map(t => ({ ...t, acc: 'full' })), conflicts: [...conflicts] };
  const outT = [];
  for (const t of tasks) {
    const acc = accessOf(t, role, tasks, zones, conflicts, opts);
    if (acc === 'hidden') continue;
    if (acc === 'full') { outT.push({ ...t, acc }); continue; }
    // 제한 공개: 업체·작업명·구역·시간·작업 유형만
    const { crew, equipment, note, requested_by, approved_by, plan_id, ...rest } = t;
    outT.push({ ...rest, crew: null, acc });
  }
  const mineIds = new Set(tasks.filter(t => t.company_id === role.id).map(t => t.id));
  return { tasks: outT, conflicts: conflicts.filter(c => c.task_ids.some(id => mineIds.has(id))) };
}

/* ───────── 3. 위험 · 안전 안내 ───────── */
const ringZone = id => /^EX-/.test(id) || id === 'CAST';

/* zoneId 구역에 t 시각 걸리는 위험 */
export function hazardsFor(zoneId, tasks, zones, t) {
  const Z = zmap(zones), tm = typeof t === 'number' ? t : toMin(t), out = [];
  const here = Z.get(zoneId);
  if (!here) return out;
  const act = tasks.filter(x => live(x) && !isPending(x) && activeAt(x, tm));
  const adjOf = id => ((Z.get(id) || {}).adj || []);
  for (const k of act) {
    const wa = k.work_area;
    /* DROP: 위층 인양 */
    if (has(k, 'LIFT')) {
      const src = k.zone_ids.find(z => ((Z.get(z) || {}).below || []).includes(zoneId));
      if (src) {
        const area = wa ? { ...wa } : ringZone(src) ? { shape: 'sector', phi: 0.9, width: 1.2 } : { shape: 'disc', r1: 0.45 };
        if (wa && wa.shape === 'sector') area.width = wa.width ?? 1.2;
        const internal = confined(Z, src);
        const sev = !internal && confined(Z, zoneId) ? 'PROHIBITED' : 'CONDITIONAL';
        out.push({ zoneId, fromTaskId: k.id, kind: 'DROP', severity: sev, area, start: k.start, end: k.end,
          text: `${zname(Z, src)} 인양 경로 아래 — ${describeArea(area)} 낙하 위험`, src: zname(Z, src) });
      }
    }
    /* HOT: 같은 구역(또는 인접 구역의 작업 위치가 정해진 경우) */
    if (has(k, 'HOT')) {
      const same = k.zone_ids.includes(zoneId), near = k.zone_ids.some(z => adjOf(z).includes(zoneId));
      let area = null;
      if (same) area = wa ? (wa.shape === 'sector' ? { ...wa, width: wa.width ?? 1.0 } : { ...wa }) : { shape: 'all' };
      else if (near && wa && wa.phi != null) area = { shape: 'sector', phi: wa.phi, width: wa.width ?? 1.0 };
      if (area) out.push({ zoneId, fromTaskId: k.id, kind: 'HOT', severity: 'CONDITIONAL', area, start: k.start, end: k.end,
        text: `${k.title} — ${describeArea(area)} 불티·화재 주의`, src: zname(Z, k.zone_ids[0]) });
    }
    /* GAS: 가스 라인 작업이 같은/인접 구역, 같은 계통, 또는 노 안으로 흘러듦 */
    if (has(k, 'GAS') && gasSys(k).length) {
      const conn = k.zone_ids.some(z => z === zoneId || adjOf(z).includes(zoneId) || gasReach(Z, z).has(zoneId))
        || inter(here.systems || [], gasSys(k)).length > 0;
      if (conn) {
        const g = gasSys(k).map(s => GAS_NAME[s]).join('·');
        const area = here.confined ? { shape: 'all' } : { shape: 'sector', phi: wa?.phi ?? 0, width: wa?.width ?? 1.6 };
        const sev = here.confined && here.side === 'in' ? 'PROHIBITED' : 'CONDITIONAL';
        out.push({ zoneId, fromTaskId: k.id, kind: 'GAS', severity: sev, area, start: k.start, end: k.end,
          text: `${zname(Z, k.zone_ids[0])} ${g} 라인 작업 — ${here.confined ? '가스 유입·질식 위험' : describeArea(area) + ' 가스 주의'}`,
          src: zname(Z, k.zone_ids[0]), gas: g });
      }
    }
  }
  return out;
}

/* 위험 영역들 → 안전 영역 (단순 근사) */
function safeFrom(danger) {
  if (!danger.length) return [{ shape: 'all' }];
  if (danger.some(a => a.shape === 'all')) return [];
  const discK = Math.max(0, ...danger.filter(a => a.shape === 'disc').map(a => a.r1 ?? 0.45));
  const ringR0 = Math.min(1, ...danger.filter(a => a.shape === 'ring').map(a => a.r0 ?? 0.5));
  const secs = danger.filter(a => a.shape === 'sector');
  const r0 = discK ? +(discK + 0.1).toFixed(2) : 0, r1 = ringR0 < 1 ? +(ringR0 - 0.1).toFixed(2) : 1;
  if (r1 <= r0) return [];
  if (!secs.length) return [r0 ? { shape: 'ring', r0, r1 } : { shape: 'disc', r1 }];
  // 부채꼴들 사이 가장 큰 빈틈 찾기
  const TAU = Math.PI * 2, norm = x => ((x % TAU) + TAU) % TAU;
  const arcs = secs.map(a => { const s = norm((a.phi ?? 0) - (a.width ?? 1) / 2); return [s, s + (a.width ?? 1)]; }).sort((a, b) => a[0] - b[0]);
  let best = null, end = arcs[0][1];
  for (let i = 1; i < arcs.length; i++) {
    if (arcs[i][0] > end && (!best || arcs[i][0] - end > best[1] - best[0])) best = [end, arcs[i][0]];
    end = Math.max(end, arcs[i][1]);
  }
  const wrap = [end, arcs[0][0] + TAU];
  if (wrap[1] > wrap[0] && (!best || wrap[1] - wrap[0] > best[1] - best[0])) best = wrap;
  if (!best || best[1] - best[0] < 0.6) return [];
  const width = +(best[1] - best[0] - 0.4).toFixed(2), phi = +norm((best[0] + best[1]) / 2).toFixed(2);
  const a = { shape: 'sector', phi, width };
  if (r0) a.r0 = r0;
  if (r1 < 1) a.r1 = r1;
  return [a];
}

const KIND_NAME = { DROP: '낙하', HOT: '불티·화재', GAS: '가스', CROWD: '인원 밀집' };

export function guidanceFor(zoneId, tasks, zones, { start, end, step = 0.5 } = {}) {
  const Z = zmap(zones), z = Z.get(zoneId) || { name: zoneId };
  const s0 = toMin(start), e0 = toMin(end), dm = Math.max(5, Math.round(step * 60));
  const raw = [];
  for (let m = s0; m < e0; m += dm) {
    const hz = hazardsFor(zoneId, tasks, zones, m + dm / 2);
    const danger = hz.map(h => h.area);
    const stop = hz.some(h => h.severity === 'PROHIBITED');
    const safe = safeFrom(danger);   // 금지라도 위험이 일부 영역이면 안전한 곳을 함께 알려 줌 (위치별 안내)
    const level = stop ? 'STOP' : hz.length ? 'CAUTION' : 'OK';
    const key = JSON.stringify([level, danger, safe, hz.map(h => h.fromTaskId + h.kind)]);
    const last = raw[raw.length - 1];
    if (last && last.key === key) last.e = Math.min(m + dm, e0);
    else raw.push({ s: m, e: Math.min(m + dm, e0), key, hz, danger, safe, level });
  }
  const short = ((z.name || '').match(/\((.+)\)$/) || [, z.name])[1];   // '노 내부 바닥(노저)' → '노저'
  const slots = raw.map(r => {
    const endIso = fromMin(r.e);
    let text;
    if (r.level === 'OK') text = z.level >= 1 && z.side !== 'aux' ? 'OK: 위층·주변 영향 없음' : 'OK: 주변 영향 없음';
    else if (r.level === 'STOP') {
      const h = r.hz.find(x => x.severity === 'PROHIBITED');
      const why = h.kind === 'DROP' ? `${h.src} 인양 중` : h.kind === 'GAS' ? `${h.src} ${h.gas} 라인 작업 — 가스 유입 위험` : `${h.src} ${KIND_NAME[h.kind]} 위험`;
      const where = [...new Set(r.danger.map(describeArea))].join('·');
      text = r.safe.length
        ? `STOP: ${why} — ${where} 진입 금지, ${r.safe.map(describeArea).join('·')}만 방호 확인 후 작업 · ${hhmm(endIso)} 이후 전체 작업`
        : `STOP: ${why} — ${short} 전체 대피, ${hhmm(endIso)} 이후 작업`;
    } else {
      const kinds = [...new Set(r.hz.map(h => KIND_NAME[h.kind]))].join('·');
      const where = r.danger.some(a => a.shape === 'all') ? '전체' : [...new Set(r.danger.map(describeArea))].join('·');
      text = r.safe.length
        ? `CAUTION: ${where} ${kinds} 위험 — ${r.safe.map(describeArea).join('·')}에서만 작업`
        : `CAUTION: ${where} ${kinds} 위험 — 감시자 배치·측정 후 작업`;
    }
    return { start: fromMin(r.s), end: endIso, danger: r.danger, safe: r.safe, level: r.level, text };
  });
  return { zoneId, slots };
}

/* 영역 → 짧은 한국어 ('중앙부', '가장자리(벽 쪽)', '앞쪽 반', '전체') */
export function describeArea(area) {
  if (!area) return '';
  if (area.label) return area.label;
  const sh = area.shape;
  if (sh === 'all') return '전체';
  if (sh === 'disc') return (area.r1 ?? 1) >= 0.9 ? '전체' : '중앙부';
  if (sh === 'ring') return (area.r0 ?? 0) >= 0.3 ? '가장자리(벽 쪽)' : '바깥쪽';
  if (sh === 'sector') {
    // 방향: 카메라 절개면(φ≈π/4) 기준 앞·오른·뒤·왼
    const TAU = Math.PI * 2, d = (((area.phi ?? 0) - Math.PI / 4) % TAU + TAU) % TAU;
    const dir = d < Math.PI / 4 || d >= 7 * Math.PI / 4 ? '앞쪽(절개면 쪽)' : d < 3 * Math.PI / 4 ? '오른쪽' : d < 5 * Math.PI / 4 ? '뒤쪽' : '왼쪽';
    const w = area.width ?? 1;
    let s = w >= TAU - 0.8 ? '대부분' : w >= Math.PI * 0.9 ? `${dir.replace('(절개면 쪽)', '')} 반` : dir;
    if ((area.r0 ?? 0) >= 0.3) s += ' 가장자리';
    else if ((area.r1 ?? 1) <= 0.7) s += ' 안쪽';
    return s;
  }
  return '';
}
