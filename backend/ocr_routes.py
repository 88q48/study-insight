"""OCR 解析接口。

单独放一个 APIRouter，main.py 里只要 include_router 一行，
不用把几百行解析逻辑塞进本来就已经很长的 main.py。
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import ocr_parser

router = APIRouter()


class OcrParseIn(BaseModel):
    text: str = Field(default="", description="OCR 识别出的原始长文本")


class OcrParseOut(BaseModel):
    # 前端约定的四个字段
    subject: str = Field(description="科目，识别不出来时为空串")
    question_type: str = Field(description="选择题 / 填空题 / 解答题")
    question_content: str = Field(description="题干")
    answer: str = Field(description="答案或解析，没有时为空串")

    # 附加字段：直接拿去 POST /api/v1/errors 也能用
    question_type_code: str = Field(description="后端题型枚举：choice / fill")
    knowledge_point: str = Field(description="知识点，跟看板已有词表对齐")
    options: dict[str, str] = Field(description="选择题的 A/B/C/D，非选择题为空")
    confidence: dict[str, int] = Field(description="分科可信度，0-20")
    warnings: list[str] = Field(description="需要用户手动确认的地方")


@router.post(
    "/api/v1/ocr/parse",
    response_model=OcrParseOut,
    summary="解析 OCR 长文本并切分题目",
)
def parse_ocr(payload: OcrParseIn):
    """前端 OCR 拿到整段文字后调这里，返回可直接填表的字段。

    只做切分和归类，不落库；用户确认后由前端自己调 POST /api/v1/errors。
    """
    if not payload.text or not payload.text.strip():
        raise HTTPException(status_code=422, detail="text 不能为空")

    return ocr_parser.parse(payload.text)
