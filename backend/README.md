# backend — 后端接口

（B 模块）

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

## 当前实现（联调骨架）

先按“能跑通前端 → 后端 → 看板”的最小链路落地了一版，代码与测试都在本目录：

| 文件 | 作用 |
|---|---|
| `backend/main.py` | FastAPI 应用（已开 CORS） |
| `backend/tests/test_api.py` | 3 个冒烟测试，锁定响应字段 |
| `backend/requirements.txt` | fastapi / uvicorn[standard] |
| `backend/pytest.ini` | 只收集 `tests/` 下的用例 |

### 已实现的接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/errors` | 接收错题。当前字段是联调简化版：`subject` / `knowledge_point` / `question_content` / `created_at`；只打印到终端，不落库 |
| GET | `/api/v1/analysis` | 返回看板假数据：`summary` / `subject_distribution` / `review_trend` |

### 启动

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8010
```

- 接口文档：<http://127.0.0.1:8010/docs>
- 8000 在部分 Windows 机器上属于系统保留端口（启动报 `WinError 10013`），改用 8010，前端把 base URL 同步改掉即可。

### 跑测试

```bash
cd backend
pip install pytest httpx
python -m pytest -q
```

### 与正式契约的差距（下一步）

联调版先按简化 JSON 落地，和本文件上半部分、`docs/api-fields.md` 的正式约定还有差距，接真实数据前需要补齐：

- 路径：正式为 `GET /api/v1/devices/{device_id}/analysis?days=7`，当前是 `GET /api/v1/analysis`
- 返回：正式要 11 个顶层字段（`device_id`、`period`、`summary`、`trend`、`app_ranking`、`group_comparison`、`error_stats`、`subject_distribution`、`knowledge_points`、`review_trend`、`efficiency_trend`），当前只有 3 个
- 上传：正式错题字段含 `error_id` / `device_id` / `content` / `mastered` / `review_count`，当前缺
- 尚未实现：`POST /api/v1/events/batch`、`GET /api/v1/devices/{device_id}/sync`、`GET /api/v1/health`
- 数据仍是内存假数据，未接数据库

