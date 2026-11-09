"""시드·초기화 (팀원이 같은 DB 상태를 다시 만들 수 있는지)."""

from datetime import date

from db.database import session
from db.plans import current_schedule, list_plans, save_plan_document
from db.seed import DEMO, TABLES, reset_db, seed_demo
from db.tbm import add_notice
from schemas import SourceLine, TbmNoticeCreate


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


def _tables() -> set[str]:
    with session() as conn:
        return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")}


def test_reset_covers_every_table():
    """새 표를 TABLES 에 안 넣으면 리셋해도 그 표의 기록이 남는다."""
    assert _tables() == set(TABLES)


def test_seed_clears_rehearsal_records():
    """리허설 때 넣은 TBM 공지·계획서 원문이 시연용 seed 뒤에 남지 않는다."""
    add_notice(TbmNoticeCreate(contractor="가상-배관O", date=date(2027, 3, 3), text="리허설 공지", created_by="원청"))
    save_plan_document("draft-rehearsal", "리허설.xlsx", [SourceLine(locator="A1", text="합성 데이터")])
    seed_demo()
    with session() as conn:
        assert {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in ("tbm_notices", "tbm_checks", "plan_documents")} == {
            "tbm_notices": 0, "tbm_checks": 0, "plan_documents": 0,
        }


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
