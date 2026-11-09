"""F8 작업 → 작업표준서 매칭 + 필수 단계 확인.

매칭 근거와 점수 [팀 설정값]
- wbs_example (0.45): 원청 표준서 목록(index.csv '적용 작업 예')에 이 작업(기준 일정 ID)이 있다
- name (0.35): 작업명에 그 표준서 작업을 가리키는 낱말이 있다 (연결·기밀 → 가스배관 표준, 절단·용접 → 화기 표준 …)
- hazard (0.20): 작업 유형(화기·밀폐·중량물·가스)이 표준서 적용 유형과 같다
- embedding (최대 0.20): 다국어 임베딩 모델이 설정돼 있으면 유사도로 순위·이유를 보강한다 (결함 판정에는 안 씀)

결함(F2)은 '주 표준서'(primary)에서만 낸다: 원청 적용 목록에 있고 작업명도 맞는 표준서(wbs_example + name).
한쪽 근거뿐인 매칭은 단계 확인 결과를 참고로만 보여 준다 — 원청이 그 표준서를 그 작업에 쓰라고 정했는지
사람이 확인해야 하기 때문이다. 결정은 사람이 한다.
"""

from __future__ import annotations

from rules.data_loader import load_wbs_tasks
from rules.sop_steps import check_steps
from schemas import SopMatch, SourceLine, Task

from .sop_catalog import Sop, load_sops
from .sop_index import Embedder, SopEmbeddingSearch, default_embedder

W_EXAMPLE, W_NAME, W_HAZARD, W_EMBED = 0.45, 0.35, 0.20, 0.20
MIN_SCORE = 0.2  # 이보다 낮으면 매칭으로 보여 주지 않는다
MAX_PER_TASK = 3
EMBED_ONLY_MIN = 0.6  # 규칙 근거 없이 임베딩만으로 후보에 올리는 유사도

# 작업명 → 표준서 작업을 가리키는 낱말 [팀 설정값]
SOP_NAME_KEYWORDS: dict[str, tuple[str, ...]] = {
    "SOP-01": ("용접", "용단", "절단", "그라인딩", "화기"),
    "SOP-02": ("축조", "내화물", "연와", "캐스터블", "노내", "노 내부", "밀폐", "굴착"),
    "SOP-03": ("인양", "크레인", "반입", "링블록", "호이스트", "양중", "설치"),
    "SOP-04": ("연결", "기밀", "퍼지", "복구", "투입", "승온"),
}

_BASIS_LABEL = {"wbs_example": "원청 적용 목록", "name": "작업명", "hazard": "작업 유형", "embedding": "임베딩"}


def _wbs_ids() -> set[str]:
    return {t.id for t in load_wbs_tasks()}


def _embedding_search(embedder: Embedder | None) -> SopEmbeddingSearch | None:
    if embedder is None:
        return None
    docs = [(s.id, s.title, f"{s.title}. " + " ".join(s.steps)) for s in load_sops()]
    search = SopEmbeddingSearch(embedder, docs)
    return search if search.ready else None


def _score(task: Task, sop: Sop, wbs_ids: set[str], sim: float | None) -> tuple[float, list[str]]:
    basis: list[str] = []
    score = 0.0
    if task.id in wbs_ids and task.id in sop.wbs_examples:
        basis.append("wbs_example")
        score += W_EXAMPLE
    if any(k in task.name for k in SOP_NAME_KEYWORDS.get(sop.id, ())):
        basis.append("name")
        score += W_NAME
    if {h.value for h in task.hazards} & sop.hazards:
        basis.append("hazard")
        score += W_HAZARD
    if sim is not None and sim > 0 and (basis or sim >= EMBED_ONLY_MIN):
        basis.append("embedding")
        score += W_EMBED * sim
    return round(min(score, 1.0), 3), basis


def _reason(task: Task, sop: Sop, basis: list[str], primary: bool, sim: float | None, missing: list[str]) -> str:
    parts = [_BASIS_LABEL[b] for b in basis]
    text = f"{task.name}({task.id}) ↔ {sop.title}: " + "·".join(parts) + " 일치"
    if sim is not None and "embedding" in basis:
        text += f" (임베딩 유사도 {sim:.2f})"
    if primary:
        text += ". 주 표준서라 필수 단계 누락을 결함으로 판정합니다"
        if missing:
            text += f" — 빠진 핵심 단계 {len(missing)}개"
    else:
        text += ". 원청 적용 목록과 작업명이 함께 맞지 않아 단계 확인 결과는 참고로만 보여 줍니다"
    return text + "."


def match_plan(
    tasks: list[Task],
    lines: list[SourceLine],
    file: str,
    embedder: Embedder | None = None,
    use_default_embedder: bool = True,
) -> list[SopMatch]:
    """계획서 1건의 작업들 → 표준서 매칭. lines 는 그 계획서 원문 줄 (필수 단계를 여기서 찾는다)."""
    sops = load_sops()
    if not sops or not tasks:
        return []
    search = _embedding_search(embedder if embedder is not None else (default_embedder() if use_default_embedder else None))
    sims = search.similarities([t.name for t in tasks]) if search else [{} for _ in tasks]
    wbs_ids = _wbs_ids()
    out: list[SopMatch] = []
    for task, task_sims in zip(tasks, sims):
        scored = []
        for sop in sops:
            sim = task_sims.get(sop.id)
            score, basis = _score(task, sop, wbs_ids, sim)
            # 작업명 낱말만 맞는 매칭은 버린다 ('비계 설치'의 '설치'가 크레인 표준으로 가는 것 방지)
            if not ({"wbs_example", "hazard"} & set(basis)) and not (sim is not None and sim >= EMBED_ONLY_MIN):
                continue
            # 임베딩 단독 후보는 점수가 0.2×유사도로 낮으니 유사도 기준(EMBED_ONLY_MIN)을 이미 통과한 것으로 본다
            if score >= MIN_SCORE or basis == ["embedding"]:
                scored.append((score, sop, basis, sim))
        scored.sort(key=lambda x: (-x[0], x[1].id))
        for score, sop, basis, sim in scored[:MAX_PER_TASK]:
            primary = "wbs_example" in basis and "name" in basis
            steps = check_steps(sop.id, sop.steps, sop.critical, lines, file)
            missing = [s.text for s in steps if s.critical and not s.found] if primary else []
            out.append(
                SopMatch(
                    task_id=task.id,
                    sop_id=sop.id,
                    title=sop.title,
                    score=score,
                    reason=_reason(task, sop, basis, primary, sim, missing),
                    missing_steps=missing,
                    primary=primary,
                    basis=basis,
                    steps=steps,
                )
            )
    return out
