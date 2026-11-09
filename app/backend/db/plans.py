"""계획서 제출·이력·현재 일정 (F1 제출 → F2 판정 연결 자리).

현재 일정 = 원청 기준 일정(작업 분해표) 위에, 협력사별 가장 최근 제출 계획서의 작업을 덮어쓴 것.
- 계획서 작업이 기준 일정 작업과 같은 ID(예: P34)면 기준 일정의 그 작업을 대체한다.
- 같은 협력사가 다시 제출하면 그 협력사의 예전 제출분은 빠지고 새 제출분만 남는다 (계획 변경 = 수정 계획서 재제출).
"""

from __future__ import annotations

import sqlite3
import threading
from datetime import datetime

from rules.data_loader import load_rules, load_wbs_tasks, load_zones
from rules.engine import detect_conflicts, detect_sequence_violations
from schemas import (
    Conflict,
    ConflictRecord,
    ConflictStatus,
    PlanExtraction,
    PlanRecord,
    PlanSubmission,
    PlanSubmitResult,
    Task,
)

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


# ── 판정 결과 저장·조회 ────────────────────────────────────────────────
# 판정 결과를 제출 응답에만 두면 화면을 새로고침할 때 사라진다. 기획서가 "판정 후 화면을 한 번 강제
# 새로고침"하라고 하므로 DB에 남긴다. F4 재판정·F5 이행 기록도 이 표를 쓴다.
_CONFLICT_UPSERT = """
INSERT INTO conflicts (id, plan_id, judged_at, payload, status, resolved_at)
VALUES (?, ?, ?, ?, 'open', NULL)
ON CONFLICT(id) DO UPDATE SET
    plan_id = excluded.plan_id,
    judged_at = excluded.judged_at,
    payload = excluded.payload,
    resolved_at = NULL,
    -- 사람이 적용한 조정(adjusted)은 그대로 둔다. 해소됐다 다시 나타나면 open 으로 되돌린다
    status = CASE WHEN conflicts.status = 'resolved' THEN 'open' ELSE conflicts.status END
"""


def save_conflicts(
    conn: sqlite3.Connection, plan_id: int | None, conflicts: list[Conflict], judged_at: str
) -> None:
    """판정 결과를 지금 상태로 맞춘다.

    판정은 일정 전체를 다시 보기 때문에, 이번 판정에 없는 충돌은 해소된 것으로 적는다(지우지 않는다 —
    없어졌다는 사실 자체가 F5 이행 기록이다).
    """
    conn.executemany(
        _CONFLICT_UPSERT, [(c.id, plan_id, judged_at, c.model_dump_json()) for c in conflicts]
    )
    ids = [c.id for c in conflicts]
    if ids:
        marks = ",".join("?" * len(ids))
        conn.execute(
            "UPDATE conflicts SET status = 'resolved', resolved_at = ?"
            f" WHERE status != 'resolved' AND id NOT IN ({marks})",
            (judged_at, *ids),
        )
    else:
        conn.execute(
            "UPDATE conflicts SET status = 'resolved', resolved_at = ? WHERE status != 'resolved'",
            (judged_at,),
        )


def _conflict_record(row) -> ConflictRecord:
    return ConflictRecord(
        conflict=Conflict.model_validate_json(row["payload"]),
        status=ConflictStatus(row["status"]),
        plan_id=row["plan_id"],
        judged_at=datetime.fromisoformat(row["judged_at"]),
        resolved_at=datetime.fromisoformat(row["resolved_at"]) if row["resolved_at"] else None,
    )


def list_conflicts(contractor: str | None = None, include_resolved: bool = False) -> list[ConflictRecord]:
    """저장된 판정 결과.

    협력사로 부르면 자기 작업이 걸린 충돌만 준다. 권한은 서버에서 거른다(프론트 필터로 대신하지 않는다).
    상대 업체가 누구인지는 충돌 안에 남는다 — 혼재작업 조정에 필요한 정보이고, 기획서의 공유 범위
    (인접 위치 작업·위험 요소·작업 인계 조건)에 들어간다.
    """
    sql = "SELECT * FROM conflicts"
    if not include_resolved:
        sql += " WHERE status != 'resolved'"
    with session() as conn:
        records = [_conflict_record(r) for r in conn.execute(sql)]
    if contractor:
        mine = {t.id for t in current_schedule() if t.contractor == contractor}
        records = [r for r in records if mine & set(r.conflict.task_ids)]
    return sorted(records, key=lambda r: (r.conflict.window_start, r.conflict.id))


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
            save_conflicts(conn, plan_id, conflicts, now)
            row = conn.execute(_PLAN_SELECT + " WHERE p.id = ?", (plan_id,)).fetchone()
    return PlanSubmitResult(plan=_record(row), conflicts=conflicts)
