#!/usr/bin/env node
/**
 * 一条命令切换手机端连的后端地址。
 *
 *   node scripts/set-host.js                 看当前值 + 本机所有 IP
 *   node scripts/set-host.js 192.168.10.103  指定 IP
 *   node scripts/set-host.js auto            改回自动推导（默认）
 *
 * 只动 src/shared/config/index.ts 里一行常量。故意不用正则，
 * 靠 indexOf 找锚点；换行也用 String.fromCharCode(10)，
 * 这样整个文件不含反斜杠，不会被 shell 转义吃掉。
 *
 * 改完需要重启 Metro 或重新打包才生效。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const LF = String.fromCharCode(10);
const CONFIG = path.join(__dirname, '..', 'src', 'shared', 'config', 'index.ts');
const ANCHOR = 'const API_HOST_OVERRIDE';
const QUOTE = String.fromCharCode(39);

function localIPs() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

function showUsage(current) {
  console.log('当前 API_HOST_OVERRIDE = ' + current);
  console.log('');
  console.log('用法：');
  console.log('  node scripts/set-host.js 192.168.10.103   指定 IP');
  console.log('  node scripts/set-host.js usb              改用 USB 模式（127.0.0.1 + adb reverse）');
  console.log('  node scripts/set-host.js auto             改回自动推导');
  console.log('');
  console.log('本机 IP（可直接用）：');
  for (const ip of localIPs()) console.log('  ' + ip);
}

function main() {
  const arg = (process.argv[2] || '').trim();

  if (!fs.existsSync(CONFIG)) {
    console.error('找不到 ' + CONFIG);
    process.exit(1);
  }

  const lines = fs.readFileSync(CONFIG, 'utf8').split(LF);

  let index = -1;
  let current = '';
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith(ANCHOR)) {
      index = i;
      const eq = lines[i].indexOf('=');
      const semi = lines[i].lastIndexOf(';');
      const end = semi > eq ? semi : lines[i].length;
      current = lines[i].slice(eq + 1, end).trim();
      break;
    }
  }

  if (index < 0) {
    console.error('config/index.ts 里没找到 ' + ANCHOR);
    process.exit(1);
  }

  if (!arg) {
    showUsage(current);
    return;
  }

  let next;
  if (arg === 'auto' || arg === 'reset') {
    next = QUOTE + QUOTE;
  } else if (arg === 'usb') {
    // USB 模式：手机连 127.0.0.1，靠 adb reverse 转到电脑。
    // 好处是完全不关心 WiFi 网段，凌零卡的就是这个。
    next = QUOTE + '127.0.0.1' + QUOTE;
  } else {
    const ok = arg.split('').every(function (ch) {
      return /[0-9a-zA-Z.-]/.test(ch);
    });
    if (!ok) {
      console.error('这个看着不像 IP 或域名：' + arg);
      process.exit(1);
    }
    next = QUOTE + arg + QUOTE;
  }

  if (current === next) {
    console.log('已经是这个值了，没动：' + next);
    return;
  }

  const eq = lines[index].indexOf('=');
  const semi = lines[index].lastIndexOf(';');
  const tail = semi > eq ? lines[index].slice(semi) : ';';
  const indent = lines[index].slice(0, lines[index].indexOf(ANCHOR));
  lines[index] = indent + ANCHOR + ' = ' + next + tail;

  fs.writeFileSync(CONFIG, lines.join(LF), 'utf8');

  console.log('改好了');
  console.log('  之前：' + current);
  console.log('  现在：' + next);
  console.log('');
  console.log('下一步（二选一）：');
  if (arg === 'usb') {
    console.log('  USB 模式还差一步，手机插上后执行：');
    console.log('    npm run usb');
    console.log('');
  }
  console.log('  1. 重启 Metro，App 重新加载即可');
  console.log('  2. 重新打包：cd android 然后 gradlew.bat :app:assembleDebug');
}

main();
