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

/** 手机端统一使用的设备标识，上传和查询必须保持一致。 */
export const DEVICE_ID = 'android_emulator_01';

/** 看板默认统计天数。 */
export const ANALYSIS_DAYS = 7;
