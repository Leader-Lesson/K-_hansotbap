"""F8 작업표준서 임베딩 인덱스 (담당: 백엔드·규칙).

FAISS 내적 인덱스(정규화 벡터 → 코사인 유사도). 임베딩은 Unsloth Studio(/v1/embeddings)에서 받는다.
- .env UNSLOTH_EMBEDDING_MODEL 이 비어 있으면 쓰지 않는다. 노트북 서버의 기본 임베딩(384차원)은 한국어 작업과
  표준서를 구분하지 못했다(합성 작업 6건 중 2건만 맞음). 다국어 임베딩 모델(bge-m3 등)을 띄우고 이름을 넣으면 켜진다.
- 임베딩은 매칭 순위·이유를 보강하는 데만 쓴다. 결함(필수 단계 누락) 판정은 rules/sop_steps.py 규칙이 한다.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

import faiss
import numpy as np

from config import settings

log = logging.getLogger(__name__)

Embedder = Callable[[list[str]], list[list[float]]]


def _normalize(mat: np.ndarray) -> np.ndarray:
    mat = np.ascontiguousarray(mat, dtype=np.float32)
    faiss.normalize_L2(mat)
    return mat


class SopIndex:
    def __init__(self) -> None:
        self.ids: list[str] = []
        self.titles: list[str] = []
        self._index: faiss.IndexFlatIP | None = None

    def build(self, ids: list[str], titles: list[str], vectors: list[list[float]]) -> None:
        mat = _normalize(np.asarray(vectors, dtype=np.float32))
        self._index = faiss.IndexFlatIP(mat.shape[1])
        self._index.add(mat)
        self.ids, self.titles = ids, titles

    def search(self, query: list[float], k: int = 3) -> list[tuple[str, str, float]]:
        if self._index is None or not self.ids:
            return []
        q = _normalize(np.asarray([query], dtype=np.float32))
        scores, idx = self._index.search(q, min(k, len(self.ids)))
        return [(self.ids[i], self.titles[i], float(s)) for s, i in zip(scores[0], idx[0]) if i >= 0]


def default_embedder() -> Embedder | None:
    """임베딩 모델 이름이 설정돼 있을 때만 Unsloth 임베딩을 쓴다."""
    if not settings.unsloth_embedding_model:
        return None
    from llm.provider import UnslothProvider

    try:
        return UnslothProvider().embed
    except Exception as e:  # 키·주소 없음
        log.warning("임베딩 사용 안 함: %s: %s", type(e).__name__, e)
        return None


class SopEmbeddingSearch:
    """표준서(제목+필수 단계)를 한 번 색인해 두고, 작업명 묶음과의 유사도를 돌려준다. 실패하면 조용히 빈 결과."""

    def __init__(self, embedder: Embedder, sops: list[tuple[str, str, str]]) -> None:
        """sops: (표준서ID, 제목, 색인할 글)"""
        self._embed = embedder
        self._index = SopIndex()
        self._ready = False
        try:
            vectors = embedder([text for _, _, text in sops])
            self._index.build([i for i, _, _ in sops], [t for _, t, _ in sops], vectors)
            self._ready = True
        except Exception as e:  # 노트북 서버 꺼짐·인증 실패 등 → 규칙만으로 매칭
            log.warning("표준서 임베딩 색인 실패, 규칙만 씀: %s: %s", type(e).__name__, e)

    @property
    def ready(self) -> bool:
        return self._ready

    def similarities(self, texts: list[str]) -> list[dict[str, float]]:
        if not self._ready or not texts:
            return [{} for _ in texts]
        try:
            vectors = self._embed(texts)
        except Exception as e:
            log.warning("작업 임베딩 실패, 규칙만 씀: %s: %s", type(e).__name__, e)
            return [{} for _ in texts]
        k = len(self._index.ids)
        return [{sid: score for sid, _, score in self._index.search(v, k)} for v in vectors]
