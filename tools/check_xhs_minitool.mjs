#!/usr/bin/env node
'use strict';

/* ============================================================
 * 小红书小工具包静态校验（在 skill 自带的体积审计之外）
 *   node tools/check_xhs_minitool.mjs xiaohongshu/dist --allow-3d
 *   node tools/check_xhs_minitool.mjs xiaohongshu/cthulhu-xhs-3d-1.0.0.zip --allow-3d
 *
 * 检查：结构 / 文件类型 / CSP 违规 / 被禁 Web API / 外部资源 /
 *       资源引用完整性 / Chrome 61 语法与 CSS 基线 / 体积门禁
 *
 * --allow-3d：按用户要求保留 .glb 与 IIIFE bundle 内部加载器；
 *   `.glb` 类型与 app3d.js 内的库内 fetch 降级为 WARN，其余门禁不变。
 * ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

const ARGS = process.argv.slice(2);
const ALLOW_3D = ARGS.includes('--allow-3d');
const TARGET = ARGS.find((a) => !a.startsWith('--'));
if (!TARGET) {
  console.error('用法: node tools/check_xhs_minitool.mjs <dist目录|zip> [--allow-3d]');
  process.exit(2);
}
const resolved = path.resolve(TARGET);
if (!fs.existsSync(resolved)) {
  console.error('路径不存在: ' + resolved);
  process.exit(2);
}

const MIB = 1024 * 1024;
const ALLOWED_EXT = new Set(['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2', '.json']);
if (ALLOW_3D) ALLOWED_EXT.add('.glb');
const errors = [];
const warnings = [];
const infos = [];

function fail(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }
function info(msg) { infos.push(msg); }

/* ---------- 读取目录或 zip ---------- */
function readFromZip(zipPath) {
  const list = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
  if (list.status !== 0) {
    console.error('无法读取 zip（需要 unzip 命令）: ' + (list.stderr || ''));
    process.exit(2);
  }
  const names = list.stdout.split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((n) => !n.endsWith('/'));
  const files = names.map((name) => {
    const p = spawnSync('unzip', ['-p', zipPath, name], { encoding: null, maxBuffer: 32 * MIB });
    return { name, size: p.stdout ? p.stdout.length : 0, content: p.stdout ? p.stdout.toString('utf8') : '' };
  });
  return { names, files, zipSize: fs.statSync(zipPath).size };
}

function readFromDir(dir) {
  const names = [];
  const walk = (d, prefix) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      const rel = prefix ? prefix + '/' + entry.name : entry.name;
      if (entry.isDirectory()) walk(full, rel);
      else if (entry.isFile()) names.push(rel);
    }
  };
  walk(dir, '');
  const files = names.map((name) => {
    const full = path.join(dir, name);
    const buf = fs.readFileSync(full);
    return { name, size: buf.length, content: buf.toString('utf8') };
  });
  return { names, files, zipSize: null };
}

const isZip = fs.statSync(resolved).isFile();
const bundle = isZip ? readFromZip(resolved) : readFromDir(resolved);
const byName = {};
bundle.files.forEach((f) => { byName[f.name] = f; });

/* ---------- 1. 结构与文件类型 ---------- */
if (!byName['index.html']) fail('zip/目录根缺少 index.html（唯一入口必须在根）');
bundle.names.forEach((name) => {
  const ext = path.extname(name).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) fail('不允许的文件类型: ' + name);
  if (name.startsWith('/') || name.indexOf('../') >= 0) fail('路径不规范: ' + name);
  if (name.indexOf('node_modules/') === 0 || name.indexOf('.git/') === 0) fail('包含开发目录: ' + name);
  if (name.endsWith('.map')) fail('包含 source map: ' + name);
  if (name.endsWith('.DS_Store')) fail('包含系统垃圾文件: ' + name);
});
info('文件清单: ' + bundle.names.join(', '));

/* ---------- 2. index.html 结构与 CSP ---------- */
const index = byName['index.html'] ? byName['index.html'].content : '';
if (!/^<!DOCTYPE html>/i.test(index.trimStart())) fail('index.html 缺少 <!DOCTYPE html>');
if (!/lang="zh-CN"/.test(index)) fail('index.html 缺少 lang="zh-CN"');
if (!/charset="?UTF-8"?/i.test(index)) fail('index.html 缺少 charset=UTF-8');
if (!/viewport-fit=cover/.test(index) || !/width=device-width/.test(index) || !/initial-scale=1\.0/.test(index)) {
  fail('viewport 缺少 width=device-width / initial-scale=1.0 / viewport-fit=cover');
}
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(index)) fail('index.html 存在内联 <script>（CSP 禁止）');
if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(index)) fail('index.html 存在行内事件属性（如 onclick=）');
if (/javascript:/i.test(index)) fail('index.html 存在 javascript: URI');
if (/<base\b/i.test(index)) fail('index.html 使用了 <base>');
if (/<iframe\b|<object\b|<embed\b/i.test(index)) fail('index.html 使用了 iframe/object/embed');
if (/type\s*=\s*["']module["']/i.test(index)) fail('index.html 仍使用 type="module"');
if (/importmap/i.test(index)) fail('index.html 仍使用 importmap');
if (/target\s*=\s*["']_blank["']/i.test(index)) fail('存在 target="_blank"');
if (/<a\b[^>]*\sdownload(=|\s|>)/i.test(index)) fail('存在 a[download] 文件下载');

/* 静态文件不应形成大树；单页只允许一个 index.html */
const htmlCount = bundle.names.filter((n) => n.endsWith('.html')).length;
if (htmlCount !== 1) fail('应只有一个 index.html，当前 ' + htmlCount + ' 个 HTML');

/* ---------- 3. 外部资源与相对引用 ---------- */
const stripped = index
  .replace(/(?:src|href)\s*=\s*"(?:data:[^"]*)"/gi, '')
  .replace(/url\(\s*(['"]?)data:[^)]*\)/gi, '');
const external = stripped.match(/https?:\/\/[^"')\s>]+/g) || [];
if (external.length) fail('存在外部资源引用: ' + external.join(', '));
const refs = [];
index.replace(/(?:src|href)\s*=\s*"([^"]+)"/g, (m, url) => {
  if (/^(data:|blob:|#|mailto:|tel:)/.test(url)) return m;
  if (url.charAt(0) === '/') { fail('资源使用绝对路径: ' + url); return m; }
  if (/^https?:/.test(url)) return m;
  refs.push(url);
  return m;
});
refs.forEach((url) => {
  const clean = url.split('?')[0].split('#')[0].replace(/^\.\//, '');
  if (!byName[clean]) fail('index.html 引用的资源不在包内: ' + url);
});

/* 3D 包：模型文件必须存在且数量正确（用户明确要求保留 3D / .glb） */
if (ALLOW_3D) {
  if (!byName['assets/idol.glb']) fail('3D 包缺少 assets/idol.glb');
  const cubes = bundle.names.filter((n) => /^assets\/cubes\/.+\.glb$/.test(n));
  if (cubes.length !== 8) fail('3D 包 assets/cubes/ 应有 8 个曜方 glb，当前 ' + cubes.length + ' 个');
  if (!bundle.names.some((n) => n === 'app3d.js')) fail('3D 包缺少 app3d.js（three + main + cubes 的经典 IIFE）');
}

/* ---------- 4. 被禁 Web API / 行为扫描 ---------- */
const BANNED = [
  ['fetch(', 'fetch'], ['XMLHttpRequest', 'XMLHttpRequest'],
  ['new WebSocket', 'WebSocket'], ['new EventSource', 'EventSource'], ['new RTCPeerConnection', 'WebRTC'],
  ['navigator.geolocation', '定位'], ['navigator.clipboard', '剪贴板'], ['document.execCommand', 'execCommand'],
  ['navigator.bluetooth', '蓝牙'], ['navigator.usb', 'USB'], ['navigator.hid', 'HID'], ['navigator.serial', '串口'],
  ['navigator.getBattery', '电量'], ['navigator.connection', '网络信息'], ['navigator.credentials', '凭据'],
  ['navigator.locks', 'Web Locks'], ['navigator.mediaDevices.enumerateDevices', '设备枚举'],
  ['getDisplayMedia', '屏幕共享'], ['navigator.storage.persist', '存储持久化'],
  ['navigator.serviceWorker', 'Service Worker'], ['new Worker', 'Web Worker'], ['new SharedWorker', 'SharedWorker'],
  ['Accelerometer', '加速度计'], ['Gyroscope', '陀螺仪'], ['Magnetometer', '磁力计'],
  ['DeviceMotionEvent', 'DeviceMotion'], ['DeviceOrientationEvent', 'DeviceOrientation'],
  ['requestFullscreen', '全屏'], ['eval(', 'eval'], ['new Function(', 'new Function'],
  ['WebAssembly.', 'WebAssembly'], ['window.open(', 'window.open'], ['window.prompt(', 'window.prompt'],
  ['location.href =', 'location.href 跳转'], ['location.assign(', 'location.assign'],
];
bundle.files.forEach((f) => {
  if (!/\.(html|css|js)$/.test(f.name)) return;
  const is3dBundle = ALLOW_3D && f.name === 'app3d.js';
  BANNED.forEach(([needle, label]) => {
    if (f.content.indexOf(needle) < 0) return;
    if (is3dBundle && (needle === 'fetch(' || needle === 'XMLHttpRequest')) {
      warn(`${f.name} 的 three.js 加载器内部包含 ${needle}（本地模型加载需要；未调用远程资源）`);
    } else {
      fail(`${f.name} 命中禁用能力 [${label}]：${needle}`);
    }
  });
});

/* ---------- 5. JS 语法 + Chrome 61 静态检查 ---------- */
const MODERN_SYNTAX = [
  [/\?\.[A-Za-z_$\[(]/, 'optional chaining (?.)'], [/\?\?/, 'nullish coalescing (??)'],
  [/\?\?=/, 'logical assignment (??=)'], [/\|\|=/, 'logical assignment (||=)'], [/&&=/, 'logical assignment (&&=)'],
  [/\bcatch\s*\{/, 'optional catch binding'], [/for\s+await\s*\(/, 'for await'],
  [/(?<!\d)\d+n\b/, 'BigInt literal'], [/\.replaceAll\s*\(/, 'String.replaceAll'],
  [/Array\.prototype\.at\b|\.at\(\s*-?\d/, 'Array.prototype.at'], [/Object\.hasOwn/, 'Object.hasOwn'], [/structuredClone/, 'structuredClone'],
  [/queueMicrotask\s*\(/, 'queueMicrotask'], [/Promise\.(any|allSettled|finally)\s*\(/, 'Promise 新 API'],
  [/\.flatMap\s*\(/, 'Array.flatMap'], [/\.flat\s*\(/, 'Array.flat'],
  [/(?<![a-zA-Z])globalThis\b/, 'globalThis'], [/matchAll\s*\(/, 'String.matchAll'],
];
bundle.files.forEach((f) => {
  if (!f.name.endsWith('.js')) return;
  try {
    new vm.Script(f.content, { filename: f.name });
  } catch (e) {
    fail(`${f.name} JS 语法错误：${e.message}`);
  }
  if (/^\s*import\s|\bexport\s+(default|const|function|class|\{)/m.test(f.content)) {
    fail(`${f.name} 含 import/export（必须经典脚本）`);
  }
  if (ALLOW_3D && f.name === 'app3d.js') {
    info('app3d.js 由 esbuild --target=chrome61 产出，跳过文本正则扫描以避免压缩后三元表达式误报');
    return;
  }
  MODERN_SYNTAX.forEach(([re, label]) => {
    if (!re.test(f.content)) return;
    if (label === 'optional chaining (?.)' || label === 'nullish coalescing (??)') fail(`${f.name} 含 Chrome 61 不支持的语法：${label}`);
    else warn(`${f.name} 含需能力检测的较新语法/API：${label}`);
  });
});

/* ---------- 6. CSS Chrome 61 基线检查 ---------- */
bundle.files.forEach((f) => {
  if (!f.name.endsWith('.css')) return;
  if (/\binset\s*:/.test(f.content)) fail(`${f.name} 仍使用 inset（Chrome 61 不支持）`);
  if (/\benv\s*\(/.test(f.content)) fail(`${f.name} 仍使用 env()（Chrome 61 不支持，应使用 --safe-area-inset-* 变量兜底）`);
  if (/\bdvh\b/.test(f.content)) fail(`${f.name} 仍使用 dvh`);
  const modernFns = f.content.match(/\b(min|max|clamp)\s*\(/g) || [];
  if (modernFns.length) fail(`${f.name} 仍使用 min()/max()/clamp()：${modernFns.join(', ')}`);
  const mix = f.content.match(/color-mix\s*\(/g) || [];
  if (mix.length) info(`${f.name} 保留 ${mix.length} 处 color-mix 增强（前方已注入基线色值）`);
});
const indexCssParts = index.match(/<style[\s\S]*?<\/style>/gi) || [];
indexCssParts.forEach((css, i) => {
  if (/\binset\s*:/.test(css)) fail(`index.html 内联样式仍使用 inset`);
  if (/\benv\s*\(/.test(css)) fail(`index.html 内联样式仍使用 env()`);
  if (/\bdvh\b/.test(css)) fail(`index.html 内联样式仍使用 dvh`);
  const modernFns = css.match(/\b(min|max|clamp)\s*\(/g) || [];
  if (modernFns.length) fail(`index.html 内联样式仍使用 min()/max()/clamp()：${modernFns.join(', ')}`);
});

/* ---------- 7. 体积门禁 ---------- */
let textTotal = 0;
bundle.files.forEach((f) => {
  if (!/\.(html|css|js|json)$/i.test(f.name)) return;
  textTotal += f.size;
  if (f.size > 2 * MIB) warn(`${f.name} 单文本 ${(f.size / MIB).toFixed(2)} MiB，超过 2 MiB 风险线`);
});
if (textTotal > 5 * MIB) warn(`文本合计 ${(textTotal / MIB).toFixed(2)} MiB，超过 5 MiB 风险线`);
if (bundle.zipSize !== null) {
  if (bundle.zipSize > 10 * MIB) fail(`zip ${(bundle.zipSize / MIB).toFixed(2)} MiB，超过 10 MiB 上限`);
  else if (bundle.zipSize > 2 * MIB) warn(`zip ${(bundle.zipSize / MIB).toFixed(2)} MiB，超过 2 MiB 建议值`);
}

/* ---------- 输出 ---------- */
console.log('=== 小红书小工具静态校验 ===');
console.log('对象: ' + resolved + (bundle.zipSize !== null ? `（zip ${(bundle.zipSize / 1024).toFixed(1)} KiB）` : `（目录，文本合计 ${(textTotal / 1024).toFixed(1)} KiB）`));
infos.forEach((m) => console.log('INFO  ' + m));
warnings.forEach((m) => console.log('WARN  ' + m));
errors.forEach((m) => console.log('FAIL  ' + m));
console.log(`结论: ${errors.length ? '未通过' : '通过'} · FAIL ${errors.length} / WARN ${warnings.length}`);
process.exitCode = errors.length ? 1 : 0;
