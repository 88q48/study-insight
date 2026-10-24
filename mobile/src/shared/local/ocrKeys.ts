/**
 * 百度 OCR 密钥。默认留空，拍照识别会退回手机本地 ML Kit。
 *
 * 想用百度识别（能分题、更准），填上自己的密钥：
 *   1. https://console.bce.baidu.com/ai/ → 文字识别 → 创建应用
 *   2. 把 API Key / Secret Key 填到下面两个常量
 *   3. 别提交改动：git update-index --skip-worktree src/shared/local/ocrKeys.ts
 *
 * 第 3 步很重要。仓库是公开的，密钥提交上去等于公开送人刷额度。
 */
export const BAIDU_OCR_API_KEY = '';
export const BAIDU_OCR_SECRET_KEY = '';
