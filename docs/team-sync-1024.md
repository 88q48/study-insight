# 队友同步（2026-10-24）

写给凌零、超凡。今天 main 上有 42 笔提交，三个人同时在改，
下面这些是我这边动过的地方，以及你们 pull 之后需要注意的。

---

## pull 之后先做三件事

```bash
cd mobile && npm install          # 缺了这步，WebView / svg / ml-kit 全都 bundle 不了
cd backend && pip install -r requirements.txt
cd backend && cp .env.example .env   # 然后填密钥，见下文
```

第三条不做也能跑，只是 OCR 用不了，其他接口照常。

---

## 我改了什么

### 后端

**密钥全部改从环境变量读**

`backend/ocr_router.py` 里原来明文写着百度 OCR 的三项和 DeepSeek 的 sk- 密钥，
随 `dd9c7ef` 推到了公开仓库。现在改成从 `backend/.env` 读，
源码里一个字都不留。`.env.example` 里写了要填哪四项。

凌零已经把百度的 key 换了，旧的那套调过去会返回
`Code 14: IAM Certification failed` —— 这是预期行为，旧密钥已经作废了。
DeepSeek 那个 key 如果还没 revoke，建议也去建个新的。

**OCR 两条路由分开**

原来 `ocr_router.py` 和 `ocr_routes.py` 都挂了 `POST /api/v1/ocr/parse`，
FastAPI 只认先注册的那个，另一条静默失效，不报错也不警告。

| 路径 | 收什么 | 干什么 |
|---|---|---|
| `POST /api/v1/ocr/parse` | 图片文件 | 百度 OCR 识别 → DeepSeek 结构化 |
| `POST /api/v1/ocr/split` | JSON 文本 | 本地规则切分，不联网 |

`/split` 的用途：手机上拍照识别成功但大模型挂了，后端内部调它兜底；
也可以给「手动粘贴一段题目」的场景用。

**大模型失败时不再返回「未知科目」**

会退回本地规则切分（认科目关键词、题号、选项），返回值多了个 `parser` 字段，
`llm` 表示大模型解析的，`local` 表示本地兜底的。前端可以据此提示用户核对。

**报错能看出该找谁了**

原来 `raise` 的异常被自己的 `except Exception` 又抓一次，
任何问题都变成「500: OCR服务异常: 400: 百度OCR报错…」三层嵌套。现在：

| 状态码 | 含义 | 怎么办 |
|---|---|---|
| 503 | 凭据无效 | 改 `.env` 里那三项，重启后端 |
| 429 | 额度 / QPS 超限 | 免费额度按天重置，等明天 |
| 400 | 图片读不出字 | 换张清晰的 |
| 502 | 连不上百度 | 检查网络 |

**新增 5 条 OCR 测试**

用假 client 顶掉真实百度调用，不耗额度、不依赖网络。
`pytest tests/` 现在 16 passed。

**`.env` 加载不再看 import 顺序**

抽成 `backend/dotenv_lite.py`，import 时自动执行。
之前加载逻辑在 `main.py` 里，写个小脚本先 import `ocr_router` 就会读到空密钥，
报「未配置密钥」，很莫名其妙。

**`requirements.txt` 补全**

原来只有 fastapi + uvicorn，缺 baidu-aip / openai / pytest / httpx。
其中 `chardet` 要单独说：它没被 baidu-aip 声明为依赖，但
`aip/__init__.py` 会 import `aip.nlp`，`nlp.py` 里 import `chardet`，
不装就 `ModuleNotFoundError`，而且报错指向 nlp 模块，跟 OCR 看起来毫无关系。

### 看板

**`index.html` 补回 `charts.js`**

`23b91f4` 把它删了，导致 `window.Charts` 是 undefined，
`radarError` 抛错被 boot 的 catch 接住，页面显示「加载失败」，
诊断结论和重做清单两块不渲染。

**mock 数字对齐真实库**

`dashboard/error_mock.py` 的科目表原来是 140 道 / 5 科，真实库是 121 道 / 3 科。
点一下右上角数据源切换，数字会跳，演示时很危险。现在两边
`error_stats` / `subject_distribution` / `knowledge_points` 逐字节相等。

排序也统一了：待复习数降序，同数按累计错题降序。看板「最该先处理」取第一条。

### 手机端

**`ProfileScreen` 的看板地址**

原来写死 `http://10.0.2.2:8080/`，8080 是另起静态服务器的做法，那个进程没开就是
`Error loading page / Domain undefined`。现在走 `${API_BASE_URL}/dashboard/`，
后端在 8010 上直接把看板挂出来。

顺带加了加载失败提示和重试按钮，关了 WebView 缓存（改了后端 config 重进就生效）。

**删掉 `gradle/gradle-daemon-jvm.properties`**

这个文件里写着 `toolchainVersion=25`，Gradle 看到就跑去 GitHub releases 下 JDK 25，
国内基本拉不下来，报 `Could not HEAD ...temurin25...`。
本机装的是 JDK 17，一直都是用 17 编的。删掉之后 `gradlew help` 19 秒通过。

**只编两个 ABI**

`reactNativeArchitectures` 原来四个全编（armeabi-v7a,arm64-v8a,x86,x86_64）。
我们只用真机（arm64）和模拟器（x86_64），32 位那两个是给老设备的。
改成两个之后构建时间和产物都少一半。需要时用 `-PreactNativeArchitectures=...` 临时覆盖。

**Gradle 守护进程闲置 10 分钟回收**

默认是 3 小时，开发机上会一直挂着吃 500MB～1GB。
今天我这台机器因为这个死机两次，`gradlew --stop` 之后可用内存从 2.0GB 回到 4.2GB。

---

## 现在能跑什么

后端 8010、Metro 8081 起来之后：

```
POST /api/v1/ocr/split   传文字 → 200，切出科目/题型/题干
POST /api/v1/ocr/parse   传图片 → 有密钥走百度+DS，没密钥或 DS 挂了走本地规则
GET  /dashboard/         看板，真实数据 121 / 85 / 36 / 70.2%
```

手机端三个 Tab 都验过：录入页正常、练习页正常、
「我的」页原生图表跑出饼图和折线图，数字和后端一致，logcat 无报错。

---

## 几个注意事项

**别再把密钥写进源码**。`.gitignore` 里有 `.env` 和 `.env.*`，
`.env.example` 是唯一的例外，那个只有变量名没有值。

**别再提交 `gradle-daemon-jvm.properties`**。它会让全组的构建卡在下载 JDK 上。

**改了 `package.json` 记得通知一声**。今天 WebView 和 svg 都是加了依赖但没装，
别人 pull 下来 bundle 直接失败，报错还指向一个跟依赖无关的文件。

---

## 还没做的

- 数据隔离（凌零提的，账号体系先不做）
- 设置栏的内容还没定（超凡在做）
- OCR 目前只验过「看板截图」和「合成试卷图」，「真实拍照」还没测
