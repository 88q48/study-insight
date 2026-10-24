/**
 * 手机独立版配置。
 *
 * 数据全部保存在手机本机，不再推导开发机 IP，也不请求 8010 后端。
 * OCR 在手机上直连百度，失败时回退 ML Kit。
 */
export const DEVICE_ID = 'local_phone';

/** 看板默认统计天数。 */
export const ANALYSIS_DAYS = 7;

