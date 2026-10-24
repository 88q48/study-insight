"""极简 .env 加载器。

不引第三方依赖，只处理 KEY=VALUE 和 # 注释。

单独成模块的原因：密钥要在多个模块的顶层被读取（ocr_router 一进来就要建
客户端）。之前那版把加载逻辑放在 main.py 里，导致直接 import ocr_router
时环境变量还是空的，凭据静默变成 None —— 写个小脚本测试就会莫名其妙
报「未配置密钥」。现在谁先 import 谁触发，顺序不再重要。
"""

from __future__ import annotations

import os
from pathlib import Path

_ENV_PATH = Path(__file__).resolve().parent / ".env"


def load(path: Path | None = None) -> None:
    """把 .env 读进 os.environ。已存在的变量不覆盖。"""
    target = path or _ENV_PATH
    if not target.is_file():
        return
    for raw in target.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def get(name: str, default: str = "") -> str:
    """读环境变量，顺带去掉首尾空白。"""
    return (os.environ.get(name) or default).strip()


load()
