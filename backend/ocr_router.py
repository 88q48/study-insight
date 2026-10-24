from fastapi import APIRouter, UploadFile, File, HTTPException
import re
import json

import dotenv_lite
import ocr_parser

router = APIRouter()

# 当前演示环境把百度 OCR 凭据内置，开箱即用。
# DeepSeek 密钥因为 GitHub 推送保护不能进仓库，从 backend/.env 读取。
# 环境变量仍然优先，方便以后换账号；正式上线前建议全部改回只读环境变量。
DEFAULT_BAIDU_OCR_APP_ID = "124538668"
DEFAULT_BAIDU_OCR_API_KEY = "yOxFOsrvg6wOhJMCaHfihfvL"
DEFAULT_BAIDU_OCR_SECRET_KEY = "YOf1cPUkjArQe29wPtyHaTi3XcnkSlVd"
DEFAULT_DEEPSEEK_API_KEY = ""

APP_ID = (
    dotenv_lite.get("BAIDU_OCR_APP_ID")
    or dotenv_lite.get("BAIDU_APP_ID")
    or DEFAULT_BAIDU_OCR_APP_ID
)
API_KEY = (
    dotenv_lite.get("BAIDU_OCR_API_KEY")
    or dotenv_lite.get("BAIDU_API_KEY")
    or DEFAULT_BAIDU_OCR_API_KEY
)
SECRET_KEY = (
    dotenv_lite.get("BAIDU_OCR_SECRET_KEY")
    or dotenv_lite.get("BAIDU_SECRET_KEY")
    or DEFAULT_BAIDU_OCR_SECRET_KEY
)
LLM_API_KEY = dotenv_lite.get("DEEPSEEK_API_KEY") or DEFAULT_DEEPSEEK_API_KEY

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



# 百度返回的错误码分几类，处理方式完全不同。全部笼统报 500 的话，
# 前端没法判断该重试、该换图、还是该找后端同学换密钥。
_BAIDU_CREDENTIAL_CODES = {6, 14, 100, 110, 111}   # 无权限 / 认证失败 / token 失效
_BAIDU_QUOTA_CODES = {17, 18, 19, 20}              # 日限额 / QPS / 总量超限
_BAIDU_IMAGE_CODES = {216200, 216201, 216202, 216203, 282003}


def call_baidu_ocr(image_bytes: bytes) -> str:
    """调用百度 OCR 识别文字。失败时抛带明确状态码的 HTTPException。"""
    if client is None:
        raise HTTPException(
            status_code=503,
            detail="未配置百度 OCR 密钥，图片识别不可用。见 backend/.env.example",
        )

    try:
        result = client.basicGeneral(image_bytes)
    except Exception as e:
        # 网络层就挂了，跟凭据无关
        raise HTTPException(status_code=502, detail=f"连接百度 OCR 失败: {e}") from e

    code = result.get("error_code")
    if code is not None:
        msg = result.get("error_msg", "未知错误")
        if code in _BAIDU_CREDENTIAL_CODES:
            raise HTTPException(
                status_code=503,
                detail=(
                    f"百度 OCR 凭据无效（Code {code}: {msg}）。"
                    "通常是密钥被重新生成或删除，请更新 backend/.env 里那三项后重启后端。"
                ),
            )
        if code in _BAIDU_QUOTA_CODES:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"百度 OCR 额度或频率超限（Code {code}: {msg}）。"
                    "免费额度按天重置，演示前留意当天调用次数。"
                ),
            )
        if code in _BAIDU_IMAGE_CODES:
            raise HTTPException(
                status_code=400,
                detail=f"图片无法识别（Code {code}: {msg}），换一张更清晰的试试。",
            )
        raise HTTPException(
            status_code=502, detail=f"百度 OCR 返回错误（Code {code}: {msg}）"
        )

    words = result.get("words_result") or []
    text = chr(10).join(item.get("words", "") for item in words).strip()
    if not text:
        raise HTTPException(status_code=400, detail="这张图里没识别出文字，换一张试试。")
    return text


def clean_ocr_text(text: str) -> str:
    """清洗 OCR 出来的乱码和多余换行。

    百度会把转义序列原样吐出来（比如字面的 \n、\u00e8），
    不处理会顶在题干里，用户看着是一堆符号。
    """
    if not text:
        return ""
    text = re.sub(r'\u00e8|\n', chr(10), text)
    text = re.sub(r'\\u[0-9a-fA-F]{4}', '', text)   # 其他 unicode 转义直接丢
    text = re.sub(r' +', ' ', text)
    return text.strip()


def parse_with_llm(text: str):
    """调 DeepSeek 把长文本结构化。没配密钥或调用失败返回 None，由调用方兜底。"""
    if not llm_client:
        return None

    safe_text = text[:4000]

    prompt = f"""你是一个专业的错题整理助手。请阅读以下 OCR 提取的试卷文本。
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
            temperature=0.1,
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"[ocr] 大模型解析失败，退回本地规则: {e}")
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
