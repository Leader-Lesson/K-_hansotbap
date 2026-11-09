"""F1 파서: 위치 표식, 표 인식, 병합 셀 이어 채우기, 표 글자 중복 없음."""

from conftest import free_text_xlsx, hwpx_plan, pdf_plan, s1_xlsx

from parsers import extract_text, parse_document
from parsers.table_mapper import header_field, is_structured, looks_like_header, table_rows


def test_xlsx_locators_and_table():
    doc = parse_document("배관O.xlsx", s1_xlsx())
    locs = [s.loc for s in doc.segments]
    assert locs[:2] == ["작업계획!A1", "작업계획!A2"]
    assert len(doc.tables) == 1 and is_structured(doc.tables[0])
    rows = table_rows(doc.tables[0])
    assert [r.fields["name"].text for r in rows] == ["질소·가스 라인 복구 연결", "냉각수 계통 압력시험"]
    # 병합 셀처럼 비어 있는 업체 칸은 위 행 값으로 채운다
    assert rows[1].fields["contractor"].text == "가상-배관O"
    assert rows[1].fields["name"].loc == "작업계획!B6"


def test_free_text_xlsx_has_no_table():
    doc = parse_document("안내.xlsx", free_text_xlsx())
    assert doc.tables == []
    assert "[Sheet1!A2]" in doc.text()


def test_hwpx_table_text_not_duplicated():
    doc = parse_document("축로I.hwpx", hwpx_plan())
    texts = [s.text for s in doc.segments]
    assert texts[1] == "작업 개요 노 내부 밀폐공간"  # <hp:tab/> 은 띄어쓰기로
    assert sum("노복~노흉 내화물 축조" in t for t in texts) == 1
    assert [s.loc for s in doc.segments][2:] == ["s0:t1:r1", "s0:t1:r2"]
    assert is_structured(doc.tables[0])


def test_pdf_lines_and_table_in_reading_order():
    doc = parse_document("기계J.pdf", pdf_plan())
    assert [s.loc for s in doc.segments] == ["p1:L1", "p1:T1:R1", "p1:T1:R2", "p1:L2"]
    assert doc.tables[0].rows[0].cells == ["장입설비 설치", "노정", "1/6~2/20"]


def test_extract_text_keeps_old_contract():
    assert extract_text("배관O.xlsx", s1_xlsx()).startswith("[작업계획!A1] 주간 작업계획서")


def test_header_mapping():
    assert header_field("작업 내용(상세)") == "name"
    assert header_field("작업시작일") == "start_date"
    assert header_field("주/야") == "shift"
    assert looks_like_header(["업체", "작업명", "기간"])
    # '작업'이 들어간 긴 데이터 칸은 머리글이 아니다
    assert not looks_like_header(["가상-배관O", "질소 라인 연결 작업", "풍구 레벨", "주간"])
