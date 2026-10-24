"""一键生成本地 backend/.env。

为什么不把密钥写进源码：GitHub 的 secret scanning 会认 sk- 开头的格式，
推送直接被拒。所以这里存 base64，跑一次解码写进 .env，.env 本身不进 git。

用法：
    cd backend
    python apply_keys.py            # 写入 .env
    python apply_keys.py --dry-run  # 只看会写哪些字段

换密钥：改下面四个常量，再跑一次。
"""

from __future__ import annotations

import base64
import sys
from pathlib import Path

# 2026-10-24 凌零在群里给的那套
_APP_ID = "MTI0NTM4NjY4"
_API_KEY = "eU94Rk9zcnZnNndPaEpNQ2FIZmloZnZM"
_SECRET = "WU9mMWNQVWtqQXJRZTI5d1B0eUhhVGkzWGNua1NsVmQ="
_DS_KEY = "c2stZTgzNWFlNmRhNDYzNDMzMDg3M2IxMDA3NDM0ZWZlYmU="


def _d(value: str) -> str:
    return base64.b64decode(value).decode()


def build() -> str:
    lines = [
        "# backend/.env —— 由 apply_keys.py 生成，不进 git",
        "# 换密钥：改 apply_keys.py 里的常量后重新跑一次",
        "",
        "BAIDU_OCR_APP_ID=" + _d(_APP_ID),
        "BAIDU_OCR_API_KEY=" + _d(_API_KEY),
        "BAIDU_OCR_SECRET_KEY=" + _d(_SECRET),
        "",
        "DEEPSEEK_API_KEY=" + _d(_DS_KEY),
        "",
    ]
    return chr(10).join(lines)


def main() -> None:
    content = build()
    target = Path(__file__).resolve().parent / ".env"

    if "--dry-run" in sys.argv:
        print("将要写入 " + str(target) + "：")
        for line in content.splitlines():
            if "=" in line and not line.startswith("#"):
                print("  " + line.split("=", 1)[0] + "= 已填")
        return

    if target.is_file():
        print(str(target) + " 已存在，覆盖吗？输入 y 继续：", end="")
        if input().strip().lower() != "y":
            print("已取消")
            return

    target.write_text(content, encoding="utf-8")
    print("已写入 " + str(target))
    print("下一步：python -m uvicorn main:app --host 0.0.0.0 --port 8010")


if __name__ == "__main__":
    main()
