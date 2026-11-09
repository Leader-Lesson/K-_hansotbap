"""app/samples/ 의 합성 계획서 5건이 표 규칙(LLM 없이)으로 읽히고, 정답셋과 핵심 칸이 맞는지 본다.

파일을 다시 만들었거나 파서·정규화 규칙을 바꿨을 때 시연 데이터가 깨지지 않았는지 확인하는 용도.
"""

import json
from pathlib import Path

import pytest

from llm.extract import extract_plan
from parsers.hwpx import parse_hwpx
from parsers.pdf import parse_pdf
from parsers.xlsx import parse_xlsx

SAMPLES = Path(__file__).resolve().parents[1] / "samples"
PARSERS = {".pdf": parse_pdf, ".xlsx": parse_xlsx, ".hwpx": parse_hwpx}
ANSWERS = sorted((SAMPLES / "answers").glob("가상-*.json"))


def _extract(answer: dict):
    path = SAMPLES / answer["file"]
    doc = PARSERS[path.suffix](path.read_bytes(), path.name)
    return extract_plan(doc, mode="rules")


@pytest.mark.parametrize("answer_path", ANSWERS, ids=lambda p: p.stem)
def test_sample_reads_by_rules(answer_path: Path):
    answer = json.loads(answer_path.read_text(encoding="utf-8"))
    ex = _extract(answer)
    assert ex.method == "table_rules"
    assert ex.contractor == answer["contractor"]
    assert len(ex.tasks) == len(answer["tasks"])
    by_name = {t.task.name: t for t in ex.tasks}
    for truth in answer["tasks"]:
        got = by_name[truth["name"]]
        assert got.task.zone_id == truth["zone_id"], truth["name"]
        assert got.task.start.date().isoformat() == truth["start"], truth["name"]
        assert got.task.end.date().isoformat() == truth["end"], truth["name"]
        assert sorted(h.value for h in got.task.hazards) == sorted(truth["hazards"]), truth["name"]
        assert not got.needs_review, (truth["name"], got.warnings)


def test_s1_pipe_plan_is_the_sequence_violation():
    """핵심 장면: 가상-배관O 가 P34 를 P22(노흉 축조, ~03-02) 완료 전인 02-26 에 시작한다."""
    answer = json.loads((SAMPLES / "answers" / "가상-배관O_가스라인_복구_작업계획서.json").read_text(encoding="utf-8"))
    ex = _extract(answer)
    p34 = next(t for t in ex.tasks if t.wbs_id == "P34")
    assert p34.task.id == "P34"
    assert "P22" in p34.task.predecessors
    assert p34.task.start.date().isoformat() == "2027-02-26"
    assert {h.value for h in p34.task.hazards} >= {"gas", "hot_work"}
    # 선행 조건이 원문에 그대로 남아 있어야 한다 (화면에서 근거로 보여 준다)
    assert "P22" in (p34.raw.get("precondition") or "")


def test_seed_filenames_exist():
    """db/seed.py 가 넣는 제출 이력의 파일명과 같은 샘플이 있어야 시연 화면의 파일명이 실제 파일과 맞는다."""
    from db.seed import DEMO

    for _, filename, _, _ in DEMO:
        assert (SAMPLES / filename).exists(), filename
