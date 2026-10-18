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

### `knowledge_points`（数组，按错题数降序）

| 字段 | 类型 | 示例 |
|---|---|---|
| `subject` | string | `"数学"` |
| `knowledge_point` | string | `"导数与函数"` |
| `error_count` | number | `15` |

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
| `app_ranking` | 应用类别占比 |
| `group_comparison` | 个人 vs 群体 + 排名文案 |
| `period` / `device_id` | 页面顶部说明 |
