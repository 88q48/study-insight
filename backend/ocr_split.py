"""把 OCR 出来的整页文字切成多道题。

背景：ocr_parser.parse() 只处理单题。一张试卷拍进去，好几道题会糊成一道，
选项串到别的题上，答案也混在一起。这个模块只负责「切」，每段再交给
parse() 解析，所以 parse() 的单题行为完全不变。

拆成独立文件而不是改 parse()，是因为单题那条路已经在用、有测试锁着。
"""

from __future__ import annotations

import re
from typing import Any

import ocr_parser

# 空白字符集：普通空格、制表符、全角空格。用 chr() 拼出来，
# 避免在正则里写转义序列（这个文件因此完全没有反斜杠）。
_WS = " " + chr(9) + chr(12288)


def _cls(chars: str) -> str:
    """包成正则字符类。"""
    return "[" + chars + "]"


# 一行开头像不像新题的题号。
# 认：1.  1、  1)  1．  （1）  (1)  第1题
# 题号前可能还挂着一个填空括号（OCR 会把「（  ）8.」整串读成一行）。
_START = re.compile("".join([
    "^", _cls(_WS), "*",
    "(?:[（(]", _cls(_WS), "*[）)]",
    "|[（(][0-9]{1,3}[）)])?",
    _cls(_WS), "*",
    "(?:",
    "[0-9]{1,3}[.、)）．]",
    "|第[0-9]{1,3}题",
    ")",
]))

# 答案区的分界标记
_ANSWER_MARK = re.compile(
    "(参考答案|答案与解析|答案解析|答案|解析|详解)" + _cls(_WS) + "*[:：]?"
)

# 答案区里的一条。整行锚定，免得题干里 f(2) 这种被误当成第 2 题。
_ANSWER_ITEM = re.compile("".join([
    "^", _cls(_WS), "*([0-9]{1,3})",
    "[.、．)）:：]",
    _cls(_WS), "*(.+)",
]))

# 答案内容以选择题字母开头：A / B / C / D
_CHOICE_HEAD = re.compile("^([A-Da-d])(" + _cls(_WS) + "|$)")

# 卷头那种整行没有题号、也不像题目的内容
_HEADER_HINT = re.compile("|".join([
    "考试", "模拟考", "月考", "期中", "期末", "试卷", "答题卡",
    "姓名", "班级", "学号", "得分", "满分", "时间", "分钟",
    "高三", "高二", "高一", "年级",
]))

MAX_QUESTIONS = 20


def _take_number(line: str) -> int:
    """从题号行里读出真实题号，读不到返回 0。

    卷子上的题号常常不从 1 开始（一页只拍了第 7～12 题），
    所以答案必须按真实题号去配，不能按切出来的顺序。
    """
    text = line.strip()
    # 去掉题号前面那个填空括号：「（  ）8.」里的 8 才是题号
    text = re.sub(
        "^" + _cls(_WS) + "*[（(]" + _cls(_WS) + "*[）)]" + _cls(_WS) + "*",
        "",
        text,
    )
    m = re.match("^[（(]?第?" + _cls(_WS) + "*([0-9]{1,3})", text)
    return int(m.group(1)) if m else 0


def _find_answer_mark(line: str):
    """在一行里找答案区标记，返回 match 或 None。

    只认两种：行首就是标记，或者标记落在行的后半段。
    题干里偶尔出现「答案」两个字，不该被误判成答案区。
    之所以要 search 而不是 match，是因为 OCR 常把上一题的尾巴和
    「答案与解析」挤在同一行（上一行不带标点，归一化时被接上了）。
    """
    for m in _ANSWER_MARK.finditer(line):
        if m.start() == 0:
            return m
        if m.start() >= max(4, len(line) // 2):
            return m
    return None


def _short_answer(raw: str) -> str:
    """从答案行里取出要填进「答案」框的部分。

    选择题常写成「A 配方得最小值为……」这种，用户只需要那个字母；
    解答题整行都留着，那本来就是答案。
    """
    m = _CHOICE_HEAD.match(raw)
    if m:
        return m.group(1).upper()
    return raw


def _looks_like_header(line: str) -> bool:
    """判断这一行是不是卷头信息，不是题目。"""
    s = line.strip()
    if not s:
        return True
    if _START.match(s):
        return False
    if len(s) <= 30 and _HEADER_HINT.search(s) and "（" not in s and "(" not in s:
        return True
    return False


def split_questions(text: str) -> tuple[list[str], dict[int, str], str]:
    """把整页文字切成多道题。

    返回 (题目文本列表, {题号: 答案}, 卷头文本)。

    切不出来题号时，整段当成一道题返回，保证不会因为格式奇怪就丢内容。
    """
    if not text:
        return [], {}, ""

    cleaned = ocr_parser.normalize(text)
    if not cleaned:
        return [], {}, ""

    lines = cleaned.split(chr(10))

    # 1. 找答案区起点。标记黏在上一题尾巴上时，把那一行拆开。
    answer_from = len(lines)
    for i, ln in enumerate(lines):
        m = _find_answer_mark(ln.strip())
        if m:
            if m.start() == 0:
                # 整行就是「答案：B」，内容在同一行，整行进答案区
                answer_from = i
            else:
                # 前段是题干，标记后面才是答案区，边界取下一行
                lines[i] = ln.strip()[: m.start()].strip()
                answer_from = i + 1
            break

    body_lines = [ln for ln in lines[:answer_from] if ln.strip()]
    answer_lines = lines[answer_from:]

    # 2. 按题号切
    blocks: list[list[str]] = []
    header: list[str] = []
    for ln in body_lines:
        if _START.match(ln):
            blocks.append([ln])
        elif blocks:
            blocks[-1].append(ln)
        else:
            header.append(ln)

    # 3. 切不出来就整段当一题
    if not blocks:
        joined = chr(10).join(body_lines).strip()
        return ([joined] if joined else []), {}, ""

    # 4. 第一题前面如果混进卷头信息，挪回 header
    first = blocks[0]
    while len(first) > 1 and _looks_like_header(first[0]):
        header.append(first.pop(0))

    blocks = [b for b in blocks if "".join(b).strip()][:MAX_QUESTIONS]

    # 5. 解析答案区
    answers: dict[int, str] = {}
    for ln in answer_lines:
        m = _ANSWER_ITEM.match(ln)
        if not m:
            continue
        idx = int(m.group(1))
        raw = m.group(2).strip()
        if raw and idx not in answers:
            answers[idx] = _short_answer(raw)

    # 答案区一个题号都没读到（比如只有「答案：A」一句），当作第一题的
    if not answers:
        tail = chr(10).join(answer_lines).strip()
        tail = _ANSWER_MARK.sub("", tail).strip().lstrip(":：").strip()
        if tail:
            answers[1] = _short_answer(tail)

    blocks = [chr(10).join(b).strip() for b in blocks]
    return blocks, answers, chr(10).join(header).strip()


def parse_many(text: str) -> tuple[list[dict[str, Any]], str]:
    """切分后逐题解析。返回 (题目列表, 卷头文本)。"""
    blocks, answers, header = split_questions(text)

    results: list[dict[str, Any]] = []
    for seq, block in enumerate(blocks, start=1):
        one = ocr_parser.parse(block)
        # 卷子上的题号可能从 7 开始，答案要按真实题号配
        number = _take_number(block) or seq
        if not one.get("answer") and number in answers:
            one["answer"] = answers[number]
            one["confidence"] = dict(one.get("confidence") or {}, answer=2)
        one["index"] = seq
        one["number"] = number
        if not one.get("subject") and header:
            subj, _ = ocr_parser._classify_subject(header)
            if subj:
                one["subject"] = subj
        results.append(one)

    return results, header
