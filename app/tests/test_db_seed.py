"""시드·초기화 (팀원이 같은 DB 상태를 다시 만들 수 있는지)."""

import json
from datetime import date
from io import BytesIO

from fastapi.testclient import TestClient
from openpyxl import load_workbook

from db.database import session
from db.history import list_history
from db.plans import current_schedule, list_plans, save_plan_document
from db.seed import DEMO, HISTORY_SEED, TABLES, reset_db, seed_demo
from db.tbm import add_notice
from main import app
from rules.data_loader import load_rules, load_wbs_tasks
from schemas import HistoryEventKind, SourceLine, TbmNoticeCreate


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


def test_seed_adds_six_days_of_field_records():
    """시연 전 6일치 현장 기록 30건: 가상 업체·실제 규칙 ID·직함만, 남긴 시각은 seed 날 기준 1~6일 전."""
    seed_demo()
    field = [e for e in list_history() if e.kind == HistoryEventKind.FIELD_RECORD]
    assert len(field) == 30
    today = date.today()
    assert all(1 <= (today - e.at.date()).days <= 6 for e in field)
    wbs_contractors = {t.contractor for t in load_wbs_tasks()}
    assert all(set(e.contractors) <= wbs_contractors for e in field)
    rule_ids = {r.id for r in load_rules()}
    assert all(e.rule_id in rule_ids and "제64조" in e.legal_basis for e in field if e.rule_id)
    assert {"교대 인계", "착수 승인", "잔업 승인", "조정"} <= {e.label for e in field}
    assert all(e.target_id.startswith("rec-") for e in field)


def test_field_records_are_synthetic_and_neutral():
    """합성 기록에 실제 회사·실명을 넣지 않는다. 시스템이 작업을 승인·중지한 기록도 없다 (결정은 사람)."""
    text = HISTORY_SEED.read_text(encoding="utf-8")
    assert "포스코" not in text and "본청" not in text
    for r in json.loads(text)["records"]:
        if any(k in r["label"] for k in ("승인", "보류", "반려")):
            assert r["actor"] and r["actor"].startswith("원청")


def test_contractor_sees_only_own_field_records():
    seed_demo()
    pipe = [e for e in list_history("가상-배관O") if e.kind == HistoryEventKind.FIELD_RECORD]
    assert pipe and all("가상-배관O" in e.contractors for e in pipe)
    assert not any(e.label == "구조화" and not e.contractors for e in pipe)  # 관련 업체가 없는 기록은 원청만


def test_export_shows_field_record_label():
    seed_demo()
    res = TestClient(app).get("/api/history/export")
    labels = {row[1] for row in load_workbook(BytesIO(res.content)).active.iter_rows(min_row=5, values_only=True)}
    assert {"교대 인계", "착수 승인", "계획서 제출"} <= labels


def test_baseline_tasks_have_crew():
    """기준 일정 37건 모두 투입 인원(합성 가정값)이 있다 — 상황판 숫자 띠·구역 칸·막대에 쓴다."""
    tasks = load_wbs_tasks()
    assert len(tasks) == 37 and all(t.crew and t.crew > 0 for t in tasks)
