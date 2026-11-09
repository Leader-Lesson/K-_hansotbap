"""SQLite 연결과 스키마 초안 (담당: 백엔드·규칙). 파일 하나, 설치 없음.

F5 공유·이력: 제출·변경·조정 기록이 제64조 이행 기록이 된다.
"""

import sqlite3
from pathlib import Path

from config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contractor TEXT NOT NULL,
    filename TEXT NOT NULL,
    submitted_at TEXT NOT NULL,          -- 제출 시점에 판정한다. 동시 제출은 먼저 들어온 계획 기준
    version INTEGER NOT NULL DEFAULT 1   -- 수정 계획서 재제출 시 +1
);
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT NOT NULL,
    plan_id INTEGER REFERENCES plans(id),
    payload TEXT NOT NULL,               -- schemas.Task JSON
    PRIMARY KEY (id, plan_id)
);
CREATE TABLE IF NOT EXISTS conflicts (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,               -- schemas.Conflict JSON
    status TEXT NOT NULL DEFAULT 'open'  -- open | adjusted | resolved
);
CREATE TABLE IF NOT EXISTS decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conflict_id TEXT REFERENCES conflicts(id),
    decided_by TEXT NOT NULL,            -- 책임자
    decision TEXT NOT NULL,              -- 적용한 조정안
    decided_at TEXT NOT NULL
);
"""


def connect(path: Path | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(path or settings.db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()
