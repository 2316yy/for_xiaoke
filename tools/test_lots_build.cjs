#!/usr/bin/env node
'use strict';

/* LOTS_COPY.md ↔ lots.js 构建器自测
 * 运行：sh build-lots.sh && node tools/test_lots_build.cjs
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const {
  parseLotsCopy,
  renderLotsJs,
  renderLotsCopy,
  GRADES,
  THEMES,
  BuildError,
} = require('./lots_build.cjs');

const ROOT = path.resolve(__dirname, '..');
const MD_FILE = path.join(ROOT, 'LOTS_COPY.md');
const JS_FILE = path.join(ROOT, 'lots.js');

let passed = 0;
let failed = 0;

function ok(cond, name) {
  if (cond) {
    passed++;
    console.log('  ✓ ' + name);
  } else {
    failed++;
    console.error('  × ' + name);
  }
}

function throws(fn, name) {
  try {
    fn();
    failed++;
    console.error('  × ' + name + '（expected BuildError, got none）');
  } catch (e) {
    ok(e instanceof BuildError, name + (e instanceof BuildError ? '' : '（wrong error: ' + e.message + '）'));
  }
}

const md = fs.readFileSync(MD_FILE, 'utf8');
const data = parseLotsCopy(md);

console.log('[1] 正常解析');
ok(data.lots.length === 64, '64 签');
ok(data.lots.every((l, i) => l.n === i + 1), '签号 1~64 且升序');
ok(data.lots.every((l) => GRADES.includes(l.grade)), '签级全部合法');
ok(data.lots.every((l) => Array.isArray(l.moods) && l.moods.length >= 2 && l.moods.length <= 3), '每签 2~3 个心情标签');
ok(data.lots.every((l) => l.moods.every((k) => Object.prototype.hasOwnProperty.call(THEMES, k))), '心情 key 全部合法');
ok(data.lots.every((l) => new Set(l.moods).size === l.moods.length), '单签内心情不重复');
ok(data.lots.every((l) => l.poem.length === 4), '每签四句');
ok(data.lots.every((l) => l.name && l.poem.every((p) => p.length > 0)), '卦名与签诗非空');
ok(GRADES.every((g) => data.verdicts[g] && data.verdicts[g].length > 0), '六档判词齐全');
ok(Object.keys(THEMES).every((k) => data.lots.some((l) => l.moods.includes(k))), '十二种心情都至少有一签');

console.log('[2] 生成结果可用且与源数据一致');
const code = renderLotsJs(data);
const loaded = vm.runInNewContext(code + '\n;({ LOTS, VERDICTS, SAN_RANGE });', {}, { filename: 'generated-lots.js' });
ok(JSON.stringify(loaded.LOTS) === JSON.stringify(data.lots), 'LOTS 数据往返一致');
ok(JSON.stringify(loaded.VERDICTS) === JSON.stringify(data.verdicts), 'VERDICTS 数据往返一致');
ok(loaded.SAN_RANGE && loaded.SAN_RANGE['下下'][1] === 78, 'SAN_RANGE 保留');

const diskCode = fs.readFileSync(JS_FILE, 'utf8');
ok(diskCode === code, '磁盘上的 lots.js 与 LOTS_COPY.md 同步（可运行 sh build-lots.sh 修复）');

const data2 = parseLotsCopy(renderLotsCopy(data));
ok(JSON.stringify(data2) === JSON.stringify(data), 'LOTS_COPY.md 重排/反向生成后可再次解析');

console.log('[3] 常见手误要有清楚报错');
const firstMoodLine = 'lost（迷茫） / courage（勇气） / hope（期待）';
throws(() => parseLotsCopy(md.replace(firstMoodLine, 'lost（迷茫） / dizzy（眩晕） / hope（期待）')), '非法心情 key');
throws(() => parseLotsCopy(md.replace(firstMoodLine, 'lost（迷茫）')), '只填 1 个心情标签');
throws(() => parseLotsCopy(md.replace(firstMoodLine, firstMoodLine + ' / joy（欢喜）')), '填了 4 个心情标签');
throws(() => parseLotsCopy(md.replace(firstMoodLine, 'lost（迷茫） / lost（迷茫） / hope（期待）')), '心情标签重复');
throws(() => parseLotsCopy(md.replace('签级：上上', '签级：超级上上')), '非法签级');

{
  const lines = md.split('\n');
  const i = lines.indexOf('星汉西流夜未央，');
  lines.splice(i, 1);
  throws(() => parseLotsCopy(lines.join('\n')), '签诗少一句');
}

{
  const lines = md.split('\n');
  const i = lines.findIndex((l) => l.startsWith('## 第1签'));
  lines[i] = '## 第65签 · 乾为天';
  throws(() => parseLotsCopy(lines.join('\n')), '签号超范围 + 缺第1签');
}

throws(() => parseLotsCopy(md.replace('## 中吉\n', '## 上上\n')), '判词签级重复');

console.log('[4] CLI');
const cli = spawnSync(process.execPath, [path.join(__dirname, 'lots_build.cjs'), '--check'], { encoding: 'utf8' });
ok(cli.status === 0, '--check 通过');

console.log('\n' + (failed === 0 ? '全部通过' : '有失败项') + `：${passed} 通过 / ${failed} 失败`);
if (failed) process.exitCode = 1;
