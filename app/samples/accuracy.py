"""F1 추출 정확도 측정: samples/ 의 계획서를 추출기에 넣고 answers/ 의 정답셋과 칸별로 비교한다.

    cd app/backend && uv run python ../samples/accuracy.py            # 표 규칙 경로 (LLM 안 부름)
    cd app/backend && uv run python ../samples/accuracy.py --mode llm  # LLM 경로 (.env 의 ANTHROPIC_API_KEY 필요)
    cd app/backend && uv run python ../samples/accuracy.py --json ../samples/answers/_last_result.json

칸: 업체 · 작업명 · 구역 · 시작일 · 종료일 · 주야간 · 투입 인원 · 작업 유형 · 선행 작업 · 기준 일정 ID (10칸).
정답셋의 값이 null 이면 그 칸은 세지 않는다 (예: '주야간' 연속 작업은 한쪽으로 정할 수 없다).
틀린 칸 목록은 프롬프트·규칙 수정용으로 그대로 전달한다.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

from llm.extract import extract_plan  # noqa: E402
from parsers.hwpx import parse_hwpx  # noqa: E402
from parsers.normalize import name_similarity  # noqa: E402
from parsers.pdf import parse_pdf  # noqa: E402
from parsers.xlsx import parse_xlsx  # noqa: E402

HERE = Path(__file__).resolve().parent
PARSERS = {".pdf": parse_pdf, ".xlsx": parse_xlsx, ".hwpx": parse_hwpx}
FIELDS = ("contractor", "name", "zone_id", "start", "end", "shift", "headcount", "hazards", "predecessors", "wbs_id")
LABEL = {
    "contractor": "업체", "name": "작업명", "zone_id": "구역", "start": "시작일", "end": "종료일",
    "shift": "주야간", "headcount": "투입 인원", "hazards": "작업 유형", "predecessors": "선행 작업", "wbs_id": "기준 일정 ID",
}


def _squash(t: str | None) -> str:
    return re.sub(r"[\s·,./()\-~]", "", t or "")


def extracted_row(et) -> dict:
    t = et.task
    return {
        "contractor": t.contractor,
        "name": t.name,
        "zone_id": t.zone_id or None,
        "start": t.start.date().isoformat(),
        "end": t.end.date().isoformat(),
        "shift": t.shift.value if t.shift else None,
        "headcount": t.crew,
        "hazards": sorted(h.value for h in t.hazards),
        "predecessors": sorted(t.predecessors),
        "wbs_id": et.wbs_id,
    }


def same(field: str, truth, got) -> bool:
    if field in ("contractor", "name"):
        return _squash(truth) == _squash(got)
    if field in ("hazards", "predecessors"):
        return sorted(truth or []) == sorted(got or [])
    return truth == got


def pair_tasks(truth_tasks: list[dict], got_rows: list[dict]) -> list[tuple[dict, dict | None]]:
    """정답 작업 ↔ 추출 작업을 작업명 유사도로 짝짓는다 (한 번 쓴 추출 작업은 다시 쓰지 않는다)."""
    free = list(range(len(got_rows)))
    out: list[tuple[dict, dict | None]] = []
    for tt in truth_tasks:
        best, best_sim = None, 0.0
        for i in free:
            sim = name_similarity(tt["name"], got_rows[i]["name"])
            if sim > best_sim:
                best, best_sim = i, sim
        if best is not None and best_sim >= 0.3:
            free.remove(best)
            out.append((tt, got_rows[best]))
        else:
            out.append((tt, None))
    return out


def measure(mode: str, only: str | None = None) -> dict:
    report = {"mode": mode, "files": [], "cells": 0, "correct": 0, "missed_tasks": 0, "extra_tasks": 0, "wrong": []}
    for ans_path in sorted((HERE / "answers").glob("가상-*.json")):
        truth = json.loads(ans_path.read_text(encoding="utf-8"))
        if only and only not in truth["file"]:
            continue
        sample = HERE / truth["file"]
        doc = PARSERS[sample.suffix](sample.read_bytes(), sample.name)
        ex = extract_plan(doc, mode=mode)
        rows = [extracted_row(t) for t in ex.tasks]
        pairs = pair_tasks(truth["tasks"], rows)
        f_cells = f_ok = 0
        for tt, got in pairs:
            if got is None:
                report["missed_tasks"] += 1
                report["wrong"].append({"file": truth["file"], "task": tt["name"], "field": "(작업 누락)", "truth": tt["name"], "got": None})
                continue
            for field in FIELDS:
                if tt.get(field) is None and field != "wbs_id":
                    continue  # 정답이 없는 칸은 세지 않는다
                f_cells += 1
                if same(field, tt.get(field), got.get(field)):
                    f_ok += 1
                else:
                    report["wrong"].append({"file": truth["file"], "task": tt["name"], "field": LABEL[field], "truth": tt.get(field), "got": got.get(field)})
        extra = len(rows) - sum(1 for _, g in pairs if g is not None)
        report["extra_tasks"] += extra
        report["files"].append({"file": truth["file"], "method": ex.method, "tasks_truth": len(truth["tasks"]), "tasks_got": len(rows), "cells": f_cells, "correct": f_ok, "warnings": ex.warnings})
        report["cells"] += f_cells
        report["correct"] += f_ok
    report["accuracy"] = round(100 * report["correct"] / report["cells"], 1) if report["cells"] else 0.0
    return report


def main() -> None:
    ap = argparse.ArgumentParser(description="F1 추출 정확도 측정 (합성 계획서 5건)")
    ap.add_argument("--mode", choices=("auto", "rules", "llm"), default="rules")
    ap.add_argument("--only", help="파일 이름 일부로 하나만")
    ap.add_argument("--json", help="결과를 JSON 으로 저장할 경로")
    args = ap.parse_args()
    r = measure(args.mode, args.only)
    print(f"추출 경로: {args.mode}")
    print(f"{'파일':48} {'경로':12} {'작업(정답/추출)':>14} {'칸':>6} {'정답':>6} {'정확도':>7}")
    for f in r["files"]:
        acc = 100 * f["correct"] / f["cells"] if f["cells"] else 0
        print(f"{f['file']:48} {f['method']:12} {f['tasks_truth']:>6}/{f['tasks_got']:<7} {f['cells']:>6} {f['correct']:>6} {acc:>6.1f}%")
        for w in f["warnings"]:
            print(f"    ! {w}")
    print(f"\n합계: {r['correct']}/{r['cells']} 칸 = {r['accuracy']}%   작업 누락 {r['missed_tasks']}건, 정답셋에 없는 작업 {r['extra_tasks']}건")
    if r["wrong"]:
        print("\n틀린 칸:")
        for w in r["wrong"]:
            print(f"  - {w['file']} / {w['task']} / {w['field']}: 정답 {w['truth']!r} → 추출 {w['got']!r}")
    if args.json:
        Path(args.json).write_text(json.dumps(r, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\n저장: {args.json}")


if __name__ == "__main__":
    main()
