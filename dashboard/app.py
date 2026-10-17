# app.py
"""错题管理与学情诊断看板。

运行：streamlit run dashboard/app.py

两个 Tab：
- 错题诊断：错在哪、消化了多少、哪个知识点最薄弱
- 专注与效率：时间投入了多少、产出了多少、哪天在假努力
"""

import streamlit as st

import api_client
from api_client import fetch_analysis
from charts import (
    radar_subject, bar_subject_mastery, bar_knowledge_points,
    funnel_mastery, line_review_trend, dual_axis_efficiency,
    line_focus_trend, pie_app_category, bar_group_compare,
)

st.set_page_config(page_title="错题管理与学情诊断", layout="wide")


def fmt_hours(seconds):
    return f"{seconds / 3600:.1f} 小时"


# ---------- 加载数据 ----------
with st.spinner("正在加载数据..."):
    try:
        data = fetch_analysis()
    except Exception as e:
        st.error(f"数据加载失败：{e}")
        st.stop()

summary = data["summary"]
group = data["group_comparison"]
err = data["error_stats"]
efficiency = data["efficiency_trend"]

st.title("📚 错题管理与学情诊断")
st.caption(
    f"🖥 设备：{data['device_id']}　"
    f"🗓 数据范围：{data['period']['start'][:10]} ~ {data['period']['end'][:10]}"
)

# ---------- 数据来源状态 ----------
_status = api_client.LAST_STATUS
if _status["source"] == "api":
    st.success(f"🔗 已连接后端　{_status['url']}")
    for _w in _status["warnings"]:
        st.warning(f"⚠️ {_w}")
elif _status["source"] == "fallback":
    NL = chr(10)
    st.warning(
        "🔌 后端未连通，当前显示演示数据" + NL + NL
        + "原因：" + str(_status["detail"]) + NL + NL
        + "后端启动后刷新页面即可自动切换。"
    )
else:
    st.info("📦 当前显示演示数据（mock）")

tab_error, tab_focus = st.tabs(["📕 错题诊断", "⏱ 专注与效率"])


# ==========================================================
# Tab 1：错题诊断
# ==========================================================
with tab_error:
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("累计错题", f"{err['total_errors']} 道")
    c2.metric("已掌握", f"{err['mastered_errors']} 道")
    c3.metric("待复习", f"{err['reviewing_errors']} 道")
    c4.metric("掌握率", f"{err['mastery_rate']}%")

    st.divider()

    col_l, col_r = st.columns(2)
    with col_l:
        st.plotly_chart(radar_subject(data["subject_distribution"]),
                        use_container_width=True)
    with col_r:
        st.plotly_chart(bar_subject_mastery(data["subject_distribution"]),
                        use_container_width=True)

    col_l2, col_r2 = st.columns([3, 2])
    with col_l2:
        st.plotly_chart(bar_knowledge_points(data["knowledge_points"]),
                        use_container_width=True)
    with col_r2:
        st.plotly_chart(funnel_mastery(err), use_container_width=True)

    st.plotly_chart(line_review_trend(data["review_trend"]),
                    use_container_width=True)

    # ---------- 诊断结论 ----------
    st.subheader("🩺 诊断结论")
    subjects = data["subject_distribution"]
    points = data["knowledge_points"]

    if subjects:
        weakest = max(subjects, key=lambda s: s["error_count"])
        slowest = min(subjects, key=lambda s: s["mastery_rate"])
        st.write(
            f"- 错题最多的是 **{weakest['subject']}**，"
            f"累计 {weakest['error_count']} 道，"
            f"已掌握 {weakest['mastered_count']} 道。"
        )
        st.write(
            f"- 消化最慢的是 **{slowest['subject']}**，"
            f"掌握率 {slowest['mastery_rate']}%，优先安排复盘。"
        )
    else:
        st.write("- 后端还没给出分科数据，暂时无法判断偏科情况。")

    if points:
        top_point = points[0]
        st.write(
            f"- 最薄弱的知识点是 **{top_point['subject']} · "
            f"{top_point['knowledge_point']}**，错了 {top_point['error_count']} 次。"
        )
    else:
        st.write("- 后端还没给出知识点明细，薄弱项待补充。")


# ==========================================================
# Tab 2：专注与效率
# ==========================================================
with tab_focus:
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("累计专注", fmt_hours(summary["total_duration_seconds"]))
    c2.metric("日均", fmt_hours(summary["avg_daily_seconds"]))
    c3.metric("中位数", fmt_hours(summary["median_daily_seconds"]))
    c4.metric("P90", fmt_hours(summary["p90_daily_seconds"]))

    st.divider()

    st.plotly_chart(dual_axis_efficiency(efficiency), use_container_width=True)

    col_l, col_r = st.columns(2)
    with col_l:
        st.plotly_chart(line_focus_trend(data["trend"]), use_container_width=True)
    with col_r:
        st.plotly_chart(pie_app_category(data["app_ranking"]),
                        use_container_width=True)

    st.plotly_chart(bar_group_compare(summary, group), use_container_width=True)
    if group["group_size"] > 0:
        st.info(
            f"你在群体中排名：第 **{group['my_rank']}** 名 / "
            f"共 **{group['group_size']}** 人"
        )

    # ---------- 效率诊断 ----------
    st.subheader("🩺 效率诊断")
    tips = []

    for day in efficiency:
        hours = day["focus_hours"]
        resolved = day["resolved_errors"]
        if hours >= 3 and resolved < 3:
            tips.append(
                f"**{day['date']}** 专注 {hours} 小时，只消灭 {resolved} 道错题，"
                f"投入产出偏低，警惕假努力。"
            )

    total_hours = sum(d["focus_hours"] for d in efficiency)
    total_resolved = sum(d["resolved_errors"] for d in efficiency)
    if not efficiency:
        tips.append("后端还没给出专注时长，效率诊断暂时无法进行。")
    if total_hours > 0:
        per_hour = total_resolved / total_hours
        tips.append(
            f"近 {len(efficiency)} 天平均每投入 1 小时，消灭 {per_hour:.1f} 道错题。"
        )

    if not tips:
        tips.append("投入与产出基本匹配，保持当前节奏。")

    for t in tips:
        st.write(f"- {t}")

st.divider()
st.caption("数据来源：后端 /api/v1/devices/{device_id}/analysis（当前为 mock）")
