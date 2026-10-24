"""OCR 长文本解析。

前端把 OCR 得到的整段文本发过来，这里按规则切成科目 / 题型 / 题干 / 答案，
前端拿到就能直接填表。

为什么用规则而不是大模型：
- 本地演示，中途没有网络也没有 API key，规则永远可用，不会在评委面前挂掉
- 规则可解释，切错了能看出是哪一条命中的，改起来也快
- 题目结构很固定（题干 + 选项 / 小问 + 答案），规则够用

要换成模型调用时，动 `_classify_subject` 和 `_split_answer` 两个函数就行，
对外的输入输出契约不用变。

真实输入长这样（Windows OCR 的中文识别会在每个字之间插空格）：

    已 知 函 数 的 定 义 域 为 （ 0 ， + ） ， 尸 ） 是 其 导 函 数 ， 且 满 足
    可 ） 一 歹 > 0 ，
    且 2 ） = 2 ， 则 不 等 式

所以清洗是第一步，也是决定成败的一步。
"""

from __future__ import annotations

import re
from typing import Any

__all__ = ["parse", "normalize", "MAX_TEXT_LEN"]

# 单次解析的文本上限。OCR 出来的东西再长也不会超过这个量级，
# 超过就是误传了内容，截断避免正则在大文本上跑太久。
MAX_TEXT_LEN = 20000

_CJK = r"\u4e00-\u9fff"

# OCR 在数学表达式里经常把运算符认成全角，中文正文里几乎不会出现全角 ＋－＝，
# 所以这几类可以放心归一化。
_OPERATOR_MAP = (
    ("＋", "+"),
    ("－", "-"),
    ("＝", "="),
    ("＜", "<"),
    ("＞", ">"),
    ("％", "%"),
    ("／", "/"),
)

_CN_PUNCT = "，。；：、？！）】」』》"


# ---------------------------------------------------------------- 文本清洗

def normalize(text: str) -> str:
    """把 OCR 原始文本整理成能读、能切的样子。"""
    if not text:
        return ""

    s = text.replace("\r\n", "\n").replace("\r", "\n")
    s = s.replace("\u3000", " ").replace("\xa0", " ").replace("\u200b", "")

    for src, dst in _OPERATOR_MAP:
        s = s.replace(src, dst)

    # 汉字之间的空格：反复替换，处理「已 知 函 数」这种密集插空
    prev = None
    while prev != s:
        prev = s
        s = re.sub(rf"(?<=[{_CJK}])[ \t]+(?=[{_CJK}])", "", s)

    # 汉字与全角标点之间的空格
    s = re.sub(rf"[ \t]+(?=[{_CN_PUNCT}])", "", s)
    s = re.sub(r"(?<=[（【「『《])[ \t]+", "", s)

    # 中文标点后多余的空格（保留英文句点后空格，避免破坏英文句子）
    s = re.sub(rf"(?<=[{_CN_PUNCT}])[ \t]+", "", s)

    # 行内多余空白压成一个
    s = re.sub(r"[ \t]{2,}", " ", s)
    # 三个以上连续换行压成两个
    s = re.sub(r"\n{3,}", "\n\n", s)

    return s.strip()


def _ends_with_punct(line: str) -> bool:
    return bool(line) and line[-1] in _CN_PUNCT + ",.;:?!)）】"


def _join_wrapped_lines(lines: list[str]) -> list[str]:
    """把 OCR 因为页宽硬断开的行接回去。

    只在「上一行没有标点结尾，且本行不是选项或小问标记」时合并，
    否则会把选择题的四个选项粘成一坨。
    """
    out: list[str] = []
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        if out and not _ends_with_punct(out[-1]) and not _looks_like_marker(line):
            out[-1] = out[-1] + line
        else:
            out.append(line)
    return out


def _looks_like_marker(line: str) -> bool:
    """这一行是不是一个新的结构标记（选项 / 小问 / 答案段）。"""
    return bool(
        re.match(r"^[ABCD]\s*[.．、:：)）]", line)
        or re.match(r"^[（(]\s*\d+\s*[）)]", line)
        or re.match(r"^【", line)
        or re.match(r"^(答案|解析|详解|解答|解|答|证明)\s*[:：]", line)
    )


# ---------------------------------------------------------------- 分科

# 关键词按「命中就加分」用，长词更可信（避免「力」这种单字到处误伤）
_SUBJECT_KEYWORDS: dict[str, tuple[str, ...]] = {
    "数学": (
        "函数", "导数", "定义域", "值域", "单调", "极值", "切线", "不等式",
        "方程", "数列", "等差", "等比", "通项", "概率", "统计", "期望", "方差",
        "三角", "正弦", "余弦", "向量", "集合", "双曲线", "椭圆", "抛物线",
        "圆锥", "离心率", "焦点", "斜率", "立体", "棱锥", "棱柱", "球体",
        "面积", "体积", "复数", "矩阵", "排列", "组合", "二项式", "坐标系",
        "判别式", "交集", "并集",
    ),
    "物理": (
        "加速度", "速度", "位移", "牛顿", "摩擦", "受力", "动能", "势能",
        "电场", "磁场", "电流", "电压", "电阻", "电容", "功率", "压强",
        "温度", "热量", "内能", "折射", "反射", "波长", "频率", "透镜",
        "匀速", "圆周运动", "动量", "冲量", "电磁感应", "热力学", "机械能",
    ),
    "化学": (
        "化学", "元素", "分子", "原子", "离子", "化合物", "氧化", "还原",
        "摩尔", "浓度", "溶液", "沉淀", "电解质", "电解", "催化", "有机物",
        "酯化", "羟基", "羧基", "化学键", "反应速率",
    ),
    "英语": (
        "完形填空", "阅读理解", "语法填空", "单项选择", "时态", "语态",
        "从句", "定语从句", "虚拟语气", "非谓语", "介词", "冠词", "被动语态",
        "翻译", "单词", "短语", "词性",
    ),
    "语文": (
        "作文", "古诗", "文言文", "修辞", "议论", "说明文", "记叙文", "病句",
        "成语", "拼音", "汉字", "诗句", "主旨", "默写",
    ),
    "生物": (
        "细胞", "基因", "DNA", "蛋白", "遗传", "光合", "呼吸作用", "酶",
        "染色体", "种群", "生态", "免疫", "激素", "减数分裂",
        "有丝分裂", "变异", "组织液",
    ),
    "历史": (
        "朝代", "革命", "战争", "条约", "变法", "王朝", "世纪", "起义",
        "君主", "帝国", "改革", "史料",
    ),
    "地理": (
        "气候", "地形", "洋流", "经纬", "大气", "季风", "地貌", "板块",
        "城市化", "水文", "植被", "等压线", "褶皱", "三角洲",
    ),
    "政治": (
        "哲学", "法律", "政府", "市场", "民主", "权利", "义务", "价值观",
        "经济生活", "政治生活", "文化生活", "辩证法", "唯物",
    ),
}


def _classify_subject(text: str) -> tuple[str, dict[str, int]]:
    """返回 (科目, 各科得分)。识别不出来时科目为空串。"""
    scores: dict[str, int] = {}

    for subject, words in _SUBJECT_KEYWORDS.items():
        score = 0
        for word in words:
            hits = text.count(word)
            if hits:
                # 三字以上的词更能说明问题，加两倍权重
                score += hits * (2 if len(word) >= 3 else 1)
        if score:
            scores[subject] = score

    # 英文题：关键词命中不到但英文占比很高时判英语
    if not scores or max(scores.values()) < 2:
        latin = sum(1 for ch in text if ch.isascii() and ch.isalpha())
        if text and latin / max(len(text), 1) > 0.45:
            scores["英语"] = scores.get("英语", 0) + 3

    if not scores:
        return "", {}

    best = max(scores, key=lambda k: scores[k])
    return best, dict(sorted(scores.items(), key=lambda kv: -kv[1]))


# ---------------------------------------------------------------- 知识点

# 跟看板已有的知识点名对齐，这样 OCR 录进来的题能落进同一个榜单条目，
# 不会因为写了「导数」和「导数与函数」被拆成两行。
_KNOWLEDGE_POINTS: dict[str, tuple[str, ...]] = {
    "导数与函数": ("导数", "单调", "极值", "切线", "定义域", "值域", "奇偶性", "周期性"),
    "圆锥曲线": ("双曲线", "椭圆", "抛物线", "圆锥", "离心率", "焦点", "准线"),
    "概率统计": ("概率", "统计", "期望", "方差", "分布", "排列", "组合", "抽样"),
    "数列": ("数列", "等差数列", "等比数列", "通项"),
    "立体几何": ("立体", "三棱锥", "四棱锥", "棱柱", "空间角", "二面角", "空间向量"),
    "三角函数": ("三角", "正弦", "余弦", "正切", "解三角形"),
    "集合与不等式": ("集合", "交集", "并集", "补集", "不等式组"),
    "力学": ("加速度", "牛顿", "摩擦", "受力", "动量", "机械能", "圆周运动"),
    "电磁学": ("电场", "磁场", "电流", "电压", "电阻", "电磁感应", "电容器"),
    "热学": ("温度", "热量", "压强", "内能", "热力学"),
    "光学": ("折射", "反射", "波长", "透镜", "成像", "干涉"),
    "语法填空": ("语法填空", "时态", "语态", "从句", "非谓语", "冠词"),
    "阅读理解": ("阅读理解", "短文", "passage"),
    "完形填空": ("完形填空", "完形"),
    "化学基础": ("摩尔", "浓度", "溶液", "氧化", "还原", "电解", "化学键"),
}


def _classify_knowledge_point(text: str, subject: str) -> str:
    """挑一个最贴合的知识点。挑不出来就返回空串，让用户自己填。"""
    scores: dict[str, int] = {}
    for point, words in _KNOWLEDGE_POINTS.items():
        score = 0
        for word in words:
            hits = text.count(word)
            if hits:
                score += hits * (2 if len(word) >= 3 else 1)
        if score:
            scores[point] = score

    if not scores:
        return ""

    best = max(scores, key=lambda k: scores[k])
    # 只有一分说明只蹭到一个单字，不够可信
    return best if scores[best] >= 2 else ""


# ---------------------------------------------------------------- 选项

_OPTION_MARK = re.compile(r"(?:^|\n|\s)([ABCD])\s*[.．、:：)）]\s*", re.MULTILINE)


def _extract_options(text: str) -> tuple[dict[str, str], tuple[int, int] | None]:
    """抽出 A/B/C/D 四个选项。

    题干里也常出现「A、B 两点」，所以只认字母严格递增、且四段内容都不空的
    那一组，从后往前找（真选项通常在文本靠后的位置）。
    """
    marks = [(m.group(1), m.start(), m.end()) for m in _OPTION_MARK.finditer(text)]

    runs: list[list[tuple[str, int, int]]] = []
    current: list[tuple[str, int, int]] = []
    expected = "A"
    for mark in marks:
        letter = mark[0]
        if letter == expected:
            current.append(mark)
            expected = chr(ord(expected) + 1)
            if len(current) == 4:
                runs.append(current)
                current = []
                expected = "A"
        elif letter == "A":
            current = [mark]
            expected = "B"
        else:
            current = []
            expected = "A"

    for run in reversed(runs):
        options: dict[str, str] = {}
        ok = True
        for idx, (_letter, _start, end) in enumerate(run):
            stop = run[idx + 1][1] if idx + 1 < len(run) else len(text)
            body = text[end:stop].strip()
            if idx == 3:
                # D 之后的内容可能是答案段，切掉
                body = re.split(r"\n(?=【|答案|解析|详解)", body)[0].strip()
            if not body or len(body) > 300:
                ok = False
                break
            options[run[idx][0]] = body
        if ok and len(options) == 4:
            return options, (run[0][1], run[-1][2])

    return {}, None


# ---------------------------------------------------------------- 题干 / 答案

# 行首出现这些标记，就认为答案从这里开始
_ANSWER_MARKERS = (
    r"【\s*答案\s*】",
    r"【\s*参考答案\s*】",
    r"【\s*解析\s*】",
    r"【\s*详解\s*】",
    r"【\s*分析\s*】",
    r"^\s*参考答案\s*[:：]",
    r"^\s*答案\s*[:：]",
    r"^\s*解析\s*[:：]",
    r"^\s*详解\s*[:：]",
    r"^\s*解答\s*[:：]",
    r"^\s*解\s*[:：]",
    r"^\s*答\s*[:：]",
)

_ANSWER_PATTERN = re.compile("|".join(_ANSWER_MARKERS), re.MULTILINE)


def _split_answer(text: str) -> tuple[str, str]:
    """把文本切成 (题干, 答案)。没有答案标记时答案为空。"""
    match = _ANSWER_PATTERN.search(text)

    if not match:
        return text.strip(), ""

    head = text[: match.start()].strip()
    tail = text[match.start():].strip()

    # 去掉答案段开头的那个标记本身，前端自己会加标签
    tail = _ANSWER_PATTERN.sub("", tail, count=1).strip()

    return head, tail


# ---------------------------------------------------------------- 题型

_BLANK_MARK = re.compile(r"_{3,}|[（(]\s{2,}[）)]|\u3000{2,}")


def _detect_question_type(question: str, options: dict[str, str]) -> str:
    """返回『选择题』/『填空题』/『解答题』。"""
    if len(options) == 4:
        return "选择题"

    if _BLANK_MARK.search(question):
        return "填空题"

    # 小问标记或「求 …」「证明 …」都按解答题处理
    if re.search(r"[（(]\s*[12]\s*[）)]", question):
        return "解答题"
    if re.search(r"(求|证明|试求|求证)", question):
        return "解答题"

    return "填空题"


# 后端错题接口目前只接受 choice / fill，解答题先按 fill 存，
# 内容本身不受影响，只是题型标签会显示成填空题。
_TYPE_CODE = {
    "选择题": "choice",
    "填空题": "fill",
    "解答题": "fill",
}


# ---------------------------------------------------------------- 主入口

def parse(text: str) -> dict[str, Any]:
    """把 OCR 长文本解析成前端填表需要的字段。

    返回的 subject / question_type / question_content / answer
    是前端约定的四个字段，其余是方便前端直接复用接口的附加信息。
    """
    if text is None:
        text = ""
    if len(text) > MAX_TEXT_LEN:
        text = text[:MAX_TEXT_LEN]

    cleaned = normalize(text)
    if not cleaned:
        return {
            "subject": "",
            "question_type": "",
            "question_content": "",
            "answer": "",
            "question_type_code": "fill",
            "knowledge_point": "",
            "options": {},
            "confidence": {"subject": 0, "answer": 0},
            "warnings": ["文本为空"],
        }

    lines = _join_wrapped_lines(cleaned.split("\n"))
    body = "\n".join(lines)

    options, option_span = _extract_options(body)

    # 先把选项从正文里摘出去，免得选项字母干扰科目和题型的判断
    stem_source = body
    if option_span:
        start, end = option_span
        tail = body[end:]
        tail = tail.split("\n", 1)[1] if "\n" in tail else ""
        stem_source = body[:start] + ("\n" + tail if tail.strip() else "")

    question, answer = _split_answer(stem_source)
    question = question.strip()

    subject, subject_scores = _classify_subject(body)
    question_type = _detect_question_type(question, options)
    knowledge_point = _classify_knowledge_point(question, subject)

    warnings: list[str] = []
    if not subject:
        warnings.append("没识别出科目，请手动选择")
    if not question:
        warnings.append("没切出题干，请手动补全")
    if question_type == "选择题" and len(options) != 4:
        warnings.append("识别到选择题但选项不全")
    if question_type == "解答题":
        warnings.append("解答题会按填空题存储（后端题型枚举暂未包含解答题）")

    best_score = max(subject_scores.values()) if subject_scores else 0

    return {
        "subject": subject,
        "question_type": question_type,
        "question_content": question,
        "answer": answer,
        "question_type_code": _TYPE_CODE.get(question_type, "fill"),
        "knowledge_point": knowledge_point,
        "options": options,
        "confidence": {
            "subject": min(best_score, 20),
            "answer": 2 if answer else 0,
        },
        "warnings": warnings,
    }
