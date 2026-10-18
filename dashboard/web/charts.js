/* charts.js — ECharts 配置
 *
 * 每个函数收数据、返回一份 ECharts option。
 * 渲染与 Tab 切换交给 app.js。
 */
(function () {
  var PALETTE = ["#5b7cfa", "#67c23a", "#f5a623", "#f56c6c", "#9b59b6", "#14b8a6"];
  var FONT = '"Microsoft YaHei", system-ui, sans-serif';

  function base() {
    return {
      color: PALETTE,
      textStyle: { fontFamily: FONT },
      tooltip: { confine: true }
    };
  }

  window.Charts = {

    radarError: function (subjects) {
      var maxVal = Math.max.apply(null, subjects.map(function (x) { return x.error_count; })) * 1.2;
      var indicator = subjects.map(function (s) {
        return { name: s.subject, max: maxVal };
      });
      return Object.assign(base(), {
        tooltip: { trigger: "item", confine: true },
        radar: {
          indicator: indicator,
          radius: "62%",
          axisName: { color: "#374151", fontSize: 12 },
          splitLine: { lineStyle: { color: "#eef1f7" } },
          splitArea: { areaStyle: { color: ["#fff", "#fafbfe"] } },
          axisLine: { lineStyle: { color: "#e5e9f2" } }
        },
        series: [{
          type: "radar",
          areaStyle: { color: "rgba(91,124,250,.22)" },
          lineStyle: { color: "#5b7cfa", width: 2 },
          data: [{
            value: subjects.map(function (s) { return s.error_count; }),
            name: "错题数"
          }]
        }]
      });
    },

    barSubjectMastery: function (subjects) {
      return Object.assign(base(), {
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, confine: true },
        legend: { data: ["已掌握", "待复习"], bottom: 0, icon: "circle",
                  textStyle: { color: "#6b7280", fontSize: 12 } },
        grid: { left: 48, right: 24, top: 24, bottom: 56 },
        xAxis: {
          type: "category",
          data: subjects.map(function (s) { return s.subject; }),
          axisLine: { lineStyle: { color: "#dfe4ee" } },
          axisLabel: { color: "#6b7280", fontSize: 11 }
        },
        yAxis: {
          type: "value",
          splitLine: { lineStyle: { color: "#eef1f7" } },
          axisLabel: { color: "#6b7280", fontSize: 11 }
        },
        series: [
          {
            name: "已掌握", type: "bar", stack: "total", barWidth: 26,
            itemStyle: { color: "#67c23a" },
            data: subjects.map(function (s) { return s.mastered_count; })
          },
          {
            name: "待复习", type: "bar", stack: "total",
            itemStyle: { color: "#f5a623", borderRadius: [6, 6, 0, 0] },
            data: subjects.map(function (s) { return s.reviewing_count; })
          }
        ]
      });
    },

    barKnowledge: function (points, topN) {
      var n = topN || 10;
      var list = points.slice(0, n).reverse();
      var names = list.map(function (p) { return p.subject + " · " + p.knowledge_point; });
      var values = list.map(function (p) { return p.error_count; });

      return Object.assign(base(), {
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, confine: true },
        grid: { left: 132, right: 48, top: 16, bottom: 32 },
        xAxis: {
          type: "value",
          splitLine: { lineStyle: { color: "#eef1f7" } },
          axisLabel: { color: "#6b7280", fontSize: 11 }
        },
        yAxis: {
          type: "category",
          data: names,
          axisLine: { lineStyle: { color: "#dfe4ee" } },
          axisLabel: { color: "#374151", fontSize: 11 }
        },
        series: [{
          type: "bar",
          barWidth: 14,
          itemStyle: { color: "#f56c6c", borderRadius: [0, 6, 6, 0] },
          label: { show: true, position: "right", formatter: "{c}",
                   color: "#6b7280", fontSize: 11 },
          data: values
        }]
      });
    },

    funnelMastery: function (stats) {
      return Object.assign(base(), {
        tooltip: { trigger: "item", formatter: "{b}：{c} 道", confine: true },
        series: [{
          type: "funnel",
          left: "12%", right: "12%", top: 24, bottom: 16,
          minSize: "32%",
          gap: 4,
          label: { show: true, position: "inside", color: "#fff",
                   fontSize: 12, formatter: "{b} {c} 道" },
          itemStyle: { borderWidth: 0 },
          data: [
            { value: stats.total_errors, name: "累计错题",
              itemStyle: { color: "#5b7cfa" } },
            { value: stats.mastered_errors, name: "已掌握",
              itemStyle: { color: "#67c23a" } }
          ]
        }]
      });
    },

    barReview: function (trend) {
      return Object.assign(base(), {
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, confine: true },
        legend: { data: ["新增错题", "消灭错题"], bottom: 0, icon: "circle",
                  textStyle: { color: "#6b7280", fontSize: 12 } },
        grid: { left: 44, right: 24, top: 24, bottom: 56 },
        xAxis: {
          type: "category",
          data: trend.map(function (d) { return d.date.slice(5); }),
          axisLine: { lineStyle: { color: "#dfe4ee" } },
          axisLabel: { color: "#6b7280", fontSize: 11 }
        },
        yAxis: {
          type: "value",
          splitLine: { lineStyle: { color: "#eef1f7" } },
          axisLabel: { color: "#6b7280", fontSize: 11 }
        },
        series: [
          {
            name: "新增错题", type: "bar", barWidth: 12,
            itemStyle: { color: "#f56c6c", borderRadius: [4, 4, 0, 0] },
            data: trend.map(function (d) { return d.new_added; })
          },
          {
            name: "消灭错题", type: "bar", barWidth: 12,
            itemStyle: { color: "#67c23a", borderRadius: [4, 4, 0, 0] },
            data: trend.map(function (d) { return d.resolved; })
          }
        ]
      });
    },

    dualAxis: function (eff) {
      return Object.assign(base(), {
        tooltip: { trigger: "axis", confine: true },
        legend: { data: ["专注时长", "消灭错题"], bottom: 0, icon: "circle",
                  textStyle: { color: "#6b7280", fontSize: 12 } },
        grid: { left: 52, right: 52, top: 30, bottom: 60 },
        xAxis: {
          type: "category",
          data: eff.map(function (d) { return d.date.slice(5); }),
          axisLine: { lineStyle: { color: "#dfe4ee" } },
          axisLabel: { color: "#6b7280", fontSize: 11 }
        },
        yAxis: [
          {
            type: "value", name: "小时",
            nameTextStyle: { color: "#9aa3b2", fontSize: 11 },
            splitLine: { lineStyle: { color: "#eef1f7" } },
            axisLabel: { color: "#6b7280", fontSize: 11 }
          },
          {
            type: "value", name: "道",
            nameTextStyle: { color: "#9aa3b2", fontSize: 11 },
            splitLine: { show: false },
            axisLabel: { color: "#6b7280", fontSize: 11 }
          }
        ],
        series: [
          {
            name: "专注时长", type: "bar", yAxisIndex: 0, barWidth: 20,
            itemStyle: { color: "rgba(91,124,250,.55)", borderRadius: [5, 5, 0, 0] },
            data: eff.map(function (d) { return d.focus_hours; })
          },
          {
            name: "消灭错题", type: "line", yAxisIndex: 1, smooth: true,
            symbolSize: 8,
            lineStyle: { color: "#67c23a", width: 3 },
            itemStyle: { color: "#67c23a" },
            data: eff.map(function (d) { return d.resolved_errors; })
          }
        ]
      });
    },

    lineFocus: function (trend) {
      return Object.assign(base(), {
        tooltip: { trigger: "axis", confine: true },
        grid: { left: 50, right: 24, top: 24, bottom: 36 },
        xAxis: {
          type: "category", boundaryGap: false,
          data: trend.map(function (d) { return d.date.slice(5); }),
          axisLine: { lineStyle: { color: "#dfe4ee" } },
          axisLabel: { color: "#6b7280", fontSize: 11 }
        },
        yAxis: {
          type: "value", name: "小时",
          nameTextStyle: { color: "#9aa3b2", fontSize: 11 },
          splitLine: { lineStyle: { color: "#eef1f7" } },
          axisLabel: { color: "#6b7280", fontSize: 11 }
        },
        series: [{
          type: "line", smooth: true, symbolSize: 7,
          lineStyle: { color: "#5b7cfa", width: 3 },
          areaStyle: {
            color: {
              type: "linear", x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(91,124,250,.28)" },
                { offset: 1, color: "rgba(91,124,250,.02)" }
              ]
            }
          },
          data: trend.map(function (d) {
            return Math.round(d.total_duration_seconds / 36) / 100;
          })
        }]
      });
    },


    barGroup: function (summary, group) {
      var me = [summary.avg_daily_seconds, summary.median_daily_seconds, summary.p90_daily_seconds]
        .map(function (v) { return Math.round(v / 36) / 100; });
      var gp = [group.group_avg_daily_seconds, group.group_median_daily_seconds, group.group_p90_daily_seconds]
        .map(function (v) { return Math.round(v / 36) / 100; });

      return Object.assign(base(), {
        tooltip: { trigger: "axis", confine: true },
        legend: { data: ["我", "群体"], bottom: 0, icon: "circle",
                  textStyle: { color: "#6b7280", fontSize: 12 } },
        grid: { left: 52, right: 24, top: 24, bottom: 56 },
        xAxis: {
          type: "category", data: ["日均", "中位数", "P90"],
          axisLine: { lineStyle: { color: "#dfe4ee" } },
          axisLabel: { color: "#374151", fontSize: 12 }
        },
        yAxis: {
          type: "value", name: "小时",
          nameTextStyle: { color: "#9aa3b2", fontSize: 11 },
          splitLine: { lineStyle: { color: "#eef1f7" } },
          axisLabel: { color: "#6b7280", fontSize: 11 }
        },
        series: [
          {
            name: "我", type: "bar", barWidth: 24,
            itemStyle: { color: "#5b7cfa", borderRadius: [5, 5, 0, 0] },
            data: me
          },
          {
            name: "群体", type: "bar", barWidth: 24,
            itemStyle: { color: "#c7d0e8", borderRadius: [5, 5, 0, 0] },
            data: gp
          }
        ]
      });
    }
  };
})();
