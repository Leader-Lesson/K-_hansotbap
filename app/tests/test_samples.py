"""app/samples/ 의 합성 계획서(안 겹침 15건 + 겹침/ 7건, PDF·엑셀·HWPX·Word)가 표 규칙(LLM 없이)으로 읽히고, 정답셋과 핵심 칸이 맞는지 본다.

파일을 다시 만들었거나 파서·정규화 규칙을 바꿨을 때 시연 데이터가 깨지지 않았는지 확인하는 용도.
"""

import json
from pathlib import Path

import pytest

from llm.extract import extract_plan
from parsers.docx import parse_docx
from parsers.hwpx import parse_hwpx
from parsers.pdf import parse_pdf
from parsers.xlsx import parse_xlsx

SAMPLES = Path(__file__).resolve().parents[1] / "samples"
PARSERS = {".pdf": parse_pdf, ".xlsx": parse_xlsx, ".hwpx": parse_hwpx, ".docx": parse_docx}
OVERLAP = SAMPLES / "겹침"
ANSWERS = sorted((SAMPLES / "answers").glob("가상-*.json")) + sorted((OVERLAP / "answers").glob("S*.json"))


def _extract(answer: dict):
    path = (OVERLAP if answer.get("scenario") else SAMPLES) / answer["file"]
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
    """핵심 장면: 가상-배관O 가 P34 를 P22(노흉 축조, ~02-27) 완료 전인 02-26 에 시작한다 (겹침/S1)."""
    answer = json.loads((OVERLAP / "answers" / "S1_가상-배관O_가스라인_앞당김_작업계획서.json").read_text(encoding="utf-8"))
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


def _submit_tasks(answer: dict):
    return [t.task for t in _extract(answer).tasks]


def test_base_files_add_no_conflicts_and_overlap_files_do():
    """안 겹치는 파일 15건은 기준 일정과 같아 다 올려도 겹침이 없고, 겹침/ 7건은 각 시연 장면의 충돌을 낸다."""
    import re

    from rules.data_loader import load_rules, load_wbs_tasks, load_zones, wbs_parent
    from rules.engine import detect_conflicts

    def judge(tasks):
        # 세부 작업(P13-1)은 기준 ID(P13)로 묶어 장면 충돌을 본다
        return {re.sub(r"P\d{2}-\d+", lambda m: wbs_parent(m.group(0)), c.id)
                for c in detect_conflicts(tasks, load_zones(), load_rules())}

    def submit(schedule: dict, tasks) -> dict:
        """db/plans.base_schedule 과 같이: 업체의 이전 제출분을 빼고 새 제출분을 얹고, 세부 작업으로 나눈 기준 작업은 뺀다."""
        contractors = {t.contractor for t in tasks}
        out = {i: t for i, t in schedule.items() if i in base or t.contractor not in contractors}
        for i, t in base.items():
            out.setdefault(i, t)
        out.update({t.id: t for t in tasks})
        split = {wbs_parent(i) for i in out if wbs_parent(i) != i}
        return {i: t for i, t in out.items() if i not in split}

    base = {t.id: t for t in load_wbs_tasks()}
    assert judge(list(base.values())) == set(), "기준 일정은 충돌 0건이어야 한다"
    schedule = dict(base)
    for path in sorted((SAMPLES / "answers").glob("가상-*.json")):
        schedule = submit(schedule, _submit_tasks(json.loads(path.read_text(encoding="utf-8"))))
    assert judge(list(schedule.values())) == set(), "안 겹치는 파일을 다 올려도 충돌이 없어야 한다"

    want = {  # 장면마다 반드시 나와야 하는 충돌
        "S1": {"R08:P22>P34", "R07:P22>P34"},
        "S2": {"R16:P23>P20"},
        "S3": {"R18:P17>P24"},
        "S4": {"R04:P10>P05"},
        "S5": {"R12:P07>P09"},
        "S6": {"R07:P26>P35", "R08:P26>P35"},
        "S7": {"R17:P30>P15"},
    }
    for path in sorted((OVERLAP / "answers").glob("S*.json")):
        answer = json.loads(path.read_text(encoding="utf-8"))
        now = submit(schedule, _submit_tasks(answer))
        assert want[answer["scenario"]] <= judge(list(now.values())), answer["file"]
