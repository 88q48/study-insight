"""错题看板后端（FastAPI 联调版）。

- POST /api/v1/errors    接收前端（客户端）录入的错题
- GET  /api/v1/analysis  给 C 看板返回画图用的统计数据（当前为假数据）

启动：uvicorn main:app --reload --port 8000
文档：http://127.0.0.1:8000/docs
"""
import os
import sys

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Windows 控制台/重定向默认是 GBK，题目里出现 ³、∑、emoji 等字符时 print 会抛
# UnicodeEncodeError 导致接口 500。保留原编码，只把无法编码的字符转义输出。
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(errors="backslashreplace")

app = FastAPI(title="错题分析 API", version="0.1.0")

# 联调期放开跨域，前端和 C 看板都可以直接请求；上线前收敛成具体域名。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================
# 1. 接收前端（客户端）上传的数据 (POST)
# ==========================================
class ErrorRecord(BaseModel):
    subject: str          # 科目，比如 "数学"
    knowledge_point: str  # 知识点，比如 "导数"
    question_content: str # 题目内容
    created_at: str       # 录入时间


@app.post("/api/v1/errors", summary="接收前端录入的错题")
def upload_error(error: ErrorRecord):
    """联调阶段先不落库：打印到终端，证明链路已通。"""
    print(f"收到前端发来的错题：{error.subject} - {error.knowledge_point}")
    print(f"  题目内容：{error.question_content}")
    print(f"  录入时间：{error.created_at}")
    return {"status": "success", "message": "错题上传成功"}


# ==========================================
# 2. 给看板（C）提供统计数据的接口 (GET)
# ==========================================
@app.get("/api/v1/analysis", summary="看板统计数据（假数据）")
def get_analysis():
    """字段与 C 看板约定一致：summary / subject_distribution / review_trend。"""
    return {
        "summary": {"total_errors": 120, "mastered_errors": 85, "mastery_rate": 70.8},
        "subject_distribution": [
            {"subject": "数学", "error_count": 45, "mastered_count": 30},
            {"subject": "物理", "error_count": 35, "mastered_count": 20},
            {"subject": "英语", "error_count": 25, "mastered_count": 20},
        ],
        "review_trend": [
            {"date": "2026-10-11", "new_added": 5, "mastered": 3},
            {"date": "2026-10-12", "new_added": 2, "mastered": 8},
        ],
    }


if __name__ == "__main__":
    # 本地直接 `python main.py` 也能起服务；8000 被系统保留时用 `$env:PORT=8010` 再运行。
    uvicorn.run("main:app", host="127.0.0.1", port=int(os.getenv("PORT", "8000")), reload=True)
