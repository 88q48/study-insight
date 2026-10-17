"""接口冒烟测试：保证 C 看板依赖的字段不会被误改。"""
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_upload_error_returns_success():
    payload = {
        "subject": "数学",
        "knowledge_point": "导数",
        "question_content": "求函数 f(x) = x³ - 3x 的极值。",
        "created_at": "2026-10-17 21:50:00",
    }

    response = client.post("/api/v1/errors", json=payload)

    assert response.status_code == 200
    assert response.json() == {"status": "success", "message": "错题上传成功"}


def test_upload_error_missing_field_returns_422():
    response = client.post("/api/v1/errors", json={"subject": "数学"})

    assert response.status_code == 422
    missing = {item["loc"][-1] for item in response.json()["detail"]}
    assert {"knowledge_point", "question_content", "created_at"} <= missing


def test_analysis_contract_for_dashboard():
    response = client.get("/api/v1/analysis")

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"summary", "subject_distribution", "review_trend"}

    summary = body["summary"]
    assert set(summary) == {"total_errors", "mastered_errors", "mastery_rate"}
    assert summary["total_errors"] == 120
    assert summary["mastered_errors"] == 85
    assert summary["mastery_rate"] == 70.8

    distribution = body["subject_distribution"]
    assert [item["subject"] for item in distribution] == ["数学", "物理", "英语"]
    for item in distribution:
        assert set(item) == {"subject", "error_count", "mastered_count"}
        assert item["mastered_count"] <= item["error_count"]

    trend = body["review_trend"]
    assert [item["date"] for item in trend] == ["2026-10-11", "2026-10-12"]
    for item in trend:
        assert set(item) == {"date", "new_added", "mastered"}
