"""F8 작업표준서 임베딩 인덱스 (담당: 백엔드·규칙).

지금은 numpy 코사인 유사도로 동작하는 최소 구현이다. 표준서가 많아지면 FAISS/Chroma로 바꾼다.
임베딩은 LM Studio(/v1/embeddings)에서 받는다.
"""

import numpy as np


class SopIndex:
    def __init__(self) -> None:
        self.ids: list[str] = []
        self.titles: list[str] = []
        self._vectors: np.ndarray | None = None

    def build(self, ids: list[str], titles: list[str], vectors: list[list[float]]) -> None:
        mat = np.asarray(vectors, dtype=np.float32)
        norms = np.linalg.norm(mat, axis=1, keepdims=True)
        self._vectors = mat / np.clip(norms, 1e-12, None)
        self.ids, self.titles = ids, titles

    def search(self, query: list[float], k: int = 3) -> list[tuple[str, str, float]]:
        if self._vectors is None:
            return []
        q = np.asarray(query, dtype=np.float32)
        q = q / max(float(np.linalg.norm(q)), 1e-12)
        scores = self._vectors @ q
        top = np.argsort(-scores)[:k]
        return [(self.ids[i], self.titles[i], float(scores[i])) for i in top]
