"""결과 보고서용 평가 스크립트(eval_conflicts·eval_sop·eval_tbm) 공통 도구 (합성 데이터).

- 백엔드 모듈을 import 할 수 있게 sys.path 에 app/backend 를 넣는다 (accuracy.py 와 같은 방식)
- 정답셋(answers/*.json)의 작업을 추출기(llm/extract.py finalize)와 같은 규칙으로 Task 로 만든다
    · 작업 ID: 기준 일정 ID(wbs_id)가 있고 아직 안 썼으면 그 ID(제출 시 기준 일정 작업을 대체), 아니면 안정적인 새 ID(U-…)
    · 시작·종료 시각: parsers.normalize.build_interval (주간 07~19시, 야간 19~07시, 미정이면 주간 기본값)
- 실제 DB 파일(hansotbap.db)은 열지 않는다. 판정은 순수 함수(rules/engine.py)로만 부른다
"""

from __future__ import annotations

import json
import sys
import time
from collections.abc import Callable
from datetime import date
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

# Windows 콘솔 코드 페이지(cp949)에 없는 기호(✗ 등)가 있어도 멈추지 않게 한다
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(errors="replace")
    except (AttributeError, ValueError):
        pass

from llm.extract import _stable_id  # noqa: E402
from parsers.normalize import build_interval  # noqa: E402
from schemas import Hazard, Shift, SourceRef, Task  # noqa: E402

HERE = Path(__file__).resolve().parent


def load_answers(samples: Path | None = None) -> list[dict]:
    """answers/ 의 정답셋 (밑줄로 시작하는 결과 파일은 뺀다)."""
    base = samples or HERE
    return [
        json.loads(p.read_text(encoding="utf-8"))
        for p in sorted((base / "answers").glob("*.json"))
        if not p.name.startswith("_")
    ]


def truth_tasks(answer: dict) -> list[Task]:
    """정답셋 작업 → Task. 추출기가 만드는 Task 와 같은 ID·시각 규칙을 쓴다 (정답값으로 판정하면 '추출이 완벽할 때'가 된다)."""
    used: set[str] = set()
    out: list[Task] = []
    for t in answer["tasks"]:
        wbs_id = t.get("wbs_id")
        task_id = wbs_id if wbs_id and wbs_id not in used else _stable_id(answer["contractor"], t["name"], t["zone_id"] or "")
        while task_id in used:
            task_id += "x"
        used.add(task_id)
        shift = Shift(t["shift"]) if t.get("shift") else None
        start, end, shift, _ = build_interval(
            date.fromisoformat(t["start"]), date.fromisoformat(t["end"]), None, None, shift
        )
        out.append(
            Task(
                id=task_id,
                contractor=answer["contractor"],
                name=t["name"],
                zone_id=t["zone_id"] or "",
                start=start,
                end=end,
                shift=shift,
                hazards=sorted((Hazard(h) for h in t["hazards"]), key=lambda h: h.value),
                predecessors=sorted(set(t.get("predecessors") or []) - {task_id}),
                source=SourceRef(file=answer["file"], locator="정답셋", text=t["name"]),
            )
        )
    return out


def overlay(base: list[Task], *plans: list[Task]) -> list[Task]:
    """db/plans.py base_schedule 과 같은 방식: 기준 일정 위에 제출 작업을 ID 로 덮어쓴다 (같은 ID면 대체)."""
    tasks = {t.id: t for t in base}
    for plan in plans:
        for t in plan:
            tasks[t.id] = t
    return list(tasks.values())


def timed(fn: Callable[[], object], runs: int = 1) -> tuple[object, list[float]]:
    """fn 을 runs 회 돌려 (마지막 결과, 회차별 ms)."""
    out, ms = None, []
    for _ in range(max(1, runs)):
        t0 = time.perf_counter()
        out = fn()
        ms.append((time.perf_counter() - t0) * 1000)
    return out, ms


def save_json(path: str | None, payload: dict) -> None:
    if path:
        Path(path).write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")
        print(f"\n저장: {path}")
