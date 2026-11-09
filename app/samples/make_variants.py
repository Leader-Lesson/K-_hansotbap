"""추출 정확도 실험용 표본 두 묶음을 만든다 (모두 합성 데이터, 협력사명은 가상).

    cd app/backend && uv run python ../samples/make_variants.py

1. uniform/  — 조건 ⑤ "협력사가 통일된 양식으로 냈을 때".
   원본 5건(make_samples.py)의 작업 13건을 업체별 엑셀 1개씩, 하나의 고정 표준양식으로 다시 쓴다
   (같은 머리글·열 순서, 날짜 셀(ISO), 작업 1건 = 1행, 모든 행에 업체, 기준 일정 ID 열, 선행 작업은 P-ID, 구역은 zones.csv 표준 이름).
2. variants/ — 같은 작업을 업체마다 4가지 다른 양식으로 다시 그린 20건.
   형식(엑셀·PDF·한글), 머리글 동의어(5벌), 열 순서, 날짜 표기, 업체명 위치, 주야간 표기, 잡음 열(비고·담당자)을 바꾸고,
   업체마다 딱 1건은 표 없이 문장으로만 쓴다(규칙 경로는 못 읽는 것이 정상 — LLM 조건 비교용).

정답(tasks)·expected_conflicts 는 원본 answers/<원본>.json 을 그대로 복사하고, 무엇을 바꿨는지는 variant 에 적는다.
양식 그리기 도구(PDF 표, HWPX 패키지)는 make_samples.py 의 것을 그대로 쓴다.
"""

from __future__ import annotations

import csv
import datetime as dt
import json
import random
import shutil
import sys
import textwrap
from pathlib import Path

import pymupdf
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import make_samples as ms  # noqa: E402

SEED = 20270323  # 담당자 이름 등 잡음 값 고르기용 고정 시드
DATA = HERE.parent / "backend" / "data"
UNIFORM = HERE / "uniform"
VARIANTS = HERE / "variants"
SYNTH = ms.SYNTH


# ──────────────────────────────────────────────────────────────────────
# 기준 자료: 원본 정답셋 · 구역 표준 이름 · 기준 일정 작업명
# ──────────────────────────────────────────────────────────────────────
def load_originals() -> dict[str, dict]:
    out: dict[str, dict] = {}
    for p in sorted((HERE / "answers").glob("*.json")):
        if p.name.startswith("_"):
            continue
        a = json.loads(p.read_text(encoding="utf-8"))
        out[a["contractor"]] = a
    return out


def load_zone_names() -> dict[str, str]:
    with (DATA / "zones.csv").open(encoding="utf-8-sig") as f:
        return {r["구역ID"]: r["구역명"] for r in csv.DictReader(f)}


def load_wbs_names() -> dict[str, str]:
    with (DATA / "gy2bf_wbs.csv").open(encoding="utf-8-sig") as f:
        return {r["작업ID"]: r["작업명"] for r in csv.DictReader(f)}


ZONE_NAME = load_zone_names()
WBS_NAME = load_wbs_names()

# 원본 계획서에 적혀 있던 표현 (작업명 기준). 정답셋에는 코드값만 있어서 원문 낱말은 여기 둔다
ORIG_TEXT: dict[str, dict[str, str]] = {
    "노저 카본블록·세라믹컵 축조(연와정초)": {"loc": "노저(hearth) 내부", "haz": "밀폐공간", "pre": "노저 해체·청소 완료, 철피 용접 완료 후", "note": "산소농도 측정 1일 2회"},
    "풍구 레벨 내화물·풍구·냉각기 신설": {"loc": "풍구 레벨", "haz": "밀폐공간, 중량물", "pre": "노저 축조 완료 후", "note": "호이스트 인양"},
    "노복~노흉 내화물 축조·캐스터블": {"loc": "노흉(shaft) 내부", "haz": "밀폐공간, 고소", "pre": "스테이브·냉각판 설치 완료 후", "note": "달비계 사용"},
    "벨리스 탑 부품 야드 반입·검수": {"loc": "조립장 야드", "haz": "중량물", "pre": "", "note": "대형 트레일러 반입"},
    "노정 장입설비(벨리스 탑) 설치": {"loc": "노정 플랫폼", "haz": "크레인 인양, 고소작업, 용접", "pre": "링블록 반입·설치(대형 인양) 완료 후", "note": "신호수 2명 배치"},
    "장입 구동부 시운전": {"loc": "노정 플랫폼", "haz": "끼임(시운전)", "pre": "설치 완료·LOTO 해제 후", "note": "시운전 중 접근 금지"},
    "질소·가스·송풍 라인 복구 연결": {"loc": "풍구 레벨 환상관·송풍지관", "haz": "화기(용접), 가스", "pre": "노흉 내화물 축조(P22) 완료 후", "note": "작업허가서(화기) 접수"},
    "냉각수 계통 압력시험·플러싱": {"loc": "노복·조안 스테이브 배관", "haz": "", "pre": "스테이브 냉각수 배관 연결 완료 후", "note": "기존 일정대로"},
    "상승관·하강관 가스 배관 절단·보수": {"loc": "하강관", "haz": "화기, 고소", "pre": "원청 가스 차단·블리더 방산 완료 후", "note": "블리더 방산 완료 여부 원청 확인 요청"},
    "제진기·가스청정설비 보수·교체": {"loc": "제진기", "haz": "화기, 밀폐공간, 중량물", "pre": "", "note": "야간은 교체품 반입·인양 위주"},
    "보수 자재 가공(야드)": {"loc": "자재 야드", "haz": "화기", "pre": "", "note": "그라인딩·절단"},
    "노체 철피 외부 비계 설치": {"loc": "노체 철피 외부", "haz": "고소작업, 낙하물", "pre": "", "note": "낙하물 방지망 설치"},
    "노흉 내부 작업 비계 해체": {"loc": "노흉 내부", "haz": "고소작업, 밀폐공간, 낙하물", "pre": "", "note": "산소농도 측정 후 입장"},
}

TITLE = {
    "가상-축로I": "노체 축조 주간 작업계획서",
    "가상-기계J": "노정 장입설비 설치 작업계획서",
    "가상-배관O": "가스·냉각수 라인 복구 작업계획서",
    "가상-제관F": "하강관·가스청정설비 보수 공사계획",
    "가상-비계N": "비계 설치·해체 작업계획",
}

# 작업 유형 코드 → 낱말 (kor: 표준 낱말, alt: 같은 뜻의 다른 낱말)
HAZ_ORDER = ["hot_work", "gas", "confined", "height", "heavy_lift"]
HAZ_KOR = {"hot_work": "화기", "gas": "가스", "confined": "밀폐공간", "height": "고소", "heavy_lift": "중량물"}
HAZ_ALT = {"hot_work": "용접·용단", "gas": "가스 계통", "confined": "밀폐", "height": "추락위험", "heavy_lift": "양중"}
OWNERS = ["김가상", "이가상", "박가상", "최가상", "정가상", "강가상", "조가상", "윤가상", "장가상", "임가상"]


def short(contractor: str) -> str:
    return contractor.removeprefix("가상-")


# ──────────────────────────────────────────────────────────────────────
# 칸 값 만들기
# ──────────────────────────────────────────────────────────────────────
def fmt_date(iso: str, style: str) -> str:
    d = dt.date.fromisoformat(iso)
    if style == "iso":
        return d.isoformat()
    if style == "dot":
        return f"{d.year}.{d.month:02d}.{d.day:02d}"
    if style == "kor":
        return f"{d.year}년 {d.month}월 {d.day}일"
    if style == "short":  # 두 자리 연도 27.1.15
        return f"{d.year % 100}.{d.month}.{d.day}"
    raise ValueError(style)


def fmt_period(t: dict, style: str) -> str:
    a, b = fmt_date(t["start"], style), fmt_date(t["end"], style)
    return f"{a}~{b}" if style == "iso" else f"{a} ~ {b}"


def shift_texts(t: dict, style: str) -> str:
    """주야간 표기. 정답이 null(주야간 연속)인 작업은 '야간'이 들어간 말로 쓴다."""
    day = t["shift"] == "day"
    return {
        "주간": "주간" if day else "주야간",
        "주": "주" if day else "주/야",
        "time": "07:00~18:00" if day else "주간+야간 교대",
        "주간(시간)": "주간 07:00~18:00" if day else "주간·야간 연속",
    }[style]


def hazard_text(t: dict, style: str) -> str:
    if style == "orig":
        return ORIG_TEXT[t["name"]]["haz"]
    words = HAZ_KOR if style == "kor" else HAZ_ALT
    return ", ".join(words[h] for h in HAZ_ORDER if h in t["hazards"])


def pre_text(t: dict, style: str) -> str:
    preds = t["predecessors"]
    if style == "orig":
        return ORIG_TEXT[t["name"]]["pre"]
    if not preds:
        return ""
    if style == "pid":
        return ", ".join(preds)
    if style == "phrase":  # "노흉 내화물 축조(P22) 완료 후" 꼴
        return ", ".join(f"{WBS_NAME[p]}({p})" for p in preds) + " 완료 후"
    raise ValueError(style)


def loc_text(t: dict, style: str) -> str:
    return ZONE_NAME[t["zone_id"]] if style == "std" else ORIG_TEXT[t["name"]]["loc"]


def cell_value(field: str, t: dict, i: int, spec: dict, contractor: str, rng: random.Random, xlsx: bool):
    if field == "contractor":
        mode = spec["contractor"]
        return contractor if mode == "row_all" or (mode == "row_first" and i == 0) else ""
    if field == "wbs":
        return t["wbs_id"] or ""
    if field == "name":
        return t["name"]
    if field == "loc":
        return loc_text(t, spec["loc"])
    if field in ("start", "end"):
        if spec["date"].startswith("cell"):  # 엑셀 날짜 셀
            return dt.datetime.fromisoformat(t[field])
        return fmt_date(t[field], spec["date"])
    if field == "period":
        return fmt_period(t, spec["date"])
    if field in ("shift", "time"):
        return shift_texts(t, spec["shift"])
    if field == "headcount":
        return t["headcount"] if xlsx else str(t["headcount"])
    if field == "hazards":
        return hazard_text(t, spec["haz"])
    if field == "pre":
        return pre_text(t, spec["pre"])
    if field == "note":
        return ORIG_TEXT[t["name"]]["note"]
    if field == "owner":
        return rng.choice(OWNERS) + "(가상)"
    raise ValueError(field)


def header_lines(contractor: str, spec: dict) -> list[str]:
    """문서 머리. 업체명은 header_only 일 때만 머리에 쓴다 (행 열 양식은 표 안에서만 읽히게)."""
    lines = []
    if spec["contractor"] == "header_only" or spec.get("layout") == "sentence":
        lines.append(f"협력사: {contractor}      공사명: 광양 2고로 개수(합성)      제출일: 2027-01-18")
    else:
        lines.append("공사명: 광양 2고로 개수(합성)      제출일: 2027-01-18      현장 책임자: 홍가상(가상)")
    lines.append(SYNTH)
    return lines


# ──────────────────────────────────────────────────────────────────────
# 형식별 그리기 — 표
# ──────────────────────────────────────────────────────────────────────
PDF_W = {"contractor": 72, "wbs": 52, "name": 150, "loc": 100, "start": 80, "end": 80, "period": 146, "shift": 58,
         "time": 90, "headcount": 44, "hazards": 100, "pre": 140, "note": 100, "owner": 66}
HWPX_W = {k: v * 60 for k, v in PDF_W.items()}


def _pdf_widths(spec: dict, total: float = 762) -> list[float]:
    # 날짜·시간·인원·업체 칸은 줄어들면 숫자 중간에서 줄이 바뀌므로 폭을 고정하고, 나머지 글 칸만 줄인다
    fixed = {"start", "end", "period", "time", "shift", "headcount", "contractor", "owner"}
    fields = [f for f, _ in spec["cols"]]
    fixed_sum = sum(PDF_W[f] for f in fields if f in fixed)
    flex_sum = sum(PDF_W[f] for f in fields if f not in fixed)
    scale = min(1.0, (total - fixed_sum) / flex_sum) if flex_sum else 1.0
    # 머리글이 한 줄에 들어가게 최소 폭을 지킨다 (make_samples._pdf_table 은 머리글 줄 높이가 20 고정)
    return [max(PDF_W[f] * (1.0 if f in fixed else scale), len(h) * 8.6 + 10) for f, h in spec["cols"]]


def _fit_row_h(widths: list[float], rows: list[list[str]]) -> float:
    """칸 글이 넘치지 않는 가장 낮은 행 높이를 빈 문서에 미리 그려 보고 고른다."""
    for h in (30, 40, 50, 62, 76, 92, 110):
        tmp = pymupdf.open()
        page = tmp.new_page(width=842, height=595)
        try:
            ms._pdf_table(page, 40, 40, widths, rows, row_h=h, font=7)
            return h
        except SystemExit:
            continue
        finally:
            tmp.close()
    raise SystemExit(f"표가 너무 깁니다: {rows[0]}")


def render_table_pdf(path: Path, contractor: str, rows: list[list[str]], spec: dict) -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=842, height=595)  # A4 가로
    page.insert_text((50, 52), TITLE[contractor], fontname=ms.FONT, fontsize=16)
    y = ms._pdf_lines(page, 50, 76, header_lines(contractor, spec), size=8.5, gap=13)
    widths = _pdf_widths(spec)
    y = ms._pdf_table(page, 40, y + 6, widths, rows, row_h=_fit_row_h(widths, rows), font=7)
    ms._pdf_lines(page, 50, y + 18, ["※ 안전조치: 작업 전 TBM 실시, 작업허가서 발급 후 착수, 종료 후 정리정돈"], size=8.5)
    doc.save(path, garbage=3, deflate=True)
    doc.close()


def render_table_hwpx(path: Path, contractor: str, rows: list[list[str]], spec: dict) -> None:
    ms._PID[0] = 100  # 문단 번호를 매번 같게 (재실행해도 같은 내용)
    title = TITLE[contractor]
    body = ms._para(title, char_pr=2, first=True)
    for ln in header_lines(contractor, spec):
        body += ms._para(ln)
    body += ms._para("□ 작업 내역")
    raw = [HWPX_W[f] for f, _ in spec["cols"]]
    scale = 42520 / sum(raw)
    body += ms._table(rows, [int(w * scale) for w in raw])
    body += ms._para("□ 안전조치: 작업 전 TBM 실시, 작업허가서 발급 후 착수, 종료 후 정리정돈")
    ms.write_hwpx(path, title, body)


def render_table_xlsx(path: Path, contractor: str, rows: list[list], spec: dict) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "작업계획"
    ws["A1"] = TITLE[contractor] + " (합성 데이터)"
    ws["A1"].font = Font(bold=True, size=14)
    for i, ln in enumerate(header_lines(contractor, spec), start=2):
        ws.cell(row=i, column=1, value=ln)
    hr = 5
    for r_off, row in enumerate(rows):
        for c, v in enumerate(row, start=1):
            if v == "" or v is None:
                continue
            cell = ws.cell(row=hr + r_off, column=c, value=v)
            if isinstance(v, dt.datetime):
                cell.number_format = "yyyy.mm.dd" if spec["date"] == "cell_dot" else "yyyy-mm-dd"
    for c in range(1, len(rows[0]) + 1):
        cell = ws.cell(row=hr, column=c)
        cell.font = Font(bold=True)
        cell.fill = PatternFill("solid", fgColor="E2EFDA")
        cell.alignment = Alignment(horizontal="center")
    fields = [f for f, _ in spec["cols"]]
    if spec["contractor"] == "row_first" and "contractor" in fields and len(rows) > 2:
        col = get_column_letter(fields.index("contractor") + 1)
        ws.merge_cells(f"{col}{hr + 1}:{col}{hr + len(rows) - 1}")  # 업체 열 병합 → 첫 행에만 값
    for i, f in enumerate(fields, start=1):
        ws.column_dimensions[get_column_letter(i)].width = max(8, PDF_W[f] / 4.5)
    wb.save(path)


# ──────────────────────────────────────────────────────────────────────
# 형식별 그리기 — 문장형 (표 없음)
# ──────────────────────────────────────────────────────────────────────
def sentence_paragraphs(tasks: list[dict], style: str) -> list[str]:
    out = []
    for i, t in enumerate(tasks, start=1):
        o = ORIG_TEXT[t["name"]]
        a, b = fmt_date(t["start"], "kor"), fmt_date(t["end"], "kor")
        when = "주간에" if t["shift"] == "day" else "주간·야간 2교대로"
        pre = f"{o['pre']} 착수한다" if o["pre"] else "별도 선행 조건 없이 착수한다"
        if style == "narrative":
            haz = f"위험작업은 {o['haz']}이며" if o["haz"] else "특별한 위험작업은 없으며"
            out.append(f"{'가나다라마'[i - 1]}) {t['name']}")
            out.append(f"   {o['loc']}에서 {a}부터 {b}까지 {when} {t['headcount']}명을 투입하여 진행한다. {haz}, {pre}.")
        else:  # memo
            out.append(f"- {t['name']}: {o['loc']} / {a} ~ {b} / {'주간' if t['shift'] == 'day' else '주야간'} / "
                       f"{t['headcount']}명. 위험작업({o['haz'] or '없음'}). 선행: {o['pre'] or '없음'}.")
    return out


def render_sentence(path: Path, contractor: str, tasks: list[dict], spec: dict) -> None:
    head = header_lines(contractor, spec)
    intro = "1. 작업 개요: 아래 작업을 계획대로 진행하고자 하며, 일정·인원·위험작업은 다음과 같다."
    paras = sentence_paragraphs(tasks, spec["style"])
    safety = "2. 안전조치: 작업 전 TBM 실시, 작업허가서 발급 후 착수, 작업 종료 후 30분 화재감시 및 정리정돈."
    fmt = spec["fmt"]
    if fmt == "hwpx":
        ms._PID[0] = 100
        body = ms._para(TITLE[contractor], char_pr=2, first=True)
        for ln in head + [intro] + paras + [safety]:
            body += ms._para(ln)
        ms.write_hwpx(path, TITLE[contractor], body)
    elif fmt == "pdf":
        doc = pymupdf.open()
        page = doc.new_page()  # A4 세로
        page.insert_text((50, 55), TITLE[contractor], fontname=ms.FONT, fontsize=16)
        y = ms._pdf_lines(page, 50, 80, head, size=8, gap=12)
        lines: list[str] = []
        for p in [intro] + paras + [safety]:
            lines += textwrap.wrap(p, width=52, subsequent_indent="   ") or [""]
        ms._pdf_lines(page, 50, y + 10, lines, size=8.5, gap=13)
        doc.save(path, garbage=3, deflate=True)
        doc.close()
    elif fmt == "xlsx":
        wb = Workbook()
        ws = wb.active
        ws.title = "작업계획"
        ws["A1"] = TITLE[contractor] + " (합성 데이터)"
        ws["A1"].font = Font(bold=True, size=14)
        for ln in head + [""] + [intro] + paras + [safety]:
            ws.append([ln] if ln else [])
        ws.column_dimensions["A"].width = 120
        wb.save(path)
    else:
        raise ValueError(fmt)


# ──────────────────────────────────────────────────────────────────────
# 변형 정의 (업체마다 4개, 그중 1개는 문장형)
# ──────────────────────────────────────────────────────────────────────
S1 = {"contractor": "업체", "name": "작업명", "loc": "작업위치", "start": "시작일", "end": "종료일", "shift": "주야간",
      "headcount": "투입인원", "hazards": "위험작업", "pre": "선행조건", "note": "비고", "owner": "담당자"}
S2 = {"contractor": "협력사", "name": "공정명", "loc": "장소", "start": "착수일", "end": "완료일", "shift": "근무형태",
      "headcount": "작업인원", "hazards": "필요허가", "pre": "착수조건", "note": "비고", "owner": "담당자"}
S3 = {"contractor": "회사명", "name": "작업내용", "loc": "구역", "period": "기간", "time": "시간대", "headcount": "인원",
      "hazards": "위험요인", "pre": "선행작업", "note": "비고", "owner": "담당자"}
S4 = {"contractor": "소속", "name": "세부작업", "loc": "작업구역", "start": "개시일", "end": "종료일자", "shift": "근무",
      "headcount": "인원", "hazards": "작업구분", "pre": "전제조건", "note": "특이사항", "owner": "담당자"}
S5 = {"contractor": "시공사", "name": "작업항목", "loc": "설비", "period": "작업기간", "time": "작업시간", "shift": "주야",
      "headcount": "인원", "hazards": "허가", "pre": "선행", "note": "비고", "owner": "담당자"}
SYN = {"S1": S1, "S2": S2, "S3": S3, "S4": S4, "S5": S5}


def T(v, fmt, tag, syn, order, **kw):
    """표 양식 변형 하나. order 는 항목 순서, 머리글 낱말은 동의어 세트 syn 에서 꺼낸다."""
    return {"v": v, "fmt": fmt, "tag": tag, "layout": "table", "synonyms": syn,
            "cols": [(f, SYN[syn][f]) for f in order], **kw}


def S(v, fmt, tag, style):
    return {"v": v, "fmt": fmt, "tag": tag, "layout": "sentence", "style": style, "contractor": "header_only"}


VARIANT_SPECS: dict[str, list[dict]] = {
    "가상-축로I": [
        T(1, "pdf", "PDF_첫행업체_점날짜", "S2", ["name", "contractor", "loc", "start", "end", "shift", "headcount", "hazards", "pre", "owner"],
          date="dot", contractor="row_first", loc="orig", pre="phrase", shift="주간", haz="kor"),
        T(2, "hwpx", "한글_기간한칸_머리업체", "S3", ["name", "loc", "period", "time", "headcount", "hazards", "pre", "note"],
          date="dot", contractor="header_only", loc="std", pre="pid", shift="time", haz="alt"),
        T(3, "xlsx", "엑셀_열순서_한글날짜", "S4", ["loc", "name", "start", "end", "contractor", "shift", "hazards", "headcount", "pre", "note"],
          date="kor", contractor="row_all", loc="orig", pre="orig", shift="주", haz="orig"),
        S(4, "hwpx", "문장형_한글", "narrative"),
    ],
    "가상-기계J": [
        T(1, "xlsx", "엑셀_두자리연도", "S1", ["contractor", "name", "loc", "start", "end", "shift", "headcount", "hazards", "pre", "note"],
          date="short", contractor="row_all", loc="std", pre="pid", shift="주간", haz="kor"),
        T(2, "hwpx", "한글_머리업체_시각근무", "S2", ["name", "start", "end", "loc", "shift", "headcount", "hazards", "pre", "owner"],
          date="iso", contractor="header_only", loc="orig", pre="orig", shift="time", haz="orig"),
        S(3, "pdf", "문장형_PDF", "memo"),
        T(4, "pdf", "PDF_작업기간_한글날짜", "S5", ["contractor", "name", "loc", "period", "time", "headcount", "hazards", "pre", "owner", "note"],
          date="kor", contractor="row_first", loc="std", pre="phrase", shift="time", haz="alt"),
    ],
    "가상-배관O": [
        T(1, "xlsx", "엑셀_병합업체_기간한칸", "S5", ["name", "contractor", "loc", "period", "shift", "headcount", "hazards", "pre", "owner"],
          date="iso", contractor="row_first", loc="std", pre="phrase", shift="주", haz="kor"),
        T(2, "pdf", "PDF_머리업체_한글날짜", "S1", ["name", "loc", "start", "end", "shift", "headcount", "hazards", "pre", "owner", "note"],
          date="kor", contractor="header_only", loc="orig", pre="orig", shift="주간", haz="orig"),
        S(3, "xlsx", "문장형_엑셀", "narrative"),
        T(4, "hwpx", "한글_소속열_점날짜", "S4", ["contractor", "name", "loc", "start", "end", "shift", "headcount", "hazards", "pre", "note"],
          date="dot", contractor="row_all", loc="std", pre="pid", shift="주", haz="alt"),
    ],
    "가상-제관F": [
        T(1, "xlsx", "엑셀_기간한칸_시간대", "S3", ["contractor", "name", "loc", "period", "time", "headcount", "hazards", "pre", "note", "owner"],
          date="dot", contractor="row_all", loc="orig", pre="phrase", shift="time", haz="kor"),
        T(2, "hwpx", "한글_첫행업체_한글날짜", "S1", ["name", "contractor", "start", "end", "loc", "shift", "headcount", "hazards", "pre", "note"],
          date="kor", contractor="row_first", loc="std", pre="pid", shift="주간(시간)", haz="orig"),
        T(3, "pdf", "PDF_두자리연도_머리업체", "S4", ["name", "loc", "start", "end", "shift", "headcount", "hazards", "pre", "owner", "note"],
          date="short", contractor="header_only", loc="orig", pre="orig", shift="주", haz="alt"),
        S(4, "pdf", "문장형_PDF", "memo"),
    ],
    "가상-비계N": [
        T(1, "pdf", "PDF_기간한칸_한글날짜", "S3", ["contractor", "name", "loc", "period", "time", "headcount", "hazards", "pre", "note"],
          date="kor", contractor="row_all", loc="std", pre="phrase", shift="time", haz="kor"),
        T(2, "xlsx", "엑셀_날짜셀_머리업체", "S2", ["name", "loc", "start", "end", "shift", "headcount", "hazards", "pre", "owner"],
          date="cell_dot", contractor="header_only", loc="orig", pre="pid", shift="주간", haz="orig"),
        T(3, "hwpx", "한글_첫행업체_기간한칸", "S5", ["contractor", "name", "loc", "period", "shift", "headcount", "hazards", "pre", "owner"],
          date="iso", contractor="row_first", loc="orig", pre="orig", shift="주간(시간)", haz="alt"),
        S(4, "hwpx", "문장형_한글", "narrative"),
    ],
}

DATE_DESC = {"iso": "2027-01-15", "dot": "2027.01.15", "kor": "2027년 1월 15일", "short": "27.1.15 (두 자리 연도)",
             "cell": "엑셀 날짜 셀(yyyy-mm-dd)", "cell_dot": "엑셀 날짜 셀(yyyy.mm.dd 표시)"}
CONTRACTOR_DESC = {"row_all": "업체 열, 모든 행에 기재", "row_first": "업체 열, 첫 행에만(병합)", "header_only": "문서 머리에만"}
SHIFT_DESC = {"주간": "주간 / 주야간", "주": "주 / 주/야", "time": "07:00~18:00 / 주간+야간 교대", "주간(시간)": "주간 07:00~18:00 / 주간·야간 연속"}
LOC_DESC = {"std": "zones.csv 표준 구역명", "orig": "원본 계획서 표현"}
PRE_DESC = {"pid": "P-ID (예: P16, P18)", "orig": "원본 선행조건 문장", "phrase": "작업명(P-ID) 완료 후"}
HAZ_DESC = {"kor": "표준 낱말(화기·가스·밀폐공간·고소·중량물)", "alt": "다른 낱말(용접·용단·가스 계통·밀폐·추락위험·양중)", "orig": "원본 계획서 표현"}


def variant_info(spec: dict, original: dict) -> dict:
    info = {"source": original["file"], "version": spec["v"], "layout": spec["layout"]}
    if spec["layout"] == "sentence":
        info["description"] = "표 없이 작업을 문단(문장)으로만 기재. 규칙 경로는 읽지 못하는 것이 정상(LLM 조건 비교용)"
        info["sentence_style"] = spec["style"]
        info["contractor_position"] = CONTRACTOR_DESC["header_only"]
        return info
    fields = [f for f, _ in spec["cols"]]
    noise = [h for f, h in spec["cols"] if f in ("note", "owner")]
    info.update({
        "header_synonym_set": spec["synonyms"],
        "headers": [h for _, h in spec["cols"]],
        "column_order": fields,
        "date_style": ("기간 한 칸: " if "period" in fields else "시작/종료 칸: ") + DATE_DESC[spec["date"]],
        "contractor_position": CONTRACTOR_DESC[spec["contractor"]],
        "shift_style": ("시간 칸: " if "time" in fields else "주야간 칸: ") + SHIFT_DESC[spec["shift"]],
        "zone_style": LOC_DESC[spec["loc"]],
        "predecessor_style": PRE_DESC[spec["pre"]],
        "hazard_style": HAZ_DESC[spec["haz"]],
        "noise_columns": noise,
    })
    return info


def write_answer(folder: Path, path: Path, original: dict, fmt: str, note: str, variant: dict | None) -> None:
    ans = {
        "file": path.name,
        "contractor": original["contractor"],
        "format": fmt,
        "tasks": original["tasks"],
        "expected_conflicts": original["expected_conflicts"],
        "note": note,
    }
    if variant is not None:
        ans["variant"] = variant
    (folder / "answers").mkdir(parents=True, exist_ok=True)
    (folder / "answers" / (path.stem + ".json")).write_text(json.dumps(ans, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def make_variants(originals: dict[str, dict]) -> list[tuple[Path, dict]]:
    made = []
    for contractor, specs in VARIANT_SPECS.items():
        orig = originals[contractor]
        tasks = orig["tasks"]
        for spec in specs:
            rng = random.Random(f"{SEED}-{contractor}-{spec['v']}")
            path = VARIANTS / f"{contractor}_v{spec['v']}_{spec['tag']}.{spec['fmt']}"
            if spec["layout"] == "sentence":
                render_sentence(path, contractor, tasks, spec)
            else:
                xlsx = spec["fmt"] == "xlsx"
                rows = [[h for _, h in spec["cols"]]]
                for i, t in enumerate(tasks):
                    rows.append([cell_value(f, t, i, spec, contractor, rng, xlsx) for f, _ in spec["cols"]])
                {"pdf": render_table_pdf, "hwpx": render_table_hwpx, "xlsx": render_table_xlsx}[spec["fmt"]](path, contractor, rows, spec)
            info = variant_info(spec, orig)
            write_answer(VARIANTS, path, orig, spec["fmt"], f"원본 {orig['file']} 과 같은 작업을 다른 양식으로 다시 그린 합성 변형", info)
            made.append((path, info))
    return made


# ──────────────────────────────────────────────────────────────────────
# 통일 양식 (조건 ⑤)
# ──────────────────────────────────────────────────────────────────────
UNIFORM_HEADER = ["업체명", "기준 일정 ID", "작업명", "구역", "시작일", "종료일", "주야간", "인원", "위험작업", "선행작업", "비고"]


def make_uniform(originals: dict[str, dict]) -> list[Path]:
    made = []
    for contractor, orig in originals.items():
        wb = Workbook()
        ws = wb.active
        ws.title = "작업계획"
        ws["A1"] = "협력사 작업계획서 — 원청 표준양식 v1 (합성 데이터)"
        ws["A1"].font = Font(bold=True, size=14)
        ws["A2"] = f"업체명: {contractor}"
        ws["A3"] = SYNTH
        ws["A4"] = "작성 요령: 날짜는 YYYY-MM-DD 날짜 셀, 구역은 표준 구역명, 선행작업은 기준 일정 ID(P01~P37), 작업 1건당 1행"
        ws.append([])
        ws.append(UNIFORM_HEADER)
        hr = ws.max_row
        for c in range(1, len(UNIFORM_HEADER) + 1):
            cell = ws.cell(row=hr, column=c)
            cell.font = Font(bold=True)
            cell.fill = PatternFill("solid", fgColor="FFF2CC")
            cell.alignment = Alignment(horizontal="center")
        for t in orig["tasks"]:
            ws.append([
                contractor,
                t["wbs_id"],
                t["name"],
                ZONE_NAME[t["zone_id"]],
                dt.datetime.fromisoformat(t["start"]),
                dt.datetime.fromisoformat(t["end"]),
                "주간" if t["shift"] == "day" else "야간" if t["shift"] == "night" else "주야간",
                t["headcount"],
                hazard_text(t, "kor") or None,
                pre_text(t, "pid") or None,
                ORIG_TEXT[t["name"]]["note"],
            ])
            for col in (5, 6):
                ws.cell(row=ws.max_row, column=col).number_format = "yyyy-mm-dd"
        for i, w in enumerate([12, 12, 38, 30, 12, 12, 8, 6, 26, 16, 30], start=1):
            ws.column_dimensions[get_column_letter(i)].width = w
        path = UNIFORM / f"{contractor}_표준양식_작업계획.xlsx"
        wb.save(path)
        write_answer(UNIFORM, path, orig, "xlsx", f"원본 {orig['file']} 의 작업을 원청 표준양식(통일 양식)으로 다시 쓴 것",
                     {"source": orig["file"], "layout": "uniform_template", "headers": UNIFORM_HEADER})
        made.append(path)
    return made


# ──────────────────────────────────────────────────────────────────────
# README
# ──────────────────────────────────────────────────────────────────────
RUN = "cd app/backend && uv run python ../samples/make_variants.py"


def write_uniform_readme(paths: list[Path]) -> None:
    lines = [
        "# 통일 양식 표본 (조건 ⑤)",
        "",
        "모든 파일은 해커톤 시연용 **합성 데이터**이며 협력사명·일정·인원은 가상이다(`가상-…`).",
        "\"협력사가 원청이 정한 하나의 양식으로 냈을 때\" 추출 정확도를 재기 위한 표본이다. 원본 5건(`../`)의 작업 13건을 그대로 옮겼다.",
        "",
        f"다시 만들기: `{RUN}`  ",
        "측정: `cd app/backend && uv run python ../samples/accuracy.py --samples ../samples/uniform`",
        "",
        "## 표준양식 규칙",
        "",
        "- 엑셀 1개 = 업체 1곳, 시트 `작업계획`, 머리글 행: " + " · ".join(f"`{h}`" for h in UNIFORM_HEADER),
        "- 시작일·종료일은 날짜 셀(yyyy-mm-dd), 작업 1건 = 1행, 모든 행에 업체명",
        "- 구역은 `data/zones.csv` 의 표준 구역명, 선행작업은 기준 일정 ID(P01~P37), 위험작업은 화기·가스·밀폐공간·고소·중량물",
        "",
        "## 파일",
        "",
        "| 파일 | 원본 | 작업 수 |",
        "|---|---|---|",
    ]
    for p in paths:
        a = json.loads((UNIFORM / "answers" / (p.stem + ".json")).read_text(encoding="utf-8"))
        lines.append(f"| `{p.name}` | `{a['variant']['source']}` | {len(a['tasks'])} |")
    lines += ["", "정답셋은 `answers/<파일명>.json` (원본 정답과 같은 tasks·expected_conflicts)."]
    (UNIFORM / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_variants_readme(made: list[tuple[Path, dict]]) -> None:
    lines = [
        "# 양식 변형 표본",
        "",
        "모든 파일은 해커톤 시연용 **합성 데이터**이며 협력사명·일정·인원은 가상이다(`가상-…`).",
        "원본 5건(`../`)의 같은 작업을 업체마다 4가지 다른 양식으로 다시 그린 20건이다. 정답(tasks)은 원본과 같고,",
        "무엇을 바꿨는지는 `answers/<파일명>.json` 의 `variant` 에 적었다. 업체마다 1건은 **문장형(표 없음)** 이라",
        "표 규칙 경로는 못 읽는 것이 정상이다(LLM 조건 비교용).",
        "",
        f"다시 만들기: `{RUN}` (고정 시드 {SEED})  ",
        "측정: `cd app/backend && uv run python ../samples/accuracy.py --samples ../samples/variants`",
        "",
        "## 머리글 동의어 세트",
        "",
    ]
    for k, s in SYN.items():
        lines.append(f"- **{k}**: " + " · ".join(s.values()))
    lines += ["", "## 파일", "", "| 파일 | 형식 | 바꾼 것 |", "|---|---|---|"]
    for p, info in made:
        if info["layout"] == "sentence":
            what = f"문장형(표 없음, {info['sentence_style']}), 업체명은 문서 머리에만"
        else:
            what = "; ".join([
                f"머리글 {info['header_synonym_set']}",
                "열 " + "·".join(info["headers"]),
                info["date_style"],
                info["contractor_position"],
                info["shift_style"],
                "구역 " + info["zone_style"],
                "선행 " + info["predecessor_style"],
                "작업유형 " + info["hazard_style"],
            ] + (["잡음 열 " + "·".join(info["noise_columns"])] if info["noise_columns"] else []))
        lines.append(f"| `{p.name}` | {p.suffix[1:]} | {what} |")
    lines += [
        "",
        "## 알아 둘 점",
        "",
        "- 두 자리 연도(27.1.15) 변형은 현재 날짜 규칙이 읽지 못한다 — 추출기 한계를 드러내려고 일부러 넣었다",
        "- 정답이 `null` 인 주야간(가상-제관F 제진기 보수, 주야간 연속)은 세지 않는다. 그 작업에만 '야간'이 들어간 표기를 썼다",
        "- 엑셀·한글 파일 안의 생성 시각 같은 메타데이터는 실행할 때마다 달라질 수 있다(내용은 같다)",
    ]
    (VARIANTS / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def _reset(folder: Path) -> None:
    """재실행 시 이전 산출물을 지운다 (이 스크립트가 만드는 폴더만)."""
    if folder.exists():
        shutil.rmtree(folder)
    (folder / "answers").mkdir(parents=True)


def main() -> None:
    originals = load_originals()
    _reset(UNIFORM)
    _reset(VARIANTS)
    uni = make_uniform(originals)
    write_uniform_readme(uni)
    for p in uni:
        print(f"만듦: {p.relative_to(HERE.parent)}")
    made = make_variants(originals)
    write_variants_readme(made)
    for p, _ in made:
        print(f"만듦: {p.relative_to(HERE.parent)}  ({p.stat().st_size:,} bytes)")
    print(f"통일 양식 {len(uni)}건, 변형 {len(made)}건 (정답셋 각 answers/)")


if __name__ == "__main__":
    main()
