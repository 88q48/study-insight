# 手机端连不上时，先跑这个，把输出整段发出来。
# 用法：在仓库根目录执行  powershell -ExecutionPolicy Bypass -File scripts\diag-mobile.ps1

$ErrorActionPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

function Title($t) {
    Write-Host ""
    Write-Host "===== $t =====" -ForegroundColor Cyan
}
function Ok($t)   { Write-Host "  [OK]   $t" -ForegroundColor Green }
function Bad($t)  { Write-Host "  [FAIL] $t" -ForegroundColor Red }
function Warn($t) { Write-Host "  [WARN] $t" -ForegroundColor Yellow }
function Info($t) { Write-Host "         $t" }

$problems = @()

# ---------- 1. 仓库版本 ----------
Title "1. 仓库版本"
if (Test-Path ".git") {
    $head = (git log -1 --format="%h %s") 2>$null
    Info "当前提交: $head"
    $behind = (git rev-list --count "HEAD..origin/main") 2>$null
    if ($behind -eq "0" -or $behind -eq $null) {
        Ok "和远程 main 一致"
    } else {
        Warn "落后远程 origin/main $behind 个提交，先 git pull"
        $problems += "代码不是最新的，git pull 再试"
    }
} else {
    Bad "当前目录不是 git 仓库根目录"
    Info "请在 study-insight 目录下运行本脚本"
    $problems += "运行目录不对"
}

# ---------- 2. 手机端配置版本 ----------
Title "2. 手机端后端地址配置"
$cfgPath = "mobile/src/shared/config/index.ts"
if (Test-Path $cfgPath) {
    $cfg = Get-Content $cfgPath -Raw
    if ($cfg -match "API_HOST_OVERRIDE") {
        Ok "是自动推导版本（从 Metro 地址推后端地址）"
    } elseif ($cfg -match "10\.0\.2\.2") {
        Bad "还是写死 10.0.2.2 的旧版"
        Info "这个地址只有模拟器能用，真机上必然失败"
        Info "先 git pull 更新代码"
        $problems += "config 是旧版，写死了 10.0.2.2"
    } else {
        Warn "没认出是哪个版本，手动看一眼 $cfgPath"
    }
} else {
    Bad "找不到 $cfgPath"
    $problems += "缺少 config 文件"
}

# ---------- 3. Metro ----------
Title "3. Metro 打包服务（8081）"
$metro = $false
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:8081/status" -TimeoutSec 4 -UseBasicParsing
    $body = $r.Content
    if ($body -is [byte[]]) { $body = [Text.Encoding]::UTF8.GetString($body) }
    if ($body -match "running") {
        Ok "Metro 在跑"
        $metro = $true
    } else {
        Warn "8081 有响应但状态异常: $body"
    }
} catch {
    Bad "Metro 没起（8081 无响应）"
    Info "起一个:  cd mobile ; npx react-native start"
    $problems += "Metro 没起，界面会卡在 Unable to load script"
}

# ---------- 4. 设备 ----------
Title "4. Android 设备连接"
$adb = $null
$candidates = @()
if ($env:ANDROID_HOME)     { $candidates += (Join-Path $env:ANDROID_HOME "platform-toolsdb.exe") }
if ($env:ANDROID_SDK_ROOT) { $candidates += (Join-Path $env:ANDROID_SDK_ROOT "platform-toolsdb.exe") }
if ($env:LOCALAPPDATA)     { $candidates += (Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-toolsdb.exe") }
foreach ($c in $candidates) {
    if ($c -and (Test-Path $c)) { $adb = $c; break }
}
if (-not $adb) {
    $cmd = Get-Command adb -ErrorAction SilentlyContinue
    if ($cmd) { $adb = $cmd.Source }
}
if ($adb) {
    Info "adb: $adb"
} else {
    Bad "找不到 adb"
    Info "设置 ANDROID_HOME 环境变量，或把 platform-tools 目录加进 PATH"
    $problems += "找不到 adb，设备相关的检查全部跳过"
}

$devList = (& $adb devices) 2>$null
$devList | Where-Object { $_ -match "\tdevice$" } | ForEach-Object { Ok "已连接: $_" }
$hasDevice = [bool]($devList | Where-Object { $_ -match "\tdevice$" })
if (-not $hasDevice) {
    Bad "没有可用设备"
    Info "模拟器要先启动，真机要开 USB 调试并授权"
    $problems += "adb 没看到设备"
}

# ---------- 5. 端口转发 ----------
Title "5. adb 端口转发（reverse）"
$revList = (& $adb reverse --list) 2>$null
$has8081 = [bool]($revList | Select-String "tcp:8081")
$has8010 = [bool]($revList | Select-String "tcp:8010")

if ($has8081) { Ok "8081 已转发（Metro 能被设备访问）" }
else {
    Bad "8081 没转发"
    Info "执行:  adb reverse tcp:8081 tcp:8081"
    $problems += "8081 没做 adb reverse"
}
if ($has8010) { Ok "8010 已转发（后端能被设备访问）" }
else {
    Warn "8010 没转发（用 10.0.2.2 或局域网 IP 时可不需要）"
    Info "想走 USB 就用:  adb reverse tcp:8010 tcp:8010"
}

# ---------- 6. 后端 ----------
Title "6. 后端服务（8010）"
$backendUp = $false
try {
    $h = Invoke-RestMethod -Uri "http://127.0.0.1:8010/api/v1/health" -TimeoutSec 5
    Ok "后端在跑，错题 $($h.error_records) 条"
    $backendUp = $true
} catch {
    Bad "后端没起（8010 无响应）"
    Info "起一个:  cd backend ; python main.py"
    $problems += "后端没起"
}

# ---------- 7. 监听网卡 ----------
Title "7. 后端监听在哪个网卡"
$lines = (netstat -ano) 2>$null | Select-String ":8010" | Select-String "LISTENING"
if ($lines) {
    foreach ($l in $lines) {
        if ($l -match "0\.0\.0\.0:8010") {
            Ok "0.0.0.0:8010（所有网卡，设备能连）"
        } elseif ($l -match "127\.0\.0\.1:8010") {
            Bad "127.0.0.1:8010（只有本机能连，手机一定连不上）"
            Info "main.py 里 host 要改成 0.0.0.0"
            $problems += "后端只监听 127.0.0.1"
        } else {
            Info $l.ToString().Trim()
        }
    }
} else {
    Info "8010 没在监听，跳过"
}

# ---------- 8. 本机局域网 IP ----------
Title "8. 本机局域网 IP（真机联调要用）"
$ips = (Get-NetIPAddress -AddressFamily IPv4) 2>$null |
    Where-Object { $_.IPAddress -notmatch "^(127\.|169\.254\.)" } |
    Select-Object -ExpandProperty IPAddress
if ($ips) {
    $ips | ForEach-Object { Info $_ }
    Info "真机连后端就用: http://<上面某个 IP>:8010"
} else {
    Warn "没拿到局域网 IP"
}

# ---------- 9. App 实际用的地址 ----------
Title "9. App 日志里实际连的地址"
$logLines = (& $adb logcat -d -s ReactNativeJS:V) 2>$null | Select-String "config\]"
if ($logLines) {
    $last = $logLines[-1].ToString().Trim()
    Info $last
    Ok "App 已打印目标地址"
    if ($last -match "127\.0\.0\.1") {
        Warn "连的是 127.0.0.1，真机上这是手机自己，连不到电脑"
        $problems += "App 连了 127.0.0.1"
    }
} else {
    Warn "日志里没有 [config] 这一行"
    Info "可能 App 还没重新加载，或者装的是旧包"
    Info "摇一摇 Reload，或者重新装一次 APK"
}

# ---------- 10. 结论 ----------
Title "诊断结论"
if ($problems.Count -eq 0) {
    Ok "没发现明显问题，链路应该是通的"
    Info "如果 App 里还是加载失败，把上面整段发出来"
} else {
    Write-Host "  发现 $($problems.Count) 个问题：" -ForegroundColor Yellow
    $i = 1
    foreach ($p in $problems) {
        Write-Host "    $i. $p" -ForegroundColor Yellow
        $i++
    }
}
Write-Host ""
Write-Host "把以上整段输出复制发出来，就能定位到具体哪一环断了。" -ForegroundColor Cyan
Write-Host ""
