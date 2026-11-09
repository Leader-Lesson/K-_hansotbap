"""SQLite 연결과 스키마 (담당: 백엔드·규칙). 파일 하나, 설치 없음.

F5 공유·이력: 제출·변경·조정 기록이 제64조 이행 기록이 된다.
"""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contractor TEXT NOT NULL,
    filename TEXT NOT NULL,
    submitted_at TEXT NOT NULL,          -- 제출 시점에 판정한다. 동시 제출은 먼저 들어온 계획 기준
    version INTEGER NOT NULL DEFAULT 1,  -- 같은 협력사의 몇 번째 제출인지 (수정 계획서 재제출 시 +1)
    submitted_by TEXT,                   -- 확인·제출한 사람
    draft_id TEXT                        -- F1 추출 결과(PlanExtraction.draft_id)
);
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT NOT NULL,
    plan_id INTEGER REFERENCES plans(id),
    payload TEXT NOT NULL,               -- schemas.Task JSON
    PRIMARY KEY (id, plan_id)
);
CREATE TABLE IF NOT EXISTS conflicts (
    id TEXT PRIMARY KEY,                 -- 규칙·작업 쌍으로 만든 키(R08:P22>P34). 재판정에서 같은 충돌을 알아본다
    plan_id INTEGER REFERENCES plans(id),-- 이 충돌을 드러낸 제출
    judged_at TEXT NOT NULL DEFAULT '',  -- 마지막 판정에서 확인된 시각
    payload TEXT NOT NULL,               -- schemas.Conflict JSON
    status TEXT NOT NULL DEFAULT 'open', -- open | adjusted | resolved
    resolved_at TEXT                     -- 재판정에서 사라진 시각 (F5 이행 기록)
);
CREATE TABLE IF NOT EXISTS decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conflict_id TEXT REFERENCES conflicts(id),
    decided_by TEXT NOT NULL,            -- 책임자
    decision TEXT NOT NULL,              -- 적용한 조정안
    decided_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS adjustments (
    id TEXT PRIMARY KEY,
    conflict_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    payload TEXT NOT NULL,                  -- schemas.Adjustment JSON
    status TEXT NOT NULL DEFAULT 'active',  -- active | reverted | stale
    decided_at TEXT NOT NULL,
    closed_at TEXT
);
CREATE TABLE IF NOT EXISTS shares (
    conflict_id TEXT PRIMARY KEY REFERENCES conflicts(id), -- 원청이 확인해 협력사에 내려보낸 충돌
    shared_by TEXT NOT NULL,                -- 확인한 책임자
    shared_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tbm_notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contractor TEXT NOT NULL,
    tbm_date TEXT NOT NULL,
    text TEXT NOT NULL,                     -- 원청이 TBM 전달 항목으로 추가한 공지
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (contractor, tbm_date, text)
);
CREATE TABLE IF NOT EXISTS tbm_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contractor TEXT NOT NULL,
    tbm_date TEXT NOT NULL,
    checked_by TEXT NOT NULL,               -- 책임자 (제64조 이행 기록)
    checked_at TEXT NOT NULL,
    transcript TEXT NOT NULL,               -- 전사문만 둔다. 원본 녹음은 받아쓴 뒤 지운다
    payload TEXT NOT NULL,                  -- schemas.TbmItemResult 목록 JSON
    provider TEXT NOT NULL,
    model TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS extraction_cache (
    key TEXT PRIMARY KEY,                -- 추출기 버전|파일 sha256|모드|LLM|모델|제출 업체
    payload TEXT NOT NULL,               -- schemas.PlanExtraction JSON
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plan_documents (
    draft_id TEXT PRIMARY KEY,           -- PlanExtraction.draft_id (파일 sha256 앞 16자)
    filename TEXT NOT NULL,
    lines TEXT NOT NULL,                 -- 파서가 읽은 원문 줄 JSON (F8 필수 단계 확인·근거 표시)
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS history_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_at TEXT NOT NULL,
    label TEXT NOT NULL,                 -- 교대 인계·착수 승인·잔업 승인 … (F5 이행 기록의 '현장 기록')
    actor TEXT,                          -- 책임자. 시스템이 남긴 기록은 NULL
    contractors TEXT NOT NULL,           -- 관련 업체 JSON 목록 (협력사는 자기 업체가 든 기록만 본다)
    detail TEXT NOT NULL,
    rule_id TEXT,
    legal_basis TEXT
);
"""

# 예전 스키마로 만든 DB 파일에 나중에 생긴 칸을 붙인다 (ALTER 로 붙이므로 NOT NULL 은 기본값을 둔다)
_ADDED_COLUMNS = {
    "plans": {"submitted_by": "TEXT", "draft_id": "TEXT"},
    "conflicts": {"plan_id": "INTEGER", "judged_at": "TEXT NOT NULL DEFAULT ''", "resolved_at": "TEXT"},
}


def connect(path: Path | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(path or settings.db_path)
    conn.row_factory = sqlite3.Row
    # WAL: 읽기가 쓰기를 막지 않는다. 백엔드 한 대를 팀이 같이 쓸 때 "database is locked" 를 줄인다
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")  # 잠겨 있으면 5초 기다린다 [팀 설정값]
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    for table, columns in _ADDED_COLUMNS.items():
        have = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}
        for name, kind in columns.items():
            if name not in have:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {kind}")
    conn.commit()


def get_conn() -> sqlite3.Connection:
    conn = connect()
    init_db(conn)
    return conn


@contextmanager
def session() -> Iterator[sqlite3.Connection]:
    """요청 하나 동안 쓰는 연결. 끝나면 커밋(오류면 롤백)하고 닫는다."""
    conn = get_conn()
    try:
        with conn:
            yield conn
    finally:
        conn.close()
