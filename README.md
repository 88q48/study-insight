# 错题管理与学情诊断系统

把「错题摄入」与「专注投入」放在同一张表上对比，回答两个问题：
错在哪、学得高不高效。

## 目录结构

```
.
├── dashboard/        C 模块：学情诊断看板
│   ├── app.py              Streamlit 主页面（两个 Tab）
│   ├── charts.py           图表函数（Plotly，9 张图）
│   ├── config.py           配置：API 地址、设备 ID、是否用 mock
│   ├── api_client.py       数据获取入口，mock / 真实 API 可切换
│   ├── mock_data.py        过程数据：应用使用时长、专注趋势
│   ├── error_mock.py       结果数据：错题、掌握率、复习进度
│   └── web/                静态网页（ECharts，双击即可打开）
│
├── windows/          A 模块：Windows 采集客户端
│   ├── app/
│   │   ├── database.py         SQLite 建表、应用表、会话表、设置表
│   │   └── usage_tracker.py    前台窗口识别、空闲检测、会话管理
│   └── tests/                  验证脚本
│
├── backend/          B 模块：后端接口
│   └── README.md           接口清单与上传格式
│
└── docs/
    └── api-fields.md       分析接口字段约定
```

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

```
https://github.com/<owner>/study-insight
```

主开发分支是 `main`。早期的 `master` 与 `windows` 分支内容已并入 `main`，均已删除。
