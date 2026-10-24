"""学情洞察后端。

接口：
- POST   /api/v1/errors                        上传错题（落库、按 error_id 去重）
- PATCH  /api/v1/errors/{error_id}             更新掌握状态 / 复习次数
- GET    /api/v1/errors                        查看最近错题
- POST   /api/v1/events/batch                  批量上传应用使用记录
- GET    /api/v1/devices/{device_id}/analysis  正式分析接口（11 个顶层字段）
- GET    /api/v1/analysis                      兼容旧路径，返回同样结构
- GET    /api/v1/devices/{device_id}/sync      同步信息
- GET    /api/v1/health                        健康检查

启动：python main.py（默认 8010，可用 $env:PORT 覆盖）
文档：http://127.0.0.1:8010/docs
"""

from __future__ import annotations

import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

import uvicorn
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import analytics
import db

# Windows 控制台/重定向默认是 GBK，题目里出现 ³、∑、emoji 等字符时 print 会抛
# UnicodeEncodeError 导致接口 500。保留原编码，只把无法编码的字符转义输出。
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(errors="backslashreplace")

app = FastAPI(title="学情洞察 API", version="0.2.0")

# 联调期放开跨域，客户端和看板端都可以直接请求；上线前收敛成具体域名。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DEFAULT_DEVICE = "win_device_01"


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _to_utc_iso(value: datetime | None) -> str:
    """统一存成 UTC、带 Z 的 ISO 8601，字符串比较即可按时间排序。"""
    if value is None:
        return _now_iso()
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _new_error_id() -> str:
    return f"err_{uuid.uuid4().hex[:12]}"


def _serialize_error(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "error_id": row["error_id"],
        "device_id": row["device_id"],
        "subject": row["subject"],
        "knowledge_point": row["knowledge_point"],
        "content": row["content"],
        "question_content": row["content"],  # 兼容旧客户端
        "answer": row.get("answer", ""),
        "question_type": row.get("question_type", "fill"),
        "option_a": row.get("option_a", ""),
        "option_b": row.get("option_b", ""),
        "option_c": row.get("option_c", ""),
        "option_d": row.get("option_d", ""),
        "created_at": row["created_at"],
        "mastered": bool(row["mastered"]),
        "review_count": row["review_count"],
        "mastered_at": row["mastered_at"],
    }


# 建表；空库首次启动时写入演示数据，方便 C 直接看到图表。
# 接真实数据后可用 $env:SI_SEED_DEMO=0 关闭。
db.init_db()
if os.getenv("SI_SEED_DEMO", "1") != "0" and db.is_empty():
    try:
        from seed_demo import seed_demo_data

        seed_demo_data()
    except Exception as exc:  # noqa: BLE001
        print(f"[seed] 演示数据写入失败：{exc}")


# ==========================================
# 错题：上传 / 更新 / 查询
# ==========================================
class ErrorIn(BaseModel):
    error_id: str | None = None          # 不传时后端生成
    device_id: str = DEFAULT_DEVICE
    subject: str                          # 科目，如 "数学"
    knowledge_point: str | None = None    # 知识点，空则归入 "未分类"
    content: str | None = None            # 题目内容（正式字段）
    answer: str | None = None             # 答案 / 解析（可选）
    question_type: Literal["choice", "fill"] = "fill"  # choice=选择题，fill=填空题
    option_a: str | None = None           # 选择题选项 A
    option_b: str | None = None           # 选择题选项 B
    option_c: str | None = None           # 选择题选项 C
    option_d: str | None = None           # 选择题选项 D
    question_content: str | None = None   # 旧字段，兼容客户端已发出的请求
    created_at: datetime | None = None    # 不传时用服务器当前时间
    mastered: bool = False
    review_count: int = Field(default=0, ge=0)


class ErrorPatch(BaseModel):
    mastered: bool | None = None
    review_count: int | None = Field(default=None, ge=0)


@app.post("/api/v1/errors", summary="接收错题并落库")
def upload_error(payload: ErrorIn, response: Response):
    subject = payload.subject.strip()
    if not subject:
        raise HTTPException(status_code=422, detail="subject 不能为空")

    knowledge_point = (payload.knowledge_point or "").strip() or "未分类"
    content = (payload.content or payload.question_content or "").strip()
    answer = (payload.answer or "").strip()
    question_type = payload.question_type
    options = {
        "option_a": (payload.option_a or "").strip(),
        "option_b": (payload.option_b or "").strip(),
        "option_c": (payload.option_c or "").strip(),
        "option_d": (payload.option_d or "").strip(),
    }
    if question_type == "choice":
        missing = [
            key.removeprefix("option_").upper()
            for key, value in options.items()
            if not value
        ]
        if missing:
            raise HTTPException(
                status_code=422,
                detail=f"选择题缺少选项：{', '.join(missing)}",
            )
        answer = answer.upper()
        if answer not in {"A", "B", "C", "D"}:
            raise HTTPException(
                status_code=422,
                detail="选择题的 answer 必须是 A/B/C/D 之一",
            )
    else:
        options = {key: "" for key in options}
    error_id = (payload.error_id or "").strip() or _new_error_id()
    created_at = _to_utc_iso(payload.created_at)
    mastered = bool(payload.mastered)
    now = _now_iso()

    record = {
        "error_id": error_id,
        "device_id": (payload.device_id or DEFAULT_DEVICE).strip() or DEFAULT_DEVICE,
        "subject": subject,
        "knowledge_point": knowledge_point,
        "content": content,
        "answer": answer,
        "question_type": question_type,
        **options,
        "created_at": created_at,
        "mastered": mastered,
        "review_count": payload.review_count,
        "mastered_at": created_at if mastered else None,
        "received_at": now,
    }
    created = db.insert_error(record)
    response.status_code = 201 if created else 200

    return {
        "status": "success",
        "duplicate": not created,
        "message": "错题上传成功" if created else "该 error_id 已存在，未重复写入",
        "error_id": error_id,
        "received_at": now,
    }


@app.patch("/api/v1/errors/{error_id}", summary="更新掌握状态 / 复习次数")
def patch_error(error_id: str, payload: ErrorPatch):
    existing = db.get_error(error_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="错题不存在")

    fields: dict[str, Any] = {}
    if payload.mastered is not None:
        fields["mastered"] = int(payload.mastered)
        if payload.mastered and not existing["mastered"]:
            fields["mastered_at"] = _now_iso()
        elif not payload.mastered:
            fields["mastered_at"] = None
    if payload.review_count is not None:
        fields["review_count"] = payload.review_count

    updated = db.update_error(error_id, fields)
    if updated is None:
        raise HTTPException(status_code=404, detail="错题不存在")
    return {"status": "success", "error": _serialize_error(updated)}


@app.get("/api/v1/errors", summary="查看最近的错题")
def get_errors(
    device_id: str = DEFAULT_DEVICE,
    limit: int = Query(default=50, ge=1, le=200),
    subject: str | None = None,
):
    rows = db.list_errors(device_id, limit=limit, subject=subject)
    return {"total": len(rows), "items": [_serialize_error(row) for row in rows]}


# ==========================================
# 应用使用记录：客户端批量上传
# ==========================================
class UsageEventIn(BaseModel):
    event_id: str
    device_id: str
    platform: str = "windows"
    app_key: str
    app_name: str | None = None
    category: str | None = None
    start_at: datetime
    end_at: datetime
    duration_seconds: int = Field(ge=0)


class UsageEventBatch(BaseModel):
    events: list[UsageEventIn]


@app.post("/api/v1/events/batch", summary="批量上传应用使用记录")
def upload_events(payload: list[UsageEventIn] | UsageEventBatch):
    items = payload.events if isinstance(payload, UsageEventBatch) else payload
    now = _now_iso()
    records = []
    for item in items:
        start_at = _to_utc_iso(item.start_at)
        end_at = _to_utc_iso(item.end_at)
        if end_at < start_at:
            raise HTTPException(
                status_code=422,
                detail=f"event_id={item.event_id} 的 end_at 早于 start_at",
            )
        records.append(
            {
                "event_id": item.event_id,
                "device_id": item.device_id,
                "platform": item.platform,
                "app_key": item.app_key,
                "app_name": item.app_name,
                "category": item.category,
                "start_at": start_at,
                "end_at": end_at,
                "duration_seconds": item.duration_seconds,
                "received_at": now,
            }
        )

    inserted, duplicates = db.insert_events(records)
    return {
        "status": "success",
        "received": len(records),
        "inserted": inserted,
        "duplicates": duplicates,
    }


# ==========================================
# 看板：分析数据（正式契约 + 旧路径兼容）
# ==========================================
@app.get(
    "/api/v1/devices/{device_id}/analysis",
    summary="看板分析数据（正式契约，11 个顶层字段）",
)
def device_analysis(device_id: str, days: int = Query(default=7, ge=1, le=90)):
    return analytics.build_analysis(device_id, days)


@app.get("/api/v1/analysis", summary="看板分析数据（兼容旧路径）")
def analysis_compat(
    device_id: str = DEFAULT_DEVICE,
    days: int = Query(default=7, ge=1, le=90),
):
    return analytics.build_analysis(device_id, days)


# ==========================================
# 健康检查 / 同步
# ==========================================
@app.get("/api/v1/health", summary="健康检查")
def health():
    try:
        counts = db.counts()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"数据库不可用：{exc}") from exc
    return {
        "status": "ok",
        "service": "study-insight-backend",
        "time": _now_iso(),
        **counts,
    }


@app.get("/api/v1/devices/{device_id}/sync", summary="设备同步信息")
def sync(device_id: str):
    info = db.sync_info(device_id)
    info["server_time"] = _now_iso()
    return info


if __name__ == "__main__":
    # 本地直接 `python main.py` 即可；看板端配置是 8010，所以默认也走 8010。
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=int(os.getenv("PORT", "8010")),
        reload=True,
    )

