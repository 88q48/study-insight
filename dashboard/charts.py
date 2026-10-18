# charts.py
"""图表函数：每个函数收 JSON 片段，返回 plotly figure。

分两类：
- 错题诊断（错题分布、掌握进度、知识点薄弱项）
- 专注与效率（专注时长趋势、时长 vs 产出双轴图）
"""

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots


def _empty_figure(message, title="暂无数据"):
    """数据为空时给一张带说明的空图，避免整页崩掉。"""
    fig = go.Figure()
    fig.add_annotation(
        text=message, x=0.5, y=0.5, xref="paper", yref="paper",
        showarrow=False, font=dict(size=14, color="#9aa3b2"),
    )
    fig.update_layout(
        title=title,
        xaxis=dict(visible=False),
        yaxis=dict(visible=False),
        margin=dict(l=20, r=20, t=50, b=20),
    )
    return fig


# ==========================================================
# 一、错题诊断
# ==========================================================

def radar_subject(subject_distribution):
    """各科错题分布雷达图，一眼看出偏科。"""
    if not subject_distribution:
        return _empty_figure("后端还没提供分科数据", "各科错题分布")
    df = pd.DataFrame(subject_distribution)
    # 雷达图要闭合，把第一个点接到末尾
    df_closed = pd.concat([df, df.iloc[[0]]], ignore_index=True)

    fig = px.line_polar(
        df_closed, r="error_count", theta="subject", line_close=True,
        title="各科错题分布（看偏科）",
    )
    fig.update_traces(fill="toself", line_color="#5b7cfa")
    fig.update_layout(
        polar=dict(radialaxis=dict(visible=True, showticklabels=False)),
        margin=dict(l=40, r=40, t=50, b=30),
    )
    return fig


def bar_subject_mastery(subject_distribution):
    """各科掌握进度：错题总量 vs 已掌握。"""
    if not subject_distribution:
        return _empty_figure("后端还没提供分科数据", "各科错题消化进度")
    df = pd.DataFrame(subject_distribution)
    fig = go.Figure()
    fig.add_trace(go.Bar(
        name="已掌握", x=df["subject"], y=df["mastered_count"],
        marker_color="#67c23a",
    ))
    fig.add_trace(go.Bar(
        name="待复习", x=df["subject"], y=df["reviewing_count"],
        marker_color="#f5a623",
    ))
    fig.update_layout(
        barmode="stack",
        title="各科错题消化进度",
        xaxis_title="科目", yaxis_title="错题数",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, x=0),
        margin=dict(l=40, r=20, t=70, b=40),
    )
    return fig


def bar_knowledge_points(knowledge_points, top_n=10):
    """知识点薄弱榜 Top N。"""
    if not knowledge_points:
        return _empty_figure("后端还没提供知识点数据", "知识点薄弱榜")
    df = pd.DataFrame(knowledge_points).head(top_n)
    df = df.sort_values("error_count")
    label = df["subject"] + " · " + df["knowledge_point"]

    fig = px.bar(
        df, x="error_count", y=label, orientation="h",
        title=f"知识点薄弱榜 Top {min(top_n, len(df))}",
        labels={"error_count": "错题数", "y": "知识点"},
        color="error_count", color_continuous_scale="OrRd",
    )
    fig.update_layout(
        yaxis_title="",
        coloraxis_showscale=False,
        margin=dict(l=150, r=30, t=50, b=40),
    )
    return fig


def funnel_mastery(error_stats):
    """错题消化漏斗：累计 → 已掌握。"""
    fig = go.Figure(go.Funnel(
        y=["累计错题", "已掌握"],
        x=[error_stats["total_errors"], error_stats["mastered_errors"]],
        textinfo="value+percent initial",
        marker=dict(color=["#5b7cfa", "#67c23a"]),
    ))
    fig.update_layout(
        title=f"错题消化漏斗（掌握率 {error_stats['mastery_rate']}%）",
        margin=dict(l=40, r=40, t=60, b=30),
    )
    return fig


def line_review_trend(review_trend):
    """每日新增 vs 消灭错题。"""
    if not review_trend:
        return _empty_figure("后端还没提供每日复习数据", "每日新增 vs 消灭")
    df = pd.DataFrame(review_trend)
    fig = go.Figure()
    fig.add_trace(go.Bar(
        name="新增错题", x=df["date"], y=df["new_added"],
        marker_color="#f56c6c",
    ))
    fig.add_trace(go.Bar(
        name="消灭错题", x=df["date"], y=df["resolved"],
        marker_color="#67c23a",
    ))
    fig.update_layout(
        barmode="group",
        title="每日新增 vs 消灭",
        xaxis_title="日期", yaxis_title="错题数",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, x=0),
        margin=dict(l=40, r=20, t=70, b=40),
    )
    return fig


# ==========================================================
# 二、专注与效率
# ==========================================================

def dual_axis_efficiency(efficiency_trend):
    """专注时长（柱）vs 消灭错题（线）——识别「假努力」的核心图。"""
    if not efficiency_trend:
        return _empty_figure(
            "缺少专注时长或错题数据，无法对比" + chr(10)
            + "等后端补齐 trend / review_trend 后会自动出图",
            "专注时长 vs 错题产出",
        )
    df = pd.DataFrame(efficiency_trend)

    fig = make_subplots(specs=[[{"secondary_y": True}]])

    fig.add_trace(
        go.Bar(
            name="专注时长", x=df["date"], y=df["focus_hours"],
            marker_color="rgba(91,124,250,.55)",
        ),
        secondary_y=False,
    )
    fig.add_trace(
        go.Scatter(
            name="消灭错题", x=df["date"], y=df["resolved_errors"],
            mode="lines+markers",
            line=dict(color="#67c23a", width=3), marker=dict(size=9),
        ),
        secondary_y=True,
    )

    fig.update_layout(
        title="专注时长 vs 错题产出（柱子高、折线低 = 值得警惕）",
        xaxis_title="日期",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, x=0),
        margin=dict(l=50, r=50, t=80, b=40),
    )
    fig.update_yaxes(title_text="专注时长（小时）", secondary_y=False)
    fig.update_yaxes(title_text="消灭错题（道）", secondary_y=True)
    return fig


def line_focus_trend(trend):
    """每日专注时长趋势（原「使用时长」改口径为学习类专注时长）。"""
    if not trend:
        return _empty_figure("后端还没提供每日专注时长", "每日专注时长趋势")
    df = pd.DataFrame(trend)
    df["hours"] = df["total_duration_seconds"] / 3600

    fig = px.line(
        df, x="date", y="hours", markers=True,
        title="每日专注时长趋势",
        labels={"date": "日期", "hours": "专注时长（小时）"},
    )
    fig.update_traces(line_color="#5b7cfa", line_width=3)
    fig.update_layout(margin=dict(l=50, r=30, t=60, b=40))
    return fig


def bar_group_compare(summary, group_comparison):
    """个人 vs 群体的专注时长对比。"""
    metrics = ["日均", "中位数", "P90"]
    my_values = [
        summary["avg_daily_seconds"] / 3600,
        summary["median_daily_seconds"] / 3600,
        summary["p90_daily_seconds"] / 3600,
    ]
    group_values = [
        group_comparison["group_avg_daily_seconds"] / 3600,
        group_comparison["group_median_daily_seconds"] / 3600,
        group_comparison["group_p90_daily_seconds"] / 3600,
    ]

    df = pd.DataFrame({"指标": metrics, "我": my_values, "群体": group_values})
    fig = px.bar(
        df, x="指标", y=["我", "群体"], barmode="group",
        title="个人 vs 群体（专注时长）",
        labels={"value": "时长（小时）", "variable": "对象"},
    )
    fig.update_layout(margin=dict(l=40, r=20, t=60, b=40))
    return fig


# ==========================================================
# 三、重做清单
# ==========================================================

def build_redo_plan(knowledge_points, error_stats=None, limit=5):
    """把薄弱知识点变成一份能照着做的重做清单。

    看板只告诉人「错在哪」还不够，得说清「今天先做哪几道」。
    这里按错题数排序，给出每个知识点建议重做的数量。
    """
    if not knowledge_points:
        return []

    # 只排还有题没消化的知识点。
    # 已经全部掌握的不再占清单，否则做完题清单也不会变短。
    pending = [p for p in knowledge_points if p.get("reviewing_count", 0) > 0]
    points = sorted(
        pending,
        key=lambda x: (-x.get("reviewing_count", 0), -x.get("error_count", 0)),
    )[:limit]

    plan = []
    for i, p in enumerate(points, 1):
        n = p.get("reviewing_count", 0)
        total = p.get("error_count", n)

        if n >= 10:
            suggest = min(n, 10)
            reason = "还有 {n} 道没消化，建议整块重做".format(n=n)
        elif n >= 5:
            suggest = n
            reason = "反复出错，建议逐题重做"
        else:
            suggest = max(n, 1)
            reason = "偶发错误，做一遍巩固即可"

        plan.append({
            "order": i,
            "subject": p.get("subject", ""),
            "knowledge_point": p.get("knowledge_point", ""),
            "error_count": total,
            "reviewing_count": n,
            "suggest_count": suggest,
            "reason": reason,
        })

    return plan


def redo_plan_text(plan, error_stats=None):
    """把清单转成纯文本，方便复制到微信或备忘录。"""
    NL = chr(10)
    lines = ["今日重做清单", "=" * 20]

    if error_stats:
        lines.append(
            "累计错题 {t} 道，已掌握 {m} 道，待复习 {r} 道".format(
                t=error_stats.get("total_errors", 0),
                m=error_stats.get("mastered_errors", 0),
                r=error_stats.get("reviewing_errors", 0),
            )
        )
        lines.append("")

    for item in plan:
        lines.append(
            "{i}. {s} · {k}".format(
                i=item["order"], s=item["subject"], k=item["knowledge_point"]
            )
        )
        lines.append(
            "   待复习 {r} 道（累计错 {t} 道） → 建议重做 {n} 道（{rs}）".format(
                r=item.get("reviewing_count", item.get("error_count", 0)),
                t=item.get("error_count", 0),
                n=item["suggest_count"],
                rs=item["reason"],
            )
        )

    if plan:
        total = sum(x["suggest_count"] for x in plan)
        lines.append("")
        lines.append(
            "合计建议重做 {} 道。做完一条在手机上标记已掌握，清单就短一条。".format(total)
        )

    return NL.join(lines)
