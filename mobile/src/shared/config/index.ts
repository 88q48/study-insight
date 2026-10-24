import { NativeModules, Platform } from 'react-native';

/**
 * 手动指定后端主机（只填 IP 或域名，不带 http:// 和端口）。
 *
 * 留空即可，会自动从 Metro 的地址推出来，下面三种情况都能连对：
 *   模拟器：Metro 在 10.0.2.2:8081  -> 后端也连 10.0.2.2:8010
 *   真机：Metro 在 192.168.x.x:8081 -> 后端也连 192.168.x.x:8010
 *   adb reverse：Metro 在 localhost:8081 -> 后端也连 localhost:8010
 *               （需要同时执行 adb reverse tcp:8010 tcp:8010）
 *
 * 只有当自动推导不出来、或者想强制指定某台机器时，才在这里填。
 * 例如：const API_HOST_OVERRIDE = '192.168.1.8';
 */
const API_HOST_OVERRIDE = '127.0.0.1';

const API_PORT = 8010;

/** 从 Metro 打包地址里取出开发机的主机名 / IP。 */
function detectDevHost(): string | null {
  try {
    const scriptURL: string | undefined = (NativeModules as any)?.SourceCode
      ?.scriptURL;
    if (!scriptURL) {
      return null;
    }
    const match = /^https?:\/\/([^/:]+)/.exec(scriptURL);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function resolveApiBaseUrl(): string {
  if (API_HOST_OVERRIDE) {
    return `http://${API_HOST_OVERRIDE}:${API_PORT}`;
  }

  const host = detectDevHost();
  if (host) {
    return `http://${host}:${API_PORT}`;
  }

  // 拿不到 Metro 地址时的兜底
  return Platform.OS === 'android'
    ? `http://10.0.2.2:${API_PORT}`
    : `http://127.0.0.1:${API_PORT}`;
}

/** 后端地址。解析失败时连不上，日志里会打出实际用的地址，方便排查。 */
export const API_BASE_URL = resolveApiBaseUrl();

// eslint-disable-next-line no-console
console.log('[config] API_BASE_URL =', API_BASE_URL);

/**
 * 手机端统一使用的设备标识，上传和查询必须保持一致。
 *
 * 和后端默认设备、看板默认设备保持一致，这样手机录的题
 * 在看板上能直接看到。三端各用各的 ID 会变成三本独立的账。
 */
export const DEVICE_ID = 'win_device_01';

/** 看板默认统计天数。 */
export const ANALYSIS_DAYS = 7;
