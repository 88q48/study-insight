# schema_adapter.py
"""把后端返回的 JSON 归一化成看板需要的结构。

联调时最常见的麻烦是字段名对不上：后端可能写 total_errors，
也可能写 totalErrors、total、totalErrorCount。这里做一层容错，
看板只认归一化之后的结构，后端换命名也不至于整个崩掉。
"""

import re


def _norm_key(key):
    """把各种命名风格统一成小写无分隔形式。

    total_errors / totalErrors / TotalErrors / total-errors
    -> totalerrors
    """
    return re.sub(r"[_\-\s]", "", str(key)).lower()


# 看板认识的顶层字段（规范化后），用来判断是不是包装层
_KNOWN_KEYS = {
    "errorstats", "subjectdistribution", "knowledgepoints", "reviewtrend",
    "efficiencytrend", "summary", "trend", "appranking", "groupcomparison",
    "devid", "deviceid", "period", "errorssummary", "overview",
}


def _index(obj):
    """给一个 dict 建规范化索引，找不到原键时用。"""
    if not isinstance(obj, dict):
        return {}
    return {_norm_key(k): v for k, v in obj.items()}


def pick(obj, *names, default=None):
    """从 dict 里按候选名取值，支持命名风格差异。

    pick(x, "total_errors", "totalErrors", default=0)
    """
    if not isinstance(obj, dict):
        return default
    if not names:
        return default

    # 先精确匹配
    for n in names:
        if n in obj:
            return obj[n]

    # 再规范化匹配
    idx = _index(obj)
    for n in names:
        k = _norm_key(n)
        if k in idx:
            return idx[k]

    return default


def as_dict(v):
    return v if isinstance(v, dict) else {}


def as_list(v):
    if isinstance(v, list):
        return v
    if isinstance(v, dict):
        # 有些后端把数组包一层：{"items": [...]}
        for k in ("items", "data", "list", "records", "rows"):
            inner = pick(v, k)
            if isinstance(inner, list):
                return inner
    return []


def num(v, default=0.0):
    try:
        if v is None or v == "":
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


def pct(v, default=0.0):
    """百分比：兼容 0.65 和 65 两种写法。"""
    n = num(v, default)
    if 0 < n <= 1:
        n *= 100
    return round(n, 1)


# ----------------------------------------------------------
# 各数据块
# ----------------------------------------------------------

def norm_summary(raw):
    """专注时长汇总，统一成秒。"""
    d = as_dict(raw)

    def to_sec(*names):
        v = num(pick(d, *names), None)
        if v is None:
            return 0.0
        # 明显是小时（值很小且有 hours 字样已在名字里）
        return v

    total = to_sec("total_duration_seconds", "totalDurationSeconds",
                   "total_seconds", "totalSeconds")
    avg = to_sec("avg_daily_seconds", "avgDailySeconds", "average_daily_seconds")
    med = to_sec("median_daily_seconds", "medianDailySeconds", "median_seconds")
    p90 = to_sec("p90_daily_seconds", "p90DailySeconds", "p90_seconds")

    return {
        "total_duration_seconds": total,
        "avg_daily_seconds": avg,
        "median_daily_seconds": med,
        "p90_daily_seconds": p90,
    }


def norm_trend(raw):
    """每日专注时长。"""
    out = []
    for item in as_list(raw):
        d = as_dict(item)
        date = pick(d, "date", "day", "stat_date", "statDate", "dt")
        sec = num(pick(d, "total_duration_seconds", "totalDurationSeconds",
                       "duration_seconds", "durationSeconds", "seconds"))
        if date is None:
            continue
        out.append({"date": str(date)[:10], "total_duration_seconds": sec})
    return out


def norm_app_ranking(raw):
    out = []
    for item in as_list(raw):
        d = as_dict(item)
        out.append({
            "app_key": pick(d, "app_key", "appKey", "app", "package", default="unknown"),
            "app_name": pick(d, "app_name", "appName", "name", "label", default="未知应用"),
            "category": pick(d, "category", "type", "app_category", default="其他"),
            "duration_seconds": num(pick(d, "duration_seconds", "durationSeconds",
                                         "duration", "seconds")),
            "percentage": pct(pick(d, "percentage", "percent", "ratio")),
        })
    return out


def norm_group(raw):
    d = as_dict(raw)
    return {
        "group_avg_daily_seconds": num(pick(d, "group_avg_daily_seconds",
                                            "groupAvgDailySeconds", "avg")),
        "group_median_daily_seconds": num(pick(d, "group_median_daily_seconds",
                                               "groupMedianDailySeconds", "median")),
        "group_p90_daily_seconds": num(pick(d, "group_p90_daily_seconds",
                                            "groupP90DailySeconds", "p90")),
        "my_rank": int(num(pick(d, "my_rank", "myRank", "rank"), 0)),
        "group_size": int(num(pick(d, "group_size", "groupSize", "size"), 0)),
    }


def norm_error_stats(raw, *fallbacks):
    """错题总览。

    有些后端把错题统计放在 summary 里（而不是独立的 error_stats），
    所以这里可以接受多个候选源，按顺序取第一个取到值的。
    """
    sources = [raw] + list(fallbacks)
    for s in sources:
        st = _error_stats_from(as_dict(s))
        if st["total_errors"] > 0:
            return st
    return _error_stats_from(as_dict(raw))


def _error_stats_from(d):
    total = int(num(pick(d, "total_errors", "totalErrors", "total",
                         "total_error_count", "totalErrorCount")))
    mastered = int(num(pick(d, "mastered_errors", "masteredErrors", "mastered",
                            "mastered_count", "masteredCount")))
    reviewing = pick(d, "reviewing_errors", "reviewingErrors", "reviewing",
                     "pending", "unmastered")
    if reviewing is None:
        reviewing = max(total - mastered, 0)
    reviewing = int(num(reviewing))

    rate = pick(d, "mastery_rate", "masteryRate", "rate", "mastery")
    if rate is None:
        rate = (mastered / total * 100) if total else 0
    else:
        rate = pct(rate)

    return {
        "total_errors": total,
        "mastered_errors": mastered,
        "reviewing_errors": reviewing,
        "mastery_rate": rate,
    }


def norm_subjects(raw, error_stats=None):
    out = []
    for item in as_list(raw):
        d = as_dict(item)
        total = int(num(pick(d, "error_count", "errorCount", "total",
                             "count", "errors")))
        mastered = int(num(pick(d, "mastered_count", "masteredCount",
                                "mastered", "learned")))
        reviewing = pick(d, "reviewing_count", "reviewingCount", "reviewing")
        if reviewing is None:
            reviewing = max(total - mastered, 0)
        reviewing = int(num(reviewing))

        rate = pick(d, "mastery_rate", "masteryRate", "rate")
        rate = pct(rate) if rate is not None else (
            round(mastered / total * 100, 1) if total else 0.0
        )

        out.append({
            "subject": pick(d, "subject", "subject_name", "subjectName",
                            "name", default="未知科目"),
            "error_count": total,
            "mastered_count": mastered,
            "reviewing_count": reviewing,
            "mastery_rate": rate,
        })
    out.sort(key=lambda x: x["error_count"], reverse=True)
    return out


def norm_knowledge_points(raw):
    out = []
    for item in as_list(raw):
        d = as_dict(item)
        out.append({
            "subject": pick(d, "subject", "subject_name", "subjectName",
                            default="未知科目"),
            "knowledge_point": pick(d, "knowledge_point", "knowledgePoint",
                                    "point", "name", "kp", default="未分类"),
            "error_count": int(num(pick(d, "error_count", "errorCount",
                                        "count", "errors"))),
        })
    out.sort(key=lambda x: x["error_count"], reverse=True)
    return out


def norm_review_trend(raw):
    out = []
    for item in as_list(raw):
        d = as_dict(item)
        date = pick(d, "date", "day", "stat_date", "statDate", "dt")
        if date is None:
            continue
        out.append({
            "date": str(date)[:10],
            "new_added": int(num(pick(d, "new_added", "newAdded", "added",
                                      "new", "created"))),
            "resolved": int(num(pick(d, "resolved", "resolved_count",
                                     "resolvedCount", "eliminated",
                                     "mastered_today", "mastered",
                                     "masteredCount", "mastered_count"))),
        })
    return out


def norm_efficiency_trend(raw, trend_list=None, review_list=None):
    """双轴图数据。后端没给就自己拼一份。

    trend_list / review_list 传归一化之后的列表，
    这样驼峰、下划线、包一层等各种情况都已经处理过了。
    """
    out = []
    for item in as_list(raw):
        d = as_dict(item)
        date = pick(d, "date", "day", "stat_date", "statDate", "dt")
        if date is None:
            continue
        hours = pick(d, "focus_hours", "focusHours", "hours")
        if hours is None:
            hours = num(pick(d, "focus_seconds", "focusSeconds",
                             "duration_seconds", "durationSeconds")) / 3600
        out.append({
            "date": str(date)[:10],
            "focus_hours": round(num(hours), 2),
            "new_errors": int(num(pick(d, "new_errors", "newErrors",
                                       "new_added", "newAdded"))),
            "resolved_errors": int(num(pick(d, "resolved_errors", "resolvedErrors",
                                            "resolved", "mastered",
                                            "mastered_count"))),
        })

    if out:
        out.sort(key=lambda x: x["date"])
        return out

    # 兜底：用专注趋势 + 复习趋势按日期对齐拼出来
    if not trend_list:
        return []
    review = {r["date"]: r for r in (review_list or [])}

    for t in trend_list:
        date = t["date"]
        r = review.get(date, {})
        out.append({
            "date": date,
            "focus_hours": round(t["total_duration_seconds"] / 3600, 2),
            "new_errors": int(num(r.get("new_added", 0))),
            "resolved_errors": int(num(r.get("resolved", 0))),
        })
    return out


def norm_period(raw, fallback_trend=None):
    d = as_dict(raw)
    start = pick(d, "start", "start_date", "startDate", "begin")
    end = pick(d, "end", "end_date", "endDate", "finish")
    if start and end:
        return {"start": str(start), "end": str(end)}

    tr = norm_trend((fallback_trend or {}).get("trend"))
    if tr:
        return {"start": tr[0]["date"] + "T00:00:00Z",
                "end": tr[-1]["date"] + "T23:59:59Z"}
    return {"start": "", "end": ""}


def normalize(raw, device_id="win_device_01"):
    """入口：任意后端响应 -> 看板标准结构。"""
    d = as_dict(raw)

    # 有些后端把结果包一层（data / result / payload）
    # 只要内层是个非空 dict 就拆开，不限制字段数量
    for wrapper in ("data", "result", "payload", "analysis"):
        inner = pick(d, wrapper)
        if isinstance(inner, dict) and inner:
            # 内层至少得有一个我们认识的键，才认定它是包装层
            known = [k for k in inner if _norm_key(k) in _KNOWN_KEYS]
            if known:
                d = inner
                break

    trend_n = norm_trend(
        pick(d, "trend", "daily_trend", "dailyTrend", "focus_trend",
             "focusTrend"))
    review_n = norm_review_trend(
        pick(d, "review_trend", "reviewTrend", "review"))

    return {
        "device_id": pick(d, "device_id", "deviceId", default=device_id),
        "period": norm_period(pick(d, "period", "time_range", "timeRange"), d),
        "summary": norm_summary(pick(d, "summary", "overview")),
        "trend": trend_n,
        "app_ranking": norm_app_ranking(
            pick(d, "app_ranking", "appRanking", "apps", "top_apps")),
        "group_comparison": norm_group(
            pick(d, "group_comparison", "groupComparison", "group")),
        "error_stats": norm_error_stats(
            pick(d, "error_stats", "errorStats", "errors_summary"),
            # 有后端把错题统计塞进 summary，这里兜一层
            pick(d, "summary", "overview")),
        "subject_distribution": norm_subjects(
            pick(d, "subject_distribution", "subjectDistribution",
                 "subjects", "subject_stats")),
        "knowledge_points": norm_knowledge_points(
            pick(d, "knowledge_points", "knowledgePoints", "points", "kps")),
        "review_trend": review_n,
        "efficiency_trend": norm_efficiency_trend(
            pick(d, "efficiency_trend", "efficiencyTrend", "efficiency"),
            trend_n, review_n),
    }


def check(normalized):
    """返回缺失/异常项，联调时快速定位问题。"""
    warns = []
    if not normalized["trend"]:
        warns.append("trend 为空：后端没给每日专注时长")
    if not normalized["subject_distribution"]:
        warns.append("subject_distribution 为空：没有分科数据")
    if not normalized["knowledge_points"]:
        warns.append("knowledge_points 为空：没有知识点数据")
    if not normalized["efficiency_trend"]:
        warns.append("efficiency_trend 为空：双轴图无法绘制")
    if normalized["error_stats"]["total_errors"] == 0:
        warns.append("error_stats 全为 0：错题总数没取到")
    return warns


# ----------------------------------------------------------
# 接口完整度：联调时用来看还差哪些字段
# ----------------------------------------------------------

# 正式契约要求的 11 个顶层字段
CONTRACT_FIELDS = [
    "device_id", "period", "summary", "trend", "app_ranking",
    "group_comparison", "error_stats", "subject_distribution",
    "knowledge_points", "review_trend", "efficiency_trend",
]

# 每个字段对应看板上一块内容，缺了会怎样
FIELD_USAGE = {
    "device_id": "页面顶部设备号",
    "period": "页面顶部时间范围",
    "summary": "专注时长指标卡",
    "trend": "每日专注时长趋势图",
    "app_ranking": "应用类别占比图",
    "group_comparison": "个人 vs 群体对比",
    "error_stats": "错题四项指标卡 + 消化漏斗",
    "subject_distribution": "科目雷达图 + 消化进度图",
    "knowledge_points": "知识点薄弱榜",
    "review_trend": "每日新增 vs 消灭",
    "efficiency_trend": "专注时长 vs 产出的双轴图",
}


def contract_status(normalized):
    """检查符合正式契约的程度。

    返回：
        {
          "level": "full" / "partial" / "transitional",
          "present": [...],
          "missing": [(字段名, 缺了影响什么), ...],
          "hint": "给人看的一句话"
        }
    """
    present = []
    missing = []

    for f in CONTRACT_FIELDS:
        v = normalized.get(f)
        ok = False
        if isinstance(v, list):
            ok = len(v) > 0
        elif isinstance(v, dict):
            # 空 dict 或全零也算没给
            ok = any(
                (isinstance(x, (int, float)) and x != 0)
                or (isinstance(x, str) and x)
                or (isinstance(x, (list, dict)) and x)
                for x in v.values()
            )
        elif v:
            ok = True

        if ok:
            present.append(f)
        else:
            missing.append((f, FIELD_USAGE.get(f, "")))

    n = len(present)
    if n == len(CONTRACT_FIELDS):
        level = "full"
        hint = "接口已符合正式契约（11 个字段齐全）"
    elif n >= 6:
        level = "partial"
        hint = f"接口有 {n}/{len(CONTRACT_FIELDS)} 个字段，还差 {len(missing)} 块"
    else:
        level = "transitional"
        hint = f"当前是过渡版接口（{n}/{len(CONTRACT_FIELDS)} 个字段）"

    return {
        "level": level,
        "present": present,
        "missing": missing,
        "hint": hint,
    }
