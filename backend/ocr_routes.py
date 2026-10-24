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
    "/api/v1/ocr/split",
    response_model=OcrParseOut,
    summary="把一段现成的文字切成填表字段（不走 OCR）",
)
def split_ocr(payload: OcrParseIn):
    """把已有文字切分归类，不调任何外部服务。

    两种用途：
    - 手机上拍照后百度 OCR 成功、但大模型解析失败时，后端内部调它兜底
    - 用户手动粘贴一段题目文字，想自动拆成科目 / 题型 / 题干 / 答案

    路径故意和 /api/v1/ocr/parse 分开：那条接图片上传，这条接 JSON。
    两个都挂 /parse 会让 FastAPI 只认先注册的那个，另一条静默失效。
    """
    if not payload.text or not payload.text.strip():
        raise HTTPException(status_code=422, detail="text 不能为空")

    return ocr_parser.parse(payload.text)
