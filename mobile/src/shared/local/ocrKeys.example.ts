/**
 * 百度 OCR 的密钥模板。
 *
 * 复制成 ocrKeys.ts 再填自己的，那个文件不会进仓库：
 *   cp src/shared/local/ocrKeys.example.ts src/shared/local/ocrKeys.ts
 *
 * 密钥去 https://console.bce.baidu.com/ai/ 拿（文字识别 → 应用列表）。
 * 填了之后 App 可以直接调百度识别，不用电脑跑后端。
 * 留空的话拍照识别会退回手机本地 ML Kit，只返回整段文字、不分题。
 */
export const BAIDU_OCR_API_KEY = '';
export const BAIDU_OCR_SECRET_KEY = '';
