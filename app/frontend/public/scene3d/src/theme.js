/* 한솥밥 3D · 공통 색과 이름 */

/* 구역 기본색: 점토 느낌의 옅은 색 (위험색과 겹치지 않게 빨강·주황·파랑 계열은 피함) */
export const ZONE_COLOR = {
  TOP: '#c9b8a6',
  'IN-UP': '#d9c7a0',
  'EX-UP': '#b9c4b0',
  'IN-MID': '#e0cfae',
  'EX-MID': '#aebfae',
  'IN-TUY': '#d6c2b4',
  'EX-TUY': '#b3bcc6',
  'IN-HEARTH': '#cdb59a',
  CAST: '#bdb6aa',
  STOVE: '#c4b4bd',
  GAS: '#b6c0b8',
  ELEC: '#c2c2b8',
};

/* 판정 3단계 (점수: 금지 9 · 조건부 3 · 결함 1) */
export const SEV = {
  PROHIBITED: { color: '#c62828', label: '금지', mark: '◆', score: 9 },
  CONDITIONAL: { color: '#e67e00', label: '조건부', mark: '▲', score: 3 },
  DEFECT: { color: '#6a4db2', label: '결함', mark: '△', score: 1 },   // 보라: 고로가스 배관 노랑(KS 식별색)과 겹치지 않게, 시안·FurnaceScene과 같은 색
};
export const SEV_ORDER = ['PROHIBITED', 'CONDITIONAL', 'DEFECT'];

export const TYPE_NAME = {
  SAME_ZONE_TIME: '같은 시간·구역',
  VERTICAL: '위아래',
  HOT_GAS: '화기 × 가스',
  SEQUENCE: '순서 위반',
  STANDARD: '표준서 단계 누락',
};

export const LEVEL_NAME = { 6: '노정', 5: '상부(노흉)', 4: '중부(벨리·보시)', 3: '풍구', 2: '노저', 1: '주상', 0: '부대설비' };

export const WORK_TYPE_NAME = { HOT: '화기', CONFINED: '밀폐', HEIGHT: '고소', LIFT: '중량물', GAS: '가스' };

/* '2027-01-21T22:00' → '22:00' */
export const fmtTime = iso => (iso || '').slice(11, 16);
/* '2027-01-21T22:00' → '1/21 22:00' */
export const fmtDateTime = iso => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)} ${iso.slice(11, 16)}`;

/* 출입 제한 한 줄 (구역 배너·왼쪽 목록·3D 라벨 공용) — app.js barrierList(t) 한 항목을 받음
   4방위 전부 → "전 구역 출입 금지", 일부 → "북·동 출입 금지", 중앙부만 → "중앙부 출입 금지" (+ " · HH:MM까지") */
export const DIR_SHORT = { N: '북', E: '동', S: '남', W: '서' };
export function barrierText(b) {
  if (!b) return '';
  const dirs = ['N', 'E', 'S', 'W'].filter((k) => (b.blocked || []).includes(k));
  const parts = dirs.length === 4 ? ['전 구역'] : dirs.map((k) => DIR_SHORT[k]);
  if (dirs.length < 4 && b.center) parts.push('중앙부');
  const where = parts.length ? parts.join('·') : '중앙부';
  return `${where} 출입 금지${b.until ? ` · ${b.until}까지` : ''}`;
}
