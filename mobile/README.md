# 手机端（React Native）

错题录入与复习的 Android/iOS 客户端。数据直连 `backend` 的 8010 端口，设备标识统一为 `android_emulator_01`。

## 代码结构

```text
src/
├── app/navigation/          # 底部 Tab 与路由类型
├── shared/
│   ├── api/                 # 请求函数与接口类型
│   ├── config/              # 后端地址、设备 ID
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

## 后端地址

统一在 `src/shared/config/index.ts` 配置：

- Android 模拟器：`http://10.0.2.2:8010`（指向宿主机）
- iOS 模拟器：`http://127.0.0.1:8010`
- 真机：改成电脑的局域网 IP，例如 `http://192.168.1.8:8010`

同时把 `DEVICE_ID` 改成该设备的唯一标识。上传和查询都会自动带上它。

## 运行

```bash
cd mobile
npm ci --registry=https://registry.npmmirror.com
npm start
```

另开一个窗口：

```bash
npm run android
```

也可以直接构建 APK：

```bash
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## 页面

- **录入**：拍照/相册选图，ML Kit 中文 OCR 识别题目；可手动补充科目、知识点、答案；提交到 `POST /api/v1/errors`
- **学习**：拉取本设备待复习错题，逐题作答；支持「标记已掌握」，会调用 `PATCH /api/v1/errors/{error_id}`
- **错题**：本设备错题列表，显示科目、知识点、题目、答案和掌握状态
- **我的**：从 `/api/v1/devices/{device_id}/analysis` 读取总错题、已掌握、待复习和掌握率

## 接口字段

上传时：

```json
{
  "error_id": "err_...",
  "device_id": "android_emulator_01",
  "subject": "数学",
  "knowledge_point": "导数与函数",
  "content": "题目内容",
  "answer": "答案 / 解析",
  "created_at": "2026-10-23T12:00:00Z",
  "mastered": false,
  "review_count": 0
}
```

- `content` 是题目，`answer` 是答案
- `question_content` 仍保留为旧字段兼容
- 查询统一带 `device_id`，避免读到其他设备的数据

## 常见问题

- **页面提示无法连接服务器**：确认后端在电脑上监听 8010，Android 模拟器用 `10.0.2.2`，真机用局域网 IP。
- **OCR 没有反应**：首次使用需要相机/相册权限；ML Kit 需要重新构建原生包，不能只在 Metro 里热更新。
- **依赖安装慢**：使用 `--registry=https://registry.npmmirror.com`。
