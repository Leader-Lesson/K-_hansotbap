"""테스트 공통: 임시 DB, 실제 LLM 호출 차단, 합성 계획서 파일 만들기 (모두 '합성 데이터', 협력사명 가상).

파일 생성 함수는 lru_cache 로 한 번만 만든다. openpyxl·PyMuPDF가 저장 시각을 파일에 넣어서, 호출할 때마다
바이트가 달라지면(초가 바뀌면) 같은 파일 재업로드 캐시 시험이 가끔 실패한다.
"""

import datetime as dt
import zipfile
from functools import lru_cache
from io import BytesIO

import pymupdf
import pytest
from openpyxl import Workbook

import llm.extract
import llm.tbm_check
import search.sop_match
from config import settings


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", tmp_path / "test.db")

    def no_llm():
        raise RuntimeError("테스트에서는 실제 LLM을 부르지 않는다")

    monkeypatch.setattr(llm.extract, "get_provider", no_llm)
    monkeypatch.setattr(llm.tbm_check, "get_provider", no_llm)
    # .env 에 임베딩 모델이 있어도 로컬 서버(Unsloth·LM Studio)를 부르지 않는다. 임베딩 시험은 가짜 임베딩을 넘긴다
    monkeypatch.setattr(search.sop_match, "default_embedder", lambda: None)


@lru_cache
def s1_xlsx() -> bytes:
    """S1 핵심 장면: 가상-배관O가 질소·가스 라인 연결(P34)을 노흉 축조(P22) 완료 전으로 앞당긴 엑셀 계획서."""
    wb = Workbook()
    ws = wb.active
    ws.title = "작업계획"
    ws["A1"] = "주간 작업계획서 (합성 데이터)"
    ws["A2"] = "업체명: 가상-배관O"
    ws.append([])
    ws.append(["업체", "작업명", "작업위치", "작업기간", "작업시간", "위험작업", "선행조건"])
    ws.append(["가상-배관O", "질소·가스 라인 복구 연결", "풍구 레벨 환상관", "2027.02.25 ~ 03.01", "08:00~17:00", "화기, 가스", ""])
    ws.append([None, "냉각수 계통 압력시험", "노복", dt.datetime(2027, 3, 2), "주간", "", "노흉 축조 완료 후"])
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


@lru_cache
def free_text_xlsx() -> bytes:
    """머리글이 없는 줄글 양식 → 표 규칙으로 못 읽고 LLM 경로로 가야 한다."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Sheet1"
    ws["A1"] = "가상-축로I 작업 안내 (합성 데이터)"
    ws["A2"] = "2월 5일부터 3월 2일까지 노흉 구간 내화물 축조를 주간에 진행합니다."
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


_HWPX_NS = 'xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"'


def _cell(text: str) -> str:
    return f"<hp:tc><hp:subList><hp:p><hp:run><hp:t>{text}</hp:t></hp:run></hp:p></hp:subList></hp:tc>"


@lru_cache
def hwpx_plan() -> bytes:
    rows = [["작업명", "위치", "기간"], ["노복~노흉 내화물 축조", "노흉", "2/5~3/2"]]
    table = "".join("<hp:tr>" + "".join(_cell(c) for c in r) + "</hp:tr>" for r in rows)
    sec = (
        f"<hs:sec {_HWPX_NS}>"
        "<hp:p><hp:run><hp:t>작업계획서 가상-축로I (합성 데이터)</hp:t></hp:run></hp:p>"
        "<hp:p><hp:run><hp:t>작업 개요<hp:tab/>노 내부 밀폐공간</hp:t></hp:run>"
        f"<hp:run><hp:tbl>{table}</hp:tbl></hp:run></hp:p>"
        "</hs:sec>"
    )
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("Contents/section0.xml", sec)
    return buf.getvalue()


@lru_cache
def pdf_plan() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 60), "작업계획서 가상-기계J (합성 데이터)", fontname="korea", fontsize=11)
    for r, row in enumerate([["작업명", "위치", "기간"], ["장입설비 설치", "노정", "1/6~2/20"]]):
        for c, val in enumerate(row):
            x, y = 50 + c * 150, 100 + r * 25
            page.draw_rect(pymupdf.Rect(x, y, x + 150, y + 25))
            page.insert_text((x + 5, y + 17), val, fontname="korea", fontsize=10)
    page.insert_text((50, 200), "비고: 크레인 인양 포함", fontname="korea", fontsize=10)
    return doc.tobytes()
