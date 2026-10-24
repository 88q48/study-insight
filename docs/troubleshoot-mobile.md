# 手机端加载失败排查

App 里出现「加载失败」「Network request failed」「Unable to load script」
时，按下面顺序从下往上排，通常第一两个就能定位。

---

## 0. 先看 App 日志里打出来的地址

`mobile/src/shared/config/index.ts` 启动时会打印一行：

```
[config] API_BASE_URL = http://xxx:8010
```

```cmd
adb logcat -s ReactNativeJS:V | findstr "config"
```

看到这行就知道 App 正在连哪台机器。连错了就在这一步暴露。

---

## 1. Unable to load script（红屏 / 弹窗）

**这是 Metro 没连上，与后端无关。**

Metro 是打包服务，App 启动时要从它那里取 JS 代码。

```cmd
:: 确认 Metro 在跑
curl http://127.0.0.1:8081/status
:: 返回 packager-status:running 才算正常
```

没跑就起一个：

```cmd
cd mobile
npx react-native start
```

然后**把 8081 转发进设备**，模拟器和真机都要：

```cmd
adb reverse tcp:8081 tcp:8081
```

改完在 App 里摇一摇 → Reload，或者重新 `am start`。

---

## 2. Network request failed（数据加载不出来）

Metro 通了、界面能显示，但数据是空的。这时是**后端连不上**。

### 2.1 后端真的在跑吗

```cmd
curl http://127.0.0.1:8010/api/v1/health
```

浏览器打开这个地址也行，应该返回 `{"status":"ok",...}`。

没起来：

```cmd
cd backend
python main.py
```

### 2.2 后端在监听哪个网卡

这是最容易踩的坑。只监听 `127.0.0.1` 时，**只有本机能连**，
手机 / 模拟器一律连不上。

```cmd
netstat -ano | findstr :8010
```

看最左边那一列：

```
TCP    127.0.0.1:8010    LISTENING    ← 只有本机能连，手机连不上
TCP    0.0.0.0:8010      LISTENING    ← 正确，所有网卡都能连
```

`main.py` 里已经配成 `0.0.0.0` 了。如果你的还是 127.0.0.1，
确认拉到了最新代码。

### 2.3 手机能不能摸到后端

**模拟器 / USB 真机（用 adb reverse）**

```cmd
adb reverse tcp:8010 tcp:8010
adb shell "toybox nc -w 3 127.0.0.1 8010 < /dev/null && echo OK"
```

出 `OK` 说明通了。注意这条命令必须在 **adb 连接着**的时候执行，
断开重连后要重新 `reverse`。

**同一 Wi-Fi 的真机（不用 USB）**

手机要能访问电脑的局域网 IP。先查电脑 IP：

```cmd
ipconfig | findstr IPv4
```

然后手机浏览器打开 `http://<电脑IP>:8010/api/v1/health`。
打不开通常是 Windows 防火墙拦了：

```cmd
:: 管理员身份运行
netsh advfirewall firewall add rule name="study-insight-backend" dir=in action=allow protocol=TCP localport=8010
```

### 2.4 Android 模拟器的 10.0.2.2

`10.0.2.2` 是模拟器里指向宿主机的固定地址。它**要求宿主机后端监听
0.0.0.0**，只监听 127.0.0.1 时照样连不上。

真机上 `10.0.2.2` 完全没有意义，会直接失败。

现在 `config` 会自动从 Metro 地址推导后端地址，模拟器和真机都不用改。
只有自动推导不出来时，才在 `API_HOST_OVERRIDE` 里手填。

---

## 3. 界面能显示，但数字全是 0

后端通了，但查的设备 ID 没有数据。

三端必须用同一个 `DEVICE_ID`（现在是 `win_device_01`）。

```cmd
curl "http://127.0.0.1:8010/api/v1/devices/win_device_01/analysis?days=7"
```

返回的 `error_stats.total_errors` 是 0，说明这个设备确实没数据；
录一道题再看。

---

## 4. 改完不生效

Metro 有缓存，改配置后偶尔不刷新。

```cmd
cd mobile
npx react-native start --reset-cache
```

---

## 5. 一条命令自查

```cmd
adb reverse tcp:8081 tcp:8081 && adb reverse tcp:8010 tcp:8010 && curl -s http://127.0.0.1:8010/api/v1/health
```

三个都正常、App 还是加载失败，把 `adb logcat -s ReactNativeJS:V` 的输出发出来。
