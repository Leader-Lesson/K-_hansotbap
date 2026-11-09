/* 한솥밥 3D · 금지(치명) 판정의 조정 대안 — "멈추지 않는 제철소"
   원칙: 치명 겹침만 금지로 두되 작업을 세우지 않고 세부 공정 안에서 시간·순서·구역을 조정한다.
        조건부·결함은 위험 알림만 하고 작업은 계속한다. 고르는 것은 원청.
   지금은 고정 시나리오(합성 데이터). 나중에 규칙 엔진이 대안을 계산해 같은 모양으로 내려주면 됨. */

const D = '2027-01-21T';
const N = '2027-01-22T';
const LIFT_TASK = { company_id: 'C', zone_ids: ['TOP'], crew: 14, work_types: ['LIFT', 'HEIGHT'], systems: [], equipment: ['크롤러 크레인'] };

/* 노정 인양 × 아래 노저(B사 22명)·냉각판(E사 14명) — 금지 2건을 한 번에 다루는 대안 묶음 */
const LIFT_ALTS = {
  stopAll: { crew: 50, hours: 6, ph: 300, text: 'C사 14명 · B사 22명 · E사 14명이 09–15시 전원 대기' },
  list: [
    {
      id: 'ALT-LIFT-1', title: '인양 시간 묶기', tag: '시간 조정',
      steps: ['C사 인양을 09–11시 · 13–14시 두 번으로 몰아서 진행', '그 3시간 동안 B사는 지상 적치장에서 카본블록 검수·가공, E사는 외부 작업대에서 냉각판 배관 연결 준비', '인양 사이(11–13시) C사는 볼트 가조립'],
      idlePh: 0, shiftPh: 108, residual: null,
      ops: [
        { op: 'patch', id: 'T-C-001', set: { end: D + '11:00', title: '벨리스 탑 장입설비 인양 (1차 묶음)' } },
        { op: 'add', task: { ...LIFT_TASK, id: 'T-C-003', title: '장입설비 인양 (2차 묶음)', start: D + '13:00', end: D + '14:00' } },
        { op: 'add', task: { id: 'T-C-006', company_id: 'C', title: '장입설비 볼트 가조립 (인양 사이)', zone_ids: ['TOP'], start: D + '11:00', end: D + '13:00', crew: 8, work_types: ['HEIGHT'], systems: [] } },
        { op: 'patch', id: 'T-C-002', set: { start: D + '14:00' } },
        { op: 'pause', id: 'T-B-001', windows: [[D + '09:00', D + '11:00'], [D + '13:00', D + '14:00']] },
        { op: 'pause', id: 'T-E-004', windows: [[D + '09:00', D + '11:00'], [D + '13:00', D + '14:00']] },
        { op: 'add', task: { id: 'T-B-101', company_id: 'B', title: '카본블록 검수·가공 (지상 적치장)', zone_ids: [], start: D + '09:00', end: D + '11:00', crew: 22, work_types: [], systems: [] } },
        { op: 'add', task: { id: 'T-B-102', company_id: 'B', title: '카본블록 검수·가공 (지상 적치장)', zone_ids: [], start: D + '13:00', end: D + '14:00', crew: 22, work_types: [], systems: [] } },
        { op: 'add', task: { id: 'T-E-101', company_id: 'E', title: '냉각판 배관 연결 준비 (낙하 범위 밖)', zone_ids: ['EX-UP'], start: D + '09:00', end: D + '11:00', crew: 14, work_types: ['HEIGHT'], systems: [] } },
        { op: 'add', task: { id: 'T-E-102', company_id: 'E', title: '냉각판 배관 연결 준비 (낙하 범위 밖)', zone_ids: ['EX-UP'], start: D + '13:00', end: D + '14:00', crew: 14, work_types: ['HEIGHT'], systems: [] } },
        { op: 'resolve', conflictId: 'C-VER-01' },
        { op: 'resolve', conflictId: 'C-VER-02' },
      ],
    },
    {
      id: 'ALT-LIFT-2', title: '순서 바꾸기 (지상 선조립 → 빈 시간 인양)', tag: '순서 조정',
      steps: ['C사는 오전에 장입설비를 지상에서 미리 조립', '인양은 점심(12–13시, 노 안 인원 철수)과 주간조 종료 뒤(19–21시)에 진행', 'B사 노저·E사 냉각판 작업은 그대로 계속'],
      idlePh: 0, shiftPh: 0, residual: '야간 인양 시 아래 노저 야간조 16명 — 조건부 (조명·신호수·방호 데크 확인)',
      ops: [
        { op: 'add', task: { id: 'T-C-005', company_id: 'C', title: '장입설비 지상 선조립', zone_ids: [], start: D + '09:00', end: D + '12:00', crew: 14, work_types: [], systems: [] } },
        { op: 'patch', id: 'T-C-001', set: { start: D + '12:00', end: D + '13:00', title: '장입설비 인양 (점심 · 노 안 인원 철수)' } },
        { op: 'patch', id: 'T-C-002', set: { start: D + '13:00' } },
        { op: 'add', task: { ...LIFT_TASK, id: 'T-C-004', title: '장입설비 인양 (주간조 종료 후)', start: D + '19:00', end: D + '21:00' } },
        { op: 'pause', id: 'T-B-001', windows: [[D + '12:00', D + '13:00']] },
        { op: 'pause', id: 'T-E-004', windows: [[D + '12:00', D + '13:00']] },
        { op: 'resolve', conflictId: 'C-VER-01' },
        { op: 'resolve', conflictId: 'C-VER-02' },
        { op: 'addConflict', conflict: {
          id: 'C-VER-04', rule_id: 'VER-01', type: 'VERTICAL', severity: 'CONDITIONAL',
          title: '야간 인양 · 아래 노저 야간조', task_ids: ['T-C-004', 'T-B-003'], company_ids: ['C', 'B'], zone_ids: ['TOP', 'IN-HEARTH'],
          start: D + '19:00', end: D + '21:00',
          reason: '주간조 뒤로 옮긴 인양이 B사 노저 야간조(16명)와 겹칩니다. 중간 방호 데크와 출입 통제로 진행할 수 있습니다.',
          law_ref: '산업안전보건법 제64조 제1항 제8호',
          suggestion: { text: '방호 데크 확인 · 인양 경로 아래 출입 통제 · 투광등·신호수 배치를 조건으로 진행합니다.' },
        } },
      ],
    },
    {
      id: 'ALT-LIFT-3', title: '방호 데크 설치 후 진행', tag: '구역 조정',
      steps: ['풍구 레벨에 노 안 방호 데크·낙하물 방지망 설치 (1시간, B사 8명)', '인양 경로 아래 중앙부만 출입 통제, 가장자리 작업은 계속', '인양은 일정대로'],
      idlePh: 28, shiftPh: 0, residual: '금지 → 조건부 (안전관리자 승인 필요)',
      ops: [
        { op: 'add', task: { id: 'T-B-110', company_id: 'B', title: '노 안 방호 데크·낙하물 방지망 설치', zone_ids: ['IN-TUY'], start: D + '10:30', end: D + '11:30', crew: 8, work_types: ['HEIGHT'], systems: [] } },
        { op: 'pause', id: 'T-B-001', windows: [[D + '10:30', D + '11:30']] },
        { op: 'pause', id: 'T-E-004', windows: [[D + '10:30', D + '11:30']] },
        { op: 'downgrade', conflictId: 'C-VER-01', set: { severity: 'CONDITIONAL', start: D + '11:30', title: '노정 인양 · 아래 노저 (방호 데크 · 중앙부 통제)', reason: '풍구 레벨 방호 데크가 노저 위를 덮어 낙하물을 막고, 인양 경로 아래 중앙부는 출입을 막습니다.' } },
        { op: 'downgrade', conflictId: 'C-VER-02', set: { severity: 'CONDITIONAL', start: D + '11:30', title: '노정 인양 · 아래 냉각판 (방호 데크 · 중앙부 통제)', reason: '인양 중에는 중부 가장자리 냉각판 작업만 하고 중앙부 출입을 막습니다.' } },
      ],
    },
  ],
};

/* 노저 축조 완료 전 풍구 레벨 질소 라인 연결 (순서 위반) */
const SEQ_ALTS = {
  stopAll: { crew: 24, hours: 4, ph: 96, text: 'A사 8명 · B사 노저 야간조 16명이 22–02시 대기' },
  list: [
    {
      id: 'ALT-SEQ-1', title: '연결을 노저 축조 완료 뒤로, 오늘 밤은 지상 선조립', tag: '순서 조정',
      steps: ['질소 라인 연결을 「노저 축조 완료·인원 철수 확인」 뒤(2/1 19시 이후)로 이동', '오늘 밤 A사 8명은 질소 배관 지상 선조립·사전 기밀 점검', 'B사 노저 야간 축조는 그대로 계속'],
      idlePh: 0, shiftPh: 0, residual: null,
      ops: [
        { op: 'patch', id: 'T-A-003', set: { start: '2027-02-01T19:00', end: '2027-02-01T23:00', title: '질소 퍼지 라인 연결 (노저 축조 완료·인원 철수 확인 후)' } },
        { op: 'add', task: { id: 'T-A-010', company_id: 'A', title: '질소 배관 지상 선조립·사전 기밀 점검', zone_ids: ['GAS'], start: D + '22:00', end: N + '02:00', crew: 8, work_types: [], systems: [] } },
        { op: 'resolve', conflictId: 'C-SEQ-01' },
        { op: 'resolve', conflictId: 'C-HOT-01' },
        { op: 'downgrade', conflictId: 'C-STD-01', set: { start: '2027-02-01T19:00', end: '2027-02-01T23:00' } },
      ],
    },
    {
      id: 'ALT-SEQ-2', title: '외부 구간만 배관 (풍구 쪽 맹판 차단)', tag: '구역 조정',
      steps: ['풍구로 이어지는 마지막 연결부에 맹판 이중 차단', '오늘 밤은 풍구층 외부 구간 배관만 진행', '노 안으로 이어지는 연결은 노저 축조 완료 뒤'],
      idlePh: 0, shiftPh: 0, residual: '금지 → 조건부 (맹판·이중 차단 확인 서명)',
      ops: [
        { op: 'patch', id: 'T-A-003', set: { title: '질소 라인 외부 구간 배관 (풍구 쪽 맹판 차단, 노 안 연결 제외)' } },
        { op: 'downgrade', conflictId: 'C-SEQ-01', set: { severity: 'CONDITIONAL', title: '풍구 외부 구간만 배관 · 맹판 이중 차단 조건', reason: '풍구로 이어지는 연결부를 맹판으로 막고 외부 구간만 배관합니다. 맹판 설치를 B사·원청이 함께 확인해야 합니다.' } },
      ],
    },
  ],
};

export const ALTERNATIVES = { 'C-VER-01': LIFT_ALTS, 'C-VER-02': LIFT_ALTS, 'C-SEQ-01': SEQ_ALTS };
export const ALT_GROUP_NOTE = { 'C-VER-02': '노정 인양 금지 2건(노저·냉각판)을 함께 해소하는 대안입니다.' };

export function findAlternative(altId) {
  for (const g of new Set(Object.values(ALTERNATIVES))) {
    const a = g.list.find((x) => x.id === altId);
    if (a) return { alt: a, group: g };
  }
  return null;
}

/* 대안 적용: 작업·판정 배열을 그 자리에서 바꿈. 되돌리기는 호출하는 쪽이 스냅샷으로. */
export function applyAlternative(altId, tasks, conflicts) {
  const found = findAlternative(altId);
  if (!found) return null;
  const { alt, group } = found;
  const sevBefore = conflicts.filter((c) => c.severity === 'PROHIBITED').length;
  for (const o of alt.ops) {
    if (o.op === 'patch') Object.assign(tasks.find((t) => t.id === o.id) || {}, o.set);
    else if (o.op === 'add') { if (!tasks.some((t) => t.id === o.task.id)) tasks.push({ ...o.task, added: true }); }
    else if (o.op === 'pause') { const t = tasks.find((x) => x.id === o.id); if (t) t.pauses = [...(t.pauses || []), ...o.windows]; }
    else if (o.op === 'resolve') { const i = conflicts.findIndex((c) => c.id === o.conflictId); if (i >= 0) conflicts.splice(i, 1); }
    else if (o.op === 'downgrade') {
      const c = conflicts.find((x) => x.id === o.conflictId);
      if (c) { Object.assign(c, o.set); if (o.set.severity && o.set.severity !== 'PROHIBITED') c.alternatives_applied = alt.id; }
    } else if (o.op === 'addConflict') { if (!conflicts.some((c) => c.id === o.conflict.id)) conflicts.push({ ...o.conflict }); }
  }
  const sevAfter = conflicts.filter((c) => c.severity === 'PROHIBITED').length;
  return { alt, saved: group.stopAll.ph - alt.idlePh, stopAll: group.stopAll.ph, prohibitedBefore: sevBefore, prohibitedAfter: sevAfter };
}
