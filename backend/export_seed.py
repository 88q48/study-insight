"""把后端当前数据导出成 App 内置的离线快照。

App 里 src/shared/api/offlineSeed.json 就是这份文件。没有后端时（录演示视频、
把包装到别人手机、断网）App 靠它把界面撑起来，所以它得跟真实数据对得上。

什么时候要重跑：
  - 数据库里加了、删了、改了一批错题
  - 想换一套演示数据

用法（后端要起着）：
    python export_seed.py
    python export_seed.py --device win_device_01 --days 7
"""

import argparse
import io
import json
import os
import sys
import urllib.request

DEFAULT_BASE = "http://127.0.0.1:8010"
DEFAULT_DEVICE = "win_device_01"
OUT_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "mobile", "src", "shared", "api", "offlineSeed.json",
)


def fetch(base: str, path: str):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    req = urllib.request.Request(base + path)
    with opener.open(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="导出 App 用的离线快照")
    parser.add_argument("--base", default=DEFAULT_BASE, help="后端地址")
    parser.add_argument("--device", default=DEFAULT_DEVICE, help="设备 ID")
    parser.add_argument("--days", type=int, default=7, help="统计窗口天数")
    args = parser.parse_args()

    device = args.device
    try:
        errors = fetch(args.base, f"/api/v1/errors?device_id={device}&limit=200")
        analysis = fetch(
            args.base, f"/api/v1/devices/{device}/analysis?days={args.days}"
        )
        subjects = fetch(args.base, f"/api/v1/errors/subjects?device_id={device}")
    except Exception as exc:
        print(f"取数据失败：{exc}")
        print("后端起了吗？先跑 python main.py")
        return 1

    seed = {
        "_note": "演示用的离线快照。没有后端时 App 用这份数据，界面照常。",
        "generated_at": analysis.get("period", {}).get("end", "")[:10],
        "errors": errors,
        "analysis": analysis,
        "subjects": subjects,
    }

    raw = json.dumps(seed, ensure_ascii=False, separators=(",", ":"))
    target = os.path.normpath(OUT_PATH)
    with io.open(target, "w", encoding="utf-8", newline=chr(10)) as fp:
        fp.write(raw)

    stats = analysis.get("error_stats", {})
    print(f"已写出 {target}")
    print(f"  大小 {len(raw.encode('utf-8')) / 1024:.1f} KB")
    print(
        "  错题 {total_errors} 道（已掌握 {mastered_errors} / 待复习 {reviewing_errors}，"
        "掌握率 {mastery_rate}%）".format(**stats)
    )
    print(f"  科目 {len(subjects.get('subjects', []))} 个")
    print("")
    print("接着重打包才会进 APK：")
    print("  cd ../mobile/android && gradlew.bat :app:assembleRelease")
    return 0


if __name__ == "__main__":
    sys.exit(main())
