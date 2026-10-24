/* app.js — 数据获取、Tab 切换、渲染、诊断结论
 *
 * 数据来源由 config.js 的 USE_MOCK 决定：
 *   true  → mock-data.js
 *   false → 后端 /api/v1/devices/{device_id}/analysis
 */
(function () {
  "use strict";

  var cfg = window.CONFIG || {};
  var chartInstances = [];
  var rendered = { error: false, focus: false };
  var DATA = null;

  // URL 参数优先，便于直接分享某个设备/数据源：
  //   ?device_id=android_emulator_01&source=api
  var query = new URLSearchParams(window.location.search);
  var querySource = query.get("source");
  var queryDevice = query.get("device_id");
  if (querySource === "mock" || querySource === "api") {
    cfg.USE_MOCK = querySource === "mock";
  }
  if (queryDevice) {
    cfg.DEVICE_ID = queryDevice;
  }

  function fmtHours(sec) {
    return (sec / 3600).toFixed(1) + " 小时";
  }

  function toHours(sec) {
    return Math.round(sec / 36) / 100;
  }

  /* ---------- 取数据 ---------- */
  function fetchWithTimeout(url, ms) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, ms);
    return fetch(url, { signal: ctrl.signal }).then(function (resp) {
      clearTimeout(timer);
      if (!resp.ok) { throw new Error("HTTP " + resp.status); }
      return resp.json();
    });
  }

  // 当前数据来源：mock / api / fallback
  var sourceInfo = { kind: "mock", url: "" };

  function mockFallback(reason) {
    if (!cfg.FALLBACK_TO_MOCK) {
      return Promise.reject(new Error(reason));
    }
    sourceInfo = { kind: "fallback", url: reason };
    return Promise.resolve(window.MOCK_DATA);
  }

  function getData() {
    if (cfg.USE_MOCK) {
      sourceInfo = { kind: "mock", url: "" };
      return Promise.resolve(window.MOCK_DATA);
    }

    // 配了就用配的；留空则按同源推导，手机 WebView 里也能直接用
    var base = (cfg.API_BASE_URL || "").replace(/\/$/, "");
    if (!base) {
      var origin = (window.location && window.location.origin) || "";
      base = origin && origin !== "null" ? origin + "/api/v1" : "/api/v1";
    }
    var dev = encodeURIComponent(cfg.DEVICE_ID);
    var days = cfg.DAYS;
    // 正式契约排最前，过渡版垫底
    var candidates = [
      base + "/devices/" + dev + "/analysis?days=" + days,
      base + "/devices/" + dev + "/analysis",
      base + (cfg.ANALYSIS_PATH || "/analysis") + "?days=" + days,
      base + "/analysis"
    ];

    // 去重后按顺序试，前一个失败再试下一个
    var seen = {};
    candidates = candidates.filter(function (u) {
      if (seen[u]) { return false; }
      seen[u] = 1;
      return true;
    });

    function attempt(i) {
      if (i >= candidates.length) {
        return mockFallback("所有候选路径都失败");
      }
      var url = candidates[i];
      return fetchWithTimeout(url, cfg.TIMEOUT || 10000)
        .then(function (raw) {
          sourceInfo = { kind: "api", url: url };
          return raw;
        })
        .catch(function () {
          return attempt(i + 1);
        });
    }

    return attempt(0);
  }

  /* ---------- 数据归一化 ---------- */
  // mock-data.js 和旧版后端的 knowledge_points 只有 error_count，
  // 缺 mastered_count / reviewing_count，直接渲染会出现「还有 undefined 道」，
  // 重做清单也会空掉。这里统一补齐，字段缺失时按总数反推。
  function normalizeData(d) {
    if (!d) { return d; }

    (d.knowledge_points || []).forEach(function (p) {
      var total = Number(p.error_count) || 0;
      var mastered = p.mastered_count == null ? 0 : Number(p.mastered_count);
      p.error_count = total;
      p.mastered_count = mastered;
      p.reviewing_count = p.reviewing_count == null
        ? Math.max(total - mastered, 0)
        : Number(p.reviewing_count) || 0;
    });

    (d.subject_distribution || []).forEach(function (s) {
      s.error_count = Number(s.error_count) || 0;
      s.mastered_count = Number(s.mastered_count) || 0;
      if (s.reviewing_count == null) {
        s.reviewing_count = Math.max(s.error_count - s.mastered_count, 0);
      }
      if (s.mastery_rate == null) {
        s.mastery_rate = s.error_count
          ? Math.round(s.mastered_count / s.error_count * 1000) / 10
          : 0;
      }
    });

    // 按待复习数降序，和「最该先处理」的说法保持一致
    if (d.knowledge_points && d.knowledge_points.length) {
      d.knowledge_points.sort(function (a, b) {
        return (b.reviewing_count - a.reviewing_count) ||
               (b.error_count - a.error_count);
      });
    }

    return d;
  }

  /* ---------- 图表容器 ---------- */
  function renderChart(id, option) {
    var el = document.getElementById(id);
    if (!el) { return; }
    var inst = echarts.getInstanceByDom(el) || echarts.init(el);
    inst.setOption(option, true);
    if (chartInstances.indexOf(inst) === -1) { chartInstances.push(inst); }
  }

  function resizeAll() {
    chartInstances.forEach(function (c) { c.resize(); });
  }

  /* ---------- 指标卡 ---------- */
  // tone 用来区分指标语义：ok=已掌握、warn=待复习、key=核心比率
  function card(label, value, tone) {
    var cls = "card" + (tone ? " tone-" + tone : "");
    return '<div class="' + cls + '"><div class="label">' + label +
           '</div><div class="value">' + value + "</div></div>";
  }

  function renderMetrics(elId, items) {
    var el = document.getElementById(elId);
    if (!el) { return; }
    el.innerHTML = items.map(function (kv) { return card(kv[0], kv[1], kv[2]); }).join("");
  }

  function renderTips(elId, tips) {
    var el = document.getElementById(elId);
    if (!el) { return; }
    el.innerHTML = tips.map(function (t) { return "<li>" + t + "</li>"; }).join("");
  }

  /* ---------- 重做清单 ---------- */
  function buildRedoPlan(points, limit) {
    if (!points || !points.length) { return []; }

    // 只排还有题没消化的。全部掌握的不再占清单。
    var pending = points.filter(function (p) {
      return (p.reviewing_count || 0) > 0;
    });
    var sorted = pending.slice().sort(function (a, b) {
      var d = (b.reviewing_count || 0) - (a.reviewing_count || 0);
      if (d !== 0) { return d; }
      return (b.error_count || 0) - (a.error_count || 0);
    }).slice(0, limit || 5);

    return sorted.map(function (p, i) {
      var n = p.reviewing_count || 0;
      var total = p.error_count || n;
      var suggest, reason;
      if (n >= 10) {
        suggest = Math.min(n, 10);
        reason = "还有 " + n + " 道没消化，建议整块重做";
      } else if (n >= 5) {
        suggest = n;
        reason = "反复出错，建议逐题重做";
      } else {
        suggest = Math.max(n, 1);
        reason = "偶发错误，做一遍巩固即可";
      }
      var level = n >= 10 ? "high" : (n >= 5 ? "mid" : "low");
      return {
        order: i + 1,
        subject: p.subject || "",
        point: p.knowledge_point || "",
        count: n,
        total: total,
        suggest: suggest,
        reason: reason,
        level: level
      };
    });
  }

  function renderRedo(plan) {
    var box = document.getElementById("redo-list");
    var totalEl = document.getElementById("redo-total");
    if (!box) { return; }

    if (!plan.length) {
      box.innerHTML = '<p class="note">还没有知识点数据，等错题录入后这里会生成清单。</p>';
      if (totalEl) { totalEl.textContent = ""; }
      return;
    }

    box.innerHTML = plan.map(function (it) {
      var cls = "redo-item" + (it.level === "mid" ? " level-mid"
                : (it.level === "low" ? " level-low" : ""));
      return '<div class="' + cls + '">' +
             '<span class="idx">' + it.order + '</span>' +
             '<span class="kp"><b>' + it.subject + '</b> · ' + it.point + '</span>' +
             '<span class="num">待复习 <strong>' + it.count + '</strong> 道' +
             '（累计 ' + it.total + '） → 重做 <strong>' + it.suggest + '</strong> 道</span>' +
             '<span class="badge-reason">' + it.reason + '</span>' +
             '</div>';
    }).join("");

    var total = plan.reduce(function (s, x) { return s + x.suggest; }, 0);
    if (totalEl) {
      totalEl.textContent = "合计建议重做 " + total + " 道。先做第 1 条，做完再看下一条。";
    }
  }

  /* ---------- Tab 切换 ---------- */
  function switchTab(name) {
    document.querySelectorAll(".tab").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.tab === name);
    });
    document.querySelectorAll(".tab-panel").forEach(function (p) {
      p.classList.toggle("active", p.id === "panel-" + name);
    });
    // 首次显示时再绘制，避免隐藏容器尺寸为 0
    if (!rendered[name]) {
      rendered[name] = true;
      if (name === "error") { renderErrorTab(); } else { renderFocusTab(); }
    }
    resizeAll();
  }

  /* ---------- 渲染：错题诊断 ---------- */
  function renderErrorTab() {
    var d = DATA;
    var err = d.error_stats;

    renderMetrics("error-metrics", [
      ["累计错题", err.total_errors + " 道", ""],
      ["已掌握", err.mastered_errors + " 道", "ok"],
      ["待复习", err.reviewing_errors + " 道", "warn"],
      ["掌握率", err.mastery_rate + "%", "key"]
    ]);

    renderChart("chart-radar", window.Charts.radarError(d.subject_distribution));
    renderChart("chart-subject-mastery", window.Charts.barSubjectMastery(d.subject_distribution));
    renderChart("chart-knowledge", window.Charts.barKnowledge(d.knowledge_points, 10));
    renderChart("chart-funnel", window.Charts.funnelMastery(err));
    renderChart("chart-review", window.Charts.barReview(d.review_trend));

    // 字段名对齐后端正式契约：subject_distribution / knowledge_points
    var subjects = d.subject_distribution || [];
    var points = d.knowledge_points || [];
    var tips = [];

    if (subjects.length) {
      var weakest = subjects.reduce(function (a, b) {
        return a.error_count >= b.error_count ? a : b;
      });
      var slowest = subjects.reduce(function (a, b) {
        return a.mastery_rate <= b.mastery_rate ? a : b;
      });
      tips.push(
        "错题最多的是 <b>" + weakest.subject + "</b>，累计 " + weakest.error_count +
          " 道，已掌握 " + weakest.mastered_count + " 道。"
      );
      tips.push(
        "消化最慢的是 <b>" + slowest.subject + "</b>，掌握率 " + slowest.mastery_rate +
          "%，优先安排复盘。"
      );
    }

    // knowledge_points 按待复习数降序，取第一条就是最该先处理的
    if (points.length) {
      var top = points[0];
      tips.push(
        "最该先处理的是 <b>" + top.subject + " · " + top.knowledge_point + "</b>，" +
          "还有 " + top.reviewing_count + " 道没消化（累计错 " + top.error_count + " 道）。"
      );
    }

    if (!tips.length) {
      tips.push("还没有错题数据，先去手机端录一道题试试。");
    }

    renderTips("error-tips", tips);
    renderRedo(buildRedoPlan(points, 5));
  }

  /* ---------- 渲染：专注与效率 ---------- */
  function renderFocusTab() {
    var d = DATA;
    var s = d.summary;

    renderMetrics("focus-metrics", [
      ["累计专注", fmtHours(s.total_duration_seconds), "key"],
      ["日均", fmtHours(s.avg_daily_seconds), ""],
      ["中位数", fmtHours(s.median_daily_seconds), ""],
      ["P90", fmtHours(s.p90_daily_seconds), ""]
    ]);

    renderChart("chart-dual", window.Charts.dualAxis(d.efficiency_trend));
    renderChart("chart-focus-line", window.Charts.lineFocus(d.trend));
    renderChart("chart-group", window.Charts.barGroup(d.summary, d.group_comparison));

    var g = d.group_comparison;
    document.getElementById("rank-note").textContent =
      "你在群体中排名：第 " + g.my_rank + " 名 / 共 " + g.group_size + " 人";

    var eff = d.efficiency_trend;
    var tips = [];
    eff.forEach(function (day) {
      if (day.focus_hours >= 3 && day.resolved_errors < 3) {
        tips.push("<b>" + day.date + "</b> 专注 " + day.focus_hours +
          " 小时，只消灭 " + day.resolved_errors +
          " 道错题，投入产出偏低，警惕假努力。");
      }
    });

    var totalHours = eff.reduce(function (a, x) { return a + x.focus_hours; }, 0);
    var totalResolved = eff.reduce(function (a, x) { return a + x.resolved_errors; }, 0);
    if (totalHours > 0) {
      tips.push("近 " + eff.length + " 天平均每投入 1 小时，消灭 " +
        (totalResolved / totalHours).toFixed(1) + " 道错题。");
    }
    if (tips.length === 0) {
      tips.push("投入与产出基本匹配，保持当前节奏。");
    }
    renderTips("focus-tips", tips);
  }

  /* ---------- 页头与页脚 ---------- */
  function renderMeta() {
    var p = DATA.period || {};
    document.getElementById("meta-line").textContent =
      "🖥 设备：" + DATA.device_id +
      "　🗓 数据范围：" + String(p.start || "-").slice(0, 10) +
      " ~ " + String(p.end || "-").slice(0, 10);

    var badge = document.getElementById("source-badge");
    var kind = sourceInfo.kind;
    if (kind === "api") {
      badge.textContent = "🔗 已连接后端";
      badge.className = "badge real";
    } else if (kind === "fallback") {
      badge.textContent = "🔌 后端未连通 · 演示数据";
      badge.className = "badge err";
    } else {
      badge.textContent = "📦 演示数据（mock）";
      badge.className = "badge";
    }

    var foot = document.getElementById("footer");
    if (kind === "api") {
      foot.textContent = "数据来源：" + sourceInfo.url;
    } else if (kind === "fallback") {
      foot.textContent = "后端未连通（" + sourceInfo.url +
        "），当前显示演示数据。后端启动后刷新页面即可自动切换。";
    } else {
      foot.textContent = "数据来源：本地 mock-data.js";
    }
  }

  function showError(msg) {
    var badge = document.getElementById("source-badge");
    badge.textContent = "加载失败";
    badge.className = "badge err";
    document.getElementById("meta-line").textContent = msg;
    var t = document.getElementById("error-tips");
    if (t) { t.innerHTML = "<li>数据加载失败：" + msg + "</li>"; }
  }

  /* ---------- 数据源切换 ---------- */
  function ensureOption(select, value) {
    if (!select || !value) { return; }
    for (var i = 0; i < select.options.length; i += 1) {
      if (select.options[i].value === value) { return; }
    }
    var option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }

  function setupSourceControls() {
    var deviceSelect = document.getElementById("device-select");
    var sourceSelect = document.getElementById("source-select");
    if (!deviceSelect || !sourceSelect) { return; }

    ensureOption(deviceSelect, cfg.DEVICE_ID);
    deviceSelect.value = cfg.DEVICE_ID;
    sourceSelect.value = cfg.USE_MOCK ? "mock" : "api";

    function reloadWithSelection() {
      var params = new URLSearchParams(window.location.search);
      params.set("device_id", deviceSelect.value);
      params.set("source", sourceSelect.value);
      window.location.search = params.toString();
    }

    deviceSelect.addEventListener("change", reloadWithSelection);
    sourceSelect.addEventListener("change", reloadWithSelection);
  }

  /* ---------- 启动 ---------- */
  function boot() {
    if (!document.getElementById("error-tips")) { return; }

    setupSourceControls();

    document.querySelectorAll(".tab").forEach(function (btn) {
      btn.addEventListener("click", function () { switchTab(btn.dataset.tab); });
    });

    getData().then(function (raw) {
      DATA = normalizeData(raw);
      renderMeta();
      // 按当前激活的 Tab 渲染，避免只认死错题面板
      var active = document.querySelector(".tab.active");
      var initial = active ? active.dataset.tab : "error";
      rendered[initial] = true;
      if (initial === "error") { renderErrorTab(); } else { renderFocusTab(); }
    }).catch(function (e) {
      showError(e && e.message ? e.message : String(e));
    });

    window.addEventListener("resize", resizeAll);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  /* 暴露给测试脚本 */
  window.__switchTab = switchTab;
})();
