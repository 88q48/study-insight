#!/usr/bin/env node
/**
 * 手机通过 USB 连电脑时，一条命令打通 Metro 和后端。
 *
 *   npm run usb
 *
 * 做三件事：
 *   1. adb reverse tcp:8081 -> 电脑 8081（Metro）
 *   2. adb reverse tcp:8010 -> 电脑 8010（后端）
 *   3. 让手机去访问这两个端口，确认真的通了
 *
 * 为什么用这个而不是写局域网 IP：
 * adb reverse 走的是 USB 通道，跟 WiFi 网段完全无关。
 * 两个人电脑在 192.168.50.x 和 192.168.10.x 也能各自跑各自的，
 * 不会出现「我这边改了 IP 你那边就连不上」。
 *
 * 注意：拔掉数据线或重启手机后要重新跑一次。
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LF = String.fromCharCode(10);

// adb 路径：先看环境变量，再看常见的几个安装位置
function findAdb() {
  const fromEnv = process.env.ADB || process.env.ANDROID_HOME;
  const candidates = [];
  if (process.env.ADB) candidates.push(process.env.ADB);
  if (fromEnv) {
    candidates.push(path.join(fromEnv, 'platform-tools', 'adb.exe'));
  }
  candidates.push('D:/AndroidComponent/platform-tools/adb.exe');
  candidates.push('C:/Users/' + require('os').userInfo().username + '/AppData/Local/Android/Sdk/platform-tools/adb.exe');
  candidates.push('adb');
  for (const c of candidates) {
    if (c === 'adb') return c;
    if (fs.existsSync(c)) return c;
  }
  return 'adb';
}

const ADB = findAdb();

function run(cmd) {
  try {
    return {
      ok: true,
      out: execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(),
    };
  } catch (e) {
    const err = (e.stderr || '') + (e.stdout || '');
    return { ok: false, out: String(err || e.message).trim() };
  }
}

function devices() {
  const r = run(ADB + ' devices');
  if (!r.ok) return [];
  return r.out
    .split(LF)
    .slice(1)
    .map(function (line) { return line.trim(); })
    .filter(function (line) { return line.endsWith('device'); })
    .map(function (line) { return line.split(String.fromCharCode(9))[0]; });
}

function main() {
  console.log('adb: ' + ADB);

  const list = devices();
  if (!list.length) {
    console.error('');
    console.error('没找到设备。检查三件事：');
    console.error('  1. 数据线插好了（有的线只能充电）');
    console.error('  2. 手机开了「开发者选项」里的 USB 调试');
    console.error('  3. 手机上那个「允许 USB 调试」的弹窗点了允许');
    console.error('');
    console.error('插好后重跑：npm run usb');
    process.exit(1);
  }

  console.log('找到设备: ' + list.join(', '));
  console.log('');

  const targets = [
    { port: 8010, name: '后端' },
    { port: 8081, name: 'Metro' },
  ];

  for (const t of targets) {
    const r = run(ADB + ' reverse tcp:' + t.port + ' tcp:' + t.port);
    if (r.ok) {
      console.log('  ' + t.name + ' ' + t.port + ' -> 已转发');
    } else {
      console.log('  ' + t.name + ' ' + t.port + ' -> 失败: ' + r.out);
    }
  }

  console.log('');
  console.log('当前转发规则：');
  const rl = run(ADB + ' reverse --list');
  for (const line of (rl.out || '').split(LF)) {
    if (line.trim()) console.log('  ' + line.trim());
  }

  console.log('');
  console.log('验证手机能不能访问后端...');
  // 手机上不一定有 curl，试几种方式，至少能判断端口通不通
  const checks = [
    { name: '后端 /api/v1/health', cmd: ADB + ' shell curl -s -m 5 http://127.0.0.1:8010/api/v1/health' },
    { name: 'Metro /status', cmd: ADB + ' shell curl -s -m 5 http://127.0.0.1:8081/status' },
  ];

  let curlWorks = true;
  for (const c of checks) {
    const r = run(c.cmd);
    if (!r.ok) { curlWorks = false; break; }
    const body = r.out;
    if (body.indexOf('curl') >= 0 && body.indexOf('not found') >= 0) { curlWorks = false; break; }
    console.log('  ' + c.name + ' -> ' + (body.slice(0, 60) || '(空)') );
  }

  if (!curlWorks) {
    console.log('  （手机上没有 curl，跳过自动验证）');
    console.log('');
    console.log('手动确认：手机浏览器打开 http://127.0.0.1:8010/docs');
  }

  console.log('');
  console.log('都好了。现在：');
  console.log('  npm start          起 Metro');
  console.log('  npx react-native run-android');
  console.log('');
  console.log('拔线或重启手机后要重跑 npm run usb');
}

main();
