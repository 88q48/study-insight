# config.py
"""看板配置。

改配置有三种方式，优先级从高到低：
1. 环境变量（CI 或临时联调最方便）
2. 改这个文件
3. 默认值

联调时最省事的做法：
    set SI_API=http://127.0.0.1:8010/api/v1
    set SI_USE_MOCK=0
    streamlit run dashboard/app.py
"""

import os


def _env_bool(name, default):
    v = os.environ.get(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "y", "on")


# 后端 API 基础地址（后端的 FastAPI 跑在 8010）
API_BASE_URL = os.environ.get(
    "SI_API", "http://127.0.0.1:8010/api/v1"
)

# 是否使用 mock 数据
# True  = 不调后端，用 mock_data.py
# False = 调真实接口
USE_MOCK = _env_bool("SI_USE_MOCK", True)

# 连不上后端时自动退回 mock，不白屏
FALLBACK_TO_MOCK = _env_bool("SI_FALLBACK", True)

# 请求超时（秒）
REQUEST_TIMEOUT = int(os.environ.get("SI_TIMEOUT", "10"))

# 当前设备 ID
DEVICE_ID = os.environ.get("SI_DEVICE", "win_device_01")

# 统计天数
DAYS = int(os.environ.get("SI_DAYS", "7"))


# 后端接口路径模板，按顺序尝试。
# 不同人写的路由风格不一样，多试几个总有一个能中。
ANALYSIS_PATHS = [
    "/analysis?days={days}",
    "/devices/{device_id}/analysis?days={days}",
    "/devices/{device_id}/analysis",
    "/analysis",
]


def analysis_urls(device_id=None, days=None):
    """生成所有候选请求地址，按顺序试。"""
    dev = device_id or DEVICE_ID
    d = days or DAYS
    base = API_BASE_URL.rstrip("/")
    return [
        base + p.format(device_id=dev, days=d)
        for p in ANALYSIS_PATHS
    ]
