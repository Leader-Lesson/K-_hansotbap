from datetime import datetime

from fastapi.testclient import TestClient

from main import app
from rules.data_loader import load_rules, load_wbs_tasks, load_zones
from rules.overlap import find_overlap_candidates, time_overlap

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
