"""F7 TBM 전달 확인: 원청 공지와 확인 기록을 저장하고, 업체·날짜별 전달 항목을 모은다.

항목은 협력사 권한으로 거른 공유·위험 시간대로만 만들므로 다른 업체만 걸린 내용은 들어오지 않는다.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime

from pydantic import TypeAdapter

from rules.data_loader import load_zones
from rules.risk import score_windows
from rules.tbm import build_items
from schemas import TbmChecklist, TbmCheckRecord, TbmItemResult, TbmNotice, TbmNoticeCreate

from .database import session
from .plans import current_schedule, list_conflicts
from .shares import list_shared

_RESULTS = TypeAdapter(list[TbmItemResult])


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _notice(row: sqlite3.Row) -> TbmNotice:
    return TbmNotice(
        id=row["id"], contractor=row["contractor"], date=row["tbm_date"], text=row["text"],
        created_by=row["created_by"], created_at=row["created_at"],
    )


def add_notice(req: TbmNoticeCreate) -> TbmNotice:
    """공지를 더한다. 같은 업체·날짜·문장은 처음 기록을 그대로 돌려준다."""
    key = (req.contractor, req.date.isoformat(), req.text)
    with session() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO tbm_notices (contractor, tbm_date, text, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
            (*key, req.created_by, _now()),
        )
        row = conn.execute("SELECT * FROM tbm_notices WHERE contractor = ? AND tbm_date = ? AND text = ?", key).fetchone()
    return _notice(row)


def list_notices(contractor: str, on: date) -> list[TbmNotice]:
    with session() as conn:
        rows = conn.execute(
            "SELECT * FROM tbm_notices WHERE contractor = ? AND tbm_date = ? ORDER BY id", (contractor, on.isoformat())
        ).fetchall()
    return [_notice(r) for r in rows]


def build_checklist(contractor: str, on: date) -> TbmChecklist:
    schedule = current_schedule()
    windows = score_windows([r.conflict for r in list_conflicts(contractor)], schedule, load_zones(), on)
    items = build_items(
        list_shared(contractor), windows, list_notices(contractor, on), {t.id: t.name for t in schedule}, on
    )
    return TbmChecklist(contractor=contractor, date=on, items=items)


def _check(row: sqlite3.Row) -> TbmCheckRecord:
    results = _RESULTS.validate_json(row["payload"])
    return TbmCheckRecord(
        id=row["id"], contractor=row["contractor"], date=row["tbm_date"], checked_by=row["checked_by"],
        checked_at=row["checked_at"], transcript=row["transcript"], results=results,
        missing_ids=[r.item.id for r in results if not r.mentioned], provider=row["provider"], model=row["model"],
    )


def save_check(
    contractor: str, on: date, checked_by: str, transcript: str, results: list[TbmItemResult], provider: str, model: str
) -> TbmCheckRecord:
    payload = json.dumps([r.model_dump(mode="json") for r in results], ensure_ascii=False)
    with session() as conn:
        cur = conn.execute(
            "INSERT INTO tbm_checks (contractor, tbm_date, checked_by, checked_at, transcript, payload, provider, model) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (contractor, on.isoformat(), checked_by, _now(), transcript, payload, provider, model),
        )
        row = conn.execute("SELECT * FROM tbm_checks WHERE id = ?", (cur.lastrowid,)).fetchone()
    return _check(row)


def list_checks(contractor: str | None = None) -> list[TbmCheckRecord]:
    """확인 기록 (최근순). 협력사로 부르면 자기 업체 것만 준다."""
    sql, args = "SELECT * FROM tbm_checks", ()
    if contractor:
        sql, args = sql + " WHERE contractor = ?", (contractor,)
    with session() as conn:
        rows = conn.execute(sql + " ORDER BY id DESC", args).fetchall()
    return [_check(r) for r in rows]
