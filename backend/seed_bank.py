"""演示错题的题库。

单独拆出来，是因为 seed_demo.py 只负责「写多少条、什么时候掌握的」，
题目内容本身跟统计逻辑无关。放一起会让那个文件长得没法读。

每个知识点配一组真实的小题，按序号轮换取用。答案都是有依据算出来的，
不是占位符——练习模式的判题、正确率、掌握判定全都依赖它。
"""

from __future__ import annotations

# 知识点 → [(题型, 题干, A, B, C, D, 答案)]
# 填空题的四个选项留空串
DEMO_BANK: dict[str, list[tuple[str, str, str, str, str, str, str]]] = {
    "导数与函数": [
        ("choice", "已知函数 f(x) = x³ − 3x，则 f(x) 的极小值为（　　）",
         "−2", "0", "2", "−4", "A"),
        ("choice", "曲线 y = x² 在点 (1, 1) 处的切线斜率为（　　）",
         "1", "2", "0", "1/2", "B"),
        ("choice", "函数 f(x) = ln x − x 的单调递增区间是（　　）",
         "(0, 1)", "(1, +∞)", "(0, +∞)", "(−∞, 1)", "A"),
        ("choice", "若 f(x) = eˣ − ax 在 x = 0 处取得极值，则 a =（　　）",
         "0", "1", "e", "−1", "B"),
    ],
    "立体几何": [
        ("fill", "棱长为 2 的正方体，其外接球的表面积为 ______。", "", "", "", "", "12π"),
        ("fill", "底面半径为 1、高为 3 的圆锥，其体积为 ______。", "", "", "", "", "π"),
        ("fill", "半径为 2 的球，其体积为 ______。", "", "", "", "", "32π/3"),
        ("fill", "棱长为 a 的正四面体，其高为 ______。", "", "", "", "", "√6a/3"),
    ],
    "数列": [
        ("fill", "等差数列首项为 1、公差为 2，则第 10 项为 ______。", "", "", "", "", "19"),
        ("fill", "等比数列首项为 2、公比为 3，则第 4 项为 ______。", "", "", "", "", "54"),
        ("fill", "数列 1, 1, 2, 3, 5, 8, … 的下一项是 ______。", "", "", "", "", "13"),
        ("fill", "等差数列 3, 7, 11, … 的第 20 项为 ______。", "", "", "", "", "79"),
    ],
    "概率统计": [
        ("choice", "掷一枚均匀骰子，出现偶数点的概率是（　　）",
         "1/6", "1/3", "1/2", "2/3", "C"),
        ("choice", "从 1, 2, 3, 4 中任取两个数，其和为 5 的概率是（　　）",
         "1/6", "1/3", "1/2", "2/3", "B"),
        ("choice", "一组数据 2, 4, 4, 6 的平均数是（　　）",
         "3", "4", "5", "6", "B"),
        ("choice", "数据 1, 2, 3, 4, 5 的方差是（　　）",
         "1", "2", "3", "4", "B"),
    ],
    "电磁学": [
        ("choice", "两个点电荷间距离减半，库仑力变为原来的（　　）",
         "2 倍", "4 倍", "1/2", "1/4", "B"),
        ("choice", "一段导线电阻为 R，均匀拉长为原来的 2 倍，电阻变为（　　）",
         "2R", "4R", "R/2", "R/4", "B"),
        ("choice", "电容器两端电压加倍，其储存的电能变为原来的（　　）",
         "2 倍", "4 倍", "1/2", "不变", "B"),
        ("choice", "匀强磁场中导体棒垂直切割磁感线，感应电动势与（　　）成正比",
         "时间", "速度", "位移", "质量", "B"),
    ],
    "力学": [
        ("fill", "质量为 2 kg 的物体受到 6 N 的合力，其加速度为 ______ m/s²。", "", "", "", "", "3"),
        ("fill", "物体从 20 m 高处自由下落，落地时间约为 ______ s（g 取 10）。", "", "", "", "", "2"),
        ("fill", "质量为 5 kg 的物体以 2 m/s 运动，其动量为 ______ kg·m/s。", "", "", "", "", "10"),
        ("fill", "用 10 N 的水平力推物体前进 3 m，做功为 ______ J。", "", "", "", "", "30"),
    ],
    "光学": [
        ("fill", "光在真空中的传播速度约为 ______ m/s。", "", "", "", "", "3×10⁸"),
        ("fill", "焦距为 10 cm 的凸透镜，物距 30 cm 时像距为 ______ cm。", "", "", "", "", "15"),
        ("fill", "光从空气斜射入水中，折射角 ______ 入射角（填「大于」或「小于」）。", "", "", "", "", "小于"),
        ("fill", "波长为 600 nm 的光，其频率约为 ______ Hz。", "", "", "", "", "5×10¹⁴"),
    ],
    "热学": [
        ("fill", "一定质量的理想气体等压膨胀，温度升高时体积 ______（填「增大」或「减小」）。", "", "", "", "", "增大"),
        ("fill", "标准大气压约为 ______ Pa。", "", "", "", "", "1.01×10⁵"),
        ("fill", "质量为 1 kg 的水温度升高 1 ℃，吸收的热量为 ______ J（比热容取 4.2×10³）。", "", "", "", "", "4.2×10³"),
        ("fill", "0 ℃ 对应的热力学温度为 ______ K。", "", "", "", "", "273"),
    ],
    "完形填空": [
        ("choice", "He ______ to school by bike every day.",
         "go", "goes", "going", "gone", "B"),
        ("choice", "She has lived here ______ 2010.",
         "for", "since", "in", "at", "B"),
        ("choice", "The book ______ by many students last year.",
         "read", "was read", "reads", "reading", "B"),
        ("choice", "I would rather you ______ tomorrow morning.",
         "come", "came", "will come", "coming", "B"),
    ],
    "阅读理解": [
        ("choice", "The old man sat by the river every morning. What was he most likely doing?（　　）",
         "Fishing", "Reading", "Working", "Sleeping", "A"),
        ("choice", "According to the passage, the writer's attitude towards the activity is（　　）",
         "negative", "positive", "neutral", "doubtful", "B"),
        ("choice", "In the sentence \"He had been living there for over thirty years\", \"there\" refers to（　　）",
         "the river", "the town", "the school", "the office", "B"),
        ("choice", "The main purpose of this passage is to（　　）",
         "share an experience", "criticize a habit", "explain a rule", "compare two places", "A"),
    ],
    "语法填空": [
        ("fill", "He is good at ______ (swim). 请填入正确形式。", "", "", "", "", "swimming"),
        ("fill", "The book was written ______ Mark Twain.（填介词）", "", "", "", "", "by"),
        ("fill", "She is the girl ______ won the first prize.（填关系代词）", "", "", "", "", "who"),
        ("fill", "If it ______ (rain) tomorrow, we will stay at home.", "", "", "", "", "rains"),
    ],
}


def pick_question(point: str, index: int) -> dict[str, str]:
    """按知识点和序号取一道题，取不到时返回一个安全的占位（带答案）。"""
    bank = DEMO_BANK.get(point)
    if not bank:
        return {
            "question_type": "fill",
            "content": f"演示错题：{point} 第 {index} 题",
            "answer": "略",
            "option_a": "", "option_b": "", "option_c": "", "option_d": "",
        }

    qtype, stem, a, b, c, d, ans = bank[(index - 1) % len(bank)]
    return {
        "question_type": qtype,
        "content": stem,
        "answer": ans,
        "option_a": a, "option_b": b, "option_c": c, "option_d": d,
    }
