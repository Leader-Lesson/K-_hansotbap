"""협력사별 문서 폴더 만들기 (사람이 보는 묶음). 시스템이 읽는 원본은 옮기지 않고 복사한다.

    cd app/backend && uv run python ../samples/make_contractor_folders.py

결과: docs/협력사별_문서/<협력사>/
  ├─ README.md            이 협력사의 작업(기준 일정)·계획서·적용 표준서 목록
  ├─ 작업계획서/           app/samples/ 의 그 협력사 계획서(PDF·Word·HWPX·엑셀) 복사본
  └─ 작업표준서/           data/sop/pdf/ 에서 이 협력사 작업에 적용되는 작업별 표준서(SOP-P<작업ID>)와
                          공통 표준서(index.csv '적용 작업 예'에 그 작업이 있는 SOP-01~04) PDF 복사본
원청 폴더(원청-제선·원청-정비)도 같은 규칙으로 만든다(계획서 없음). 다시 돌리면 폴더를 비우고 새로 만든다.
"""

from __future__ import annotations

import csv
import json
import shutil
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
DATA = REPO / "app" / "backend" / "data"
SOP_DIR = DATA / "sop"
PDF_DIR = SOP_DIR / "pdf"
OUT = REPO / "docs" / "협력사별_문서"
PLAN_EXT = (".pdf", ".docx", ".hwpx", ".xlsx")


def _rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def main() -> None:
    wbs = _rows(DATA / "gy2bf_wbs.csv")
    sops = _rows(SOP_DIR / "index.csv")
    by_contractor: dict[str, list[dict[str, str]]] = defaultdict(list)
    for r in wbs:
        by_contractor[r["협력사(가상)"]].append(r)
    # 계획서: 정답셋(answers/*.json)의 contractor → 파일
    plans: dict[str, list[Path]] = defaultdict(list)
    for a in sorted((HERE / "answers").glob("가상-*.json")):
        meta = json.loads(a.read_text(encoding="utf-8"))
        f = HERE / meta["file"]
        if f.exists() and f.suffix in PLAN_EXT:
            plans[meta["contractor"]].append(f)
    common = [s for s in sops if not s["표준서ID"].startswith("SOP-P")]
    per_task = {s["표준서ID"]: s for s in sops if s["표준서ID"].startswith("SOP-P")}

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    index_lines = ["# 협력사별 문서 (합성)", "", "협력사마다 작업계획서(협력사 제출)와 그 작업에 적용되는 원청 작업표준서 PDF를 모았다. 원본은 `app/samples/`(계획서)와 `app/backend/data/sop/`(표준서)이고 이 폴더는 `app/samples/make_contractor_folders.py`가 복사해 만든 것이다. 모두 합성 데이터이며 협력사명은 가상이다.", "", "| 협력사 | 작업 | 계획서 | 표준서 PDF |", "|---|---|---|---|"]
    missing_pdf: set[str] = set()
    for contractor, tasks in sorted(by_contractor.items()):
        folder = OUT / contractor
        (folder / "작업계획서").mkdir(parents=True)
        (folder / "작업표준서").mkdir(parents=True)
        task_ids = [t["작업ID"] for t in tasks]
        for f in plans.get(contractor, []):
            shutil.copy2(f, folder / "작업계획서" / f.name)
        applied: list[dict[str, str]] = []
        for tid in task_ids:
            if s := per_task.get(f"SOP-{tid}"):
                applied.append(s)
        for s in common:
            if set(x.strip() for x in s["적용 작업 예(WBS)"].split(",")) & set(task_ids):
                applied.append(s)
        copied = 0
        for s in applied:
            pdf = PDF_DIR / (Path(s["파일"]).stem + ".pdf")
            if pdf.exists():
                shutil.copy2(pdf, folder / "작업표준서" / pdf.name)
                copied += 1
            else:
                missing_pdf.add(s["표준서ID"])
        lines = [f"# {contractor} — 작업계획서·작업표준서 (합성)", "", f"기준 일정 작업 {len(tasks)}건. 모두 합성 데이터이며 협력사명은 가상이다.", "", "## 작업 (원청 기준 일정)", "", "| 작업ID | 작업 | 구역 | 기간(가정) | 위험 작업 | 선행 |", "|---|---|---|---|---|---|"]
        for t in tasks:
            hz = [k for k in ("화기", "밀폐공간", "고소", "중량물", "가스계통") if t.get(k, "0").strip() == "1"]
            lines.append(f"| {t['작업ID']} | {t['작업명']} | {t['구역']} {t['구역명']} | {t['시작일']} ~ {t['종료일']} | {', '.join(hz) or '—'} | {t['선행 작업'] or '—'} |")
        lines += ["", "## 작업계획서 (협력사 제출, 양식 자유)", ""]
        lines += [f"- `작업계획서/{f.name}`" for f in plans.get(contractor, [])] or ["- (아직 없음 — 기준 일정으로만 판정)"]
        lines += ["", "## 적용 작업표준서 (원청, PDF)", ""]
        for s in applied:
            kind = "작업별" if s["표준서ID"].startswith("SOP-P") else "공통"
            lines.append(f"- `작업표준서/{Path(s['파일']).stem}.pdf` — {s['표준서ID']} {s['제목']} ({kind}, 적용 유형 {s['적용 작업 유형']})")
        (folder / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
        index_lines.append(f"| [{contractor}]({contractor}/README.md) | {', '.join(task_ids)} | {len(plans.get(contractor, []))}건 | {copied}건 |")
    (OUT / "README.md").write_text("\n".join(index_lines) + "\n", encoding="utf-8")
    print(f"만듦: {OUT.relative_to(REPO)} — 협력사 {len(by_contractor)}곳")
    if missing_pdf:
        print(f"PDF 없음(make_sop_pdf.py 먼저): {', '.join(sorted(missing_pdf))}")


if __name__ == "__main__":
    main()
