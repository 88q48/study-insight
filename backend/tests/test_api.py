"""接口测试：用临时 SQLite，不碰 backend/study_insight.db。"""

from __future__ import annotations

import os
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

# 必须在 import main / db 之前设置，否则会连到真实库并写入演示数据。
_TMP_DIR = Path(tempfile.mkdtemp(prefix="study_insight_test_"))
os.environ["SI_DB_PATH"] = str(_TMP_DIR / "test.db")
os.environ["SI_SEED_DEMO"] = "0"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import db  # noqa: E402
import main  # noqa: E402

client = TestClient(main.app)
DEVICE = "win_device_01"

CONTRACT_FIELDS = {
    "device_id",
    "period",
    "summary",
    "trend",
    "app_ranking",
    "group_comparison",
    "error_stats",
    "subject_distribution",
    "knowledge_points",
    "review_trend",
    "efficiency_trend",
}


@pytest.fixture(autouse=True)
def clean_db():
    db.init_db()
    with db.connection() as conn:
        conn.execute("DELETE FROM error_record")
        conn.execute("DELETE FROM usage_event")
    yield


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def _iso(value: datetime) -> str:
    return value.strftime("%Y-%m-%dT%H:%M:%SZ")


def test_health_and_contract_fields():
    health = client.get("/api/v1/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["error_records"] == 0

    response = client.get("/api/v1/devices/win_device_01/analysis")
    assert response.status_code == 200
    data = response.json()
    assert set(data) == CONTRACT_FIELDS
    assert data["device_id"] == DEVICE
    assert data["period"]["start"].endswith("Z")
    assert data["period"]["end"].endswith("Z")


def test_upload_errors_and_error_stats():
    now = _now()
    simplified = client.post(
        "/api/v1/errors",
        json={
            "subject": "数学",
            "knowledge_point": "导数与函数",
            "question_content": "求 f(x)=x^3-3x 的单调区间",
            "created_at": _iso(now),
        },
    )
    assert simplified.status_code == 201
    body = simplified.json()
    assert body["status"] == "success"
    assert body["duplicate"] is False
    assert body["error_id"].startswith("err_")

    formal = client.post(
        "/api/v1/errors",
        json={
            "error_id": "err_0002",
            "device_id": DEVICE,
            "subject": "物理",
            "knowledge_point": "力学",
            "content": "受力分析",
            "created_at": _iso(now),
            "mastered": True,
            "review_count": 2,
        },
    )
    assert formal.status_code == 201

    data = client.get("/api/v1/analysis").json()
    stats = data["error_stats"]
    assert stats == {
        "total_errors": 2,
        "mastered_errors": 1,
        "reviewing_errors": 1,
        "mastery_rate": 50.0,
    }

    # summary 只放专注时长，错题统计必须在 error_stats（C 的反馈）
    assert set(data["summary"]) == {
        "total_duration_seconds",
        "avg_daily_seconds",
        "median_daily_seconds",
        "p90_daily_seconds",
    }
    assert data["summary"]["total_duration_seconds"] == 0

    subjects = {item["subject"]: item for item in data["subject_distribution"]}
    assert subjects["数学"]["error_count"] == 1
    assert subjects["数学"]["mastered_count"] == 0
    assert subjects["物理"]["mastery_rate"] == 100.0
    assert sum(item["error_count"] for item in data["knowledge_points"]) == 2

    today = data["review_trend"][-1]
    assert today["date"] == now.date().isoformat()
    assert today["new_added"] == 2
    assert today["resolved"] == 1


def test_duplicate_error_id_is_idempotent():
    now = _now()
    payload = {
        "error_id": "err_dup_1",
        "subject": "英语",
        "knowledge_point": "阅读理解",
        "content": "重复上传测试",
        "created_at": _iso(now),
    }
    first = client.post("/api/v1/errors", json=payload)
    assert first.status_code == 201
    second = client.post("/api/v1/errors", json=payload)
    assert second.status_code == 200
    assert second.json()["duplicate"] is True

    listing = client.get(f"/api/v1/errors?device_id={DEVICE}")
    assert listing.status_code == 200
    assert listing.json()["total"] == 1
    assert listing.json()["items"][0]["error_id"] == "err_dup_1"

    data = client.get("/api/v1/analysis").json()
    assert data["error_stats"]["total_errors"] == 1


def test_patch_mastered_and_review_count():
    created = client.post(
        "/api/v1/errors",
        json={
            "subject": "数学",
            "knowledge_point": "数列",
            "question_content": "求通项公式",
            "created_at": _iso(_now()),
        },
    ).json()
    error_id = created["error_id"]

    updated = client.patch(
        f"/api/v1/errors/{error_id}",
        json={"mastered": True, "review_count": 3},
    )
    assert updated.status_code == 200
    item = updated.json()["error"]
    assert item["mastered"] is True
    assert item["review_count"] == 3
    assert item["mastered_at"] is not None

    data = client.get("/api/v1/analysis").json()
    assert data["error_stats"]["mastered_errors"] == 1
    assert data["review_trend"][-1]["resolved"] == 1

    reverted = client.patch(
        f"/api/v1/errors/{error_id}", json={"mastered": False}
    )
    assert reverted.json()["error"]["mastered_at"] is None
    data = client.get("/api/v1/analysis").json()
    assert data["error_stats"]["mastered_errors"] == 0
    assert data["review_trend"][-1]["resolved"] == 0

    missing = client.patch("/api/v1/errors/err_not_exist", json={"mastered": True})
    assert missing.status_code == 404


def test_events_batch_and_focus_blocks():
    start = _now().replace(hour=9, minute=0, second=0)
    events = [
        {
            "event_id": "evt_test_1",
            "device_id": DEVICE,
            "platform": "windows",
            "app_key": "chrome",
            "start_at": _iso(start),
            "end_at": _iso(start + timedelta(seconds=3600)),
            "duration_seconds": 3600,
        },
        {
            "event_id": "evt_test_2",
            "device_id": DEVICE,
            "platform": "windows",
            "app_key": "douyin",
            "start_at": _iso(start),
            "end_at": _iso(start + timedelta(seconds=1800)),
            "duration_seconds": 1800,
        },
    ]
    result = client.post("/api/v1/events/batch", json=events)
    assert result.status_code == 200
    assert result.json() == {
        "status": "success",
        "received": 2,
        "inserted": 2,
        "duplicates": 0,
    }

    again = client.post("/api/v1/events/batch", json=events).json()
    assert again["inserted"] == 0
    assert again["duplicates"] == 2

    data = client.get(f"/api/v1/devices/{DEVICE}/analysis?days=3").json()
    assert len(data["trend"]) == 3
    assert data["trend"][-1]["total_duration_seconds"] == 5400
    assert data["summary"]["total_duration_seconds"] == 5400
    assert data["summary"]["avg_daily_seconds"] == 1800.0

    apps = {item["app_key"]: item for item in data["app_ranking"]}
    assert apps["chrome"]["duration_seconds"] == 3600
    assert apps["chrome"]["percentage"] == 66.67
    assert apps["chrome"]["app_name"] == "Chrome"
    assert apps["chrome"]["category"] == "工具"

    assert len(data["efficiency_trend"]) == 3
    assert data["efficiency_trend"][-1]["focus_hours"] == 1.5


def test_events_batch_wrapper_body():
    start = _now().replace(hour=9, minute=0, second=0)
    payload = {
        "events": [
            {
                "event_id": "evt_wrap_1",
                "device_id": DEVICE,
                "platform": "windows",
                "app_key": "study",
                "start_at": _iso(start),
                "end_at": _iso(start + timedelta(seconds=600)),
                "duration_seconds": 600,
            }
        ]
    }
    result = client.post("/api/v1/events/batch", json=payload)
    assert result.status_code == 200
    assert result.json()["inserted"] == 1


def test_empty_analysis_returns_empty_arrays():
    data = client.get("/api/v1/analysis?days=3").json()
    assert len(data["trend"]) == 3
    assert data["subject_distribution"] == []
    assert data["knowledge_points"] == []
    assert data["app_ranking"] == []
    assert data["error_stats"]["total_errors"] == 0
    assert data["summary"]["total_duration_seconds"] == 0
    assert data["group_comparison"]["my_rank"] == 0

