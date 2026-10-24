/* config.js — 网页版配置
 *
 * 联调时改这里，不用动其他文件：
 *   USE_MOCK = false，并把 API_BASE_URL 改成后端的真实地址。
 *
 * 页面右上角也可以直接切换「设备 / 数据源」，切换后会带上 URL 参数并刷新，
 * 不需要修改本文件。
 *
 * 注意：用 file:// 直接打开网页时，浏览器会因为跨域策略
 * 拦住对 localhost 的请求。联调请改用 http 方式打开，
 * 比如在 dashboard/web 目录下跑：
 *     python -m http.server 8080
 * 然后访问 http://127.0.0.1:8080
 */
window.CONFIG = {
  // true = 用 mock-data.js 里的数据；false = 请求后端
  USE_MOCK: true,

  // 后端接口前缀。留空表示按同源推导（后端挂 /dashboard 时最省事）
  // 本机联调也可以直接写 "http://127.0.0.1:8010/api/v1"
  API_BASE_URL: "",

  // 接口路径：留一个就够，填后端实际给的那条
  ANALYSIS_PATH: "/analysis",

  // 连不上后端时是否自动退回 mock，避免页面空白
  FALLBACK_TO_MOCK: true,

  // 当前设备标识（三端统一）
  DEVICE_ID: "win_device_01",

  // 统计天数
  DAYS: 7,

  // 请求超时（毫秒）
  TIMEOUT: 10000
};
