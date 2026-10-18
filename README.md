# 📚 学情洞察 study-insight

> 学情洞察：基于错题掌握与专注投入双维度的学习诊断系统

把「错题摄入」与「专注投入」放在同一张表上对比，回答两个问题：
**错在哪、学得高不高效**。

## 目录结构

```
.
├── dashboard/        看板端：学情诊断看板
│   ├── app.py              Streamlit 主页面（两个 Tab）
│   ├── charts.py           图表函数（Plotly，9 张图）
│   ├── config.py           配置：API 地址、设备 ID、是否用 mock
│   ├── api_client.py       数据获取入口，mock / 真实 API 可切换
│   ├── mock_data.py        过程数据：应用使用时长、专注趋势
│   ├── error_mock.py       结果数据：错题、掌握率、复习进度
│   └── web/                静态网页（ECharts，双击即可打开）
│
├── windows/          客户端：Windows 采集
│   ├── app/
│   │   ├── database.py         SQLite 建表、应用表、会话表、设置表
│   │   └── usage_tracker.py    前台窗口识别、空闲检测、会话管理
│   └── tests/                  验证脚本
│
├── backend/          后端：接口服务
│   └── README.md           接口清单与上传格式
│
└── docs/
    └── api-fields.md       分析接口字段约定
```

## 🔗 和后端联调

后端跑在 **8010** 端口。联调只需改环境变量，不用动代码：

```bash
cd windows  # 或者任意目录
set SI_API=http://127.0.0.1:8010/api/v1
set SI_USE_MOCK=0
streamlit run dashboard/app.py
```

后端不在本机时，把 `127.0.0.1` 换成对方的内网 IP（如 `http://192.168.1.8:8010/api/v1`），
Windows 防火墙需要放行 8010。

### 当前状态（2026-10-18）

后端已按正式契约返回全部 11 个字段，看板实测通过：

```
🔗 已连接后端　http://127.0.0.1:8010/api/v1/devices/win_device_01/analysis?days=7
✅ 接口已符合正式契约（11 个字段齐全）
```

后端启动后会自动灌入演示数据（120 道错题、7 天使用记录），
无需手动 seed。

### 数据来源会自动识别

| 情况 | 页面表现 |
|---|---|
| `USE_MOCK=1`（默认） | 📦 演示数据 |
| 后端正常 | 🔗 已连接后端 + 实际请求地址 |
| 后端没开 | 🔌 后端未连通，自动退回演示数据，不会白屏 |

后端启动后刷新页面，会自动切到实时数据。

### 字段对不上怎么办

`dashboard/schema_adapter.py` 做了一层容错，下面这些写法都能识别：

| 看板要的 | 后端可以写 |
|---|---|
| `total_errors` | `totalErrors` / `total` / `total_error_count` |
| `subject` | `subjectName` / `name` |
| `mastery_rate` | `masteryRate` / `rate`，且 `0.625` 和 `62.5` 都行 |
| `date` | `day` / `stat_date` / `dt` |

外层包一层 `{"data": {...}}` 也能自动拆开。
如果 `efficiency_trend` 后端没给，会用 `trend` 和 `review_trend` 按日期拼出来。

### 自查命令

```bash
cd dashboard
python -c "import api_client; print(api_client.check_health())"
```

返回 `'status': 'ok'` 说明通了；`down` 就是没连上，提示里会写明卡在哪。

### 网页版注意

用 `file://` 双击打开时，浏览器会拦住对 `localhost` 的跨域请求。
联调请改用 http 方式：

```bash
cd dashboard/web
python -m http.server 8080
# 浏览器访问 http://127.0.0.1:8080
```

---

## 快速开始

### 静态网页

双击 `dashboard/web/index.html`，不需要安装任何东西。

页面分两个 Tab：

- **错题诊断**：累计错题、掌握率、各科分布雷达图、知识点薄弱榜、消化漏斗
- **专注与效率**：专注时长、时长 vs 产出双轴图、个人 vs 群体

连真实后端时改 `dashboard/web/config.js`：

```js
USE_MOCK: false,
API_BASE_URL: "http://localhost:8000/api/v1",
```

### Streamlit 看板

```bash
pip install -r requirements.txt
streamlit run dashboard/app.py
```

浏览器打开 `http://localhost:8501`，同样是两个 Tab。

### 生成网页用的 mock 数据

改动 `dashboard/mock_data.py` 或 `dashboard/error_mock.py` 之后重新生成：

```bash
python dashboard/web/gen_mock.py
```

### Windows 采集

采集核心在 `windows/app/`，`windows/` 作为包的根目录：

```bash
cd windows
python -m app.usage_tracker     # 启动采集，Ctrl+C 退出
```

数据库落在 `windows/tests/test_usage.db`（已在 .gitignore 里）。

### 跑验证

单元测试（会自动建临时库，不碰真实数据）：

```bash
python -m unittest windows.tests.test_database_module
python -m unittest windows.tests.test_usage_tracker
```

一次性脚本：

```bash
python windows/tests/test_database_write.py   # 写库并回读
python windows/tests/test.py                  # 前台窗口识别
python windows/tests/test_foreground.py       # 持续监听，Ctrl+C 退出
python windows/tests/test_idle.py             # 空闲检测，Ctrl+C 退出
python windows/tests/text_usage_timer.py      # 计时核心
```

### 采集模块做了什么

`app/database.py`：

- `applications` 应用表，`app_key` 唯一
- `usage_sessions` 会话表，带 `duration_seconds >= 0` 与时间先后约束
- `settings` 配置表，默认 `idle_threshold_seconds=60`
- 两个索引，分别加速按应用和按时间查询

`app/usage_tracker.py`：

- 用 `GetForegroundWindow` + `GetWindowThreadProcessId` 拿前台进程
- 用 `GetLastInputInfo` 判断空闲，超过阈值就停止计时
- 应用切换时关掉旧会话、开新会话
- 崩溃或断电留下的未结束会话，下次启动时自动收尾

## 数据流

```
Windows 客户端 ─┐
                ├─→ 后端 ─→ 学情诊断看板
安卓客户端    ─┘
```

客户端只管采集上传，错题与时长两套数据都由后端统一口径后返回。

## 两条分析主线

**错题维度**：错题总数、已掌握、待复习、掌握率、各科分布、知识点薄弱项、每日新增与消灭。

**效率维度**：把专注时长和消灭错题数放在同一张双轴图上。柱子高而折线低的日子，就是投入产出不匹配的日子，系统会点名提示。

## 仓库

仓库名 `study-insight`，地址见 GitHub 页面。

报名表要用的项目名称和简介，见 [`docs/project-intro.md`](docs/project-intro.md)。

演示怎么跑，见 [`docs/demo.md`](docs/demo.md)。

主开发分支是 `main`。早期的 `master` 与 `windows` 分支内容已并入 `main`，均已删除。
