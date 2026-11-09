"""F2 충돌 판정 엔진 (담당: 백엔드·규칙). LLM을 쓰지 않는다. pytest로 검증한다.

입력: 작업 목록, 구역, 규칙(R01~R30)
출력: Conflict 목록 — 모든 판정에 rule_id, legal_basis(법 조문), sources(원문 문장)를 붙인다.

순서
1. overlap.find_overlap_candidates() 로 시간·공간 후보를 뽑는다
2. 후보 쌍의 작업 유형(hazards)·공간 관계가 규칙 A/B 조건에 맞는지 본다 → 같은 시간·구역 / 위아래 / 화기×가스
3. 선행 조건(predecessors)과 일정으로 순서 위반을 본다 (예: P34 질소 라인 연결이 P22 축조 완료 전)
4. F8 표준서 필수 단계 누락을 '결함'으로 합친다
"""

from schemas import Conflict, Rule, Task, Zone


def detect_conflicts(tasks: list[Task], zones: list[Zone], rules: list[Rule]) -> list[Conflict]:
    # TODO(F2): 위 순서대로 구현. 시연 핵심 장면은 S1 순서 위반(P34 ↔ P22, R08·R07)
    return []


def detect_sequence_violations(tasks: list[Task]) -> list[Conflict]:
    # TODO(F2): 선행 작업이 끝나기 전에 시작하는 작업 찾기
    return []
