import { Platform } from 'react-native';

/**
 * 后端地址。
 *
 * - Android 模拟器：10.0.2.2 指向宿主机
 * - iOS 模拟器：127.0.0.1
 * - 真机联调：改成电脑的局域网 IP，例如 http://192.168.1.8:8010
 */
export const API_BASE_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:8010'
    : 'http://127.0.0.1:8010';

/**
 * 手机端统一使用的设备标识，上传和查询必须保持一致。
 *
 * 和后端默认设备、看板默认设备保持一致，这样手机录的题
 * 在看板上能直接看到。三端各用各的 ID 会变成三本独立的账。
 */
export const DEVICE_ID = 'win_device_01';

/** 看板默认统计天数。 */
export const ANALYSIS_DAYS = 7;
