from fastapi import APIRouter, UploadFile, File, HTTPException
import re
import json

import dotenv_lite
import ocr_parser
import ocr_split

router = APIRouter()

# 凭据一律从 backend/.env 或环境变量读，源码里不留任何默认值。
# 仓库是公开的，写在这里等于公开送人刷额度——之前就这么漏过一对。
#
# 第一次跑：python apply_keys.py   （会生成 .env）
# 或者手动在 backend/.env 里填：
#   BAIDU_OCR_APP_ID=...
#   BAIDU_OCR_API_KEY=...
#   BAIDU_OCR_SECRET_KEY=...
#   DEEPSEEK_API_KEY=...
DEFAULT_BAIDU_OCR_APP_ID = ""
DEFAULT_BAIDU_OCR_API_KEY = ""
DEFAULT_BAIDU_OCR_SECRET_KEY = ""
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


def _strip_options_from_stem(one: dict) -> dict:
    """选项已经单独拆出来了，题干里就别再重复一遍。

    大模型返回的 question_content 常把 A/B/C/D 一起塞进来。客户端存题时
    选项是分开的（option_a..d），题干里再带一份，看题时就成了两遍。
    """
    options = one.get("options") or {}
    content = one.get("question_content") or ""
    if len(options) < 4 or not content:
        return one

    _opts, span = ocr_parser._extract_options(content)
    if not span:
        return one

    start, end = span
    tail = content[end:]
    tail = tail.split(chr(10), 1)[1] if chr(10) in tail else ""
    stem = (content[:start] + (chr(10) + tail if tail.strip() else "")).strip()
    if stem:
        one["question_content"] = stem
    return one


def _structure_one(block: str, fallback_text: str) -> dict:
    """把一道题的文本整理成填表字段。

    优先让大模型精修（它更懂「哪句是题干、哪个是选项」）；
    没配密钥、调用失败、或者题太多控制成本时，用本地规则。

    不管走哪条，subject / question_type / question_content / answer
    这四个字段一定有值，parser 标明来源。
    """
    local = ocr_parser.parse(block)

    # 题数多的时候不逐题调大模型：又慢又费额度，本地规则够用
    if llm_client and getattr(_structure_one, "_budget", None) is not False:
        refined = parse_with_llm(block)
        if refined:
            merged = dict(local)
            for key in ("subject", "question_type", "question_content", "answer"):
                val = (refined.get(key) or "").strip()
                if val:
                    merged[key] = val
            merged["parser"] = "llm"
            return _strip_options_from_stem(merged)

    out = dict(local)
    out["parser"] = "local"
    # 本地切不出题干时，至少把这段原文给出去，别让用户面对空白
    if not out.get("question_content"):
        out["question_content"] = block.strip() or fallback_text
    return _strip_options_from_stem(out)


@router.post("/parse")
async def ocr_parse(file: UploadFile = File(...)):
    """上传图片 → 识别文字 → 切成多道题 → 逐题结构化。

    一次拍一整页试卷时，返回的 questions 里会有多道题；
    只拍一道题时，questions 长度为 1。

    顶层那几个字段（subject / question_type / question_content / answer）
    保留成「第一题」，老的调用方不用改。
    """
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="上传的图片为空")

    raw_text = call_baidu_ocr(contents)
    cleaned_text = clean_ocr_text(raw_text)
    if not cleaned_text:
        raise HTTPException(status_code=400, detail="这张图里没识别出文字，换一张试试。")

    # 按题号切成多道。切不出来时整段当一题，内容不会丢。
    blocks, answers, header = ocr_split.split_questions(cleaned_text)

    questions: list[dict] = []
    for seq, block in enumerate(blocks, start=1):
        one = _structure_one(block, cleaned_text)
        # 卷子上的题号可能从 7 开始，答案要按真实题号配，不能按顺序
        number = ocr_split._take_number(block) or seq
        if not one.get("answer") and number in answers:
            one["answer"] = answers[number]
            one["confidence"] = dict(one.get("confidence") or {}, answer=2)
        if not one.get("subject") and header:
            guess, _ = ocr_parser._classify_subject(header)
            if guess:
                one["subject"] = guess
        one["index"] = seq
        one["number"] = number
        questions.append(one)

    if not questions:
        raise HTTPException(status_code=400, detail="没能从这段文字里切出题目。")

    first = questions[0]
    return {
        "raw_text": cleaned_text,
        # 多题结果
        "questions": questions,
        "question_count": len(questions),
        "header": header,
        # 兼容老调用方：等价于第一题
        "subject": first.get("subject", ""),
        "question_type": first.get("question_type", ""),
        "question_content": first.get("question_content", ""),
        "answer": first.get("answer", ""),
        "parser": first.get("parser", "local"),
    }
