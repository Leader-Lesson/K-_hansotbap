"""합성 협력사 계획서 5건 생성 (PDF 2 · 엑셀 1 · HWPX 2). 협력사명은 모두 가상, 모든 파일에 "합성 데이터" 표시.

    cd app/backend && uv run python ../samples/make_samples.py

양식은 일부러 서로 다르게 만든다(머리글 낱말·열 순서·날짜 표기·업체명 위치). F1 파서가 "양식을 강제하지 않아도"
읽을 수 있음을 보이기 위해서다. 작업은 data/gy2bf_wbs.csv(기준 일정)에서 골랐고, 아래 네 쌍이 충돌 4유형을 하나씩 낸다.

  S1 순서 위반  가상-배관O  P34 질소·가스 라인 연결을 02-26으로 앞당김  ↔ 가상-축로I P22 노흉 축조(~03-02)   R08·R07
  S2 위아래     가상-기계J  P23 노정 장입설비 설치(TOP)                  ↔ 가상-축로I P20 노저 축조(HEARTH)    R16
  S4 화기×가스  가상-제관F  P10 하강관 절단을 11-15로 앞당김              ↔ 원청-정비 P05 가스 퍼지(~11-15)     R04
  같은 시간·구역 가상-비계N  노흉 내부 비계 해체 03-01~                  ↔ 가상-축로I P22 노흉 축조(~03-02)    R17·R16
                가상-비계N  철피 외부 비계 설치 12-28~                   ↔ 가상-양중C P17 링블록 인양(~01-03)  R18·R20

정답셋은 answers/<파일명>.json 에 같이 만든다 (추출 정확도 비교용, accuracy.py).
"""

from __future__ import annotations

import datetime as dt
import json
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

import pymupdf
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

HERE = Path(__file__).resolve().parent
ANSWERS = HERE / "answers"
SYNTH = "※ 본 문서는 해커톤 시연용 합성 데이터이며 협력사명·일정·인원은 모두 가상입니다."
FONT = "korea"  # PyMuPDF 내장 CJK 글꼴


# ──────────────────────────────────────────────────────────────────────
# 1. 가상-축로I — 엑셀 (기준 일정 그대로, 시드와 같은 파일명)
# ──────────────────────────────────────────────────────────────────────
def make_chukro_xlsx() -> tuple[Path, dict]:
    wb = Workbook()
    ws = wb.active
    ws.title = "작업계획"
    ws["A1"] = "주간 작업계획서 — 광양 2고로 개수 노체 축조 (합성 데이터)"
    ws["A1"].font = Font(bold=True, size=14)
    ws["A2"] = "업체명: 가상-축로I"
    ws["A3"] = "공종: 축로(내화물)   현장 책임자: 홍길동(가상)   제출일: 2027-01-18"
    ws["A4"] = SYNTH
    header = ["업체", "작업명", "작업위치", "시작일", "종료일", "주야간", "투입인원", "위험작업", "선행조건", "비고"]
    ws.append([])
    ws.append(header)
    for c in range(1, len(header) + 1):
        cell = ws.cell(row=6, column=c)
        cell.font = Font(bold=True)
        cell.fill = PatternFill("solid", fgColor="DDEBF7")
        cell.alignment = Alignment(horizontal="center")
    rows = [
        ["가상-축로I", "노저 카본블록·세라믹컵 축조(연와정초)", "노저(hearth) 내부", dt.datetime(2027, 1, 21), dt.datetime(2027, 2, 15), "주간", 18, "밀폐공간", "노저 해체·청소 완료, 철피 용접 완료 후", "산소농도 측정 1일 2회"],
        [None, "풍구 레벨 내화물·풍구·냉각기 신설", "풍구 레벨", dt.datetime(2027, 2, 10), dt.datetime(2027, 2, 25), "주간", 14, "밀폐공간, 중량물", "노저 축조 완료 후", "호이스트 인양"],
        [None, "노복~노흉 내화물 축조·캐스터블", "노흉(shaft) 내부", dt.datetime(2027, 2, 5), dt.datetime(2027, 3, 2), "주간", 22, "밀폐공간, 고소", "스테이브·냉각판 설치 완료 후", "달비계 사용"],
    ]
    for r in rows:
        ws.append(r)
    for row in ws.iter_rows(min_row=7, max_row=9, min_col=4, max_col=5):
        for cell in row:
            cell.number_format = "yyyy-mm-dd"
    widths = [12, 38, 18, 12, 12, 8, 9, 16, 32, 20]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    ws2 = wb.create_sheet("안전조치")
    for line in [
        "노 내부 밀폐공간 작업 안전조치 (합성)",
        "1. 작업 전 산소농도(18~23.5%)·가연성가스·CO 측정, 결과를 출입 기록부에 기재",
        "2. 감시인 1명 출입구 상주, 구조장비(삼각대·공기호흡기) 비치",
        "3. 환기팬 연속 가동, 불활성가스(질소) 유입 가능 배관은 맹판 설치 확인",
        "4. 달비계·안전대 체결 확인(고소), 자재 인양 시 하부 출입 통제",
    ]:
        ws2.append([line])
    ws2.column_dimensions["A"].width = 90

    path = HERE / "가상-축로I_노체축조_주간계획.xlsx"
    wb.save(path)
    answer = {
        "file": path.name,
        "contractor": "가상-축로I",
        "format": "xlsx",
        "tasks": [
            {"wbs_id": "P20", "name": "노저 카본블록·세라믹컵 축조(연와정초)", "zone_id": "HEARTH", "start": "2027-01-21", "end": "2027-02-15", "shift": "day", "headcount": 18, "hazards": ["confined"], "predecessors": ["P16", "P18"]},
            {"wbs_id": "P21", "name": "풍구 레벨 내화물·풍구·냉각기 신설", "zone_id": "TUYERE", "start": "2027-02-10", "end": "2027-02-25", "shift": "day", "headcount": 14, "hazards": ["confined", "heavy_lift"], "predecessors": ["P20"]},
            {"wbs_id": "P22", "name": "노복~노흉 내화물 축조·캐스터블", "zone_id": "STACK", "start": "2027-02-05", "end": "2027-03-02", "shift": "day", "headcount": 22, "hazards": ["confined", "height"], "predecessors": ["P19"]},
        ],
        "expected_conflicts": [
            {"scenario": "S2", "type": "vertical", "rule_ids": ["R16"], "with": "가상-기계J P23 (TOP, 2027-01-06~02-20)", "note": "기준 일정 그대로여도 노정 설치 아래 노저 축조가 겹친다 — 조정 대상 표시"},
        ],
        "note": "기준 일정 그대로. 시드(db/seed.py)가 넣는 파일과 같은 이름. 이 계획서 단독으로는 충돌 없음",
    }
    return path, answer


# ──────────────────────────────────────────────────────────────────────
# PDF 공통: 표 그리기 (PyMuPDF find_tables 가 선을 보고 표를 찾는다)
# ──────────────────────────────────────────────────────────────────────
def _pdf_table(page: pymupdf.Page, x0: float, y0: float, widths: list[float], rows: list[list[str]], row_h: float = 34, font: float = 8.5) -> float:
    y = y0
    for r_no, row in enumerate(rows):
        x = x0
        h = row_h if r_no else 20
        for w, val in zip(widths, row):
            rect = pymupdf.Rect(x, y, x + w, y + h)
            if r_no == 0:
                page.draw_rect(rect, color=(0, 0, 0), fill=(0.88, 0.92, 0.97), width=0.8)
            else:
                page.draw_rect(rect, color=(0, 0, 0), width=0.6)
            page.insert_textbox(rect + (3, 3, -3, -2), val, fontname=FONT, fontsize=font, align=pymupdf.TEXT_ALIGN_LEFT)
            x += w
        y += h
    return y


def _pdf_lines(page: pymupdf.Page, x: float, y: float, lines: list[str], size: float = 9, gap: float = 14) -> float:
    for ln in lines:
        page.insert_text((x, y), ln, fontname=FONT, fontsize=size)
        y += gap
    return y


# ──────────────────────────────────────────────────────────────────────
# 2. 가상-기계J — PDF (세로, 결재란 + 표, 시드와 같은 파일명)
# ──────────────────────────────────────────────────────────────────────
def make_gigye_pdf() -> tuple[Path, dict]:
    doc = pymupdf.open()
    page = doc.new_page()  # A4 세로
    page.insert_text((50, 55), "작 업 계 획 서", fontname=FONT, fontsize=18)
    page.insert_text((50, 72), "광양 2고로 개수 — 노정 장입설비(벨리스 탑) 설치", fontname=FONT, fontsize=10)
    # 결재란
    for i, (k, v) in enumerate([("작성", "김가상"), ("검토", "이가상"), ("승인", "")]):
        x = 380 + i * 55
        page.draw_rect(pymupdf.Rect(x, 40, x + 55, 58), width=0.6, fill=(0.9, 0.9, 0.9))
        page.draw_rect(pymupdf.Rect(x, 58, x + 55, 85), width=0.6)
        page.insert_text((x + 18, 53), k, fontname=FONT, fontsize=8)
        page.insert_text((x + 14, 76), v, fontname=FONT, fontsize=8)
    y = _pdf_lines(page, 50, 100, [
        "협력사: 가상-기계J (장비 제작사)      공종: 기계      작성일: 2026-12-28",
        "현장 책임자: 박가상(가상)      비상연락: 000-0000-0000(가상)",
        SYNTH,
    ])
    y = _pdf_lines(page, 50, y + 6, ["1. 작업 개요"], size=10)
    y = _pdf_lines(page, 60, y, [
        "신 철피 링블록 설치 완료 후 노정 플랫폼에 벨리스 탑·호퍼를 대형 크레인으로 인양하여 설치한다.",
        "설치 후 장입 구동부 시운전을 2월 셋째 주에 실시한다.",
    ], size=8.5, gap=12)
    y = _pdf_lines(page, 50, y + 8, ["2. 작업 일정표"], size=10)
    header = ["작업명", "위치", "기간", "작업시간", "인원", "위험작업", "선행조건"]
    rows = [
        header,
        ["벨리스 탑 부품 야드 반입·검수", "조립장 야드", "2026.12.20 ~ 2027.01.05", "08:00~17:00", "6", "중량물", ""],
        ["노정 장입설비(벨리스 탑) 설치", "노정 플랫폼", "2027.01.06 ~ 2027.02.20", "08:00~17:00", "12", "크레인 인양, 고소작업, 용접", "신 철피 링블록 설치 완료 후"],
        ["장입 구동부 시운전", "노정 플랫폼", "2027.02.18 ~ 2027.02.20", "13:00~17:00", "4", "끼임(시운전)", "설치 완료·LOTO 해제 후"],
    ]
    y = _pdf_table(page, 50, y + 4, [120, 62, 108, 62, 30, 90, 90], rows, row_h=36)
    y = _pdf_lines(page, 50, y + 16, ["3. 안전조치"], size=10)
    _pdf_lines(page, 60, y, [
        "- 인양 시 신호수 2명 배치, 인양 경로 하부 출입 통제(노정 직하 노 내부 작업 업체와 시간 협의)",
        "- 고소작업: 안전대 100% 체결, 노정 개구부 덮개·난간 확인",
        "- 용접 시 화재감시자 배치, 소화기 2대, 종료 후 30분 감시",
        "- 시운전 전 구동부 주변 인원 철수 확인, 시운전 중 접근 금지",
    ], size=8.5, gap=12)
    path = HERE / "가상-기계J_장입설비_설치계획서.pdf"
    doc.save(path, garbage=3, deflate=True)
    answer = {
        "file": path.name,
        "contractor": "가상-기계J",
        "format": "pdf",
        "tasks": [
            {"wbs_id": None, "name": "벨리스 탑 부품 야드 반입·검수", "zone_id": "YARD", "start": "2026-12-20", "end": "2027-01-05", "shift": "day", "headcount": 6, "hazards": ["heavy_lift"], "predecessors": []},
            {"wbs_id": "P23", "name": "노정 장입설비(벨리스 탑) 설치", "zone_id": "TOP", "start": "2027-01-06", "end": "2027-02-20", "shift": "day", "headcount": 12, "hazards": ["heavy_lift", "height", "hot_work"], "predecessors": ["P17"]},
            {"wbs_id": None, "name": "장입 구동부 시운전", "zone_id": "TOP", "start": "2027-02-18", "end": "2027-02-20", "shift": "day", "headcount": 4, "hazards": [], "predecessors": []},
        ],
        "expected_conflicts": [
            {"scenario": "S2", "type": "vertical", "rule_ids": ["R16", "R18"], "with": "가상-축로I P20 (HEARTH, 2027-01-21~02-15)", "note": "노정 고소·인양 바로 아래 노저 축조 — 방호선반·하부 출입금지 기재 없으면 금지"},
        ],
        "note": "기준 일정 그대로. 시드가 넣는 파일과 같은 이름",
    }
    return path, answer


# ──────────────────────────────────────────────────────────────────────
# 4. 가상-제관F — PDF (가로, 다른 머리글 낱말, 업체명은 머리에만) — S4 화기×가스
# ──────────────────────────────────────────────────────────────────────
def make_jegwan_pdf() -> tuple[Path, dict]:
    doc = pymupdf.open()
    page = doc.new_page(width=842, height=595)  # A4 가로
    page.draw_rect(pymupdf.Rect(40, 35, 802, 70), width=1.0)
    page.insert_text((50, 58), "월간 공사 계획 (가스 계통 보수)", fontname=FONT, fontsize=16)
    page.insert_text((560, 50), "문서번호: JG-2026-11-07 (가상)", fontname=FONT, fontsize=8)
    page.insert_text((560, 63), "개정: 1차  작성일: 2026.11.10", fontname=FONT, fontsize=8)
    y = _pdf_lines(page, 50, 90, [
        "협력업체 : 가상-제관F      공종 : 제관·내화물      공사명 : 광양 2고로 개수 상승관·하강관 및 가스청정설비 보수",
        "안전관리자 : 최가상(가상)      작업 책임자 : 정가상(가상)",
        SYNTH,
    ], size=8.5, gap=12)
    header = ["공정명", "장소", "일정", "근무형태", "작업인원", "필요허가", "착수조건", "비고"]
    rows = [
        header,
        ["상승관·하강관 가스 배관 절단·보수", "하강관", "2026.11.15 ~ 2027.01.11", "주간", "10", "화기, 고소", "가스 계통 차단 후", "블리더 방산 완료 여부 원청 확인 요청"],
        ["제진기·가스청정설비 보수·교체", "제진기", "2026.11.22 ~ 2027.02.20", "주야간", "14", "화기, 밀폐공간, 중량물", "", "야간은 교체품 반입·인양 위주"],
        ["보수 자재 가공(야드)", "자재 야드", "2026.11.12 ~ 2026.12.31", "주간", "5", "화기", "", "그라인딩·절단"],
    ]
    y = _pdf_table(page, 40, y + 6, [150, 60, 110, 55, 50, 110, 100, 127], rows, row_h=34)
    y = _pdf_lines(page, 50, y + 16, ["작업 절차 (하강관 절단·보수)"], size=10)
    _pdf_lines(page, 60, y, [
        "① 작업허가서(화기·고소) 발급 → ② 가스 계통 차단·맹판 확인, 작업 전 가스 측정(LEL 10% 미만, O2 18~23.5%, CO 30ppm 미만) 기록",
        "③ 화재감시자 배치·불티비산방지포 설치 → ④ 절단·보수 용접 → ⑤ 비파괴검사 → ⑥ 작업 종료 후 30분 화재감시 → ⑦ 허가서 반납",
    ], size=8.5, gap=12)
    path = HERE / "가상-제관F_하강관_가스청정_보수계획.pdf"
    doc.save(path, garbage=3, deflate=True)
    answer = {
        "file": path.name,
        "contractor": "가상-제관F",
        "format": "pdf",
        "tasks": [
            {"wbs_id": "P10", "name": "상승관·하강관 가스 배관 절단·보수", "zone_id": "DOWNCOMER", "start": "2026-11-15", "end": "2027-01-11", "shift": "day", "headcount": 10, "hazards": ["gas", "height", "hot_work"], "predecessors": ["P05"]},
            {"wbs_id": "P25", "name": "제진기·가스청정설비 보수·교체", "zone_id": "GCP", "start": "2026-11-22", "end": "2027-02-20", "shift": None, "headcount": 14, "hazards": ["confined", "heavy_lift", "hot_work"], "predecessors": ["P05"]},
            {"wbs_id": None, "name": "보수 자재 가공(야드)", "zone_id": "YARD", "start": "2026-11-12", "end": "2026-12-31", "shift": "day", "headcount": 5, "hazards": ["hot_work"], "predecessors": []},
        ],
        "expected_conflicts": [
            {"scenario": "S4", "type": "hot_gas", "rule_ids": ["R04"], "with": "원청-정비 P05 가스 계통 차단·블리더 방산·질소 퍼지 (DOWNCOMER, 2026-11-13~11-15)", "note": "하강관 절단을 기준(11-17)보다 이틀 앞당겨 퍼지 중 화기 — 금지"},
        ],
        "note": "P10 시작일을 2026-11-15로 앞당겨 제출(기준 11-17). 절차에 '작업 전 가스 측정'이 들어 있다(표준서 누락 없음)",
    }
    return path, answer


# ──────────────────────────────────────────────────────────────────────
# HWPX 공통: 최소 패키지 (파서는 Contents/section*.xml 만 읽는다)
# ──────────────────────────────────────────────────────────────────────
_NS = (
    'xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" '
    'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" '
    'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" '
    'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"'
)
_PID = [100]


def _pid() -> int:
    _PID[0] += 1
    return _PID[0]


def _para(text: str, char_pr: int = 0, para_pr: int = 0, first: bool = False) -> str:
    sec_pr = ""
    if first:
        sec_pr = (
            '<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" '
            'outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">'
            '<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>'
            '<hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>'
            '<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" '
            'hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>'
            '<hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>'
            '<hp:pagePr landscape="WIDELY" width="59528" height="84188" gutterType="LEFT_ONLY">'
            '<hp:margin header="4252" footer="4252" gutter="0" left="8504" right="8504" top="5668" bottom="4252"/></hp:pagePr>'
            "</hp:secPr>"
        )
    return (
        f'<hp:p id="{_pid()}" paraPrIDRef="{para_pr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
        f'<hp:run charPrIDRef="{char_pr}">{sec_pr}<hp:t>{escape(text)}</hp:t></hp:run></hp:p>'
    )


def _cell(text: str, col: int, row: int, width: int, header: bool) -> str:
    return (
        f'<hp:tc name="" header="{int(header)}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="3">'
        '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" '
        'textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">'
        f"{_para(text, char_pr=1 if header else 0)}"
        "</hp:subList>"
        f'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/><hp:cellSpan colSpan="1" rowSpan="1"/>'
        f'<hp:cellSz width="{width}" height="1800"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/>'
        "</hp:tc>"
    )


def _table(rows: list[list[str]], widths: list[int]) -> str:
    total_w = sum(widths)
    trs = []
    for r, row in enumerate(rows):
        tcs = "".join(_cell(val, c, r, widths[c], header=(r == 0)) for c, val in enumerate(row))
        trs.append(f"<hp:tr>{tcs}</hp:tr>")
    tbl = (
        f'<hp:tbl id="{_pid()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" '
        f'dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="{len(rows)}" colCnt="{len(widths)}" cellSpacing="0" '
        'borderFillIDRef="3" noAdjust="0">'
        f'<hp:sz width="{total_w}" widthRelTo="ABSOLUTE" height="{1800 * len(rows)}" heightRelTo="ABSOLUTE" protect="0"/>'
        '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" '
        'horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
        '<hp:outMargin left="283" right="283" top="283" bottom="283"/>'
        '<hp:inMargin left="510" right="510" top="141" bottom="141"/>'
        + "".join(trs)
        + "</hp:tbl>"
    )
    return (
        f'<hp:p id="{_pid()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
        f'<hp:run charPrIDRef="0">{tbl}</hp:run></hp:p>'
    )


_HEADER_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" version="1.4" secCnt="1">
<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>
<hh:refList>
<hh:fontfaces itemCnt="7">
<hh:fontface lang="HANGUL" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface>
<hh:fontface lang="LATIN" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface>
<hh:fontface lang="HANJA" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface>
<hh:fontface lang="JAPANESE" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface>
<hh:fontface lang="OTHER" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface>
<hh:fontface lang="SYMBOL" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface>
<hh:fontface lang="USER" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface>
</hh:fontfaces>
<hh:borderFills itemCnt="3">
<hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/><hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/><hh:topBorder type="NONE" width="0.1 mm" color="#000000"/><hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill>
<hh:borderFill id="2" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/><hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/><hh:topBorder type="NONE" width="0.1 mm" color="#000000"/><hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill>
<hh:borderFill id="3" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:rightBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:topBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:bottomBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill>
</hh:borderFills>
<hh:charProperties itemCnt="3">
<hh:charPr id="0" height="1000" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2"><hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:underline type="NONE" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#B2B2B2" offsetX="10" offsetY="10"/></hh:charPr>
<hh:charPr id="1" height="1000" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2"><hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:bold/><hh:underline type="NONE" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#B2B2B2" offsetX="10" offsetY="10"/></hh:charPr>
<hh:charPr id="2" height="1600" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2"><hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:bold/><hh:underline type="NONE" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#B2B2B2" offsetX="10" offsetY="10"/></hh:charPr>
</hh:charProperties>
<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>
<hh:numberings itemCnt="1"><hh:numbering id="1" start="0"><hh:paraHead start="1" level="1" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT" charPrIDRef="4294967295" checkable="0">^1.</hh:paraHead></hh:numbering></hh:numberings>
<hh:paraProperties itemCnt="1">
<hh:paraPr id="0" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0"><hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/><hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/><hh:autoSpacing eAsianEng="0" eAsianNum="0"/><hp:switch xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar"><hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/></hp:case><hp:default><hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/></hp:default></hp:switch><hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>
</hh:paraProperties>
<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>
</hh:refList>
</hh:head>
"""

_CONTAINER_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf">
<ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles>
</ocf:container>
"""

_MANIFEST_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
<odf:file-entry odf:full-path="/" odf:media-type="application/hwp+zip"/>
<odf:file-entry odf:full-path="Contents/header.xml" odf:media-type="application/xml"/>
<odf:file-entry odf:full-path="Contents/section0.xml" odf:media-type="application/xml"/>
<odf:file-entry odf:full-path="settings.xml" odf:media-type="application/xml"/>
<odf:file-entry odf:full-path="version.xml" odf:media-type="application/xml"/>
</odf:manifest>
"""

_VERSION_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" os="1" xmlVersion="1.4" application="Hancom Office Hangul" appVersion="12.0.0.0"/>
"""

_SETTINGS_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0">
<ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/>
</ha:HWPApplicationSetting>
"""


def _content_hpf(title: str) -> str:
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" version="" unique-identifier="" id="">
<opf:metadata><opf:title>{escape(title)}</opf:title><opf:language>ko</opf:language><opf:meta name="creator" content="text">가상 협력사(합성 데이터)</opf:meta></opf:metadata>
<opf:manifest>
<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>
<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>
<opf:item id="settings" href="settings.xml" media-type="application/xml"/>
</opf:manifest>
<opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine>
</opf:package>
"""


def write_hwpx(path: Path, title: str, body: str) -> None:
    sec = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<hs:sec {_NS}>{body}</hs:sec>'
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr(zipfile.ZipInfo("mimetype"), "application/hwp+zip", compress_type=zipfile.ZIP_STORED)
        zf.writestr("version.xml", _VERSION_XML, compress_type=zipfile.ZIP_DEFLATED)
        zf.writestr("META-INF/container.xml", _CONTAINER_XML, compress_type=zipfile.ZIP_DEFLATED)
        zf.writestr("META-INF/manifest.xml", _MANIFEST_XML, compress_type=zipfile.ZIP_DEFLATED)
        zf.writestr("Contents/content.hpf", _content_hpf(title), compress_type=zipfile.ZIP_DEFLATED)
        zf.writestr("Contents/header.xml", _HEADER_XML, compress_type=zipfile.ZIP_DEFLATED)
        zf.writestr("Contents/section0.xml", sec, compress_type=zipfile.ZIP_DEFLATED)
        zf.writestr("settings.xml", _SETTINGS_XML, compress_type=zipfile.ZIP_DEFLATED)


# ──────────────────────────────────────────────────────────────────────
# 3. 가상-배관O — HWPX (S1 핵심 장면: P34 앞당김, 절차에 '작업 전 가스 측정' 없음)
# ──────────────────────────────────────────────────────────────────────
def make_baegwan_hwpx() -> tuple[Path, dict]:
    title = "가스·냉각수 라인 복구 작업계획서"
    body = _para(title, char_pr=2, first=True)
    body += _para("업체명: 가상-배관O      공종: 배관(가스·냉각수)      작성일: 2027-02-18      작성자: 윤가상(가상)")
    body += _para(SYNTH)
    body += _para("1. 작업 개요")
    body += _para(
        "노 내부 내화물 축조가 마무리 단계에 들어감에 따라 풍구 레벨 질소·가스·송풍 라인 복구 연결을 당초 3월 4일에서 "
        "2월 26일로 앞당겨 착수하고자 함. 냉각수 계통 압력시험은 기존 일정대로 진행."
    )
    body += _para("2. 작업 내역")
    rows = [
        ["작업명", "작업장소", "작업기간", "근무", "인원", "위험작업", "착수조건"],
        ["질소·가스·송풍 라인 복구 연결", "풍구 레벨 환상관·송풍지관", "2027.02.26 ~ 2027.03.04", "주간", "8", "화기(용접), 가스", "노흉 내화물 축조(P22) 완료 후"],
        ["냉각수 계통 압력시험·플러싱", "노복·조안 스테이브 배관", "2027.02.20 ~ 2027.03.07", "주간", "6", "", "스테이브 냉각수 배관 연결 완료 후"],
    ]
    body += _table(rows, [9000, 8000, 8600, 2800, 2600, 5500, 8000])
    body += _para("3. 작업 절차 (라인 복구 연결)")
    for step in [
        "① 작업허가서(화기) 접수 및 작업 구역 표시",
        "② 플랜지 면 청소, 가스켓 교체",
        "③ 볼트 체결 및 연결부 용접",
        "④ 질소 가압 기밀시험(누설 확인)",
        "⑤ 복구 완료 보고 및 허가서 반납",
    ]:
        body += _para(step)
    body += _para("4. 안전조치: 용접 시 소화기 비치, 안전모·보안경 착용, 작업 구역 외 출입 금지")
    path = HERE / "가상-배관O_가스라인_복구_작업계획서.hwpx"
    write_hwpx(path, title, body)
    answer = {
        "file": path.name,
        "contractor": "가상-배관O",
        "format": "hwpx",
        "tasks": [
            {"wbs_id": "P34", "name": "질소·가스·송풍 라인 복구 연결", "zone_id": "TUYERE", "start": "2027-02-26", "end": "2027-03-04", "shift": "day", "headcount": 8, "hazards": ["gas", "hot_work"], "predecessors": ["P20", "P21", "P22"]},
            {"wbs_id": "P33", "name": "냉각수 계통 압력시험·플러싱", "zone_id": "BELLY_BOSH", "start": "2027-02-20", "end": "2027-03-07", "shift": "day", "headcount": 6, "hazards": [], "predecessors": ["P19"]},
        ],
        "expected_conflicts": [
            {"scenario": "S1", "type": "sequence", "rule_ids": ["R08", "R07"], "with": "가상-축로I P22 노복~노흉 내화물 축조 (STACK, ~2027-03-02)", "note": "핵심 장면. 선행 조건에 'P22 완료 후'라고 써 놓고 02-26에 착수 → 순서 위반(금지). 조정안: P22 완료·인원 철수 확인 후(03-03~)로 이동"},
            {"scenario": "F8", "type": "sop_missing", "rule_ids": ["R04", "R27"], "with": "SOP-04 가스 배관 연결·기밀시험 표준", "note": "절차에 '작업 전 가스 측정(LEL·O2)'과 '맹판·LOTO 확인' 단계가 빠져 있다 → 결함"},
        ],
        "note": "시연 중 직접 올리는 파일(시드에 넣지 않는다). 기준 P34는 2027-03-04~03-12",
    }
    return path, answer


# ──────────────────────────────────────────────────────────────────────
# 5. 가상-비계N — HWPX (머리글 낱말이 다른 양식) — 같은 시간·구역
# ──────────────────────────────────────────────────────────────────────
def make_bigye_hwpx() -> tuple[Path, dict]:
    title = "비계 설치·해체 작업계획"
    body = _para(title, char_pr=2, first=True)
    body += _para("협력사: 가상-비계N (비계 전문)   현장소장: 강가상(가상)   제출: 2026-12-22")
    body += _para(SYNTH)
    body += _para("□ 작업 범위: 노체 철피 외부 비계 설치(용접·검사용), 노 내부 축조 비계 해체")
    rows = [
        ["구분", "작업내용", "구역", "시작일", "종료일", "시간대", "인원", "위험요인"],
        ["설치", "노체 철피 외부 비계 설치", "노체 철피 외부", "2026.12.28", "2027.01.05", "07:00~18:00", "12", "고소작업, 낙하물"],
        ["해체", "노흉 내부 작업 비계 해체", "노흉 내부", "2027.03.01", "2027.03.05", "07:00~18:00", "8", "고소작업, 밀폐공간, 낙하물"],
    ]
    body += _table(rows, [3000, 9500, 7000, 5000, 5000, 5500, 2500, 7000])
    body += _para("□ 안전조치")
    for s in [
        "- 비계 설치·해체 구간 하부 출입통제(관리감독자 배치), 낙하물 방지망 10m 이내마다 설치",
        "- 안전대 부착설비 선행 설치, 작업발판 폭 40cm 이상·안전난간 설치",
        "- 노 내부 해체 시 산소농도 측정 후 입장, 감시인 배치",
    ]:
        body += _para(s)
    path = HERE / "가상-비계N_비계_설치해체_작업계획.hwpx"
    write_hwpx(path, title, body)
    answer = {
        "file": path.name,
        "contractor": "가상-비계N",
        "format": "hwpx",
        "tasks": [
            {"wbs_id": "P30", "name": "노체 철피 외부 비계 설치", "zone_id": "SHELL", "start": "2026-12-28", "end": "2027-01-05", "shift": "day", "headcount": 12, "hazards": ["height"], "predecessors": []},
            {"wbs_id": "P30", "name": "노흉 내부 작업 비계 해체", "zone_id": "STACK", "start": "2027-03-01", "end": "2027-03-05", "shift": "day", "headcount": 8, "hazards": ["confined", "height"], "predecessors": []},
        ],
        "expected_conflicts": [
            {"scenario": "same_zone", "type": "same_time_zone", "rule_ids": ["R17", "R16"], "with": "가상-축로I P22 노복~노흉 내화물 축조 (STACK, ~2027-03-02)", "note": "축조가 끝나기 전(03-01~03-02) 같은 노흉에서 비계 해체 — 금지"},
            {"scenario": "S3-변형", "type": "same_time_zone", "rule_ids": ["R18", "R20"], "with": "가상-양중C P17 신 철피 링블록 반입·설치(대형 인양) (SHELL, 2026-12-27~2027-01-03)", "note": "링블록 인양 중 같은 철피 외부에서 비계 설치(고소) — 인양 시간대 분리"},
        ],
        "note": "기준 P30(비계, 전 구역 D3~D125)을 구역·기간별 작업 2건으로 쪼개 제출. 두 건 모두 기준 일정상 P30에 해당한다",
    }
    return path, answer


def main() -> None:
    ANSWERS.mkdir(exist_ok=True)
    made = []
    for fn in (make_chukro_xlsx, make_gigye_pdf, make_baegwan_hwpx, make_jegwan_pdf, make_bigye_hwpx):
        path, answer = fn()
        (ANSWERS / (path.stem + ".json")).write_text(json.dumps(answer, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        made.append(path)
        print(f"만듦: {path.relative_to(HERE.parent)}  ({path.stat().st_size:,} bytes)")
    print(f"정답셋 {len(made)}건: {ANSWERS.relative_to(HERE.parent)}/")


if __name__ == "__main__":
    main()
