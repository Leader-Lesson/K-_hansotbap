"""F8 원청 작업표준서 목록 (data/sop/index.csv + 표준서 마크다운).

- 필수 단계: index.csv '필수 단계' 칸(; 로 구분)
- 핵심 단계(빠지면 결함): 표준서 마크다운 '## 판정에 쓰는 기준'의 "절차에 4·5 단계가 없으면 …" 문장에서 읽는다
  표준서를 고치면 코드 수정 없이 기준이 바뀐다.
"""

from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from config import DATA_DIR
from schemas import SopInfo

SOP_DIR: Path = DATA_DIR / "sop"
_CRITICAL = re.compile(r"절차에\s*([\d·,\s및]+?)\s*단계")


@dataclass(frozen=True)
class Sop:
    id: str
    title: str
    file: str
    hazards: frozenset[str]
    wbs_examples: frozenset[str]
    steps: tuple[str, ...]
    critical: frozenset[int]  # 1부터
    source: str

    def text(self) -> str:
        path = SOP_DIR / self.file
        return path.read_text(encoding="utf-8") if path.exists() else ""

    def info(self, with_text: bool = False) -> SopInfo:
        return SopInfo(
            id=self.id,
            title=self.title,
            file=self.file,
            hazards=sorted(self.hazards),
            wbs_examples=sorted(self.wbs_examples),
            steps=list(self.steps),
            critical_steps=sorted(self.critical),
            source=self.source,
            text=self.text() if with_text else None,
        )


def _critical_steps(markdown: str) -> frozenset[int]:
    section = markdown.split("## 판정에 쓰는 기준", 1)[-1].split("\n## ", 1)[0] if "## 판정에 쓰는 기준" in markdown else ""
    m = _CRITICAL.search(section)
    return frozenset(int(n) for n in re.findall(r"\d+", m.group(1))) if m else frozenset()


def _split(value: str, sep: str) -> list[str]:
    return [v.strip() for v in value.split(sep) if v.strip()]


@lru_cache
def load_sops() -> tuple[Sop, ...]:
    path = SOP_DIR / "index.csv"
    if not path.exists():
        return ()
    with path.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    out: list[Sop] = []
    for r in rows:
        file = r["파일"].strip()
        md = (SOP_DIR / file).read_text(encoding="utf-8") if (SOP_DIR / file).exists() else ""
        out.append(
            Sop(
                id=r["표준서ID"].strip(),
                title=r["제목"].strip(),
                file=file,
                hazards=frozenset(_split(r["적용 작업 유형"], ",")),
                wbs_examples=frozenset(_split(r["적용 작업 예(WBS)"], ",")),
                steps=tuple(_split(r["필수 단계(;로 구분)"], ";")),
                critical=_critical_steps(md),
                source=r.get("출처", "").strip(),
            )
        )
    return tuple(out)


def get_sop(sop_id: str) -> Sop | None:
    return next((s for s in load_sops() if s.id == sop_id), None)
