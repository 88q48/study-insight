"""把数据库里的原始记录聚合成看板要的 11 个顶层字段。

口径与 docs/api-fields.md 一致：
- summary / trend / app_ranking / group_comparison 是专注维度
- error_stats / subject_distribution / knowledge_points / review_trend 是错题维度
- efficiency_trend 是把两边按日期对齐后拼出来的

注意：错题总量统计的是该设备的全部记录（看板文案是「累计错题」），
review_trend 只统计查询窗口内的每日新增 / 消灭。
"""

from __future__ import annotations

import math
import statistics
from collections import Counter
from datetime import datetime, time, timedelta, timezone
from typing import Any

import db

# 应用展示名与类别。客户端只传 app_key，映射放在后端，避免两端各维护一份。
APP_META: dict[str, tuple[str, str]] = {
    "chrome": ("Chrome", "工具"),
    "com.tencent.mm": ("微信", "社交"),
    "douyin": ("抖音", "娱乐"),
    "study": ("学习通", "学习"),
    "bilibili": ("B站", "娱乐"),
}

# 群体对比暂未接入真实班级数据，先按 20 人班给演示占位。
GROUP_SIZE = 20


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _period(days: int) -> tuple[str, str, list[str]]:
    today = datetime.now(timezone.utc).date()
    start = datetime.combine(today - timedelta(days=days - 1), time.min, tzinfo=timezone.utc)
    end = datetime.combine(today, time.max, tzinfo=timezone.utc).replace(microsecond=0)
    dates = [
        (today - timedelta(days=days - 1 - index)).isoformat() for index in range(days)
    ]
    return _iso(start), _iso(end), dates


def _percentile(values: list[int], percent: float) -> float:
    """线性插值分位数，和 numpy.percentile 的默认口径一致。"""
    if not values:
        return 0.0
    data = sorted(values)
    if len(data) == 1:
        return float(data[0])
    position = (len(data) - 1) * (percent / 100.0)
    low = math.floor(position)
    high = math.ceil(position)
    if low == high:
        return float(data[int(position)])
    return float(data[low] + (data[high] - data[low]) * (position - low))


def _load(device_id: str, start: str, end: str) -> tuple[list[dict], list[dict]]:
    with db.connection() as conn:
        errors = [
            dict(row)
            for row in conn.execute(
                "SELECT * FROM error_record WHERE device_id = ?", (device_id,)
            )
        ]
        events = [
            dict(row)
            for row in conn.execute(
                "SELECT * FROM usage_event "
                "WHERE device_id = ? AND start_at >= ? AND start_at <= ?",
                (device_id, start, end),
            )
        ]
    return errors, events


def _error_block(errors: list[dict], dates: list[str]) -> dict[str, Any]:
    total = len(errors)
    mastered = sum(1 for error in errors if error["mastered"])
    reviewing = total - mastered
    error_stats = {
        "total_errors": total,
        "mastered_errors": mastered,
        "reviewing_errors": reviewing,
        "mastery_rate": round(mastered / total * 100, 1) if total else 0.0,
    }

    by_subject: dict[str, dict[str, Any]] = {}
    by_point: dict[tuple[str, str], int] = {}
    for error in errors:
        subject = error["subject"]
        item = by_subject.setdefault(
            subject, {"subject": subject, "error_count": 0, "mastered_count": 0}
        )
        item["error_count"] += 1
        item["mastered_count"] += int(error["mastered"])
        key = (subject, error["knowledge_point"])
        by_point[key] = by_point.get(key, 0) + 1

    subject_distribution = []
    for item in by_subject.values():
        count = item["error_count"]
        item["reviewing_count"] = count - item["mastered_count"]
        item["mastery_rate"] = (
            round(item["mastered_count"] / count * 100, 1) if count else 0.0
        )
        subject_distribution.append(item)
    subject_distribution.sort(key=lambda item: (-item["error_count"], item["subject"]))

    knowledge_points = [
        {"subject": subject, "knowledge_point": point, "error_count": count}
        for (subject, point), count in by_point.items()
    ]
    knowledge_points.sort(
        key=lambda item: (
            -item["error_count"],
            item["subject"],
            item["knowledge_point"],
        )
    )

    new_by_day = Counter(error["created_at"][:10] for error in errors)
    resolved_by_day = Counter(
        error["mastered_at"][:10]
        for error in errors
        if error["mastered"] and error["mastered_at"]
    )
    review_trend = [
        {
            "date": day,
            "new_added": new_by_day.get(day, 0),
            "resolved": resolved_by_day.get(day, 0),
        }
        for day in dates
    ]

    return {
        "error_stats": error_stats,
        "subject_distribution": subject_distribution,
        "knowledge_points": knowledge_points,
        "review_trend": review_trend,
    }


def _focus_block(events: list[dict], dates: list[str]) -> dict[str, Any]:
    seconds_by_day = {day: 0 for day in dates}
    app_totals: dict[str, dict[str, Any]] = {}

    for event in events:
        day = event["start_at"][:10]
        duration = int(event["duration_seconds"])
        if day in seconds_by_day:
            seconds_by_day[day] += duration

        key = event["app_key"]
        app = app_totals.setdefault(key, {"duration_seconds": 0})
        app["duration_seconds"] += duration
        if event.get("app_name"):
            app["app_name"] = event["app_name"]
        if event.get("category"):
            app["category"] = event["category"]

    trend = [
        {"date": day, "total_duration_seconds": seconds_by_day[day]} for day in dates
    ]
    values = [seconds_by_day[day] for day in dates]
    total = sum(values)
    summary = {
        "total_duration_seconds": total,
        "avg_daily_seconds": round(total / len(values), 2) if values else 0.0,
        "median_daily_seconds": (
            round(float(statistics.median(values)), 2) if values else 0.0
        ),
        "p90_daily_seconds": round(_percentile(values, 90), 2),
    }

    total_app = sum(item["duration_seconds"] for item in app_totals.values())
    app_ranking = []
    for key, item in app_totals.items():
        name, category = APP_META.get(key, (key, "其他"))
        duration = item["duration_seconds"]
        app_ranking.append(
            {
                "app_key": key,
                "app_name": item.get("app_name") or name,
                "category": item.get("category") or category,
                "duration_seconds": duration,
                "percentage": (
                    round(duration / total_app * 100, 2) if total_app else 0.0
                ),
            }
        )
    app_ranking.sort(key=lambda item: (-item["duration_seconds"], item["app_key"]))

    average = summary["avg_daily_seconds"]
    if average > 0:
        group_avg = round(average * 1.05, 1)
        group_comparison = {
            "group_avg_daily_seconds": group_avg,
            "group_median_daily_seconds": round(average * 1.02, 1),
            "group_p90_daily_seconds": round(average * 1.35, 1),
            "my_rank": max(1, min(GROUP_SIZE, round(average / group_avg * 10))),
            "group_size": GROUP_SIZE,
        }
    else:
        group_comparison = {
            "group_avg_daily_seconds": 0.0,
            "group_median_daily_seconds": 0.0,
            "group_p90_daily_seconds": 0.0,
            "my_rank": 0,
            "group_size": GROUP_SIZE,
        }

    return {
        "summary": summary,
        "trend": trend,
        "app_ranking": app_ranking,
        "group_comparison": group_comparison,
    }


def build_analysis(device_id: str, days: int = 7) -> dict[str, Any]:
    """返回正式契约要求的 11 个顶层字段。"""
    days = max(1, min(int(days), 90))
    start, end, dates = _period(days)
    errors, events = _load(device_id, start, end)

    error_block = _error_block(errors, dates)
    focus_block = _focus_block(events, dates)

    efficiency_trend = [
        {
            "date": trend_item["date"],
            "focus_hours": round(trend_item["total_duration_seconds"] / 3600, 2),
            "new_errors": review_item["new_added"],
            "resolved_errors": review_item["resolved"],
        }
        for trend_item, review_item in zip(
            focus_block["trend"], error_block["review_trend"]
        )
    ]

    return {
        "device_id": device_id,
        "period": {"start": start, "end": end},
        "summary": focus_block["summary"],
        "trend": focus_block["trend"],
        "app_ranking": focus_block["app_ranking"],
        "group_comparison": focus_block["group_comparison"],
        "error_stats": error_block["error_stats"],
        "subject_distribution": error_block["subject_distribution"],
        "knowledge_points": error_block["knowledge_points"],
        "review_trend": error_block["review_trend"],
        "efficiency_trend": efficiency_trend,
    }
