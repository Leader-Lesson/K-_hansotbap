"""계획서 제출·이력·현재 일정 (F1 제출 → F2 판정 연결 자리).

현재 일정 = 원청 기준 일정(작업 분해표) 위에, 협력사별 가장 최근 제출 계획서의 작업을 덮어쓴 것.
- 계획서 작업이 기준 일정 작업과 같은 ID(예: P34)면 기준 일정의 그 작업을 대체한다.
- 같은 협력사가 다시 제출하면 그 협력사의 예전 제출분은 빠지고 새 제출분만 남는다 (계획 변경 = 수정 계획서 재제출).
"""

from __future__ import annotations

import threading
from datetime import datetime

from rules.data_loader import load_rules, load_wbs_tasks, load_zones
from rules.engine import detect_conflicts, detect_sequence_violations
from schemas import Conflict, PlanExtraction, PlanRecord, PlanSubmission, PlanSubmitResult, Task

from .database import session

# 판정은 제출 순간 한 번. 동시에 들어오면 먼저 들어온 계획부터 하나씩 처리한다
_submit_lock = threading.Lock()


# ── F1 추출 결과 캐시 (같은 파일을 다시 올리면 LLM을 다시 부르지 않는다) ──
def cache_get(key: str) -> PlanExtraction | None:
    with session() as conn:
        row = conn.execute("SELECT payload FROM extraction_cache WHERE key = ?", (key,)).fetchone()
    return PlanExtraction.model_validate_json(row["payload"]) if row else None


def cache_put(key: str, extraction: PlanExtraction) -> None:
    with session() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO extraction_cache (key, payload, created_at) VALUES (?, ?, ?)",
            (key, extraction.model_dump_json(), datetime.now().isoformat(timespec="seconds")),
        )


# ── 제출·이력 ─────────────────────────────────────────────────────────
def _record(row) -> PlanRecord:
    return PlanRecord(
        id=row["id"],
        contractor=row["contractor"],
        file=row["filename"],
        version=row["version"],
        submitted_at=datetime.fromisoformat(row["submitted_at"]),
        submitted_by=row["submitted_by"],
        task_count=row["task_count"],
    )


_PLAN_SELECT = """
SELECT p.*, (SELECT COUNT(*) FROM tasks t WHERE t.plan_id = p.id) AS task_count
FROM plans p
"""


def list_plans(contractor: str | None = None) -> list[PlanRecord]:
    sql, args = _PLAN_SELECT, ()
    if contractor:
        sql, args = sql + " WHERE p.contractor = ?", (contractor,)
    with session() as conn:
        return [_record(r) for r in conn.execute(sql + " ORDER BY p.id", args)]


def current_schedule() -> list[Task]:
    tasks = {t.id: t for t in load_wbs_tasks()}
    with session() as conn:
        latest = conn.execute("SELECT contractor, MAX(id) AS plan_id FROM plans GROUP BY contractor").fetchall()
        for row in sorted(latest, key=lambda r: r["plan_id"]):
            for t in conn.execute("SELECT payload FROM tasks WHERE plan_id = ?", (row["plan_id"],)):
                task = Task.model_validate_json(t["payload"])
                tasks[task.id] = task
    return list(tasks.values())


def judge(tasks: list[Task]) -> list[Conflict]:
    """F2 판정 자리. 규칙 엔진이 채워지면 여기서 나온 충돌이 그대로 화면에 간다."""
    found = detect_conflicts(tasks, load_zones(), load_rules()) + detect_sequence_violations(tasks)
    unique: dict[str, Conflict] = {}
    for c in found:
        unique.setdefault(c.id, c)
    return list(unique.values())


def submit_plan(sub: PlanSubmission) -> PlanSubmitResult:
    with _submit_lock:
        now = datetime.now().isoformat(timespec="seconds")
        with session() as conn:
            version = 1 + conn.execute(
                "SELECT COUNT(*) FROM plans WHERE contractor = ?", (sub.contractor,)
            ).fetchone()[0]
            cur = conn.execute(
                "INSERT INTO plans (contractor, filename, submitted_at, version, submitted_by, draft_id)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (sub.contractor, sub.file, now, version, sub.submitted_by, sub.draft_id),
            )
            plan_id = cur.lastrowid
            conn.executemany(
                "INSERT INTO tasks (id, plan_id, payload) VALUES (?, ?, ?)",
                [(t.id, plan_id, t.model_dump_json()) for t in sub.tasks],
            )
        conflicts = judge(current_schedule())
        with session() as conn:
            row = conn.execute(_PLAN_SELECT + " WHERE p.id = ?", (plan_id,)).fetchone()
    return PlanSubmitResult(plan=_record(row), conflicts=conflicts)
