/* 담당자 연락처 (합성 데이터) — 이름은 프로토타입 상황판(PARTNERS·HQ)과 같게.
   전화번호는 실제로 쓰이지 않는 010-0000-XXXX 꼴로만 만든다. 실제 연락처가 생기면 이 파일만 바꾸면 됨 */
export const CONTACTS = {
  A: { trade: '내화물', lead: { name: '이현수 소장', tel: '010-0000-1101' }, part: { name: '정우진 파트장', tel: '010-0000-1102' } },
  B: { trade: '철피·장입설비', lead: { name: '최도윤 소장', tel: '010-0000-1201' }, part: { name: '문가람 파트장', tel: '010-0000-1202' } },
  C: { trade: '배관', lead: { name: '김태오 소장', tel: '010-0000-1301' }, part: { name: '송재훈 파트장', tel: '010-0000-1302' } },
  D: { trade: '전기·계장·보온', lead: { name: '정민아 소장', tel: '010-0000-1401' }, part: { name: '임하늘 파트장', tel: '010-0000-1402' } },
  E: { trade: '비계·대형 인양', lead: { name: '오승민 소장', tel: '010-0000-1501' }, part: { name: '강도현 파트장', tel: '010-0000-1502' } },
};
/* 원청 조정 창구: 금지·위반은 안전보건, 일정 조정은 공정관리 */
export const HQ_CONTACTS = {
  safety: { name: '박정훈 과장', team: '안전보건팀', tel: '010-0000-9001' },
  schedule: { name: '한예린 대리', team: '공정관리팀', tel: '010-0000-9002' },
};

/* 'A' · 'A사' · '가상-A사' → 'A' */
export const coKey = (id) => (String(id || '').match(/([A-Z])사?$/) || [])[1] || null;

/* 그 역할이 볼 수 있는 연락처. 협력사는 자기 회사만 보고, 다른 회사는 원청을 통해 연락 */
export function contactFor(companyId, role) {
  const k = coKey(companyId), c = k && CONTACTS[k];
  if (!c) return null;
  const mine = !role || role.id === 'PRIME' || coKey(role.id) === k;
  return mine ? { company: `${k}사`, ...c, masked: false } : { company: '타사', masked: true };
}
