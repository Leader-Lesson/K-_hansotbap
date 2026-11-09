"""질문에서 날짜·구역·작업 번호·업체·의도를 규칙으로 읽는다.

두 곳에서 쓴다.
- LLM 이 고른 조회 조건을 바로잡을 때: 날짜·구역은 규칙이 읽은 값을 우선한다 (작은 모델이 '내일'을 틀리기 쉽다)
- LLM 이 늦거나 실패했을 때: 이 결과만으로 조회 도구를 고른다
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, timedelta

from schemas import ChatTool

# 구역 별칭. zones.csv 의 구역명을 현장에서 부르는 말로, 음성 질문(Whisper)이 잘못 받아쓰는 형태도 넣는다 [팀 설정값]
ZONE_ALIASES: dict[str, list[str]] = {
    "TOP": ["노정", "장입설비"],
    "STACK": ["노흉", "샤프트", "노흥", "노증", "노횽"],
    "BELLY_BOSH": ["노복", "조안"],
    "TUYERE": ["풍구", "환상관", "송풍지관"],
    "HEARTH": ["노상", "노저", "노져"],
    "SHELL": ["철피", "노체 외부"],
    "CASTHOUSE": ["주상", "출선장", "출선구"],
    "DOWNCOMER": ["하강관", "상승관", "다운커머"],
    "GCP": ["제진기", "가스청정"],
    "STOVE": ["열풍로"],
    "SLAG": ["슬래그", "수재"],
    "CRANE_PAD": ["크레인 기초", "인양 구역", "크레인 야드"],
    "YARD": ["자재 야드", "조립장", "야드"],
}

_REL_DAYS = {"그저께": -2, "그제": -2, "어제": -1, "오늘": 0, "금일": 0, "내일": 1, "명일": 1, "모레": 2, "글피": 3}

# 의도 낱말. 앞에 있는 것이 우선한다 (위험 시간대 > 겹침 > 공지 > 작업)
_INTENTS: list[tuple[ChatTool, re.Pattern[str]]] = [
    (ChatTool.RISK_WINDOWS, re.compile(r"위험\s*시간|위험한\s*시간|언제\s*위험|위험도|위험\s*점수|가장\s*위험|위험\s*예보")),
    (ChatTool.FIND_CONFLICTS, re.compile(r"겹치|겹쳐|겹친|겹침|충돌|간섭|부딪|혼재|동시\s*작업|같이\s*(작업|일)")),
    (ChatTool.SHARED_NOTICES, re.compile(r"공지|공유|인계|전달\s*받|통보")),
    (ChatTool.FIND_TASKS, re.compile(r"누가|무슨|어떤|무엇|뭐\s*해|뭘|작업|일정|스케줄|언제|하는지|해\?|하나요|있어|있나")),
]
_MINE = re.compile(r"내\s*작업|우리\s*작업|우리\s*(업체|회사|팀)|저희|나와|나랑|내\s*거")
_TASK_ID = re.compile(r"(?<![A-Za-z0-9])[Pp](\d{2})(?!\d)")
_ZONE_ID = re.compile(r"(?<![A-Za-z_])(" + "|".join(sorted(ZONE_ALIASES, key=len, reverse=True)) + r")(?![A-Za-z_])", re.I)


@dataclass
class ParsedQuestion:
    date_from: date | None = None
    date_to: date | None = None
    has_date: bool = False  # 질문에 날짜 표현이 있었나 (없으면 도구별 기본값을 쓴다)
    zone_ids: list[str] = field(default_factory=list)
    task_ids: list[str] = field(default_factory=list)
    contractor: str | None = None
    intent: ChatTool | None = None
    mine: bool = False  # '내 작업', '우리 업체' (협력사 질문)


def _nearest_year(month: int, day: int, today: date) -> date | None:
    """연도 없는 날짜(1/15, 1월 15일)는 오늘에 가장 가까운 해로 본다 (공사가 해를 넘긴다)."""
    best = None
    for y in (today.year - 1, today.year, today.year + 1):
        try:
            d = date(y, month, day)
        except ValueError:
            continue
        if best is None or abs((d - today).days) < abs((best - today).days):
            best = d
    return best


def parse_dates(q: str, today: date, d0: date | None) -> list[date]:
    found: list[date] = []
    used: list[tuple[int, int]] = []

    def take(m: re.Match[str], d: date | None) -> None:
        if d and not any(a <= m.start() < b for a, b in used):
            found.append(d)
            used.append(m.span())

    for m in re.finditer(r"(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})", q):
        try:
            take(m, date(int(m[1]), int(m[2]), int(m[3])))
        except ValueError:
            pass
    for m in re.finditer(r"(\d{1,2})\s*월\s*(\d{1,2})\s*일", q):
        take(m, _nearest_year(int(m[1]), int(m[2]), today))
    for m in re.finditer(r"(?<![\d./-])(\d{1,2})/(\d{1,2})(?![\d/])", q):
        take(m, _nearest_year(int(m[1]), int(m[2]), today))
    if d0:
        for m in re.finditer(r"D\s*\+?\s*(\d{1,3})(?!\d)", q, re.I):
            take(m, d0 + timedelta(days=int(m[1])))
    for word, n in _REL_DAYS.items():
        for m in re.finditer(word, q):
            take(m, today + timedelta(days=n))
    if re.search(r"이번\s*주|금주", q):
        found += [today, today + timedelta(days=6 - today.weekday())]
    if re.search(r"다음\s*주|차주", q):
        start = today + timedelta(days=7 - today.weekday())
        found += [start, start + timedelta(days=6)]
    return found


def parse_question(q: str, today: date, d0: date | None = None, contractors: list[str] | None = None) -> ParsedQuestion:
    p = ParsedQuestion()
    dates = parse_dates(q, today, d0)
    if dates:
        p.has_date = True
        p.date_from, p.date_to = min(dates), max(dates)

    zones: list[str] = []
    for m in _ZONE_ID.finditer(q):
        zones.append(m[1].upper())
    for zid, names in ZONE_ALIASES.items():
        if any(n in q for n in names):
            zones.append(zid)
    p.zone_ids = list(dict.fromkeys(zones))
    p.task_ids = list(dict.fromkeys(f"P{m[1]}" for m in _TASK_ID.finditer(q)))

    for name in sorted(contractors or [], key=len, reverse=True):
        short = name.split("-", 1)[-1]  # 가상-배관O → 배관O
        if name in q or (len(short) >= 2 and short in q):
            p.contractor = name
            break

    p.mine = bool(_MINE.search(q))
    for tool, pat in _INTENTS:
        if pat.search(q):
            p.intent = tool
            break
    if p.intent is None and p.mine:
        p.intent = ChatTool.FIND_TASKS
    if p.intent is None and (p.zone_ids or p.task_ids):
        p.intent = ChatTool.FIND_TASKS  # "내일 노정은?" 처럼 낱말 없이 장소·작업 번호만 물으면 작업 일정
    # 날짜만 있고 현장 낱말이 없으면("오늘 날씨 어때?") 조회하지 않고 안내한다
    return p


def default_range(tool: ChatTool, p: ParsedQuestion, today: date) -> tuple[date | None, date | None]:
    """날짜를 말하지 않았을 때: 작업은 오늘, 겹침·위험·공지는 오늘부터 앞으로. 작업 번호를 물으면 날짜로 거르지 않는다."""
    if p.has_date:
        return p.date_from, p.date_to
    if p.task_ids:
        return None, None
    if tool == ChatTool.FIND_TASKS:
        return today, today
    return today, None
