# api_client.py
"""数据获取入口。

两种情况：
- USE_MOCK=True  直接用本地 mock
- USE_MOCK=False 请求后端，字段用 schema_adapter 归一化

后端连不上时，若 FALLBACK_TO_MOCK 为 True，会自动退回 mock，
看板照常显示，只是在界面上标注「后端未连通」。
"""

import requests

import config
from mock_data import get_mock_response_from_events
from schema_adapter import normalize, check, contract_status


# 上一次请求的结果，界面用来显示数据来源
LAST_STATUS = {
    "source": "mock",       # mock / api / fallback
    "url": None,
    "detail": "",
    "warnings": [],
    "contract": None,       # 接口符合正式契约的程度
}


def _mock(device_id, reason="", source="mock"):
    LAST_STATUS.update({
        "source": source,
        "url": None,
        "detail": reason,
        "warnings": [],
        "contract": None,
    })
    return get_mock_response_from_events(device_id=device_id)


def _try_urls(device_id):
    """按候选路径依次尝试，返回 (json, url) 或 (None, 错误说明)。"""
    errors = []
    for url in config.analysis_urls(device_id):
        try:
            resp = requests.get(url, timeout=config.REQUEST_TIMEOUT)
        except requests.exceptions.ConnectionError:
            errors.append(f"{url} 连不上")
            # 端口都没开，后面的不用试了
            break
        except requests.exceptions.Timeout:
            errors.append(f"{url} 超时")
            continue
        except requests.exceptions.RequestException as e:
            errors.append(f"{url} 请求异常 {e}")
            continue

        if resp.status_code == 200:
            try:
                return resp.json(), url
            except ValueError:
                errors.append(f"{url} 返回的不是 JSON")
                continue

        if resp.status_code == 404:
            errors.append(f"{url} 404")
            continue
        if resp.status_code == 401:
            raise Exception("后端要求授权，检查 token 或设备注册")
        if resp.status_code >= 500:
            raise Exception(f"后端错误 {resp.status_code}：{resp.text[:200]}")

        errors.append(f"{url} HTTP {resp.status_code}")

    return None, "；".join(errors[-3:]) if errors else "所有候选路径都失败"


def fetch_analysis(device_id=None):
    """获取分析数据，返回看板标准结构。"""
    dev = device_id or config.DEVICE_ID

    if config.USE_MOCK:
        return _mock(dev)

    try:
        raw, url = _try_urls(dev)
    except Exception as e:
        if config.FALLBACK_TO_MOCK:
            return _mock(dev, reason=str(e), source="fallback")
        raise

    if raw is None:
        if config.FALLBACK_TO_MOCK:
            return _mock(dev, reason=url, source="fallback")
        raise Exception(f"拿不到数据：{url}")

    data = normalize(raw, device_id=dev)
    warns = check(data)
    contract = contract_status(data)

    LAST_STATUS.update({
        "source": "api",
        "url": url,
        "detail": "",
        "warnings": warns,
        "contract": contract,
    })
    return data


def check_health():
    """探测后端是否可用，联调前先跑这个。"""
    if config.USE_MOCK:
        return {"status": "mock", "detail": "当前配置为使用 mock 数据"}

    errors = []
    for url in config.analysis_urls():
        probe = url.split("?")[0]
        try:
            resp = requests.get(probe, timeout=min(config.REQUEST_TIMEOUT, 3))
            return {
                "status": "ok",
                "url": probe,
                "http": resp.status_code,
                "detail": f"{probe} 可访问（HTTP {resp.status_code}）",
            }
        except requests.exceptions.ConnectionError:
            errors.append(probe)
            break
        except Exception as e:
            errors.append(f"{probe} {type(e).__name__}")

    return {
        "status": "down",
        "url": config.API_BASE_URL,
        "detail": f"连不上 {config.API_BASE_URL}，确认后端是否已启动、端口是否为 8010",
    }
