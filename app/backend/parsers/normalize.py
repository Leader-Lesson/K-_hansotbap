"""계획서 값 정규화 (규칙). 표 규칙 경로의 값도, LLM이 뽑은 값도 이 함수로 다시 확인한다.

LLM은 문장을 읽는 데 강하고, 날짜·구역 코드처럼 형식이 정해진 값은 규칙이 더 확실하다.
그래서 LLM에게는 원문 그대로(raw)와 자기 해석을 함께 받고, 원문을 규칙으로 다시 읽어 둘이 다르면 '확인 필요'로 둔다.
"""

from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta
from typing import Any

from config import settings
from rules.data_loader import DEFAULT_DAY_END, DEFAULT_DAY_START
from schemas import Hazard, Shift, Task

# 기준 현장: 광양 2고로 2차 개수 132일 (D0 = settings.project_d0)
PROJECT_DAYS = 132
NIGHT_START, NIGHT_END = time(19, 0), time(7, 0)  # 야간 기본값 [팀 설정값]


def project_window() -> tuple[date, date]:
    d0 = date.fromisoformat(settings.project_d0)
    return d0, d0 + timedelta(days=PROJECT_DAYS - 1)


# ── 날짜 ─────────────────────────────────────────────────────────────
_DATE = re.compile(
    r"(?P<y>20\d{2})\s*[.\-/년]\s*(?P<m>\d{1,2})\s*[.\-/월]\s*(?P<d>\d{1,2})\s*일?"
    r"|D\s*\+?\s*(?P<dn>\d{1,3})(?!\d)"
    r"|(?<![\d.])(?P<m2>\d{1,2})\s*(?:[./]|월\s*)\s*(?P<d2>\d{1,2})\s*일?(?![\d])"
)


def _infer_year(month: int, day: int) -> date | None:
    start, end = project_window()
    for year in sorted({start.year, end.year}):
        try:
            cand = date(year, month, day)
        except ValueError:
            continue
        if start - timedelta(days=60) <= cand <= end + timedelta(days=60):
            return cand
    try:
        return date(start.year, month, day)
    except ValueError:
        return None


def parse_dates(text: str | None) -> list[date]:
    """문장에서 날짜를 나온 순서대로. 연도가 없으면 공사 기간 안으로 맞추고, D+N은 D0 기준으로 바꾼다."""
    if not text:
        return []
    out: list[date] = []
    for m in _DATE.finditer(text):
        try:
            if m.group("y"):
                out.append(date(int(m.group("y")), int(m.group("m")), int(m.group("d"))))
            elif m.group("dn"):
                out.append(project_window()[0] + timedelta(days=int(m.group("dn"))))
            else:
                d = _infer_year(int(m.group("m2")), int(m.group("d2")))
                if d:
                    out.append(d)
        except ValueError:
            continue
    return out


def as_date(value: Any) -> date | None:
    """엑셀 셀 값(datetime·date) 또는 문자열 → date."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        found = parse_dates(value)
        return found[0] if found else None
    return None


def iso_date(text: str | None) -> date | None:
    if not text:
        return None
    try:
        return date.fromisoformat(text.strip()[:10])
    except ValueError:
        return None


# ── 시간·주야간 ──────────────────────────────────────────────────────
_TIME = re.compile(r"(?<!\d)(?P<h>\d{1,2})\s*(?::|시)\s*(?P<mi>[0-5]\d)?\s*분?")


def parse_times(text: str | None) -> list[time]:
    if not text:
        return []
    out: list[time] = []
    for m in _TIME.finditer(text):
        h, mi = int(m.group("h")), int(m.group("mi") or 0)
        if h == 24 and mi == 0:
            out.append(time(0, 0))
        elif 0 <= h <= 23:
            out.append(time(h, mi))
    return out


_CREW = re.compile(r"\d{1,4}")


def parse_crew(value: Any) -> int | None:
    """투입 인원 칸 → 명 수. '8', '8명', '작업인원 12명', 8.0 을 읽는다. 숫자가 여럿이면 첫 숫자 ('8명(신호수 2명 포함)' → 8)."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value) if value >= 0 else None
    m = _CREW.search(str(value))
    return int(m.group(0)) if m else None


def as_time(value: Any) -> time | None:
    if isinstance(value, datetime):
        return value.time()
    if isinstance(value, time):
        return value
    if isinstance(value, str):
        found = parse_times(value)
        return found[0] if found else None
    return None


def iso_time(text: str | None) -> time | None:
    found = parse_times(text) if text else []
    return found[0] if found else None


def parse_shift(text: str | None) -> Shift | None:
    if not text:
        return None
    t = text.strip().lower()
    if "주야" in t or "주/야" in t:  # 주야간 연속 → 한쪽으로 정하지 않는다
        return None
    night = "야간" in t or t in {"야", "night", "n"}
    day = "주간" in t or t in {"주", "day"}
    if night and not day:
        return Shift.NIGHT
    if day and not night:
        return Shift.DAY
    return None


def build_interval(
    start_date: date | None,
    end_date: date | None,
    start_time: time | None,
    end_time: time | None,
    shift: Shift | None,
) -> tuple[datetime | None, datetime | None, Shift | None, list[str]]:
    """날짜·시간·주야간 → (시작, 끝, 주야간, 경고). 하루 단위 기간이면 매일 같은 시간대로 본다."""
    warnings: list[str] = []
    if start_date is None:
        return None, None, shift, ["작업 기간(시작일)을 찾지 못했습니다"]
    if end_date is None:
        end_date = start_date
    if end_date < start_date:
        warnings.append("종료일이 시작일보다 빨라 시작일로 맞췄습니다")
        end_date = start_date
    if start_time and end_time:
        st, et = start_time, end_time
    elif shift == Shift.NIGHT:
        st, et = NIGHT_START, NIGHT_END
    else:
        st, et = DEFAULT_DAY_START, DEFAULT_DAY_END
        if shift is None:
            warnings.append("작업 시간이 없어 주간(07~19시) 기본값을 썼습니다")
    start = datetime.combine(start_date, st)
    end = datetime.combine(end_date, et)
    if et <= st:  # 자정을 넘기는 야간 작업
        end += timedelta(days=1)
    if shift is None:
        shift = Shift.NIGHT if (st >= NIGHT_START or st < NIGHT_END) else Shift.DAY
    return start, end, shift, warnings


# ── 구역 ─────────────────────────────────────────────────────────────
# zones.csv 구역명 외에 현장에서 쓰는 말 [팀 설정값]
ZONE_ALIASES: dict[str, list[str]] = {
    "TOP": ["노정", "장입설비", "벨리스", "노정 플랫폼"],
    "STACK": ["노흉", "샤프트", "shaft"],
    "BELLY_BOSH": ["노복", "조안", "보시", "belly", "bosh"],
    "TUYERE": ["풍구", "환상관", "송풍지관", "tuyere"],
    "HEARTH": ["노상", "노저", "노바닥", "hearth"],
    "SHELL": ["철피", "노체 외부", "노체 철피", "shell"],
    "CASTHOUSE": ["주상", "출선장", "출선구", "탕도", "cast house", "casthouse"],
    "DOWNCOMER": ["상승관", "하강관", "downcomer", "uptake"],
    "GCP": ["제진기", "가스청정", "가스 청정"],
    "STOVE": ["열풍로", "stove"],
    "SLAG": ["슬래그", "수재설비", "수재 설비"],
    "CRANE_PAD": ["크레인 기초", "인양 구역", "크레인 패드"],
    "YARD": ["야드", "조립장", "자재장", "적치장"],
    "ALL": ["전 구역", "전구역", "노 전체"],
}


def _squash(text: str) -> str:
    return re.sub(r"[\s·,./()\-~]", "", text).lower()


def resolve_zones(text: str | None) -> set[str]:
    """위치 문장에서 구역 ID 후보. 한 개면 확정, 여러 개면 사람이 확인한다."""
    if not text:
        return set()
    t = _squash(text)
    found = {zid for zid, words in ZONE_ALIASES.items() if any(_squash(w) in t for w in words)}
    found |= {zid for zid in ZONE_ALIASES if re.search(rf"\b{zid}\b", text)}
    return found


# ── 작업 유형 ────────────────────────────────────────────────────────
# 작업명·위험작업 칸의 낱말 → 작업 유형 [팀 설정값]
HAZARD_KEYWORDS: dict[Hazard, list[str]] = {
    Hazard.HOT_WORK: ["용접", "용단", "절단", "화기", "그라인더", "랜싱", "토치", "브레이징"],
    Hazard.GAS: ["가스", "질소", "n2", "아르곤", "산소", "퍼지", "기밀", "bfg", "cog", "lng"],
    Hazard.CONFINED: ["밀폐", "노내", "노 내부", "탱크 내부", "맨홀", "산소농도"],
    Hazard.HEIGHT: ["고소", "비계", "추락", "고소작업대", "달비계", "안전대"],
    Hazard.HEAVY_LIFT: ["크레인", "양중", "인양", "중량물", "호이스트", "리깅", "링블록"],
}


def detect_hazards(*texts: str | None) -> set[Hazard]:
    t = " ".join(x for x in texts if x).lower()
    return {h for h, words in HAZARD_KEYWORDS.items() if any(w in t for w in words)}


# ── 작업 분해표(원청 기준 일정) 연결 ────────────────────────────────
def _bigrams(text: str) -> set[str]:
    s = _squash(text)
    return {s[i : i + 2] for i in range(len(s) - 1)} if len(s) > 1 else {s}


def name_similarity(a: str, b: str) -> float:
    """글자 2개 묶음 겹침(Jaccard). 띄어쓰기·가운뎃점 차이에 흔들리지 않는다."""
    A, B = _bigrams(a), _bigrams(b)
    return len(A & B) / len(A | B) if A and B else 0.0


def same_contractor(a: str | None, b: str | None) -> bool:
    if not a or not b:
        return False
    na, nb = _squash(a).removeprefix("가상"), _squash(b).removeprefix("가상")
    return na == nb


# 작업명 매칭 기준 [팀 설정값]
WBS_MIN_NAME_SIM = 0.2
WBS_MIN_SCORE = 0.45


def match_wbs(name: str, contractor: str | None, zone_id: str | None, wbs: list[Task]) -> tuple[str | None, float]:
    """계획서 작업 → 작업 분해표 작업 ID. 이름 유사도 + 같은 업체 + 같은 구역."""
    scored: list[tuple[float, float, str]] = []
    for w in wbs:
        sim = name_similarity(name, w.name)
        score = sim + (0.25 if same_contractor(contractor, w.contractor) else 0) + (0.15 if zone_id == w.zone_id else 0)
        scored.append((score, sim, w.id))
    scored.sort(reverse=True)
    if not scored:
        return None, 0.0
    best = scored[0]
    second = scored[1][0] if len(scored) > 1 else 0.0
    if best[1] >= WBS_MIN_NAME_SIM and best[0] >= WBS_MIN_SCORE and best[0] - second >= 0.05:
        return best[2], round(best[0], 3)
    return None, round(best[0], 3)


_STOPWORDS = ("완료", "이후", "후", "전", "작업", "확인", "철수", "인원", "종료", "다음", "뒤")
_WBS_CODE = re.compile(r"(?<![A-Za-z0-9])P\d{2}(?!\d)")


def wbs_refs_in_text(text: str | None, wbs: list[Task]) -> list[str]:
    """선행 조건 문장 → 작업 분해표 작업 ID. 'P22' 같은 코드, 또는 작업명 핵심어가 문장에 들어 있으면 연결한다."""
    if not text:
        return []
    ids = {w.id for w in wbs}
    found = [c for c in _WBS_CODE.findall(text) if c in ids]
    core = text
    for sw in _STOPWORDS:
        core = core.replace(sw, " ")
    A = _bigrams(core)
    for w in wbs:
        B = _bigrams(w.name)
        if A and B and len(A & B) / len(A) >= 0.5 and w.id not in found:
            found.append(w.id)
    return found
