"""SQLite 数据层。

两张表：
- error_record  错题：科目、知识点、复习次数、是否掌握、掌握时间
- usage_event   客户端上传的应用使用记录，供专注趋势 / 应用排行统计

数据库文件默认 ``backend/study_insight.db``（已被 .gitignore 忽略）。
测试或多环境可用环境变量 SI_DB_PATH 指定其他路径。
"""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

DEFAULT_DB_NAME = "study_insight.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS error_record (
    error_id        TEXT PRIMARY KEY,
    device_id       TEXT NOT NULL,
    subject         TEXT NOT NULL,
    knowledge_point TEXT NOT NULL,
    content         TEXT NOT NULL DEFAULT '',
    answer          TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL,
    mastered        INTEGER NOT NULL DEFAULT 0,
    review_count    INTEGER NOT NULL DEFAULT 0,
    mastered_at     TEXT,
    received_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_error_device_created
    ON error_record(device_id, created_at);
CREATE INDEX IF NOT EXISTS idx_error_subject
    ON error_record(subject);

CREATE TABLE IF NOT EXISTS usage_event (
    event_id         TEXT PRIMARY KEY,
    device_id        TEXT NOT NULL,
    platform         TEXT NOT NULL,
    app_key          TEXT NOT NULL,
    app_name         TEXT,
    category         TEXT,
    start_at         TEXT NOT NULL,
    end_at           TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL,
    received_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_device_start
    ON usage_event(device_id, start_at);
"""


def db_path() -> Path:
    """数据库文件路径。每次调用都读环境变量，方便测试切临时库。"""
    raw = os.getenv("SI_DB_PATH")
    if raw:
        return Path(raw).expanduser().resolve()
    return Path(__file__).resolve().parent / DEFAULT_DB_NAME


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    """一次请求一个连接，自动提交 / 回滚。"""
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with connection() as conn:
        conn.executescript(SCHEMA)
        # 旧库补列：answer 是本轮手机端联调新增的字段。
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(error_record)")}
        if "answer" not in columns:
            conn.execute(
                "ALTER TABLE error_record ADD COLUMN answer TEXT NOT NULL DEFAULT ''"
            )


def is_empty() -> bool:
    init_db()
    with connection() as conn:
        errors = conn.execute("SELECT COUNT(*) FROM error_record").fetchone()[0]
        events = conn.execute("SELECT COUNT(*) FROM usage_event").fetchone()[0]
    return errors == 0 and events == 0


def counts() -> dict[str, int]:
    init_db()
    with connection() as conn:
        errors = conn.execute("SELECT COUNT(*) FROM error_record").fetchone()[0]
        events = conn.execute("SELECT COUNT(*) FROM usage_event").fetchone()[0]
    return {"error_records": errors, "usage_events": events}


def insert_errors(records: list[dict[str, Any]]) -> tuple[int, int]:
    """批量写错题，返回 (新增数, 重复数)。error_id 冲突时保留原记录。"""
    if not records:
        return 0, 0
    rows = [
        (
            record["error_id"],
            record["device_id"],
            record["subject"],
            record["knowledge_point"],
            record.get("content", ""),
            record.get("answer", ""),
            record["created_at"],
            int(bool(record.get("mastered"))),
            int(record.get("review_count", 0)),
            record.get("mastered_at"),
            record["received_at"],
        )
        for record in records
    ]
    with connection() as conn:
        before = conn.total_changes
        conn.executemany(
            """
            INSERT INTO error_record (
                error_id, device_id, subject, knowledge_point, content, answer,
                created_at, mastered, review_count, mastered_at, received_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(error_id) DO NOTHING
            """,
            rows,
        )
        inserted = conn.total_changes - before
    return inserted, len(rows) - inserted


def insert_error(record: dict[str, Any]) -> bool:
    inserted, _ = insert_errors([record])
    return inserted == 1


def get_error(error_id: str) -> dict[str, Any] | None:
    with connection() as conn:
        row = conn.execute(
            "SELECT * FROM error_record WHERE error_id = ?", (error_id,)
        ).fetchone()
    return dict(row) if row else None


_UPDATE_COLUMNS = {
    "subject",
    "knowledge_point",
    "content",
    "answer",
    "mastered",
    "review_count",
    "mastered_at",
}


def update_error(error_id: str, fields: dict[str, Any]) -> dict[str, Any] | None:
    """按字段更新一条错题，返回更新后的记录；不存在返回 None。"""
    clean = {key: value for key, value in fields.items() if key in _UPDATE_COLUMNS}
    with connection() as conn:
        if clean:
            assignments = ", ".join(f"{key} = ?" for key in clean)
            cursor = conn.execute(
                f"UPDATE error_record SET {assignments} WHERE error_id = ?",
                (*clean.values(), error_id),
            )
            if cursor.rowcount == 0:
                return None
        row = conn.execute(
            "SELECT * FROM error_record WHERE error_id = ?", (error_id,)
        ).fetchone()
    return dict(row) if row else None


def list_errors(
    device_id: str, limit: int = 50, subject: str | None = None
) -> list[dict[str, Any]]:
    sql = "SELECT * FROM error_record WHERE device_id = ?"
    params: list[Any] = [device_id]
    if subject:
        sql += " AND subject = ?"
        params.append(subject)
    sql += " ORDER BY created_at DESC, error_id DESC LIMIT ?"
    params.append(limit)
    with connection() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(row) for row in rows]


def insert_events(events: list[dict[str, Any]]) -> tuple[int, int]:
    """批量写使用记录，返回 (新增数, 重复数)。event_id 冲突时跳过。"""
    if not events:
        return 0, 0
    rows = [
        (
            event["event_id"],
            event["device_id"],
            event["platform"],
            event["app_key"],
            event.get("app_name"),
            event.get("category"),
            event["start_at"],
            event["end_at"],
            int(event["duration_seconds"]),
            event["received_at"],
        )
        for event in events
    ]
    with connection() as conn:
        before = conn.total_changes
        conn.executemany(
            """
            INSERT INTO usage_event (
                event_id, device_id, platform, app_key, app_name, category,
                start_at, end_at, duration_seconds, received_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(event_id) DO NOTHING
            """,
            rows,
        )
        inserted = conn.total_changes - before
    return inserted, len(rows) - inserted


def sync_info(device_id: str) -> dict[str, Any]:
    """设备同步信息：两边各有多少条、最后一条是什么时候。"""
    with connection() as conn:
        error_row = conn.execute(
            "SELECT COUNT(*) AS n, MAX(created_at) AS last_at "
            "FROM error_record WHERE device_id = ?",
            (device_id,),
        ).fetchone()
        event_row = conn.execute(
            "SELECT COUNT(*) AS n, MAX(start_at) AS last_at "
            "FROM usage_event WHERE device_id = ?",
            (device_id,),
        ).fetchone()
    return {
        "device_id": device_id,
        "error_records": error_row["n"],
        "last_error_at": error_row["last_at"],
        "usage_events": event_row["n"],
        "last_event_at": event_row["last_at"],
    }
