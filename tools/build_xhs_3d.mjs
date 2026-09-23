#!/usr/bin/env node
'use strict';

/* ============================================================
 * 小红书小工具 3D 版构建脚本（模型 base64 内嵌，无 .glb）
 *   node tools/build_xhs_3d.mjs
 *
 * 容器只允许 jpg/css/gif/svg/png/js/jpeg/json/html/woff2/webp/woff；
 * 因此不再放 .glb 文件，而是把优化模型 base64 写进 model-idol.js /
 * model-cubes.js，运行时 __xhsLoadGLB() 用 GLTFLoader.parse() 解析。
 *
 * 产物：
 *   xiaohongshu/dist/                                    打包内容（index.html 在根）
 *   xiaohongshu/cthulhu-xhs-3d-embedded-1.0.0.zip        本地上传包（.gitignore）
 *
 * 关键处理：
 *   - three.js / OrbitControls / GLTFLoader / RoomEnvironment / main.js / cubes.js
 *     用 esbuild 打成经典 IIFE（容器不要 ESM / importmap / type=module）
 *   - 神像与曜方模型读取 xiaohongshu/models3d/ 下预先优化过的 GLB，
 *     构建时转成 base64 .js；zip 内不再出现 .glb
 *   - 关掉 createImageBitmap，强制 GLTFLoader 用 TextureLoader(<img> blob:) 读内嵌贴图
 *   - 内联 script 外置；剪贴板改为可选中文本浮层；Chrome 61 CSS 基线回退
 * ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const OUT_DIR = path.join(ROOT, 'xiaohongshu');
const DIST = path.join(OUT_DIR, 'dist');
const MODELS = path.join(OUT_DIR, 'models3d');
const ZIP = path.join(OUT_DIR, 'cthulhu-xhs-3d-embedded-1.0.0.zip');
const TEMP_MAIN = path.join(ROOT, '.xhs-main.build.js');
const TEMP_CUBES = path.join(ROOT, '.xhs-cubes.build.js');

const ALLOWED_EXT = new Set([
  '.html', '.css', '.js', '.json',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
  '.woff', '.woff2',
]);

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function write(rel, content) {
  const file = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}
function copy(src, rel) {
  const file = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.copyFileSync(src, file);
}
function assert(cond, msg) { if (!cond) throw new Error('[xhs3d] ' + msg); }
function replaceAllPairs(text, pairs) {
  let out = text;
  pairs.forEach(([from, to]) => { out = out.split(from).join(to); });
  return out;
}

function findEsbuild() {
  const env = process.env.ESBUILD;
  if (env && fs.existsSync(env)) return env;
  const candidates = [
    path.join(ROOT, 'node_modules', '.bin', 'esbuild'),
    path.join(process.env.HOME || '', 'cth_tools', 'xhs3d_build', 'node_modules', '.bin', 'esbuild'),
    '/opt/homebrew/bin/esbuild',
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  const which = spawnSync('which', ['esbuild'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  throw new Error(
    '找不到 esbuild。可临时安装：npm i -D esbuild，或设置 ESBUILD=/path/to/esbuild'
  );
}

/* ---------- index.html ---------- */
function extractDeviceScript(html) {
  const marker = '/* 设备探测';
  const at = html.indexOf(marker);
  assert(at > -1, '找不到设备探测内联脚本');
  const openStart = html.lastIndexOf('<script', at);
  const openEnd = html.indexOf('>', openStart);
  const closeStart = html.indexOf('</script>', openEnd);
  assert(openStart > -1 && openEnd > -1 && closeStart > -1, '内联脚本边界解析失败');
  const code = html.slice(openEnd + 1, closeStart).replace(/^\s+/, '');
  return {
    code,
    html: html.slice(0, openStart) + '<script src="./device.js"></script>' + html.slice(closeStart + '</script>'.length),
  };
}

function patchIndex(html) {
  const device = extractDeviceScript(html);
  let out = device.html;

  /* 去掉 preload / favicon data URI（前者路径要改成 assets/idol.glb，后者顺带清理 http 字符串） */
  out = out.replace(/[ \t]*<link rel="preload"[^>]*>\s*\n?/g, '');
  out = out.replace(/[ \t]*<link rel="icon"[^>]*>\s*\n?/g, '');

  /* importmap / module 是容器禁止项；改成经典脚本顺序：UI 补丁 → 3D bundle */
  out = out.replace(/[ \t]*<script type="importmap">[\s\S]*?<\/script>\s*\n?/g, '');
  const moduleTag = '<script type="module" src="./main.js"></script>';
  assert(out.indexOf(moduleTag) > -1, '找不到 main.js 的 module 标签');
  out = out.replace(moduleTag,
    '<script src="./xhs-ui.js"></script>\n' +
    '  <script src="./model-idol.js"></script>\n' +
    '  <script src="./model-cubes.js"></script>\n' +
    '  <script src="./app3d.js"></script>');

  out = out.replace(
    /<meta name="viewport"\s*content="[^"]*"\s*\/>/,
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />'
  );
  out = out.replace('<title>向克苏鲁许愿 · 集曜 2.5</title>', '<title>向克苏鲁许愿</title>');

  const styleClose = out.indexOf('</style>');
  assert(styleClose > -1, '找不到 </style>');
  out = out.slice(0, styleClose + '</style>'.length) +
    '\n<link rel="stylesheet" href="./compat.css" />' +
    out.slice(styleClose + '</style>'.length);

  return { html: out, deviceCode: device.code };
}

/* ---------- Chrome 61 CSS 基线回退 ---------- */
function patchCss(css) {
  let out = css;
  out = out.replace(/inset\s*:\s*0\s*;/g, 'top: 0; right: 0; bottom: 0; left: 0;');

  out = replaceAllPairs(out, [
    ['bottom: max(12px, env(safe-area-inset-bottom, 0px));',
      'bottom: 12px; bottom: calc(12px + var(--safe-area-inset-bottom, 0px));'],
    ['left: auto; right: max(10px, env(safe-area-inset-right, 0px));',
      'left: auto; right: 10px; right: calc(10px + var(--safe-area-inset-right, 0px));'],
    ['top: 56px; bottom: max(10px, env(safe-area-inset-bottom, 0px));',
      'top: 56px; bottom: 10px; bottom: calc(10px + var(--safe-area-inset-bottom, 0px));'],
    ['padding: 0 14px calc(8px + env(safe-area-inset-bottom));',
      'padding: 0 14px 8px; padding: 0 14px calc(8px + var(--safe-area-inset-bottom, 0px));'],
    ['padding-bottom: calc(2vh + env(safe-area-inset-bottom));',
      'padding-bottom: 2vh; padding-bottom: calc(2vh + var(--safe-area-inset-bottom, 0px));'],
    ['padding-bottom: calc(8px + env(safe-area-inset-bottom));',
      'padding-bottom: 8px; padding-bottom: calc(8px + var(--safe-area-inset-bottom, 0px));'],
  ]);

  out = replaceAllPairs(out, [
    ['left: max(34px, 4.5vw);', 'left: 4.5vw;'],
    ['left: max(10px, calc(50vw - 280px));', 'left: 10px;'],
    ['right: max(10px, calc(50vw - 280px));', 'right: 10px;'],
    ['width: min(540px, calc(100vw - 40px));', 'width: calc(100vw - 40px); max-width: 540px;'],
    ['margin: 7vh 0 7vh max(40px, 7vw);', 'margin: 7vh auto;'],
    ['width: min(460px, calc(100vw - 56px));', 'width: calc(100vw - 56px); max-width: 460px;'],
    ['max-width: min(46vw, 360px);', 'max-width: 46vw;'],
    ['width: min(360px, 46vw);', 'width: 46vw; max-width: 360px;'],
    ['width: min(680px, calc(100vw - 44px));', 'width: calc(100vw - 44px); max-width: 680px;'],
    ['max-height: clamp(230px, 32vh, 320px);', 'max-height: 320px;'],
    ['max-height: clamp(230px, 32dvh, 320px);', ''],
    ['max-height: min(66vh, calc(100vh - 84px));', 'max-height: 66vh;'],
    ['max-height: min(66dvh, calc(100dvh - 84px));', ''],
  ]);

  out = out.replace(/(^|[;{]\s*)((?:row-)?gap)(\s*:\s*[^;{}]+;)/gm,
    (m, pre, prop, rest) => pre + 'grid-' + prop + rest + ' ' + prop + rest);

  out = out.replace(
    /(^[ \t]*|[;{]\s*)([a-z-]+)(\s*:[^;{}]*color-mix\([^;{}]*\)[^;{}]*);/gm,
    (m, pre, prop, rest) => {
      const fb = {
        'text-shadow': 'text-shadow: var(--sh)',
        'box-shadow': 'box-shadow: none',
        'border-color': 'border-color: var(--c, rgba(232,228,245,.45))',
        'border': 'border: 1px solid rgba(232,228,245,.35)',
        'background': 'background: rgba(216,180,106,.12)',
        'filter': 'filter: none',
      }[prop.trim()];
      return pre + (fb ? fb + '; ' : '') + prop + rest + ';';
    }
  );
  return out;
}

/* ---------- game.js：剪贴板 API 替换为可选中文本 ---------- */
function patchGame(js) {
  const out = js.replace(
    /navigator\.clipboard\.writeText\(txt\)[\s\S]*?\.catch\(\(\) => \{\}\);/,
    'window.__xhsShowCopy(txt);'
  );
  assert(out.indexOf('navigator.clipboard') < 0, 'game.js 仍残留 navigator.clipboard');
  assert(out.indexOf('execCommand') < 0, 'game.js 仍残留 execCommand');
  return out;
}

/* ---------- 优化模型 → base64 .js（包内不再出现 .glb） ---------- */
function modelScript(entries) {
  return 'window.__XHS_MODELS = window.__XHS_MODELS || {};\n' +
    entries.map(([name, buf]) =>
      "window.__XHS_MODELS['" + name + "'] = '" + buf.toString('base64') + "';\n"
    ).join('');
}

function writeModelScripts() {
  assert(fs.existsSync(path.join(MODELS, 'idol.glb')), '缺少 models3d/idol.glb');
  write('model-idol.js', modelScript([
    ['idol.glb', fs.readFileSync(path.join(MODELS, 'idol.glb'))],
  ]));
  const cubeDir = path.join(MODELS, 'cubes');
  const cubeFiles = fs.readdirSync(cubeDir).filter((f) => f.endsWith('.glb')).sort();
  assert(cubeFiles.length === 8, 'models3d/cubes 应有 8 个 glb，当前 ' + cubeFiles.length);
  write('model-cubes.js', modelScript(
    cubeFiles.map((f) => [f, fs.readFileSync(path.join(cubeDir, f))])
  ));
}

/* ---------- three/main/cubes → 经典 IIFE（模型改为内嵌 parse） ---------- */
function bundleApp() {
  let main = read('main.js');
  let cubes = read('cubes.js');

  main = main.replace(
    "import { createGarden } from './cubes.js';",
    "import { createGarden } from './.xhs-cubes.build.js';"
  );
  assert(main.indexOf("'./.xhs-cubes.build.js'") >= 0, 'main.js 的 cubes 引用替换失败');

  main = main.replace(
    "new GLTFLoader().load('./小克1.1.glb',",
    "window.__xhsLoadGLB(new GLTFLoader(), 'idol.glb',"
  );
  assert(main.indexOf("window.__xhsLoadGLB(new GLTFLoader(), 'idol.glb'") >= 0, 'main.js 神像 load 替换失败');

  cubes = cubes.replace(
    "loader.load('./assets/cubes/' + meta.file, (gltf) => {",
    "window.__xhsLoadGLB(loader, meta.file, (gltf) => {"
  );
  assert(cubes.indexOf('window.__xhsLoadGLB(loader, meta.file') >= 0, 'cubes.js load 替换失败');

  fs.writeFileSync(TEMP_MAIN, main, 'utf8');
  fs.writeFileSync(TEMP_CUBES, cubes, 'utf8');

  const esbuild = findEsbuild();
  try {
    const out = path.join(DIST, 'app3d.js');
    const r = spawnSync(esbuild, [
      TEMP_MAIN,
      '--bundle', '--format=iife', '--target=chrome61', '--platform=browser',
      '--minify', '--log-level=warning', '--outfile=' + out,
    ], { encoding: 'utf8' });
    assert(r.status === 0, 'esbuild 打包失败：' + (r.stderr || r.error));
  } finally {
    fs.rmSync(TEMP_MAIN, { force: true });
    fs.rmSync(TEMP_CUBES, { force: true });
  }
}

function build() {
  const patched = patchIndex(read('index.html'));

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  write('index.html', patchCss(patched.html));
  write('device.js', '/* 从 index.html 头部外置：容器 CSP 禁止内联脚本 */\n' + patched.deviceCode + '\n');
  write('lots.js', read('lots.js'));
  write('audio.js', read('audio.js'));
  write('dex.js', read('dex.js'));
  write('game.js', patchGame(read('game.js')));
  write('xhs-ui.js', read('tools/xhs-ui.js'));
  write('compat.css', read('tools/xhs-compat.css'));

  bundleApp();
  writeModelScripts();

  fs.rmSync(ZIP, { force: true });
  const zip = spawnSync('zip', ['-r', '-X', ZIP, '.', '-x', '*.DS_Store'], { cwd: DIST, encoding: 'utf8' });
  assert(zip.status === 0, 'zip 打包失败：' + (zip.stderr || zip.error));

  const files = [];
  (function walk(d, pre) {
    fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const full = path.join(d, e.name);
      const rel = pre ? pre + '/' + e.name : e.name;
      if (e.isDirectory()) walk(full, rel);
      else { files.push(rel); assert(ALLOWED_EXT.has(path.extname(rel).toLowerCase()), '不允许的文件类型：' + rel); }
    });
  })(DIST, '');

  const size = fs.statSync(ZIP).size;
  const textTotal = files.filter((f) => /\.(html|css|js|json)$/i.test(f))
    .reduce((n, f) => n + fs.statSync(path.join(DIST, f)).size, 0);
  console.log('✓ 小红书 3D 小工具已构建（模型 base64 内嵌，无 .glb）');
  console.log('  目录 : ' + DIST);
  console.log('  zip  : ' + ZIP);
  console.log('  大小 : ' + (size / 1024 / 1024).toFixed(2) + ' MiB（' + (size / 1024).toFixed(1) + ' KiB）');
  console.log('  文件 : ' + files.length + ' 个 · 文本 ' + (textTotal / 1024).toFixed(1) + ' KiB');
  console.log('  模型 : model-idol.js + model-cubes.js（8 个曜方，已优化后内嵌）');
}

build();
