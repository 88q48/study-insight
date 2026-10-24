# 分析接口字段约定

看板端已按本文用 mock 数据跑通。后端就绪后，只要字段名与本文一致，
把 `dashboard/web/config.js` 的 `USE_MOCK` 改成 `false` 就能直接对接。

---

## 一、接口路径

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/v1/devices/{device_id}/analysis` | 取某个设备的完整分析结果 |

查询参数：

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `days` | int | 7 | 统计最近多少天，1~90 |

---

## 二、返回结构（顶层）

| 字段 | 类型 | 归属 | 说明 |
|---|---|---|---|
| `device_id` | string | 公共 | 设备标识 |
| `period` | object | 公共 | 统计时间范围 |
| `summary` | object | 专注维度 | 专注时长汇总 |
| `trend` | array | 专注维度 | 每日专注时长 |
| `app_ranking` | array | 专注维度 | 应用排行 |
| `group_comparison` | object | 专注维度 | 群体对比 |
| `error_stats` | object | 错题维度 | 错题总览 |
| `subject_distribution` | array | 错题维度 | 各科分布 |
| `knowledge_points` | array | 错题维度 | 知识点明细 |
| `review_trend` | array | 错题维度 | 每日新增与消灭 |
| `efficiency_trend` | array | 交叉分析 | 时长与产出对照 |

---

## 三、字段明细

### `period`

| 字段 | 类型 | 示例 |
|---|---|---|
| `start` | string（ISO 8601，UTC） | `"2026-10-11T00:00:00Z"` |
| `end` | string（ISO 8601，UTC） | `"2026-10-17T23:59:59Z"` |

### `summary`（专注维度）

| 字段 | 类型 | 单位 | 示例 |
|---|---|---|---|
| `total_duration_seconds` | number | 秒 | `93535` |
| `avg_daily_seconds` | number | 秒 | `13362.14` |
| `median_daily_seconds` | number | 秒 | `14241.0` |
| `p90_daily_seconds` | number | 秒 | `16132.2` |

### `trend`（数组，每天一项）

| 字段 | 类型 | 示例 |
|---|---|---|
| `date` | string（`YYYY-MM-DD`） | `"2026-10-11"` |
| `total_duration_seconds` | number（秒） | `7201` |

### `app_ranking`（数组，按时长降序）

| 字段 | 类型 | 示例 |
|---|---|---|
| `app_key` | string | `"douyin"` |
| `app_name` | string | `"抖音"` |
| `category` | string | `"娱乐"` |
| `duration_seconds` | number（秒） | `25725` |
| `percentage` | number | `27.5` |

### `group_comparison`

| 字段 | 类型 | 单位 | 示例 |
|---|---|---|---|
| `group_avg_daily_seconds` | number | 秒 | `12371.6` |
| `group_median_daily_seconds` | number | 秒 | `13317.1` |
| `group_p90_daily_seconds` | number | 秒 | `17620.5` |
| `my_rank` | number | — | `11` |
| `group_size` | number | 人 | `20` |

### `error_stats`（错题维度）

| 字段 | 类型 | 单位 | 示例 |
|---|---|---|---|
| `total_errors` | number | 道 | `140` |
| `mastered_errors` | number | 道 | `91` |
| `reviewing_errors` | number | 道 | `49` |
| `mastery_rate` | number | % | `65.0` |

### `subject_distribution`（数组，每科一项）

| 字段 | 类型 | 示例 |
|---|---|---|
| `subject` | string | `"数学"` |
| `error_count` | number | `45` |
| `mastered_count` | number | `30` |
| `reviewing_count` | number | `15` |
| `mastery_rate` | number | `66.7` |

### `knowledge_points`（数组，按待复习数降序）

| 字段 | 类型 | 示例 |
|---|---|---|
| `subject` | string | `"数学"` |
| `knowledge_point` | string | `"导数与函数"` |
| `error_count` | number | `15` |
| `mastered_count` | number | `6` |
| `reviewing_count` | number | `9` |

### `review_trend`（数组，每天一项）

| 字段 | 类型 | 示例 |
|---|---|---|
| `date` | string（`YYYY-MM-DD`） | `"2026-10-11"` |
| `new_added` | number | `7` |
| `resolved` | number | `4` |

### `efficiency_trend`（数组，每天一项）

交叉分析的核心表，日期轴必须与 `trend` 完全对齐。

| 字段 | 类型 | 单位 | 示例 |
|---|---|---|---|
| `date` | string（`YYYY-MM-DD`） | — | `"2026-10-11"` |
| `focus_hours` | number | 小时 | `2.0` |
| `new_errors` | number | 道 | `7` |
| `resolved_errors` | number | 道 | `4` |

---

## 四、几个要一起定的点

1. **时长统一用秒**，换算成小时交给前端。
2. **时间统一 UTC**，ISO 8601 带 `Z` 结尾。
3. **`my_rank` 从 1 开始**，数字越小越靠前。
4. 没有数据时 `trend`、`app_ranking`、`knowledge_points` **返回空数组**，不要返回 `null`。
5. **各科知识点错题数之和应等于该科错题总数**，前端会拿来做自洽校验。
6. **`efficiency_trend` 与 `trend` 的日期必须一一对应**，双轴图靠这个对齐。
7. `category` 建议固定为 `学习` / `娱乐` / `社交` / `工具` 四类。
8. `subject` 用中文科目名，与客户端录入时保持一致。

---

## 五、各字段用在哪

| 字段 | 页面位置 |
|---|---|
| `error_stats` | 错题 Tab 顶部四张指标卡 |
| `subject_distribution` | 科目雷达图 + 各科消化进度堆叠图 |
| `knowledge_points` | 知识点薄弱榜 |
| `review_trend` | 每日新增 vs 消灭 |
| `efficiency_trend` | 专注时长与错题产出的双轴图 |
| `summary` / `trend` | 专注 Tab 指标卡 + 专注时长趋势 |
| `app_ranking` | 暂无对应图表（原「应用类别占比」已移除，字段保留兼容） |
| `group_comparison` | 个人 vs 群体 + 排名文案 |
| `period` / `device_id` | 页面顶部说明 |

---

## 六、错题接口（录入 / 练习 / 删除）

分析接口只负责「读」。错题的新增、修改、删除走下面这几条。

### 6.1 接口一览

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/api/v1/errors` | 录入一道错题 |
| `GET` | `/api/v1/errors` | 查询错题列表（支持 `subject` 过滤） |
| `GET` | `/api/v1/errors/subjects` | 练习页的科目列表 |
| `GET` | `/api/v1/errors/practice` | 按做题次数优先的练习队列 |
| `POST` | `/api/v1/errors/{error_id}/attempts` | 记录一次做题结果 |
| `PATCH` | `/api/v1/errors/{error_id}` | 更新掌握状态 / 复习次数 |
| `DELETE` | `/api/v1/errors/{error_id}` | 删除错题 |

### 6.2 录入字段（POST /api/v1/errors）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `error_id` | string | 否 | 不传由后端生成；客户端传了要保证唯一 |
| `device_id` | string | 否 | 默认 `win_device_01` |
| `subject` | string | **是** | 科目名，空值返回 422 |
| `knowledge_point` | string | 否 | 空则归入「未分类」 |
| `content` | string | 否 | 题目内容 |
| `answer` | string | 否 | 答案；选择题需为 A/B/C/D |
| `question_type` | string | 否 | `choice`（选择题）或 `fill`（填空题），默认 `fill` |
| `option_a` ~ `option_d` | string | 选择题必填 | 四个选项，缺任一项返回 422 |
| `created_at` | ISO 8601 | 否 | 不传用服务器时间 |
| `mastered` | bool | 否 | 默认 `false` |
| `review_count` | int | 否 | 默认 `0` |

> `error_id` 建议带随机部分。只用毫秒时间戳时，同一毫秒连点两次会被后端
> 当成重复写入，第二次静默丢弃。

### 6.3 错题对象（所有接口统一返回这个结构）

| 字段 | 说明 |
|---|---|
| `error_id` / `device_id` / `subject` / `knowledge_point` | 基本信息 |
| `content` | 题目内容 |
| `question_content` | 旧字段，等同 `content`，保留兼容 |
| `answer` / `question_type` / `option_a` ~ `option_d` | 答案与题型 |
| `created_at` / `mastered` / `review_count` / `mastered_at` | 时间与掌握状态 |
| `attempt_count` | 累计做过几次 |
| `correct_count` / `wrong_count` | 做对 / 做错次数 |
| `accuracy` | 正确率（百分比，未做过为 0） |

### 6.4 练习队列（GET /api/v1/errors/practice）

```json
{
  "total": 10,
  "subject": "数学",
  "items": [ { "error_id": "...", "wrong_count": 3, "...": "..." } ]
}
```

排序规则：做错次数多的排前面，同次数按最近一次做错时间倒序。
`subject` 不传则跨科目。

### 6.5 做题结果（POST /api/v1/errors/{error_id}/attempts）

请求体：`{ "device_id": "win_device_01", "answer": "B" }`

```json
{
  "status": "success",
  "correct": true,
  "error": { "attempt_count": 2, "correct_count": 1, "accuracy": 50.0 }
}
```

选择题会自动判断题：把提交的 `answer` 与存下来的答案比对。
填空题同样按字符串比对（去空格、忽略大小写）。
题目没有答案时，`correct` 恒为 `false`。

### 6.6 删除（DELETE /api/v1/errors/{error_id}?device_id=...）

```json
{ "status": "success", "deleted": true, "error_id": "err_xxx" }
```

只能删自己设备的错题，`device_id` 对不上返回 404。
