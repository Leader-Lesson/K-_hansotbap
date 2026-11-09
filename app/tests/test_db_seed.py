"""시드·초기화 (팀원이 같은 DB 상태를 다시 만들 수 있는지)."""

from db.plans import current_schedule, list_plans
from db.seed import DEMO, reset_db, seed_demo


def test_seed_is_idempotent():
    """여러 번 돌려도 제출 이력이 쌓이지 않는다 (먼저 비우고 넣기 때문)."""
    first = seed_demo()
    second = seed_demo()
    assert len(first) == len(second) == len(DEMO)
    assert {p.contractor for p in second} == {c for c, *_ in DEMO}
    assert all(p.version == 1 for p in second)


def test_reset_empties_submissions():
    seed_demo()
    assert list_plans()
    reset_db()
    assert list_plans() == []


def test_seeded_tasks_overwrite_baseline_not_append():
    """시드 제출은 기준 일정 작업을 같은 ID로 덮어쓴다 → 작업 수는 그대로 37개."""
    reset_db()
    assert len(current_schedule()) == 37
    seed_demo()
    assert len(current_schedule()) == 37


def test_seed_does_not_include_s1_piping_plan():
    """시연 핵심 장면의 배관 계획서(P34)는 시연 중에 올린다. 시드에 있으면 장면이 깨진다."""
    seed_demo()
    assert "가상-배관O" not in {p.contractor for p in list_plans()}
