"""시연·개발용 DB 시드 (합성 데이터). 팀원 누구나 같은 상태를 다시 만들 수 있게 한다.

DB 파일은 공유하지 않는다 (.gitignore 의 *.db). 바이너리라 merge 가 안 되고 누가 최신인지
알 수 없게 된다. 대신 이 스크립트를 커밋해서 각자 같은 상태를 다시 만든다.

    npm run seed      비우고 시연용 제출 이력을 넣는다 (여러 번 돌려도 결과가 같다)
    npm run db:reset  비우기만 한다 (시연 직전 "아무도 올리지 않은" 상태)

기준 일정(작업 분해표 37개)은 data/gy2bf_wbs.csv 에서 읽으므로 시드할 것이 없다.
시연 핵심 장면(S1)의 배관 계획서는 일부러 넣지 않는다 — 시연 중에 직접 올리는 파일이다.
"""

from __future__ import annotations

import argparse

from rules.data_loader import load_wbs_tasks
from schemas import PlanRecord, PlanSubmission, SourceRef, Task

from .database import session
from .plans import list_plans, submit_plan

# 지우는 순서: tasks 가 plans 를 참조하므로 자식부터
TABLES = ("tasks", "plans", "conflicts", "decisions", "adjustments", "extraction_cache")

# 시연 시작 상태: 협력사 두 곳이 기준 일정대로 이미 제출해 둔 상태.
# 각각 따로 보면 정상이다 — 겹쳐서 위험해지는 건 배관 계획서가 올라온 다음이다.
DEMO: list[tuple[str, str, list[str], str]] = [
    ("가상-축로I", "가상-축로I_노체축조_주간계획.xlsx", ["P20", "P22"], "축로 공무팀"),
    ("가상-기계J", "가상-기계J_장입설비_설치계획서.pdf", ["P23"], "기계 공사팀"),
]


def reset_db() -> None:
    """표를 비우고 다시 만든다. 스키마를 바꿨을 때도 이걸 쓴다 (해커톤 범위에서는 마이그레이션을 만들지 않는다)."""
    with session() as conn:
        for table in TABLES:
            conn.execute(f"DROP TABLE IF EXISTS {table}")
    with session() as conn:  # session() 이 열 때 init_db 로 다시 만든다
        conn.execute("SELECT 1")


def _tasks(filename: str, task_ids: list[str]) -> list[Task]:
    """기준 일정에서 작업을 그대로 가져온다. 기준과 같은 기간이라 충돌이 생기지 않는다."""
    baseline = {t.id: t for t in load_wbs_tasks()}
    missing = [i for i in task_ids if i not in baseline]
    if missing:
        raise SystemExit(f"작업 분해표에 없는 작업 ID: {', '.join(missing)} (data/gy2bf_wbs.csv 확인)")
    return [
        baseline[i].model_copy(
            update={"source": SourceRef(file=filename, locator="합성 시드", text=baseline[i].name)}
        )
        for i in task_ids
    ]


def seed_demo() -> list[PlanRecord]:
    """비우고 시연용 제출 이력을 넣는다. 먼저 비우기 때문에 여러 번 돌려도 결과가 같다."""
    reset_db()
    for contractor, filename, task_ids, submitted_by in DEMO:
        submit_plan(
            PlanSubmission(
                contractor=contractor,
                file=filename,
                tasks=_tasks(filename, task_ids),
                submitted_by=submitted_by,
            )
        )
    return list_plans()


def main() -> None:
    parser = argparse.ArgumentParser(description="한솥밥 DB 시드 (합성 데이터)")
    parser.add_argument("--empty", action="store_true", help="비우기만 하고 시연용 제출 이력은 넣지 않는다")
    args = parser.parse_args()

    if args.empty:
        reset_db()
        print("DB 를 비웠습니다. 제출 이력 0건 (기준 일정 작업 37개는 CSV 에서 읽습니다).")
        return

    plans = seed_demo()
    print(f"DB 를 비우고 시연용 제출 이력 {len(plans)}건을 넣었습니다 (모두 합성 데이터).")
    for p in plans:
        print(f"  #{p.id} {p.contractor} v{p.version} — {p.file} (작업 {p.task_count}개)")


if __name__ == "__main__":
    main()
