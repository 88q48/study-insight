from fastapi import APIRouter, UploadFile, File, HTTPException
import re
import json
import os

import ocr_parser

router = APIRouter()

# 密钥一律从环境变量读，不写进源码。
# 这两个服务都是按量计费的，密钥进 git 等于把钱包交出去。
APP_ID = os.getenv("BAIDU_OCR_APP_ID", "").strip()
API_KEY = os.getenv("BAIDU_OCR_API_KEY", "").strip()
SECRET_KEY = os.getenv("BAIDU_OCR_SECRET_KEY", "").strip()
LLM_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip()

# 缺密钥时不要 import 对应 SDK 就崩，而是把功能降级成「不可用」，
# 让后端整体还能起来，其他接口照常工作。
client = None
if APP_ID and API_KEY and SECRET_KEY:
    try:
        from aip import AipOcr

        client = AipOcr(APP_ID, API_KEY, SECRET_KEY)
    except ImportError:
        print("[ocr] 缺 baidu-aip，图片识别不可用。装一下：pip install baidu-aip")
elif not all([APP_ID, API_KEY, SECRET_KEY]):
    print("[ocr] 没配百度 OCR 密钥，图片识别不可用（见 backend/.env.example）")

llm_client = None
if LLM_API_KEY and LLM_API_KEY.startswith("sk-"):
    try:
        from openai import OpenAI

        llm_client = OpenAI(api_key=LLM_API_KEY, base_url="https://api.deepseek.com")
    except ImportError:
        print("[ocr] 缺 openai SDK，大模型解析不可用。装一下：pip install openai")
elif not LLM_API_KEY:
    print("[ocr] 没配 DeepSeek 密钥，大模型解析不可用（会自动退回本地规则切分）")



def call_baidu_ocr(image_bytes: bytes) -> str:
    """调用百度 OCR 识别文字，并包含错误拦截"""
    if client is None:
        raise HTTPException(
            status_code=503,
            detail="未配置百度 OCR 密钥，图片识别不可用。见 backend/.env.example",
        )
    try:
        result = client.basicGeneral(image_bytes)
        
        # 拦截百度的错误码（比如额度用完、图片不对）
        if "error_code" in result:
            raise HTTPException(
                status_code=400, 
                detail=f"百度OCR报错: {result.get('error_msg')} (Code: {result.get('error_code')})"
            )

        if "words_result" in result:
            return "\n".join(item["words"] for item in result["words_result"])
        return ""
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR服务异常: {str(e)}")


def clean_ocr_text(text: str) -> str:
    """清洗乱码和多余的换行（针对你之前截图里的问题）"""
    if not text:
        return ""
    # 干掉常见的乱码字符
    text = re.sub(r'\\u00e8|\u00e8|\\n', '\n', text)
    text = re.sub(r'\\u[0-9a-fA-F]{4}', '', text) # 干掉其他 unicode 转义
    text = re.sub(r' +', ' ', text) # 多个空格变一个
    return text.strip()


def parse_with_llm(text: str):
    """调用 DeepSeek 提取结构化信息"""
    if not llm_client:
        return None

    safe_text = text[:4000] 

    prompt = f"""
    你是一个专业的错题整理助手。请阅读以下 OCR 提取的试卷文本。
    提取信息，并严格以 JSON 格式返回，不要包含任何 Markdown 标记或多余解释。
    
    要求的 JSON 格式如下：
    {{
      "subject": "科目(如：语文、数学、化学、英语)",
      "question_type": "题型(如：单选题、文言文阅读、解答题)",
      "question_content": "题目和选项内容（请保留清晰的换行排版）",
      "answer": "答案与解析（如果文本里没有明确答案，返回空字符串）"
    }}

    试卷文本内容：
    {safe_text}
    """

    try:
        response = llm_client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.1 # 设置低温度，让模型更严谨，不乱编
        )
        # 返回解析后的字典
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"大模型解析失败: {e}")
        return None



@router.post("/parse")
async def ocr_parse(file: UploadFile = File(...)):
    # 1. 读取图片
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="上传的图片为空")
    
    # 2. 百度 OCR 提取纯文本
    raw_text = call_baidu_ocr(contents)
    if not raw_text:
        raise HTTPException(status_code=400, detail="未能识别出文字，请换一张清晰的图片")
    
    # 3. 文本清洗（去乱码）
    cleaned_text = clean_ocr_text(raw_text)
    
    # 4. 尝试 DeepSeek 结构化
    parsed_data = parse_with_llm(cleaned_text)
    
    # 5. 组装返回给前端的最终结果
    if parsed_data:
        subject = parsed_data.get("subject", "")
        qtype = parsed_data.get("question_type", "")
        content = parsed_data.get("question_content", "")
        answer = parsed_data.get("answer", "")
        source = "llm"
    else:
        # 大模型没配或调用失败，用本地规则切分兜底。
        # 只认字符特征（科目关键词、题号、选项），不依赖网络和额度，
        # 演示时外网断了也能出结果，不至于整页空白。
        local = ocr_parser.parse(cleaned_text)
        subject = local.get("subject", "")
        qtype = local.get("question_type", "")
        content = local.get("question_content", "") or cleaned_text
        answer = local.get("answer", "")
        source = "local"

    return {
        "raw_text": cleaned_text,
        "subject": subject,
        "question_type": qtype,
        "question_content": content,
        "answer": answer,
        # 前端可以据此提示「这条是本地规则识别的，请核对一下」
        "parser": source,
    }
