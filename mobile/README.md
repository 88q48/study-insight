# 手机端（React Native）

手机独立版 Android 客户端。错题、练习记录、掌握状态、学情统计和应用使用时长全部保存在手机本机，不再依赖电脑上的 8010 后端。拍照识别在手机上直连百度 OCR，失败时回退 ML Kit。

## 代码结构

```text
src/
├── app/
│   ├── navigation/          # 底部 Tab 与路由类型
│   └── screens/
│       └── PracticeScreen.tsx  # 学习 + 错题的组合页面
├── shared/
│   ├── api/                 # 页面调用的数据接口（已转发到本机实现）
│   ├── local/               # 本地错题库、统计聚合、百度 OCR
│   ├── config/              # 本地设备 ID、统计天数
│   ├── storage/             # AppPreferences 原生持久化封装
│   └── domain/              # 题目/答案等公共业务逻辑
└── features/
    ├── entry/               # 录入
    ├── study/               # 学习
    ├── mistakes/            # 错题
    └── profile/             # 我的
```

依赖方向固定为 `app → features → shared`，feature 之间不要互相 import。

## 环境要求

- Node.js >= 22
- JDK 17
- Android SDK：Platform 37、Build Tools 37、NDK 27.1、CMake 3.22
- Android 模拟器或真机

本机开发时用到的路径：

```powershell
D:\tools\node_extract\node-v24.22.1-win-x64
D:\tools\jdk_extract\jdk-17.0.20.1+1
D:\Android\Sdk
```

## 本地数据

- 错题、做题次数、正确率、掌握状态和使用记录存在 Android `SharedPreferences`
  （`local_db_v1`），由已有的 `AppPreferences` 原生模块读写。
- `src/shared/local/localDb.ts` 串行化所有写入，避免多个页面同时保存时互相覆盖。
- `src/shared/local/localAnalytics.ts` 在手机上生成与原来 11 个字段一致的学情数据。
- `src/shared/api/client.ts` 只做转发，页面调用方式保持不变。
- 首次安装是空库，不自动写入演示错题；从录入页保存第一道题后，练习和“我的”会立即有数据。

## OCR

- 拍照/相册选图后，图片压到 1200px 并读取 base64。
- 优先在手机直连百度通用文字识别；失败（无网、额度、凭据）自动回退 ML Kit 中文识别。
- 识别文本由手机本地规则拆科目、答案和 A-D 选项，不再调用 `/api/v1/ocr/parse`。
- 百度凭据在 `src/shared/local/ocr.ts` 中内置，方便测试；正式发布应换成自己的受限凭据，
  并注意 APK 中的密钥可被反编译读取。

## 运行与打包 APK

```bash
cd mobile
npm ci --registry=https://registry.npmmirror.com
npm start
```

另开一个窗口运行调试包：

```bash
npm run android
```

打一个**不需要 Metro、也不连电脑后端**的测试 APK：

```bash
cd android
./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

release 变体使用项目自带的 debug keystore 签名，仅用于测试；正式上架前要换成自己的签名。

## 数学公式

题目、选项和答案通过 `shared/ui/MathText.tsx` 显示，采用衬线数学字体，并支持常见 LaTeX 写法：

- `x^2` → `x²`
- `\frac{a}{b}` → `(a)/(b)`
- `\sqrt{x}` → `√(x)`
- `\alpha`、`\times`、`\le` 等常见符号

这层是轻量 Unicode 排版，不引入 WebView / KaTeX 原生依赖。

## 页面

- **录入**：拍照/相册选图，手机直连百度 OCR 或 ML Kit 识别题目；可手动补充科目、知识点、答案；保存到本机错题库
- **练习**：顶部用「学习 / 错题」分段切换
  - 学习：先选择题量和科目，本机按错得次数从多到少返回题目；答题后在本机累计做题次数和正确率
  - 错题：本机错题列表，显示题型、选项、掌握状态、做题次数/正确率，并支持删除
- **我的**：从本机错题和使用记录生成总错题、已掌握、待复习、掌握率与专注图表

## 本地数据结构

`local_db_v1` 保存一份 JSON：

```json
{
  "version": 1,
  "errors": [],
  "events": []
}
```

错题字段与原来的 API 对齐：

```json
{
  "error_id": "err_...",
  "device_id": "local_phone",
  "subject": "数学",
  "knowledge_point": "导数与函数",
  "content": "题目内容",
  "answer": "答案 / 解析；选择题填 A/B/C/D",
  "question_type": "choice",
  "option_a": "A 选项内容",
  "option_b": "B 选项内容",
  "option_c": "C 选项内容",
  "option_d": "D 选项内容",
  "created_at": "2026-10-23T12:00:00Z",
  "mastered": false,
  "review_count": 0
}
```

- `question_type` 为 `choice` 时，`option_a`~`option_d` 是四个选项，`answer` 存正确答案字母
- `question_type` 为 `fill` 时，`answer` 是填空答案/解析
- 每次答题由本机计算 `attempt_count`、`correct_count`、`wrong_count`、`accuracy`
- 答错会自动退回待复习；答对不会自动标记已掌握，需要用户点“标记已掌握”

## 常见问题

- **页面没有题目**：独立版首次安装是空库，先在「录入」保存一道题。
- **OCR 没有反应**：首次使用需要相机/相册权限；云端识别需要手机联网，断网时自动用 ML Kit。
- **依赖安装慢**：使用 `--registry=https://registry.npmmirror.com`。
- **release APK 启动后找不到 JS**：不要安装 `debug` 包，独立测试请用 `release` 包。

## 使用情况访问（专注效率）

“我的 → 专注效率”使用 Android `UsageStatsManager` 采集前台应用会话，直接写入本机
`local_db_v1.events`，不再上传到后端。

- 首次使用需要在“我的”页面点击「去开启」，授予 **使用情况访问** 特殊权限。
  该权限不是普通运行时权限，需要用户在系统设置里手动开启。
- 只读取应用名、包名、前台起止时间和时长，不读取应用内容。
- 同步游标保存在原生 `SharedPreferences`，只读取上次同步之后已经结束的会话；
  当前仍在前台的应用会在下次同步时读取。
- 启动 App、进入“我的”、从设置页返回前台时会自动同步。
- 本地最多保留最近 30 天、5000 条使用记录。

