/* 한솥밥 3D · 시연 데이터 (모두 가상·합성)
   기준: app/contracts/CONTRACT.md §6 · 시연일 2027-01-21(목) D71 · A사 수정 계획서(v2) 반영 직후 상태
   공정은 작업 분해표(work-packages.json) D71 기준: 노저 카본블록(WP16 D60-82), 냉각판 설치 마무리(WP14), 벨리스 탑(WP20), 풍구·송풍지관(WP21), 출선구(WP22)
   인원은 교대당 한 번에 현장에 있는 인원 (노 안은 바닥 면적상 20명 안팎이 상한)
   나중에 서버가 생기면 GET /api/meta, /api/view 응답으로 바꿔 끼움 (모양 동일) */

export const DEMO = {
  date: '2027-01-21',
  day: 71,
  now: '2027-01-21T21:00',
  windowStart: '2027-01-21T07:00',
  windowEnd: '2027-01-22T07:00',
};

/* app/backend/data/zones.csv 와 같은 내용 */
export const ZONES = [
  { id: 'TOP', name: '노정', plain: '고로 꼭대기 (약 100m)', level: 6, side: 'out', cap: 40, below: ['IN-UP', 'IN-MID', 'IN-TUY', 'IN-HEARTH'], adj: ['IN-UP', 'EX-UP', 'GAS'], systems: ['BFG', 'N2'], confined: false },
  { id: 'IN-UP', name: '노 내부 상부(노흉)', plain: '샤프트 구간 안쪽', level: 5, side: 'in', cap: 40, below: ['IN-MID', 'IN-TUY', 'IN-HEARTH'], adj: ['TOP', 'IN-MID', 'EX-UP'], systems: ['N2'], confined: true },
  { id: 'EX-UP', name: '외부 상부 작업대', plain: '샤프트 높이 바깥 작업대', level: 5, side: 'out', cap: 40, below: ['EX-MID', 'EX-TUY', 'CAST'], adj: ['TOP', 'IN-UP', 'EX-MID'], systems: ['N2', 'WTR'], confined: false },
  { id: 'IN-MID', name: '노 내부 중부', plain: '벨리·보시 구간 안쪽', level: 4, side: 'in', cap: 40, below: ['IN-TUY', 'IN-HEARTH'], adj: ['IN-UP', 'IN-TUY', 'EX-MID'], systems: [], confined: true },
  { id: 'EX-MID', name: '외부 중부 작업대', plain: '벨리·보시 높이 바깥 작업대', level: 4, side: 'out', cap: 30, below: ['EX-TUY', 'CAST'], adj: ['EX-UP', 'IN-MID', 'EX-TUY'], systems: ['WTR'], confined: false },
  { id: 'IN-TUY', name: '풍구 층 내부', plain: '바람구멍 높이 안쪽', level: 3, side: 'in', cap: 30, below: ['IN-HEARTH'], adj: ['IN-MID', 'IN-HEARTH', 'EX-TUY'], systems: [], confined: true },
  { id: 'EX-TUY', name: '풍구 층 외부', plain: '바람 배관이 둘러싼 바깥 작업대', level: 3, side: 'out', cap: 30, below: ['CAST'], adj: ['EX-MID', 'IN-TUY', 'CAST', 'STOVE'], systems: ['N2', 'O2', 'WTR'], confined: false },
  { id: 'IN-HEARTH', name: '노 내부 바닥(노저)', plain: '쇳물이 고이는 맨 아래', level: 2, side: 'in', cap: 50, below: [], adj: ['IN-TUY', 'CAST'], systems: [], confined: true },
  { id: 'CAST', name: '주상', plain: '쇳물을 빼내는 바닥 작업장', level: 1, side: 'out', cap: 40, below: [], adj: ['IN-HEARTH', 'EX-TUY'], systems: ['O2'], confined: false },
  { id: 'STOVE', name: '열풍로', plain: '바람을 데우는 탑 (고로 옆)', level: 0, side: 'aux', cap: 25, below: [], adj: ['EX-TUY', 'GAS'], systems: ['BFG'], confined: true },
  { id: 'GAS', name: '가스 설비', plain: '고로가스 배관·청정설비·TRT', level: 0, side: 'aux', cap: 25, below: [], adj: ['TOP', 'STOVE'], systems: ['BFG', 'N2'], confined: false },
  { id: 'ELEC', name: '전기실', plain: '전원·제어반', level: 0, side: 'aux', cap: 20, below: [], adj: [], systems: ['PWR'], confined: false },
];

export const COMPANIES = [
  { id: 'A', name: 'A사', trade: '가스·질소 배관', color: '#2e6fd0' },
  { id: 'B', name: 'B사', trade: '내화물 축로', color: '#8a3fa0' },
  { id: 'C', name: 'C사', trade: '노정 장입설비', color: '#1f8a8a' },
  { id: 'D', name: 'D사', trade: '주상·출선', color: '#b08300' },
  { id: 'E', name: 'E사', trade: '중량물 인양·제관', color: '#a0522d' },
];

export const TASKS = [
  /* B사 내화물 — 노저 축로 (완료 예정 2/1 = D82) */
  { id: 'T-B-001', work_area: { shape: 'all' }, company_id: 'B', title: '노저 카본블록·세라믹 시공 (주간조)', zone_ids: ['IN-HEARTH'], start: '2027-01-21T07:00', end: '2027-01-21T19:00', crew: 22, work_types: ['CONFINED', 'LIFT'], systems: [], wbs: 'WP16' },
  { id: 'T-B-003', work_area: { shape: 'ring', r0: 0.5, r1: 1 }, company_id: 'B', title: '노저 세라믹컵 축조 (야간조)', zone_ids: ['IN-HEARTH'], start: '2027-01-21T19:00', end: '2027-01-22T07:00', crew: 16, work_types: ['CONFINED'], systems: [], wbs: 'WP16' },
  { id: 'T-B-002', company_id: 'B', title: '풍구 연와 자재 반입·치수 확인', zone_ids: ['IN-TUY'], start: '2027-01-21T09:00', end: '2027-01-21T16:00', crew: 6, work_types: ['CONFINED'], systems: [], wbs: 'WP17' },
  { id: 'T-P-001', company_id: 'B', title: '열풍로 내부 점검', zone_ids: ['STOVE'], start: '2027-01-21T09:00', end: '2027-01-21T16:00', crew: 6, work_types: ['CONFINED'], systems: ['BFG'], wbs: 'WP23' },
  /* C사 노정 장입설비 (WP20 벨리스 탑 설치 D50–105) */
  { id: 'T-C-001', work_area: { shape: 'disc', r1: 0.45 }, company_id: 'C', title: '벨리스 탑 장입설비 인양', zone_ids: ['TOP'], start: '2027-01-21T09:00', end: '2027-01-21T15:00', crew: 14, work_types: ['LIFT', 'HEIGHT'], systems: [], equipment: ['크롤러 크레인'], wbs: 'WP20' },
  { id: 'T-C-002', company_id: 'C', title: '장입설비 볼트 체결', zone_ids: ['TOP'], start: '2027-01-21T15:00', end: '2027-01-21T19:00', crew: 8, work_types: ['HEIGHT'], systems: [], wbs: 'WP20' },
  /* A사 배관 */
  { id: 'T-A-002', company_id: 'A', title: '가스청정 연계 배관 절단·용접', zone_ids: ['GAS'], start: '2027-01-21T08:00', end: '2027-01-21T12:00', crew: 10, work_types: ['HOT', 'GAS'], systems: ['BFG'], wbs: 'WP24' },
  { id: 'T-A-001', company_id: 'A', title: '냉각수 배관 수압시험', zone_ids: ['EX-MID'], start: '2027-01-21T13:00', end: '2027-01-21T18:00', crew: 8, work_types: ['HEIGHT'], systems: ['WTR'], wbs: 'WP15' },
  { id: 'T-A-004', company_id: 'A', title: '배관 보온재 교체', zone_ids: ['EX-MID'], start: '2027-01-21T09:00', end: '2027-01-21T12:00', crew: 6, work_types: ['HEIGHT'], systems: [], wbs: 'WP15' },
  { id: 'T-A-003', work_area: { shape: 'sector', phi: 0.6, width: 1.0 }, company_id: 'A', title: '질소 퍼지 라인 연결 (풍구 레벨)', zone_ids: ['EX-TUY'], start: '2027-01-21T22:00', end: '2027-01-22T02:00', crew: 8, work_types: ['GAS', 'HEIGHT'], systems: ['N2'], plan_id: 'PLAN-A-v2', wbs: 'WP21',
    note: '원래 계획(v1)은 노저 축조 완료 뒤 2/2 주간. 수정 계획서(v2)에서 1/21 야간으로 앞당김' },
  /* D사 주상·출선 (WP22) */
  { id: 'T-D-001', work_area: { shape: 'sector', phi: 0.9, width: 0.9 }, company_id: 'D', title: '출선구 개공기 설치', zone_ids: ['CAST'], start: '2027-01-21T08:00', end: '2027-01-21T17:00', crew: 16, work_types: ['LIFT', 'HOT'], systems: [], wbs: 'WP22' },
  { id: 'T-D-002', company_id: 'D', title: '탕도 정비 (야간)', zone_ids: ['CAST'], start: '2027-01-21T19:00', end: '2027-01-21T23:00', crew: 10, work_types: ['HOT'], systems: [], wbs: 'WP22' },
  /* E사 중량물·제관 */
  { id: 'T-E-004', work_area: { shape: 'ring', r0: 0.7, r1: 1 }, company_id: 'E', title: '냉각판(스테이브) 설치 마무리', zone_ids: ['IN-MID'], start: '2027-01-21T08:00', end: '2027-01-21T17:00', crew: 14, work_types: ['LIFT', 'CONFINED', 'HOT'], systems: [], wbs: 'WP14' },
  { id: 'T-E-001', work_area: { shape: 'sector', phi: 1.2, width: 0.8 }, company_id: 'E', title: '링블록 인양 (풍구층 → 주상 경로)', zone_ids: ['EX-TUY', 'CAST'], start: '2027-01-21T10:00', end: '2027-01-21T14:00', crew: 12, work_types: ['LIFT'], systems: [], equipment: ['대형 크롤러 크레인'], wbs: 'WP21' },
  { id: 'T-E-002', work_area: { shape: 'sector', phi: 2.4, width: 1.2 }, company_id: 'E', title: '송풍지관 교체 용접 (야간)', zone_ids: ['EX-TUY'], start: '2027-01-21T20:00', end: '2027-01-22T01:00', crew: 10, work_types: ['HOT', 'HEIGHT', 'LIFT'], systems: [], wbs: 'WP21' },
  { id: 'T-E-003', company_id: 'E', title: '철피 보강부 용단', zone_ids: ['EX-MID'], start: '2027-01-21T09:00', end: '2027-01-21T11:30', crew: 9, work_types: ['HOT', 'HEIGHT'], systems: [], wbs: 'WP13' },
];

/* 판정 결과 (나중에 규칙 엔진이 계산해 줌 — 지금은 고정값) */
export const CONFLICTS = [
  {
    id: 'C-SEQ-01', rule_id: 'SEQ-01', type: 'SEQUENCE', severity: 'PROHIBITED',
    title: '노저 축조 완료 전 풍구 레벨 질소 라인 연결',
    task_ids: ['T-A-003', 'T-B-003'], company_ids: ['A', 'B'], zone_ids: ['IN-HEARTH', 'EX-TUY'],
    start: '2027-01-21T22:00', end: '2027-01-22T02:00',
    reason: 'B사 16명이 노저(밀폐공간) 안에서 야간 축조 중인데, A사가 풍구 레벨 질소 퍼지 라인을 연결합니다. 노저 축조 완료(2/1 예정) 전에 연결하면 질소가 풍구를 통해 노 안으로 흘러들 수 있습니다.',
    law_ref: '산업안전보건법 제64조 제1항 제7·8호 (혼재작업 확인·조정)',
    suggestion: { kind: 'ADD_PRECONDITION', text: '질소 라인 연결을 「노저 축조 완료·인원 철수 확인」 뒤로 옮깁니다 (2/1 19:00 이후).' },
  },
  {
    id: 'C-VER-01', rule_id: 'VER-01', type: 'VERTICAL', severity: 'PROHIBITED',
    title: '노정 인양 · 아래 노저 카본블록 시공',
    task_ids: ['T-C-001', 'T-B-001'], company_ids: ['C', 'B'], zone_ids: ['TOP', 'IN-HEARTH'],
    start: '2027-01-21T09:00', end: '2027-01-21T15:00',
    reason: 'C사가 노정에서 장입설비를 인양하는 동안, 같은 수직축 맨 아래 노저(밀폐)에서 B사 22명이 카본블록을 시공합니다. 떨어지면 피할 곳이 없습니다.',
    law_ref: '산업안전보건법 제64조 제1항 제8호 · 안전보건규칙 (낙하물 위험 방지)',
    suggestion: { kind: 'SHIFT_TIME', text: '인양하는 동안만 노 안 작업을 멈추는 「인양 정지 시간」을 둡니다.' },
  },
  {
    id: 'C-VER-02', rule_id: 'VER-01', type: 'VERTICAL', severity: 'PROHIBITED',
    title: '노정 인양 · 아래 냉각판 설치',
    task_ids: ['T-C-001', 'T-E-004'], company_ids: ['C', 'E'], zone_ids: ['TOP', 'IN-MID'],
    start: '2027-01-21T09:00', end: '2027-01-21T15:00',
    reason: '노정 인양 경로 바로 아래 노 내부 중부에서 E사 14명이 냉각판을 설치합니다.',
    law_ref: '산업안전보건법 제64조 제1항 제8호',
    suggestion: { kind: 'SHIFT_TIME', text: '인양 시간에는 냉각판 작업을 외부 준비 작업으로 돌립니다.' },
  },
  {
    id: 'C-VER-05', rule_id: 'VER-03', type: 'VERTICAL', severity: 'CONDITIONAL',
    title: '노 안 냉각판 인양 · 아래 노저 작업',
    task_ids: ['T-E-004', 'T-B-001'], company_ids: ['E', 'B'], zone_ids: ['IN-MID', 'IN-HEARTH'],
    start: '2027-01-21T08:00', end: '2027-01-21T17:00',
    reason: 'E사가 노 안 중부에서 냉각판을 체인블록으로 올리는 동안 아래 노저에서 B사가 일합니다. 중간 방호 데크가 있으면 진행할 수 있습니다.',
    law_ref: '산업안전보건법 제64조 제1항 제8호',
    suggestion: { kind: 'SHIFT_TIME', text: '방호 데크 상태 확인 · 냉각판 인양 순간 신호수 무전 통보를 조건으로 진행합니다.' },
  },
  {
    id: 'C-VER-03', rule_id: 'VER-02', type: 'VERTICAL', severity: 'CONDITIONAL',
    title: '링블록 인양 경로 아래 출선장 작업',
    task_ids: ['T-E-001', 'T-D-001'], company_ids: ['E', 'D'], zone_ids: ['EX-TUY', 'CAST'],
    start: '2027-01-21T10:00', end: '2027-01-21T14:00',
    reason: 'E사 링블록이 풍구층에서 주상 쪽으로 내려오는 경로 아래에서 D사 16명이 출선구 장치를 설치합니다.',
    law_ref: '산업안전보건법 제64조 제1항 제8호',
    suggestion: { kind: 'SHIFT_TIME', text: '인양 경로 아래 출입 통제·신호수 배치 조건으로 진행합니다.' },
  },
  {
    id: 'C-HOT-01', rule_id: 'HOT-02', type: 'HOT_GAS', severity: 'CONDITIONAL',
    title: '풍구층 용접 · 같은 층 질소 라인 개방',
    task_ids: ['T-E-002', 'T-A-003'], company_ids: ['E', 'A'], zone_ids: ['EX-TUY'],
    start: '2027-01-21T22:00', end: '2027-01-22T01:00',
    reason: 'E사가 풍구층에서 용접하는 시간에 같은 층에서 A사가 질소 라인을 엽니다. 산소 결핍·가스 체류를 확인해야 합니다.',
    law_ref: '산업안전보건법 제64조 제1항 제7호',
    suggestion: { kind: 'SHIFT_TIME', text: '용접 전 산소·가스 농도 측정·기록, 화기 감시자 배치를 조건으로 합니다.' },
  },
  {
    id: 'C-SZT-01', rule_id: 'SZT-03', type: 'SAME_ZONE_TIME', severity: 'CONDITIONAL',
    title: '용단 작업 옆 보온재(가연물) 교체',
    task_ids: ['T-E-003', 'T-A-004'], company_ids: ['E', 'A'], zone_ids: ['EX-MID'],
    start: '2027-01-21T09:00', end: '2027-01-21T11:30',
    reason: '같은 외부 중부 작업대에서 E사가 철피를 용단하고, 옆에서 A사가 보온재(가연물)를 교체합니다.',
    law_ref: '산업안전보건법 제64조 제1항 제7호',
    suggestion: { kind: 'SHIFT_TIME', text: '보온재 교체를 용단이 끝난 11:30 이후로 옮기거나 불티 방지포를 칩니다.' },
  },
  {
    id: 'C-STD-01', rule_id: 'STD-01', type: 'STANDARD', severity: 'DEFECT',
    title: '질소 라인 연결 — 작업 전 가스 측정 단계 없음',
    task_ids: ['T-A-003'], company_ids: ['A'], zone_ids: ['EX-TUY'],
    start: '2027-01-21T22:00', end: '2027-01-22T02:00',
    reason: 'A사 계획서에 작업표준서의 필수 단계 「작업 전 가스 측정」이 빠져 있습니다.',
    law_ref: '원청 작업표준서 STD-PIPE-07 (질소 배관 연결)',
    suggestion: { kind: 'ADD_PRECONDITION', text: '계획서에 「작업 전 산소·질소 농도 측정」 단계를 추가합니다.' },
  },
];

/* 긴급 변경 예시 (시뮬레이션 버튼·발표용) — SPEC_v2 §4 Change
   E사가 22:30부터 외부 상부 작업대에서 냉각판 긴급 인양 → 바로 아래 풍구층 외부(A사 질소 배관·E사 용접)에 낙하 위험 */
export const SAMPLE_CHANGE = {
  id: 'CHG-001', at: '2027-01-21T21:40', kind: 'ADD', urgent: true, status: 'pending',
  title: '냉각판 긴급 교체 인양 (외부 상부 작업대)',
  requested_by: { company_id: 'E', name: 'E사 현장소장', level: 'lead' },
  affected_company_ids: ['A', 'E'],
  task: { id: 'T-E-201', company_id: 'E', title: '냉각판 긴급 교체 인양', zone_ids: ['EX-UP'], start: '2027-01-21T22:30', end: '2027-01-21T23:30',
    crew: 6, work_types: ['LIFT', 'HEIGHT'], systems: [], equipment: ['체인블록·소형 크레인'], urgent: true, status: 'pending',
    work_area: { shape: 'sector', phi: 0.8, width: 0.9 } },
};
