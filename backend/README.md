# backend — 后端接口

（后端）

## 负责什么

- 接收客户端上传的应用使用记录与错题记录
- 统一统计口径，避免两端各算一套
- 向看板返回一份完整的分析结果

## 接口清单

前缀统一 `/api/v1`，字段详见 [`../docs/api-fields.md`](../docs/api-fields.md)。

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/v1/events/batch` | 批量上传应用使用记录 |
| POST | `/api/v1/errors` | 上传错题记录 |
| GET | `/api/v1/devices/{device_id}/analysis` | 返回分析结果（看板用） |
| GET | `/api/v1/devices/{device_id}/sync` | 同步信息 |
| GET | `/api/v1/health` | 健康检查 |

## 上传：应用使用记录

```json
{
  "event_id": "evt_a102",
  "device_id": "win_device_01",
  "platform": "windows",
  "app_key": "chrome",
  "start_at": "2026-10-17T09:00:00Z",
  "end_at": "2026-10-17T09:30:00Z",
  "duration_seconds": 1800
}
```

| 字段 | 说明 |
|---|---|
| `event_id` | 每条记录唯一，重试时保持不变，用于去重 |
| `device_id` | 客户端首次启动生成并持久化，不用硬件序列号 |
| `platform` | `windows` 或 `android` |
| `app_key` | 稳定的应用标识，不依赖窗口标题 |
| `start_at` / `end_at` | UTC，ISO 8601 |
| `duration_seconds` | 整数秒 |

## 上传：错题记录

```json
{
  "error_id": "err_0001",
  "device_id": "win_device_01",
  "subject": "数学",
  "knowledge_point": "导数与函数",
  "content": "求 f(x)=x^3-3x 的单调区间",
  "answer": "C",
  "question_type": "choice",
  "option_a": "递增",
  "option_b": "递减",
  "option_c": "先增后减",
  "option_d": "无法判断",
  "created_at": "2026-10-17T20:00:00Z",
  "mastered": false,
  "review_count": 0
}
```

| 字段 | 说明 |
|---|---|
| `error_id` | 每条错题唯一，用于去重 |
| `subject` | 中文科目名，与客户端录入一致 |
| `knowledge_point` | 知识点，用于薄弱项统计 |
| `question_type` | `choice`=选择题，`fill`=填空题；旧客户端不传时默认 `fill` |
| `option_a` ~ `option_d` | 选择题四个选项；填空题可留空 |
| `answer` | 填空题填答案/解析；选择题填 `A/B/C/D` |
| `mastered` | 是否已彻底掌握 |
| `review_count` | 已复习次数 |

## 建议的表结构

```
usage_event      event_id(PK) device_id platform app_key
                 start_at end_at duration_seconds received_at

error_record     error_id(PK) device_id subject knowledge_point
                 content created_at mastered review_count

device           device_id(PK) platform registered_at
```

去重交给主键加 `ON CONFLICT DO NOTHING`，比先查后插稳。

## 分析接口要点

`/devices/{device_id}/analysis` 要一次返回 11 个顶层字段，两个维度：

- 专注维度：`summary` / `trend` / `app_ranking` / `group_comparison`
- 错题维度：`error_stats` / `subject_distribution` / `knowledge_points` / `review_trend`
- 交叉分析：`efficiency_trend`

`efficiency_trend` 是把两边的日期对齐后拼出来的，前端双轴图靠它。

## 代码放这里

例如 `backend/main.py`、`backend/db.py`、`backend/models.py`。

---

## 当前实现（SQLite 落库 + 正式分析接口）

### 代码结构

| 文件 | 作用 |
|---|---|
| `main.py` | FastAPI 应用与接口定义 |
| `db.py` | SQLite 连接、建表、错题 / 使用记录读写 |
| `analytics.py` | 聚合 11 个顶层字段（错题 + 专注 + 交叉） |
| `seed_demo.py` | 演示数据：120 道错题 + 7 天使用记录 |
| `tests/test_api.py` | 9 个接口测试，使用临时库 |

### 数据表

- `error_record`：`error_id`(PK)、`device_id`、`subject`、`knowledge_point`、`content`、`answer`、`question_type`、`option_a`~`option_d`、`attempt_count`、`correct_count`、`created_at`、`mastered`、`review_count`、`mastered_at`、`received_at`
- `usage_event`：`event_id`(PK)、`device_id`、`platform`、`app_key`、`app_name`、`category`、`start_at`、`end_at`、`duration_seconds`、`received_at`

错题按 `error_id`、使用记录按 `event_id` 去重（`ON CONFLICT DO NOTHING`），重复上传不会覆盖已有数据。

### 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/errors` | 上传错题并落库；`content` 为题目、`answer` 为答案，兼容 `question_content` 旧字段；不传 `error_id` 时自动生成 |
| PATCH | `/api/v1/errors/{error_id}` | 更新 `mastered` / `review_count` |
| GET | `/api/v1/errors?device_id=&limit=&subject=` | 查看最近错题 |
| GET | `/api/v1/errors/subjects?device_id=` | 获取练习科目列表 |
| GET | `/api/v1/errors/practice?device_id=&subject=&limit=` | 按错题次数优先获取练习队列 |
| POST | `/api/v1/errors/{error_id}/attempts` | 记录一次做题结果并累计正确率 |
| DELETE | `/api/v1/errors/{error_id}?device_id=` | 删除本设备的错题 |
| POST | `/api/v1/events/batch` | 批量上传使用记录，支持数组或 `{"events": [...]}` |
| GET | `/api/v1/devices/{device_id}/analysis?days=7` | 正式契约，11 个顶层字段 |
| GET | `/api/v1/analysis?device_id=&days=` | 旧路径兼容，返回同样结构 |
| GET | `/api/v1/devices/{device_id}/sync` | 最近同步时间与条数 |
| GET | `/api/v1/health` | 健康检查 |

### summary 与 error_stats 已分开

- `summary` 只放专注时长：`total_duration_seconds` / `avg_daily_seconds` / `median_daily_seconds` / `p90_daily_seconds`
- 错题总览统一放 `error_stats`：`total_errors` / `mastered_errors` / `reviewing_errors` / `mastery_rate`

看板端已按这个口径做兼容，不用再改。

### 专注与交叉数据

- `trend`：按天汇总 `usage_event`；窗口内有记录时缺失日期补 0，完全没有记录时返回空数组
- `app_ranking`：按 `app_key` 汇总，`app_name` / `category` 由后端映射（Chrome / 微信 / 抖音 / 学习通 / B站）
- `knowledge_points`：按（科目，知识点）汇总，各科知识点之和等于该科错题总数
- `efficiency_trend`：用 `trend` 与 `review_trend` 按日期对齐生成
- `group_comparison`：暂按 20 人班给占位值，接入多设备后换成真实统计

### 启动

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python main.py          # 默认 8010，与看板配置一致
```

- 接口文档：<http://127.0.0.1:8010/docs>
- 端口可覆盖：`$env:PORT=8010`（8000 在部分 Windows 机器上被系统保留）
- 数据库路径可覆盖：`$env:SI_DB_PATH="D:\data\study.db"`

### 演示数据

空库首次启动会自动写入 120 道错题（数学 45 / 物理 35 / 英语 40，掌握 85，掌握率 70.8%）和最近 7 天的使用记录，看板端的三张空图会立即有数据。

```bash
python seed_demo.py            # 幂等写入
python seed_demo.py --reset    # 删除演示数据后重写
```

接真实数据时用 `$env:SI_SEED_DEMO=0` 关闭自动写入。演示数据的 id 分别是 `err_demo_*` 和 `evt_demo_*`，不影响真实记录。

### 测试

```bash
cd backend
pip install pytest httpx
python -m pytest -q
```

测试使用临时数据库，不会碰 `backend/study_insight.db`。
