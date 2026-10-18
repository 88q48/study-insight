"""演示数据：120 道错题 + 最近 7 天的应用使用记录。

空库首次启动时由 main.py 自动调用；也可以手动执行：
    python seed_demo.py            # 幂等写入（已有则跳过）
    python seed_demo.py --reset    # 先删演示数据再重写

数字与 C 看板一致：数学 45、物理 35、英语 40，共 120 道；已掌握 85，掌握率 70.8%。
错题 id 以 err_demo_ 开头、使用记录 id 以 evt_demo_ 开头，方便单独清理。
"""

from __future__ import annotations

import argparse
from datetime import datetime, time, timedelta, timezone

import analytics
import db

DEMO_DEVICE = "win_device_01"

# 科目 → (已掌握数, [(知识点, 错题数)])
# 45+35+40 = 120；32+28+25 = 85；85/120 = 70.8%
SUBJECTS: list[tuple[str, int, list[tuple[str, int]]]] = [
    ("数学", 32, [("导数与函数", 15), ("立体几何", 12), ("数列", 10), ("概率统计", 8)]),
    ("物理", 28, [("电磁学", 13), ("力学", 9), ("光学", 7), ("热学", 6)]),
    ("英语", 25, [("完形填空", 14), ("阅读理解", 13), ("语法填空", 13)]),
]

# app_key, 每日时长占比, 当天开始小时, 分钟
APP_PLAN = [
    ("chrome", 0.35, 9, 0),
    ("com.tencent.mm", 0.25, 10, 30),
    ("douyin", 0.20, 14, 0),
    ("study", 0.10, 16, 0),
    ("bilibili", 0.10, 20, 0),
]


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_demo_errors(now: datetime) -> list[dict]:
    """120 道错题，created_at 落在最近 7 天内，掌握时间落在查询窗口内。"""
    records: list[dict] = []
    index = 0
    today = now.date()

    for subject, mastered_count, points in SUBJECTS:
        remaining_mastered = mastered_count
        for point, count in points:
            for _ in range(count):
                index += 1
                day = today - timedelta(days=(index * 3) % 7)
                created_at = datetime.combine(
                    day,
                    time(hour=8 + (index * 5) % 12, minute=(index * 7) % 60),
                    tzinfo=timezone.utc,
                )
                if created_at > now:
                    created_at = now - timedelta(minutes=5 + index % 30)

                mastered = remaining_mastered > 0
                if mastered:
                    remaining_mastered -= 1

                mastered_at = None
                if mastered:
                    mastered_at = created_at + timedelta(days=1, hours=2)
                    if mastered_at > now:
                        mastered_at = max(created_at, now - timedelta(minutes=15))

                records.append(
                    {
                        "error_id": f"err_demo_{index:04d}",
                        "device_id": DEMO_DEVICE,
                        "subject": subject,
                        "knowledge_point": point,
                        "content": f"演示错题：{subject}·{point} 第 {index} 题",
                        "created_at": _iso(created_at),
                        "mastered": mastered,
                        "review_count": (2 + index % 3) if mastered else (index % 3),
                        "mastered_at": _iso(mastered_at) if mastered_at else None,
                        "received_at": _iso(now),
                    }
                )

    return records


def build_demo_events(now: datetime) -> list[dict]:
    """最近 7 天、每天 5 个应用的使用记录，供 trend / app_ranking 使用。"""
    events: list[dict] = []
    today = now.date()

    for offset in range(6, -1, -1):
        day = today - timedelta(days=offset)
        # 每天 3~5 小时，五天数据规模不同，图表不至于一条直线
        daily_total = 3 * 3600 + ((offset * 37) % 120) * 60
        for app_key, weight, hour, minute in APP_PLAN:
            start_at = datetime.combine(
                day, time(hour=hour, minute=minute), tzinfo=timezone.utc
            )
            duration = int(daily_total * weight)
            end_at = start_at + timedelta(seconds=duration)
            app_name, category = analytics.APP_META.get(app_key, (app_key, "其他"))
            events.append(
                {
                    "event_id": f"evt_demo_{day.isoformat()}_{app_key}",
                    "device_id": DEMO_DEVICE,
                    "platform": "windows",
                    "app_key": app_key,
                    "app_name": app_name,
                    "category": category,
                    "start_at": _iso(start_at),
                    "end_at": _iso(end_at),
                    "duration_seconds": duration,
                    "received_at": _iso(now),
                }
            )

    return events


def seed_demo_data(reset: bool = False) -> dict[str, int]:
    """写入演示数据，返回各类新增 / 重复条数。重复 id 不会覆盖已有记录。"""
    db.init_db()
    now = datetime.now(timezone.utc)

    if reset:
        with db.connection() as conn:
            conn.execute("DELETE FROM error_record WHERE error_id LIKE 'err_demo_%'")
            conn.execute("DELETE FROM usage_event WHERE event_id LIKE 'evt_demo_%'")

    errors = build_demo_errors(now)
    events = build_demo_events(now)
    inserted_errors, duplicate_errors = db.insert_errors(errors)
    inserted_events, duplicate_events = db.insert_events(events)

    result = {
        "errors_inserted": inserted_errors,
        "errors_duplicated": duplicate_errors,
        "events_inserted": inserted_events,
        "events_duplicated": duplicate_events,
    }
    print(
        "[seed] 演示数据：错题新增 "
        f"{inserted_errors}（重复 {duplicate_errors}），"
        f"使用记录新增 {inserted_events}（重复 {duplicate_events}）"
    )
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="写入学情洞察演示数据")
    parser.add_argument("--reset", action="store_true", help="先删除演示数据再写入")
    args = parser.parse_args()
    seed_demo_data(reset=args.reset)


if __name__ == "__main__":
    main()

