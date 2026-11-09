"""F2 충돌 판정 엔진 (담당: 백엔드·규칙). LLM을 쓰지 않는다. pytest로 검증한다.

입력: 작업 목록, 구역, 규칙(R01~R30)
출력: Conflict 목록 — 모든 판정에 rule_id, legal_basis(법 조문), sources(원문 문장)를 붙인다.

순서
1. overlap.find_overlap_candidates() 로 시간·공간 후보를 뽑는다                [TODO]
2. 후보 쌍의 작업 유형(hazards)·공간 관계가 규칙 A/B 조건에 맞는지 본다        [TODO]
   → 같은 시간·구역 / 위아래 / 화기×가스
3. 선행 조건(predecessors)과 일정으로 순서 위반을 본다                          [R08 구현]
   (예: P34 질소 라인 연결이 P22 축조 완료 전)
4. F8 표준서 필수 단계 누락을 '결함'으로 합친다                                [TODO]

규칙 CSV(data/conflict_rules.csv)는 판정 등급·근거·조정안 문구를 준다. 걸리는 조건은 사람이 쓴 문장이라
기계가 못 읽으므로, 규칙 ID마다 이 파일에 조건 함수를 둔다.
"""

from rules.data_loader import load_rules
from rules.overlap import FURNACE_COLUMN
from schemas import Conflict, ConflictType, Grade, Hazard, Rule, SourceRef, Task, Zone

# R08 후행 작업(가스·냉각수·동력 라인 복구/연결)으로 보는 작업명 키워드.
# 작업 유형 태그에 '라인 연결'이 없어서 작업명으로 본다 [팀 설정값]
LINE_CONNECT_KEYWORDS = ("연결", "복구")


def grade_of(rule: Rule) -> Grade:
    """CSV '판정' 칸("금지 (순서 위반)", "조건부(…없으면 금지)" 등)을 등급 3종으로 바꾼다."""
    for prefix, grade in (("금지", Grade.PROHIBITED), ("조건부", Grade.CONDITIONAL), ("결함", Grade.DEFECT)):
        if rule.grade.startswith(prefix):
            return grade
    # R30 "경고(혼재)" 같은 값은 '참고' 등급을 정한 뒤에 처리한다
    raise ValueError(f"{rule.id}: 등급 3종으로 바꿀 수 없는 판정 값 {rule.grade!r}")


def detect_conflicts(tasks: list[Task], zones: list[Zone], rules: list[Rule]) -> list[Conflict]:
    # TODO(F2): 순서 2·4 구현. 지금은 순서 위반(R08)만 한다
    return detect_sequence_violations(tasks, rules)


def _is_furnace_inside_work(t: Task) -> bool:
    """R08 A: 노 내부(수직 공동) 밀폐공간 작업."""
    return t.zone_id in FURNACE_COLUMN and Hazard.CONFINED in t.hazards


def _is_line_connection(t: Task) -> bool:
    """R08 B: 가스 계통 라인 복구·연결 작업."""
    return Hazard.GAS in t.hazards and any(k in t.name for k in LINE_CONNECT_KEYWORDS)


def detect_sequence_violations(tasks: list[Task], rules: list[Rule] | None = None) -> list[Conflict]:
    """R08: 노 내부 작업(A)이 끝나기 전에 가스 라인 연결(B)이 시작하면 순서 위반.

    rules를 생략하면 data/conflict_rules.csv 의 규칙을 쓴다. 제출 판정(db/plans.py judge)이
    detect_sequence_violations(tasks) 로 부르기 때문이다.

    A는 B가 계획서에 적은 선행 작업(predecessors) 중에서만 본다. 데이터의 '선행 작업' 열은 느슨한 의존이라
    기본 일정에서도 선행보다 먼저 시작하는 쌍이 여럿(예: P01→P02) 있다. 규칙에 해당하는 쌍만 판정한다.
    끝과 시작이 같은 시각이면 위반이 아니고, A가 끝나는 날 B가 시작하면(07시 < 19시) 위반이다.
    """
    rules = load_rules() if rules is None else rules
    rule = next((r for r in rules if r.id == "R08"), None)
    if rule is None:
        return []
    by_id = {t.id: t for t in tasks}
    out: list[Conflict] = []
    for b in tasks:
        if not _is_line_connection(b):
            continue
        for a_id in b.predecessors:
            a = by_id.get(a_id)
            if a is None or not _is_furnace_inside_work(a) or b.start >= a.end:
                continue
            out.append(
                Conflict(
                    id=f"{rule.id}:{a.id}>{b.id}",  # 선행>후행. 전후 비교(F4)에서 같은 충돌을 알아보는 키
                    type=ConflictType.SEQUENCE,
                    grade=grade_of(rule),
                    task_ids=[a.id, b.id],
                    rule_id=rule.id,
                    legal_basis=rule.basis,
                    window_start=b.start,
                    window_end=min(a.end, b.end),
                    reason=(
                        f"{b.name}({b.id})이(가) 선행 작업 {a.name}({a.id})이(가) 끝나는 {a.end:%Y-%m-%d} 전인 "
                        f"{b.start:%Y-%m-%d}에 시작합니다 (규칙 {rule.id}: 노 내부 작업이 끝나기 전 "
                        "가스·냉각수·동력 라인 연결 금지)."
                    ),
                    suggestion=rule.adjustment,
                    sources=[t.source for t in (a, b) if t.source],
                )
            )
    return sorted(out, key=lambda c: (c.window_start, c.id))
