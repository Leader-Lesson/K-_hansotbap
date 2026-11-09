"""F8 작업표준서 매칭 평가: 정답셋의 작업마다 표준서 매처를 돌려 top-1/top-3 적중률과 필수 단계 누락 검출을 본다.

    cd app/backend && uv run python ../samples/eval_sop.py
    cd app/backend && uv run python ../samples/eval_sop.py --json ../samples/answers/_eval_sop.json

- 매칭 정답: answers_sop.json ('<파일>|<작업명>' → expected 표준서 ID, also_ok 함께 적용되는 공통 표준서)
  · 엄격: 매처 순위의 1위(top-1) / 3위 안(top-3)에 expected 가 있으면 적중. expected 가 비어 있으면 매칭 0건이 적중
  · 느슨: expected ∪ also_ok 로 같은 계산
- 누락 검출 정답: answers/*.json 의 expected_conflicts 중 type=sop_missing (with 첫 낱말 = 표준서 ID)
  · 매처가 missing_steps 를 채운 (작업, 표준서)를 '결함'으로 보고 정답과 비교한다
  · 배관O 계획서는 '작업 전 가스 측정'이 빠진 것으로 잡혀야 한다 (시연 F8 완료 기준)
- 작업은 정답셋 값으로 만든다 (eval_common.truth_tasks — 추출기와 같은 ID 규칙). 계획서 원문 줄은 실제 파일을 파싱한다
- 임베딩 모델(.env 의 *_EMBEDDING_MODEL)이 없으면 규칙 근거(원청 적용 목록·작업명 낱말·작업 유형)만으로 매칭한다
"""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path

from eval_common import HERE, load_answers, save_json, timed, truth_tasks

from parsers import parse_document  # noqa: E402
from rules.engine import defects_from_sop  # noqa: E402
from schemas import SourceLine  # noqa: E402
from search.sop_index import default_embedder  # noqa: E402
from search.sop_match import match_plan  # noqa: E402

TRUTH = HERE / "answers_sop.json"
KEY_STEP = "작업 전 가스 측정"


def rate(hit: int, n: int) -> float:
    return round(100 * hit / n, 1) if n else 0.0


def main() -> None:
    ap = argparse.ArgumentParser(description="F8 표준서 매칭 top-1/top-3·필수 단계 누락 검출 (합성 계획서 5건)")
    ap.add_argument("--samples", help="표본 폴더 (그 안에 answers/). 기본은 samples/")
    ap.add_argument("--truth", help="매칭 정답 JSON. 기본은 samples/answers_sop.json")
    ap.add_argument("--runs", type=int, default=10, help="매칭 시간 반복 횟수 (평균)")
    ap.add_argument("--json", help="결과를 JSON 으로 저장할 경로")
    args = ap.parse_args()

    samples = Path(args.samples).resolve() if args.samples else HERE
    truth = json.loads(Path(args.truth or TRUTH).read_text(encoding="utf-8"))["tasks"]
    embedder = default_embedder()
    how = "임베딩 + 규칙" if embedder else "규칙만 (임베딩 모델이 설정되지 않아 원청 적용 목록·작업명 낱말·작업 유형 점수로 매칭, LLM 안 씀)"
    print(f"매칭 방식: {how}")

    rows, defect_rows, ms_all = [], [], []
    no_truth: list[str] = []
    key_step_found = None
    for a in load_answers(samples):
        doc = parse_document(a["file"], (samples / a["file"]).read_bytes())
        lines = [SourceLine(locator=s.loc, text=s.text) for s in doc.segments]
        tasks = truth_tasks(a)
        matches, ms = timed(lambda: match_plan(tasks, lines, a["file"], embedder=embedder, use_default_embedder=False), args.runs)
        ms_all.append(statistics.mean(ms))

        for t in tasks:
            key = f"{a['file']}|{t.name}"
            ranked = [m for m in matches if m.task_id == t.id]
            ids = [m.sop_id for m in ranked]
            if key not in truth:
                no_truth.append(key)
                continue
            exp = set(truth[key]["expected"])
            ok = exp | set(truth[key].get("also_ok", []))

            def hit(target: set[str], k: int) -> bool:
                return not ids if not target else bool(target & set(ids[:k]))

            rows.append({
                "file": a["file"], "task": t.name, "task_id": t.id, "expected": sorted(exp), "also_ok": sorted(ok - exp),
                "ranked": [{"sop": m.sop_id, "score": m.score, "basis": m.basis, "primary": m.primary} for m in ranked],
                "top1": hit(exp, 1), "top3": hit(exp, 3), "top1_loose": hit(ok, 1), "top3_loose": hit(ok, 3),
            })

        # 필수 단계 누락: 주 표준서에서 빠진 핵심 단계가 있는 (작업, 표준서) = 결함
        flagged = {(m.task_id, m.sop_id): m for m in matches if m.missing_steps}
        expected = sorted(e["with"].split()[0] for e in a.get("expected_conflicts", []) if e["type"] == "sop_missing")
        got = sorted(sop for _, sop in flagged)
        defects = defects_from_sop(tasks, list(flagged.values()))
        defect_rows.append({
            "file": a["file"], "expected": expected, "flagged": got,
            "tp": len(set(expected) & set(got)), "fp": len(set(got) - set(expected)), "fn": len(set(expected) - set(got)),
            "missing_steps": {f"{tid}|{sop}": m.missing_steps for (tid, sop), m in flagged.items()},
            "f2_defects": [c.id for c in defects],
        })
        if "배관O" in a["file"]:
            key_step_found = any(KEY_STEP in s for m in flagged.values() for s in m.missing_steps)

    # ── 출력 ──
    print(f"\n{'계획서':40} {'작업':28} {'정답':18} {'매처 순위(점수)':44} {'1위':3} {'3위':3}")
    for r in rows:
        ranked = ", ".join(f"{x['sop']}({x['score']:.2f}{'*' if x['primary'] else ''})" for x in r["ranked"]) or "(매칭 없음)"
        exp = "·".join(r["expected"]) or "(없음)"
        print(f"{r['file'][:40]:40} {r['task'][:28]:28} {exp:18} {ranked:44} {'○' if r['top1'] else '✗':3} {'○' if r['top3'] else '✗':3}")
    print("  (* 주 표준서: 필수 단계 누락을 결함으로 판정하는 매칭)")
    n = len(rows)
    t1, t3 = sum(r["top1"] for r in rows), sum(r["top3"] for r in rows)
    l1, l3 = sum(r["top1_loose"] for r in rows), sum(r["top3_loose"] for r in rows)
    print(f"\n매칭 합계(엄격, expected 만): top-1 {t1}/{n} = {rate(t1, n)}%   top-3 {t3}/{n} = {rate(t3, n)}%")
    print(f"매칭 합계(느슨, expected+also_ok): top-1 {l1}/{n} = {rate(l1, n)}%   top-3 {l3}/{n} = {rate(l3, n)}%")
    misses = [r for r in rows if not r["top3"]]
    for r in misses:
        print(f"  ✗ top-3 밖: {r['file']} / {r['task']}({r['task_id']}) — 정답 {'·'.join(r['expected'])}, "
              f"매처 {', '.join(x['sop'] for x in r['ranked']) or '없음'}")
    for k in no_truth:
        print(f"  ! 정답셋(answers_sop.json)에 없는 작업: {k}")

    print("\n필수 단계 누락 검출 (주 표준서의 핵심 단계):")
    for d in defect_rows:
        print(f"  {d['file']}: 정답 {', '.join(d['expected']) or '없음'} / 검출 {', '.join(d['flagged']) or '없음'} "
              f"(맞음 {d['tp']}, 잘못 검출 {d['fp']}, 놓침 {d['fn']})")
        for k, steps in d["missing_steps"].items():
            print(f"      - {k}: {'; '.join(steps)}")
    tp, fp, fn = (sum(d[k] for d in defect_rows) for k in ("tp", "fp", "fn"))
    print(f"누락 검출 합계: 정답 {tp + fn}건 중 검출 {tp}건(재현율 {rate(tp, tp + fn)}%), 잘못 검출 {fp}건(정밀도 {rate(tp, tp + fp)}%)")
    print(f"배관O '{KEY_STEP}' 누락 표시: {'○ 검출' if key_step_found else '✗ 못 찾음'}  "
          f"(F2 결함으로 넘어간 건수 {sum(len(d['f2_defects']) for d in defect_rows)}건)")
    print(f"\n매칭 시간 ({args.runs}회 평균, 파싱 제외): 계획서당 {statistics.mean(ms_all):.1f}ms · 5건 합계 {sum(ms_all):.1f}ms")

    save_json(args.json, {
        "method": how, "rows": rows, "defects": defect_rows,
        "totals": {"tasks": n, "top1": t1, "top3": t3, "top1_loose": l1, "top3_loose": l3,
                   "top1_rate": rate(t1, n), "top3_rate": rate(t3, n), "top1_loose_rate": rate(l1, n), "top3_loose_rate": rate(l3, n),
                   "defect_tp": tp, "defect_fp": fp, "defect_fn": fn, "key_step_found": key_step_found},
        "timing_ms": {"runs": args.runs, "per_plan_mean": round(statistics.mean(ms_all), 2), "total": round(sum(ms_all), 2)},
        "no_truth": no_truth,
    })


if __name__ == "__main__":
    main()
