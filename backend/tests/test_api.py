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
            "answer": "F = ma",
            "created_at": _iso(now),
            "mastered": True,
            "review_count": 2,
        },
    )
    assert formal.status_code == 201

    listed = client.get(f"/api/v1/errors?device_id={DEVICE}&limit=10").json()
    saved = next(item for item in listed["items"] if item["error_id"] == "err_0002")
    assert saved["content"] == "受力分析"
    assert saved["question_content"] == "受力分析"
    assert saved["answer"] == "F = ma"

    data = client.get("/api/v1/analysis").json()
    stats = data["error_stats"]
    assert stats == {
        "total_errors": 2,
        "mastered_errors": 1,
        "reviewing_errors": 1,
        "mastery_rate": 50.0,
    }

    # summary 只放专注时长，错题统计必须在 error_stats（看板端反馈）
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
    assert data["trend"] == []
    assert data["efficiency_trend"] == []
    assert len(data["review_trend"]) == 3
    assert data["subject_distribution"] == []
    assert data["knowledge_points"] == []
    assert data["app_ranking"] == []
    assert data["error_stats"]["total_errors"] == 0
    assert data["summary"]["total_duration_seconds"] == 0
    assert data["group_comparison"]["my_rank"] == 0


def test_choice_question_fields_are_stored():
    now = _now()
    payload = {
        "error_id": "err_choice_1",
        "device_id": DEVICE,
        "subject": "数学",
        "knowledge_point": "函数",
        "content": "f(x)=x² 在 x=2 处的值是？",
        "question_type": "choice",
        "option_a": "1",
        "option_b": "2",
        "option_c": "4",
        "option_d": "8",
        "answer": "c",
        "created_at": _iso(now),
    }
    created = client.post("/api/v1/errors", json=payload)
    assert created.status_code == 201

    item = next(
        row
        for row in client.get(
            f"/api/v1/errors?device_id={DEVICE}&limit=10"
        ).json()["items"]
        if row["error_id"] == "err_choice_1"
    )
    assert item["question_type"] == "choice"
    assert item["option_a"] == "1"
    assert item["option_b"] == "2"
    assert item["option_c"] == "4"
    assert item["option_d"] == "8"
    assert item["answer"] == "C"

    invalid = client.post(
        "/api/v1/errors",
        json={
            "error_id": "err_choice_invalid",
            "device_id": DEVICE,
            "subject": "数学",
            "content": "缺选项",
            "question_type": "choice",
            "option_a": "1",
            "option_b": "2",
            "option_c": "3",
            "answer": "A",
            "created_at": _iso(now),
        },
    )
    assert invalid.status_code == 422
    assert "D" in invalid.json()["detail"]


def test_attempt_stats_practice_priority_and_delete():
    now = _iso(_now())
    for error_id, answer in (
        ("err_stats_a", "A"),
        ("err_stats_b", "B"),
        ("err_stats_c", "C"),
    ):
        created = client.post(
            "/api/v1/errors",
            json={
                "error_id": error_id,
                "device_id": DEVICE,
                "subject": "数学",
                "knowledge_point": "统计",
                "content": f"题目 {error_id}",
                "question_type": "fill",
                "answer": answer,
                "created_at": now,
            },
        )
        assert created.status_code == 201

    # A 错两次，C 错一次，B 全对
    for error_id, answer in (
        ("err_stats_a", "wrong"),
        ("err_stats_a", "wrong"),
        ("err_stats_c", "wrong"),
        ("err_stats_c", "C"),
        ("err_stats_b", "B"),
    ):
        result = client.post(
            f"/api/v1/errors/{error_id}/attempts",
            json={"device_id": DEVICE, "answer": answer},
        )
        assert result.status_code == 200

    practice = client.get(
        f"/api/v1/errors/practice?device_id={DEVICE}&subject=数学&limit=10"
    ).json()
    assert [item["error_id"] for item in practice["items"]] == [
        "err_stats_a",
        "err_stats_c",
        "err_stats_b",
    ]
    stats = {item["error_id"]: item for item in practice["items"]}
    assert stats["err_stats_a"]["attempt_count"] == 2
    assert stats["err_stats_a"]["correct_count"] == 0
    assert stats["err_stats_a"]["wrong_count"] == 2
    assert stats["err_stats_a"]["accuracy"] == 0.0
    assert stats["err_stats_c"]["wrong_count"] == 1
    assert stats["err_stats_c"]["accuracy"] == 50.0
    assert stats["err_stats_b"]["accuracy"] == 100.0

    subjects = client.get(f"/api/v1/errors/subjects?device_id={DEVICE}").json()
    assert subjects["total"] == 1
    assert subjects["subjects"][0] == {"subject": "数学", "count": 3}

    wrong_device = client.delete(
        f"/api/v1/errors/err_stats_a?device_id=win_device_02"
    )
    assert wrong_device.status_code == 404

    deleted = client.delete(f"/api/v1/errors/err_stats_a?device_id={DEVICE}")
    assert deleted.status_code == 200
    remaining = client.get(
        f"/api/v1/errors/practice?device_id={DEVICE}&limit=10"
    ).json()
    assert all(item["error_id"] != "err_stats_a" for item in remaining["items"])



def test_practice_queue_deduplicates_same_question():
    """同一道题被多次录入时，练习队列只能出现一次。"""
    now = _iso(_now())
    cases = (
        ("err_dup_a", "重复录入的题干"),
        ("err_dup_b", "重复录入的题干"),
        ("err_dup_c", "另一道题"),
    )
    for error_id, content in cases:
        created = client.post(
            "/api/v1/errors",
            json={
                "error_id": error_id,
                "device_id": DEVICE,
                "subject": "数学",
                "knowledge_point": "去重",
                "content": content,
                "question_type": "fill",
                "answer": "A",
                "created_at": now,
            },
        )
        assert created.status_code == 201

    # err_dup_a 错两次，err_dup_b 错一次；应保留错得更多的 a。
    for error_id, answer in (
        ("err_dup_a", "wrong"),
        ("err_dup_a", "wrong"),
        ("err_dup_b", "wrong"),
        ("err_dup_c", "A"),
    ):
        result = client.post(
            f"/api/v1/errors/{error_id}/attempts",
            json={"device_id": DEVICE, "answer": answer},
        )
        assert result.status_code == 200

    practice = client.get(
        f"/api/v1/errors/practice?device_id={DEVICE}&subject=数学&limit=10"
    ).json()
    ids = [item["error_id"] for item in practice["items"]]
    assert ids == ["err_dup_a", "err_dup_c"]
    assert "err_dup_b" not in ids


def test_attempt_without_answer_is_skipped():
    """题目没录答案时，作答应被跳过而不是记成做错。

    以前这里是 correct = bool(answer) and (...)，空答案恒为 False，
    导致这类题做多少次正确率都是 0%，也永远不会变成已掌握。
    """
    created = client.post(
        "/api/v1/errors",
        json={
            "error_id": "err_no_answer",
            "device_id": DEVICE,
            "subject": "数学",
            "knowledge_point": "未分类",
            "content": "这道题故意不填答案",
            "question_type": "fill",
        },
    )
    assert created.status_code == 201

    # 提交任何答案都不该被计入统计
    first = client.post(
        "/api/v1/errors/err_no_answer/attempts",
        json={"device_id": DEVICE, "answer": "随便填一个"},
    )
    assert first.status_code == 200
    body = first.json()
    assert body["status"] == "skipped"
    assert body["correct"] is None
    assert "没有录入答案" in body["reason"]
    assert body["error"]["attempt_count"] == 0
    assert body["error"]["accuracy"] == 0.0

    # 再提交一次，仍然不累加
    second = client.post(
        "/api/v1/errors/err_no_answer/attempts",
        json={"device_id": DEVICE, "answer": "再填一次"},
    )
    assert second.json()["status"] == "skipped"
    assert second.json()["error"]["attempt_count"] == 0

    client.delete(f"/api/v1/errors/err_no_answer?device_id={DEVICE}")


def test_wrong_attempt_resets_mastered():
    """答错会取消已掌握；答对不会自动标记，掌握状态由用户手动确认。"""
    created = client.post(
        "/api/v1/errors",
        json={
            "error_id": "err_mastery_reset",
            "device_id": DEVICE,
            "subject": "数学",
            "knowledge_point": "函数",
            "content": "选择题：1+1 等于？",
            "answer": "A",
            "question_type": "choice",
            "option_a": "2",
            "option_b": "3",
            "option_c": "4",
            "option_d": "5",
            "mastered": True,
            "created_at": _iso(_now()),
        },
    )
    assert created.status_code == 201

    wrong = client.post(
        "/api/v1/errors/err_mastery_reset/attempts",
        json={"device_id": DEVICE, "answer": "B"},
    )
    assert wrong.status_code == 200
    body = wrong.json()
    assert body["correct"] is False
    assert body["error"]["mastered"] is False
    assert body["error"]["mastered_at"] is None

    right = client.post(
        "/api/v1/errors/err_mastery_reset/attempts",
        json={"device_id": DEVICE, "answer": "A"},
    )
    assert right.status_code == 200
    assert right.json()["correct"] is True
    assert right.json()["error"]["mastered"] is False


# ---------- OCR：错误分类 ----------
# 这几条锁的是「报错要能一眼看出该找谁」：
# 凭据失效去找后端改 .env，额度超限等明天，图片不行重拍。
# 用假的 client 顶掉真实百度调用，不消耗额度、不依赖网络。


class _FakeBaidu:
    def __init__(self, result):
        self._result = result

    def basicGeneral(self, _bytes):
        return self._result


def test_ocr_parse_without_credentials_returns_503(monkeypatch):
    import ocr_router

    monkeypatch.setattr(ocr_router, "client", None)
    resp = client.post(
        "/api/v1/ocr/parse",
        files={"file": ("a.jpg", b"fake-bytes", "image/jpeg")},
    )
    assert resp.status_code == 503
    assert "密钥" in resp.json()["detail"]


def test_ocr_credential_error_maps_to_503(monkeypatch):
    import ocr_router

    monkeypatch.setattr(
        ocr_router,
        "client",
        _FakeBaidu({"error_code": 14, "error_msg": "IAM Certification failed"}),
    )
    resp = client.post(
        "/api/v1/ocr/parse",
        files={"file": ("a.jpg", b"fake-bytes", "image/jpeg")},
    )
    # 关键是别被包成 500：原始实现 raise 后又 except 住，前端只会看到
    # 「OCR服务异常: 400: 百度OCR报错...」这种三层嵌套，看不出问题在哪
    assert resp.status_code == 503
    assert "凭据无效" in resp.json()["detail"]


def test_ocr_quota_error_maps_to_429(monkeypatch):
    import ocr_router

    monkeypatch.setattr(
        ocr_router,
        "client",
        _FakeBaidu({"error_code": 17, "error_msg": "daily limit reached"}),
    )
    resp = client.post(
        "/api/v1/ocr/parse",
        files={"file": ("a.jpg", b"fake-bytes", "image/jpeg")},
    )
    assert resp.status_code == 429
    assert "额度" in resp.json()["detail"]


def test_ocr_success_joins_lines(monkeypatch):
    import ocr_router

    monkeypatch.setattr(
        ocr_router,
        "client",
        _FakeBaidu({"words_result": [{"words": "第一行"}, {"words": "第二行"}]}),
    )
    resp = client.post(
        "/api/v1/ocr/parse",
        files={"file": ("a.jpg", b"fake-bytes", "image/jpeg")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["raw_text"] == "第一行\n第二行"
    # 大模型没配（或调失败）时要落到本地规则，不能返回「未知科目」
    assert body["parser"] in {"llm", "local"}


def test_ocr_split_works_offline():
    """纯文本切分不联网，任何环境都该成功。"""
    resp = client.post(
        "/api/v1/ocr/split",
        json={"text": "数学\n7. 已知函数 f(x)=x^2，求 f(2)。\nA. 2   B. 4\n答案 4"},
    )
    assert resp.status_code == 200
    assert resp.json()["subject"] == "数学"


# ---------- OCR：多题切分 ----------
# 一张试卷拍进去，原来会糊成一道。这几条锁住「按题号切成多题」，
# 以及「答案按真实题号配」——卷子上的题号常常不从 1 开始。

import ocr_split  # noqa: E402


MULTI = "\n".join([
    "数学 高三 第一次模拟考",
    "7. 已知函数 f(x)=x^2-4x+3，则最小值为（  ）",
    "A. -1    B. 0    C. 3    D. 4",
    "8. 若等差数列前 n 项和为 Sn，a1=2，S5=30，求 a3。",
    "12. 质量为 2 kg 的物体从 5 m 高处自由下落，求落地速度。",
    "答案与解析",
    "7. A",
    "8. C",
    "12. 10 m/s",
])


def test_split_multiple_questions():
    blocks, answers, header = ocr_split.split_questions(MULTI)
    assert len(blocks) == 3
    assert "模拟考" in header
    # 答案按卷面题号存，不是按切出来的顺序
    assert answers[7] == "A"
    assert answers[8] == "C"
    assert answers[12] == "10 m/s"


def test_split_keeps_options_per_question():
    questions, _ = ocr_split.parse_many(MULTI)
    first = questions[0]
    assert first["subject"] == "数学"
    assert first["question_type"] == "选择题"
    assert set(first["options"]) == {"A", "B", "C", "D"}
    assert first["answer"] == "A"
    assert first["number"] == 7
    # 第二题不该沾上第一题的选项
    assert questions[1]["options"] == {}


def test_split_handles_leading_blank_bracket():
    """OCR 会把填空括号和题号读成一行：（  ）8. 若……"""
    text = "（  ）8. 若等差数列前 n 项和为 Sn，a1=2，求 a3。\n答案：C"
    questions, _ = ocr_split.parse_many(text)
    assert len(questions) == 1
    assert questions[0]["number"] == 8


def test_question_number_survives_missing_left_paren():
    """OCR 偶尔吞掉左括号，剩「（）8.」这种也要能认出题号。"""
    text = "()8. 若等差数列前 n 项和为 Sn，求 a3。\n答案：C"
    questions, _ = ocr_split.parse_many(text)
    assert questions[0]["number"] == 8


def test_split_single_question_unchanged():
    """单题行为不能变：老调用方靠这个。"""
    text = "1. 已知函数 f(x)=x^2，求 f(2)。\nA. 2   B. 4   C. 6   D. 8\n答案：B"
    questions, _ = ocr_split.parse_many(text)
    assert len(questions) == 1
    assert questions[0]["answer"] == "B"
    assert questions[0]["question_type"] == "选择题"


def test_split_without_number_falls_back_to_one_question():
    """没有题号的碎片不该丢内容。"""
    text = "已知函数 f(x)=x^2，求 f(2) 的值。"
    questions, _ = ocr_split.parse_many(text)
    assert len(questions) == 1
    assert "f(2)" in questions[0]["question_content"]
