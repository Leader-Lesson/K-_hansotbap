"""F1 규칙 정규화: 날짜·시간·주야간·구역·작업 유형·작업 분해표 연결."""

from datetime import date, datetime, time

from parsers.normalize import (
    build_interval,
    detect_hazards,
    match_wbs,
    parse_dates,
    parse_shift,
    parse_times,
    resolve_zones,
    wbs_refs_in_text,
)
from rules.data_loader import load_wbs_tasks
from schemas import Hazard, Shift


def test_dates_korean_formats_and_year_inference():
    assert parse_dates("2027.02.25 ~ 03.01") == [date(2027, 2, 25), date(2027, 3, 1)]
    assert parse_dates("2월 5일부터 3월 2일까지") == [date(2027, 2, 5), date(2027, 3, 2)]
    assert parse_dates("11/20~12/3") == [date(2026, 11, 20), date(2026, 12, 3)]  # 연도 없음 → 공사 기간 안
    assert parse_dates("D+105") == [date(2027, 2, 25)]  # D0 = 2026-11-12
    assert parse_dates("2027-03-02") == [date(2027, 3, 2)]


def test_times_and_shift():
    assert parse_times("08:00~17:00") == [time(8), time(17)]
    assert parse_times("19시~익일 7시") == [time(19), time(7)]
    assert parse_shift("야간") == Shift.NIGHT
    assert parse_shift("주간") == Shift.DAY
    assert parse_shift("주야간") is None


def test_interval_night_crosses_midnight():
    start, end, shift, _ = build_interval(date(2027, 3, 4), date(2027, 3, 5), None, None, Shift.NIGHT)
    assert (start, end, shift) == (datetime(2027, 3, 4, 19), datetime(2027, 3, 6, 7), Shift.NIGHT)


def test_interval_without_time_uses_day_default_and_warns():
    start, end, shift, warnings = build_interval(date(2027, 3, 4), None, None, None, None)
    assert (start, end, shift) == (datetime(2027, 3, 4, 7), datetime(2027, 3, 4, 19), Shift.DAY)
    assert warnings


def test_zone_aliases():
    assert resolve_zones("풍구 레벨 환상관") == {"TUYERE"}
    assert resolve_zones("노복~노흉") == {"BELLY_BOSH", "STACK"}
    assert resolve_zones("사무실") == set()


def test_hazard_keywords():
    assert detect_hazards("송풍지관 플랜지 용접") == {Hazard.HOT_WORK}
    assert detect_hazards("질소 라인 연결", "화기") == {Hazard.GAS, Hazard.HOT_WORK}


def test_wbs_matching_s1():
    wbs = load_wbs_tasks()
    wbs_id, score = match_wbs("질소·가스 라인 복구 연결", "가상-배관O", "TUYERE", wbs)
    assert wbs_id == "P34" and score > 0.6
    assert wbs_refs_in_text("노흉 축조 완료 후", wbs) == ["P22"]
    assert wbs_refs_in_text("P20, P21 완료 확인 후", wbs)[:2] == ["P20", "P21"]
