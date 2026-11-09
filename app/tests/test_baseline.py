from datetime import datetime

from fastapi.testclient import TestClient

from main import app
from rules.data_loader import load_rules, load_wbs_tasks, load_zones
from rules.overlap import find_overlap_candidates, time_overlap, work_overlap, work_periods

client = TestClient(app)


def test_data_counts():
    assert len(load_zones()) == 14
    assert len(load_rules()) == 30
    assert len(load_wbs_tasks()) == 37


def test_time_overlap_touching_is_not_overlap():
    a = (datetime(2027, 1, 1, 7), datetime(2027, 1, 1, 12))
    b = (datetime(2027, 1, 1, 12), datetime(2027, 1, 1, 19))
    assert time_overlap(*a, *b) is None


def test_time_overlap_window():
    a = (datetime(2027, 1, 1, 7), datetime(2027, 1, 1, 13))
    b = (datetime(2027, 1, 1, 12), datetime(2027, 1, 1, 19))
    assert time_overlap(*a, *b) == (datetime(2027, 1, 1, 12), datetime(2027, 1, 1, 13))


def test_work_overlap_day_and_night_do_not_meet():
    # 같은 날짜들이어도 주간(07~19)과 야간(19~다음 날 07)은 함께 일하지 않는다
    day = (datetime(2027, 1, 1, 7), datetime(2027, 1, 10, 19))
    night = (datetime(2027, 1, 1, 19), datetime(2027, 1, 11, 7))
    assert work_overlap(*day, *night) is None


def test_work_overlap_is_daily_hours_not_one_block():
    # 여러 날 주간 작업과 하루 오후 작업: 그날 오후만 겹친다 (밤은 일하지 않는다)
    day = (datetime(2027, 1, 1, 7), datetime(2027, 1, 10, 19))
    afternoon = (datetime(2027, 1, 5, 13), datetime(2027, 1, 5, 17))
    assert work_overlap(*day, *afternoon) == (datetime(2027, 1, 5, 13), datetime(2027, 1, 5, 17))
    # 밤 사이(19시~다음 날 07시)에만 하는 작업은 겹치지 않는다
    assert work_overlap(*day, datetime(2027, 1, 5, 20), datetime(2027, 1, 6, 6)) is None


def test_work_overlap_24h_meets_both_shifts():
    # 끝 시각 = 시작 시각이면 24시간 연속 → 주간·야간 모두와 겹친다
    nonstop = (datetime(2027, 1, 3, 7), datetime(2027, 1, 5, 7))
    assert work_overlap(*nonstop, datetime(2027, 1, 1, 7), datetime(2027, 1, 10, 19)) == (
        datetime(2027, 1, 3, 7), datetime(2027, 1, 4, 19))
    assert work_overlap(*nonstop, datetime(2027, 1, 1, 19), datetime(2027, 1, 11, 7)) == (
        datetime(2027, 1, 3, 19), datetime(2027, 1, 5, 7))


def test_work_periods_one_per_day():
    assert work_periods(datetime(2027, 1, 1, 7), datetime(2027, 1, 3, 19)) == [
        (datetime(2027, 1, d, 7), datetime(2027, 1, d, 19)) for d in (1, 2, 3)
    ]
    assert work_periods(datetime(2027, 1, 1, 19), datetime(2027, 1, 3, 7)) == [
        (datetime(2027, 1, 1, 19), datetime(2027, 1, 2, 7)), (datetime(2027, 1, 2, 19), datetime(2027, 1, 3, 7))
    ]


def test_overlap_candidates_include_vertical_pair():
    # S2: 노정 장입설비 설치(P23, TOP) ↔ 노저 축조(P20, HEARTH) — 업체가 다른 위아래 겹침
    pairs = {
        (c.task_a, c.task_b, c.relation)
        for c in find_overlap_candidates(load_wbs_tasks(), load_zones())
    }
    assert ("P20", "P23", "vertical") in pairs


def test_api_health_and_baseline():
    assert client.get("/api/health").json()["status"] == "ok"
    assert len(client.get("/api/zones").json()) == 14
    assert len(client.get("/api/tasks").json()) == 37
