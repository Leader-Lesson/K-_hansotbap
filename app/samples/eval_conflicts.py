"""F2 충돌 판정 평가: 정답셋의 작업(또는 추출 결과)을 기준 일정과 같이 판정해 expected_conflicts 를 몇 건 찾는지 본다.

    cd app/backend && uv run python ../samples/eval_conflicts.py                       # 정답셋 작업으로 판정 (추출이 완벽할 때)
    cd app/backend && uv run python ../samples/eval_conflicts.py --from-extraction rules  # 표 규칙 추출 결과로 판정
    cd app/backend && uv run python ../samples/eval_conflicts.py --scale 100,500,1000     # 작업 수를 늘려 판정 시간
    cd app/backend && uv run python ../samples/eval_conflicts.py --json ../samples/answers/_eval_conflicts.json

판정 대상 일정 (db/plans.py base_schedule 과 같은 방식, DB 는 열지 않는다)
- 계획서별: 기준 일정 37개 위에 그 계획서 작업을 ID 로 덮어쓴다. 시드가 넣는 축로I(P20·P22)·기계J(P23)는 기준 일정과
  같은 작업이라 기준 일정에 이미 들어 있다 (S1 의 상대 P22, S2 의 P20·P23 이 여기서 온다)
- 5건 동시: 기준 일정 위에 5건을 모두 덮어쓴다 (시연이 끝났을 때의 일정)

정답과 판정의 짝 (판정 1건 = 규칙 1개, 정답 1건 = 규칙 여러 개일 수 있음)
- 정답 1건의 '상대'는 with 글에 적힌 기준 일정 ID(P\\d\\d) 하나다
- 판정이 정답과 맞으려면: 판정 규칙이 정답 rule_ids 중 하나이고, 판정의 작업 쌍이 (이 계획서 작업, 상대)여야 한다
  · 보통 판정은 task_ids[0]·[1] 이 쌍, 전 구역 묶음(…>ALL)은 (전 구역 작업, 나머지 각각), R30 혼재는 모든 쌍
- 재현율(찾음) = 정답 중 맞는 판정이 1건 이상인 비율. '규칙 전부'는 정답 rule_ids 를 모두 판정한 비율
- 정밀도 = 이 계획서 작업이 낀 판정 중 정답과 맞는 판정 비율. 정답셋은 시연 장면 충돌만 적었으므로 맞지 않는 판정이
  곧 오탐은 아니다 — 목록을 찍어 사람이 본다 (--verbose)
- '제출로 새로 생긴 판정' = 기준 일정만 판정했을 때 없던 판정. 축로I·기계J(P23)는 기준 일정과 같은 작업이라
  그 장면 충돌(S2)은 기준 일정에 이미 있고 새로 생긴 판정으로 세지 않는다
- sop_missing(표준서 누락)은 F8 이라 여기서 세지 않는다 → eval_sop.py
"""

from __future__ import annotations

import argparse
import random
import re
import statistics
import sys
from datetime import timedelta
from pathlib import Path

from eval_common import HERE, load_answers, overlay, save_json, timed, truth_tasks

from rules.data_loader import load_rules, load_wbs_tasks, load_zones  # noqa: E402
from rules.engine import detect_conflicts, detect_sequence_violations, is_all_zone_conflict  # noqa: E402
from schemas import Conflict, Task  # noqa: E402

WITH_ID = re.compile(r"\bP\d{2}\b")
LLM_MODES = ("llm", "auto", "llm-raw")


# ── 판정 (db/plans.py judge 에서 DB·표준서 부분만 뺀 것) ─────────────────────
def judge(tasks: list[Task]) -> list[Conflict]:
    found = detect_conflicts(tasks, load_zones(), load_rules()) + detect_sequence_violations(tasks)
    unique: dict[str, Conflict] = {}
    for c in found:
        unique.setdefault(c.id, c)
    return list(unique.values())


def pairs(c: Conflict) -> set[frozenset[str]]:
    """판정이 가리키는 작업 쌍."""
    ids = c.task_ids
    if is_all_zone_conflict(c):
        return {frozenset((ids[0], x)) for x in ids[1:]}
    if c.rule_id == "R30":
        return {frozenset((a, b)) for i, a in enumerate(ids) for b in ids[i + 1:]}
    return {frozenset(ids[:2])}


def touches(c: Conflict, mine: set[str]) -> bool:
    return any(p & mine for p in pairs(c))


def matches(c: Conflict, exp: dict, mine: set[str]) -> bool:
    other = exp["_with_id"]
    if c.rule_id not in exp["rule_ids"] or other is None:
        return False
    return any(other in p and (p - {other}) & mine for p in pairs(c))


def conflict_expectations(answer: dict) -> list[dict]:
    out = []
    for e in answer.get("expected_conflicts", []):
        if e["type"] == "sop_missing":
            continue
        m = WITH_ID.search(e["with"])
        out.append({**e, "_with_id": m.group(0) if m else None})
    return out


def score_plan(answer: dict, mine_tasks: list[Task], conflicts: list[Conflict], before: set[str]) -> dict:
    """before: 기준 일정만 판정했을 때의 판정 ID (제출로 새로 생긴 판정을 가려낸다)."""
    mine = {t.id for t in mine_tasks}
    exps = conflict_expectations(answer)
    rows = []
    for e in exps:
        hit = [c for c in conflicts if matches(c, e, mine)]
        got_rules = sorted({c.rule_id for c in hit})
        rows.append({
            "scenario": e["scenario"], "type": e["type"], "rule_ids": e["rule_ids"], "with": e["_with_id"],
            "found": bool(hit), "all_rules": set(e["rule_ids"]) <= set(got_rules), "found_rules": got_rules,
            "conflict_ids": sorted(c.id for c in hit), "types_found": sorted({c.type.value for c in hit}),
        })
    involved = [c for c in conflicts if touches(c, mine)]
    matched = [c for c in involved if any(matches(c, e, mine) for e in exps)]
    unmatched = sorted((c for c in involved if c not in matched), key=lambda c: c.id)
    new = [c for c in involved if c.id not in before]
    return {
        "file": answer["file"], "contractor": answer["contractor"], "tasks": len(mine_tasks), "expected": rows,
        "involved": len(involved), "matched": len(matched),
        "new": len(new), "new_matched": sum(1 for c in new if c in matched),
        "unmatched": [{"id": c.id, "rule": c.rule_id, "type": c.type.value, "grade": c.grade.value} for c in unmatched],
    }


def totals(plans: list[dict]) -> dict:
    exp = [r for p in plans for r in p["expected"]]
    n = len(exp)
    found = sum(r["found"] for r in exp)
    all_rules = sum(r["all_rules"] for r in exp)
    inv = sum(p["involved"] for p in plans)
    mat = sum(p["matched"] for p in plans)
    new = sum(p["new"] for p in plans)
    new_mat = sum(p["new_matched"] for p in plans)
    return {
        "expected": n, "found": found, "all_rules": all_rules, "missed": n - found,
        "recall": round(100 * found / n, 1) if n else 0.0,
        "recall_all_rules": round(100 * all_rules / n, 1) if n else 0.0,
        "involved": inv, "matched": mat, "precision": round(100 * mat / inv, 1) if inv else 0.0,
        "new": new, "new_matched": new_mat, "precision_new": round(100 * new_mat / new, 1) if new else 0.0,
    }


# ── 판정에 넣을 작업: 정답셋 또는 추출 결과 ────────────────────────────────
def llm_unavailable(mode: str) -> str | None:
    """LLM 경로를 못 쓰는 이유 (없으면 None). 키가 없는데 Claude 를 부르지 않게 미리 막는다."""
    from config import settings

    if mode == "auto":
        return None  # 규칙으로 읽히면 LLM 을 부르지 않는다. 못 읽은 파일만 실패로 센다
    if settings.llm_provider == "claude" and not settings.anthropic_api_key:
        return (f"--from-extraction {mode}: LLM 경로는 지금 쓸 수 없습니다 — .env 의 LLM_PROVIDER=claude 인데 "
                "ANTHROPIC_API_KEY 가 비어 있습니다. 키를 넣거나 LLM_PROVIDER=lmstudio 로 바꾼 뒤 다시 돌리세요. "
                "(표 규칙 경로는 --from-extraction rules)")
    return None


def extracted_tasks(answer: dict, mode: str, samples: Path) -> tuple[list[Task] | None, str | None]:
    from accuracy import PARSERS, extract_plan, raw_document

    path = samples / answer["file"]
    try:
        doc = PARSERS[path.suffix](path.read_bytes(), path.name)
        if mode == "llm-raw":
            doc = raw_document(doc)
        ex = extract_plan(doc, mode="llm" if mode == "llm-raw" else mode)
    except Exception as e:  # 규칙으로 못 읽고 LLM 도 못 부르면 그 파일의 충돌은 모두 놓친 것으로 센다
        return None, f"{type(e).__name__}: {e}"[:200]
    return [et.task for et in ex.tasks], None


# ── 규모 시험: 기준 일정을 복제·이동해 작업 수를 늘린다 ──────────────────────
def synthetic_schedule(n: int, seed: int = 20270226) -> list[Task]:
    """기준 37개 + 복제 작업 (n-37)개. 복제는 날짜를 ±21일 옮기고 협력사를 40곳 가상 업체로 나눈다 (같은 seed → 같은 일정)."""
    rng = random.Random(seed)
    base = load_wbs_tasks()
    out = list(base[:n])
    for i in range(max(0, n - len(base))):
        t = rng.choice(base)
        d = timedelta(days=rng.randint(-21, 21))
        out.append(t.model_copy(update={
            "id": f"S{i:04d}", "contractor": f"가상-복제{i % 40:02d}", "start": t.start + d, "end": t.end + d,
        }))
    return out


def run_scale(sizes: list[int]) -> list[dict]:
    print("규모 시험 (기준 일정 복제·이동, seed 고정, 1회 판정)")
    print(f"{'작업 수':>8} {'판정 건수':>10} {'판정 시간(ms)':>14}")
    rows = []
    for n in sizes:
        tasks = synthetic_schedule(n)
        out, ms = timed(lambda: judge(tasks))
        rows.append({"tasks": len(tasks), "conflicts": len(out), "ms": round(ms[0], 1)})
        print(f"{len(tasks):>8} {len(out):>10} {ms[0]:>14.1f}")
    return rows


# ── 출력 ───────────────────────────────────────────────────────────────
def print_plans(title: str, plans: list[dict]) -> None:
    print(f"\n[{title}]")
    print(f"{'계획서':46} {'장면':10} {'유형':15} {'정답 규칙':12} {'상대':5} {'찾음':4} {'판정 규칙':12}")
    for p in plans:
        for r in p["expected"]:
            mark = "○" if r["all_rules"] else ("△" if r["found"] else "✗")
            print(f"{p['file']:46} {r['scenario']:10} {r['type']:15} {'·'.join(r['rule_ids']):12} {r['with'] or '-':5} "
                  f"{mark:4} {'·'.join(r['found_rules']) or '-':12}")
    print("  (○ 정답 규칙 전부 판정 · △ 일부 규칙만 판정 · ✗ 못 찾음)")


def print_totals(label: str, t: dict) -> None:
    print(f"{label}: 정답 {t['expected']}건 중 찾음 {t['found']}건 = 재현율 {t['recall']}%  "
          f"(규칙 전부 {t['all_rules']}건 = {t['recall_all_rules']}%)  놓침 {t['missed']}건  |  "
          f"계획서 작업이 낀 판정 {t['involved']}건 중 정답과 맞음 {t['matched']}건 = 정밀도 {t['precision']}%  |  "
          f"제출로 새로 생긴 판정 {t['new']}건 중 정답과 맞음 {t['new_matched']}건 = {t['precision_new']}%")


def main() -> None:
    ap = argparse.ArgumentParser(description="F2 충돌 판정 재현율·정밀도·판정 시간 (합성 계획서 5건)")
    ap.add_argument("--from-extraction", choices=("rules", "llm", "auto", "llm-raw"),
                    help="정답셋 작업 대신 accuracy.py 의 추출 경로 결과로 판정")
    ap.add_argument("--samples", help="표본 폴더 (그 안에 answers/). 기본은 samples/")
    ap.add_argument("--scale", help="규모 시험 작업 수, 쉼표로 (예: 100,500,1000). 주면 규모 시험만 한다")
    ap.add_argument("--runs", type=int, default=10, help="판정 시간 반복 횟수 (평균)")
    ap.add_argument("--verbose", action="store_true", help="정답셋에 없는 판정 목록을 모두 찍는다")
    ap.add_argument("--json", help="결과를 JSON 으로 저장할 경로")
    args = ap.parse_args()

    if args.scale:
        sizes = [int(x) for x in args.scale.split(",") if x.strip()]
        save_json(args.json, {"scale": run_scale(sizes)})
        return

    mode = args.from_extraction
    if mode in LLM_MODES and (why := llm_unavailable(mode)):
        print(why)
        sys.exit(2)

    samples = Path(args.samples).resolve() if args.samples else HERE
    answers = load_answers(samples)
    baseline = load_wbs_tasks()
    plan_tasks: dict[str, list[Task]] = {}
    failed: list[dict] = []
    for a in answers:
        if mode:
            tasks, err = extracted_tasks(a, mode, samples)
            if tasks is None:
                failed.append({"file": a["file"], "error": err})
                tasks = []
        else:
            tasks = truth_tasks(a)
        plan_tasks[a["file"]] = tasks

    source = f"추출 결과({mode})" if mode else "정답셋 작업 (추출이 완벽할 때)"
    print(f"판정 입력: {source}   표본: {samples.name}   기준 일정 {len(baseline)}개")

    before = {c.id for c in judge(baseline)}

    # 계획서별: 기준 일정 + 그 계획서
    per_plan = []
    for a in answers:
        conflicts = judge(overlay(baseline, plan_tasks[a["file"]]))
        per_plan.append(score_plan(a, plan_tasks[a["file"]], conflicts, before))
    print_plans("계획서별: 기준 일정 + 해당 계획서", per_plan)

    # 5건 동시: 기준 일정 + 5건
    everything = overlay(baseline, *plan_tasks.values())
    all_conflicts = judge(everything)
    together = [score_plan(a, plan_tasks[a["file"]], all_conflicts, before) for a in answers]
    print_plans("5건 동시: 기준 일정 + 계획서 5건", together)

    print("\n정답셋에 없는 판정 (계획서별, 오탐이 아니라 시연 장면 밖의 판정일 수 있다):")
    for p in per_plan:
        rules_count: dict[str, int] = {}
        for u in p["unmatched"]:
            rules_count[u["rule"]] = rules_count.get(u["rule"], 0) + 1
        summary = ", ".join(f"{r} {n}건" for r, n in sorted(rules_count.items())) or "없음"
        print(f"  {p['file']}: 낀 판정 {p['involved']}건(제출로 새로 생김 {p['new']}건), 정답과 맞음 {p['matched']}건, "
              f"그 밖 {len(p['unmatched'])}건 ({summary})")
        if args.verbose:
            for u in p["unmatched"]:
                print(f"      - {u['id']} [{u['type']}, {u['grade']}]")

    t_plan, t_all = totals(per_plan), totals(together)
    print()
    print_totals("합계(계획서별)", t_plan)
    print_totals("합계(5건 동시)", t_all)
    if failed:
        for f in failed:
            print(f"  ✗ 추출 실패 → 그 파일 충돌은 놓침으로 셈: {f['file']}: {f['error']}")
    diff = None
    if mode:
        # 추출 오류가 판정을 얼마나 바꾸는지: 같은 '5건 동시' 일정을 정답셋 작업으로 판정한 결과와 비교
        truth_ids = {c.id for c in judge(overlay(baseline, *(truth_tasks(a) for a in answers)))}
        got_ids = {c.id for c in all_conflicts}
        diff = {"only_extraction": sorted(got_ids - truth_ids), "only_truth": sorted(truth_ids - got_ids)}
        print(f"정답셋 작업 판정 대비(5건 동시): 추출로만 생긴 판정 {len(diff['only_extraction'])}건, "
              f"추출 때문에 사라진 판정 {len(diff['only_truth'])}건")
        for cid in diff["only_truth"][:20]:
            print(f"  - 사라짐: {cid}")
        for cid in diff["only_extraction"][:20]:
            print(f"  + 생김: {cid}")

    # 판정 시간
    _, ms_base = timed(lambda: judge(baseline), args.runs)
    _, ms_all = timed(lambda: judge(everything), args.runs)
    print(f"\n판정 시간 ({args.runs}회 평균, DB·표준서 매칭 제외): 기준 일정 {len(baseline)}개 {statistics.mean(ms_base):.1f}ms · "
          f"기준+계획서 5건 {len(everything)}개 {statistics.mean(ms_all):.1f}ms (판정 {len(all_conflicts)}건)")

    save_json(args.json, {
        "source": source, "mode": mode or "truth", "samples": samples.name,
        "per_plan": per_plan, "together": together, "totals_per_plan": t_plan, "totals_together": t_all,
        "failed": failed, "diff_vs_truth": diff,
        "timing_ms": {"runs": args.runs, "baseline_tasks": len(baseline), "baseline_mean": round(statistics.mean(ms_base), 2),
                      "all_tasks": len(everything), "all_mean": round(statistics.mean(ms_all), 2), "all_conflicts": len(all_conflicts)},
    })


if __name__ == "__main__":
    main()
