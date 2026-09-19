#!/usr/bin/env node
'use strict';

/* ============================================================
 * 《向克苏鲁许愿》64 签文案构建器
 *
 *   默认        LOTS_COPY.md  →  lots.js
 *   --check     检查 lots.js 是否与 LOTS_COPY.md 同步（CI 用）
 *   --extract   从 lots.js 反向提取标准格式，输出到 stdout（应急恢复用）
 *
 * 人类只需要编辑仓库根目录的 LOTS_COPY.md，然后运行：
 *     sh build-lots.sh
 * ============================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const MD_FILE = path.join(ROOT, 'LOTS_COPY.md');
const JS_FILE = path.join(ROOT, 'lots.js');

const GRADES = ['上上', '上吉', '中吉', '中平', '中下', '下下'];
const THEMES = {
  lost: '迷茫',
  tired: '疲惫',
  lonely: '孤独',
  fear: '恐惧',
  angry: '愤怒',
  hollow: '空洞',
};

/* 签级 → 理智消耗区间（数值配置，不属于文案；改这里不要改 lots.js） */
const SAN_RANGE = {
  '上上': [8, 18],
  '上吉': [18, 28],
  '中吉': [28, 38],
  '中平': [38, 48],
  '中下': [50, 62],
  '下下': [62, 78],
};

class BuildError extends Error {}

/* 中文按 2 列宽计算，用来对齐生成的代码 */
function displayWidth(s) {
  let w = 0;
  for (const ch of s) {
    w += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1;
  }
  return w;
}

function jsString(s) {
  return "'" + String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029') + "'";
}

/* 把 HTML 注释替换成等行数的空白，保证报错行号不变 */
function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
}

const RE_LOT = /^#{2,6}\s*第\s*(\d+)\s*签\s*(?:[·•・:：\-—–]\s*)?(.*?)\s*$/;
const RE_GRADE_HEAD = /^#{2,6}\s*(上上|上吉|中吉|中平|中下|下下)\s*(?:[（(].*?[)）])?\s*$/;
const RE_META_GRADE = /^签级\s*[:：]\s*(.*?)\s*$/;
const RE_META_THEME = /^主题\s*[:：]\s*([A-Za-z][A-Za-z0-9_-]*)/;
const RE_POEM_HEAD = /^签诗\s*[:：]\s*$/;
const RE_BULLET = /^[-*+]\s*(.+?)\s*$/;

function parseLotsCopy(text) {
  const src = stripHtmlComments(String(text).replace(/^\uFEFF/, ''));
  const lines = src.split('\n');
  const lots = [];
  const verdicts = {};
  const errors = [];

  const err = (lineNo, msg) => errors.push(`第 ${lineNo} 行：${msg}`);

  let mode = 'preamble'; // preamble | lot | verdict | other
  let lot = null;
  let inPoem = false;
  let gradeKey = null;

  function finishLot() {
    if (!lot) return;
    const label = `第 ${lot.n} 签${lot.name ? '「' + lot.name + '」' : ''}`;
    if (!lot.name) err(lot.line, `${label} 缺少卦名（标题应写成「## 第 N 签 · 卦名」）`);
    if (!lot.grade) err(lot.line, `${label} 缺少「签级：」`);
    else if (!GRADES.includes(lot.grade)) {
      err(lot.line, `${label} 签级「${lot.grade}」不合法；只能是 ${GRADES.join(' / ')}`);
    }
    if (!lot.theme) err(lot.line, `${label} 缺少「主题：」`);
    else if (!THEMES[lot.theme]) {
      err(lot.line, `${label} 主题「${lot.theme}」不合法；只能是 ${Object.keys(THEMES).join(' / ')}`);
    }
    if (lot.poem.length !== 4) {
      err(lot.line, `${label} 签诗应为 4 行，目前是 ${lot.poem.length} 行`);
    }
    lot.poem.forEach((p, i) => {
      if (!p) err(lot.line, `${label} 第 ${i + 1} 句签诗为空`);
    });
    lots.push(lot);
    lot = null;
    inPoem = false;
  }

  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    const t = raw.replace(/\s+$/, '').trim();
    if (!t) return;
    if (/^---+$/.test(t)) return;

    let m;
    if ((m = t.match(RE_LOT))) {
      finishLot();
      gradeKey = null;
      mode = 'lot';
      lot = {
        n: parseInt(m[1], 10),
        name: m[2].trim(),
        grade: '',
        theme: '',
        poem: [],
        line: lineNo,
      };
      return;
    }
    if ((m = t.match(RE_GRADE_HEAD))) {
      finishLot();
      mode = 'verdict';
      gradeKey = m[1];
      if (verdicts[gradeKey]) err(lineNo, `签级「${gradeKey}」的判词出现了两次`);
      else verdicts[gradeKey] = [];
      return;
    }
    if (/^#{1,6}\s/.test(t)) {
      /* 其他标题，例如「# 签级判词」或顶部大标题 */
      finishLot();
      mode = 'other';
      gradeKey = null;
      return;
    }

    if (mode === 'lot' && lot) {
      if (inPoem) {
        if (RE_META_GRADE.test(t) || RE_META_THEME.test(t)) {
          err(lineNo, `签诗已经开始，这里不能再出现「签级：」或「主题：」`);
        } else {
          lot.poem.push(t);
        }
        return;
      }
      if ((m = t.match(RE_META_GRADE))) {
        if (lot.grade) err(lineNo, `第 ${lot.n} 签的「签级：」出现了两次`);
        lot.grade = m[1].trim();
        return;
      }
      if ((m = t.match(RE_META_THEME))) {
        if (lot.theme) err(lineNo, `第 ${lot.n} 签的「主题：」出现了两次`);
        lot.theme = m[1].toLowerCase();
        return;
      }
      if (RE_POEM_HEAD.test(t)) {
        inPoem = true;
        return;
      }
      err(lineNo, '无法识别的内容；签级写成「签级：上上」，主题写成「主题：lost」，四句签诗逐行写在「签诗：」下面');
      return;
    }

    if (mode === 'verdict' && gradeKey) {
      if ((m = t.match(RE_BULLET))) {
        verdicts[gradeKey].push(m[1].trim());
        return;
      }
      err(lineNo, '签级判词应写成「- 一句话」，每档至少一条');
      return;
    }

    /* preamble / other：忽略过渡文字 */
  });
  finishLot();

  lots.sort((a, b) => a.n - b.n);

  if (lots.length !== 64) errors.push(`应有 64 签，目前解析到 ${lots.length} 签`);
  const seen = new Set();
  lots.forEach((l) => {
    if (l.n < 1 || l.n > 64) errors.push(`第 ${l.line} 行：签号 ${l.n} 超出 1~64`);
    else if (seen.has(l.n)) errors.push(`第 ${l.line} 行：签号 ${l.n} 重复`);
    seen.add(l.n);
  });
  const missing = [];
  for (let i = 1; i <= 64; i++) if (!seen.has(i)) missing.push(i);
  if (missing.length) errors.push(`缺少签号：${missing.join('、')}（可能是整段被删掉了）`);

  GRADES.forEach((g) => {
    if (!verdicts[g] || !verdicts[g].length) {
      errors.push(`签级判词缺少「${g}」（标题写成「## ${g}」，下面至少保留一条「- ……」）`);
    }
  });

  if (errors.length) {
    throw new BuildError(errors.map((e) => '  × ' + e).join('\n'));
  }
  lots.forEach((l) => delete l.line); // 行号只用于报错，不进入生成结果
  return { lots, verdicts };
}

function renderLotsJs(data) {
  const out = [];
  out.push('/* ============================================================');
  out.push(' * 向克苏鲁许愿 · 六十四签');
  out.push(' *');
  out.push(' * ⚠ 本文件由 LOTS_COPY.md 自动生成，请勿直接修改。');
  out.push(' *   改文案请编辑 LOTS_COPY.md，然后运行：sh build-lots.sh');
  out.push(' *   核对是否忘了同步：node tools/lots_build.cjs --check');
  out.push(' *');
  out.push(' * 每签：n 签号 / name 卦名 / grade 签级 / theme 主题(对应解读语料)');
  out.push(' *       poem 签诗四句');
  out.push(' * grade: 上上 | 上吉 | 中吉 | 中平 | 中下 | 下下');
  out.push(' * theme: lost 迷茫 / tired 疲惫 / lonely 孤独 / fear 恐惧 / angry 愤怒 / hollow 空洞');
  out.push(' * （game2.0：theme 仅作签的元数据分类；解读语料由用户所选心情驱动）');
  out.push(' * ============================================================ */');
  out.push('const LOTS = [');

  data.lots.forEach((lot) => {
    const nLead = lot.n < 10 ? '  ' : ' ';
    const namePad = ' '.repeat(Math.max(1, 9 - displayWidth(lot.name)));
    out.push(
      `  { n: ${lot.n},${nLead}name: ${jsString(lot.name)},${namePad}` +
      `grade: ${jsString(lot.grade)}, theme: ${jsString(lot.theme)},`
    );
    out.push(`    poem: [${lot.poem.map(jsString).join(', ')}] },`);
  });

  out.push('];');
  out.push('');
  out.push('/* 六档签级判词 */');
  out.push('const VERDICTS = {');
  GRADES.forEach((g) => {
    out.push(`  ${jsString(g)}: [`);
    data.verdicts[g].forEach((v) => out.push(`    ${jsString(v)},`));
    out.push('  ],');
  });
  out.push('};');
  out.push('');
  out.push('/* 签级 → 理智消耗区间 */');
  out.push('const SAN_RANGE = {');
  const ranges = GRADES.map((g) => `${jsString(g)}: [${SAN_RANGE[g].join(', ')}]`);
  out.push('  ' + ranges.slice(0, 3).join(', ') + ',');
  out.push('  ' + ranges.slice(3).join(', ') + ',');
  out.push('};');
  out.push('');
  return out.join('\n');
}

function renderLotsCopy(data) {
  const out = [];
  out.push('<!--');
  out.push('  《向克苏鲁许愿》64 签文案 —— 人类编辑版');
  out.push('');
  out.push('  游戏实际读取的是 lots.js（同目录）。请不要手改 lots.js，改完本文件后运行：');
  out.push('');
  out.push('      sh build-lots.sh');
  out.push('');
  out.push('  规则：');
  out.push('  1. 每支签一个二级标题：「## 第12签 · 天泽履」。签号 1~64，不重复；顺序随意，生成时自动按签号排。');
  out.push('  2. 签级：六档之一 —— 上上 / 上吉 / 中吉 / 中平 / 中下 / 下下。');
  out.push('  3. 主题：六个英文 key 之一 —— lost(迷茫) / tired(疲惫) / lonely(孤独) / fear(恐惧) / angry(愤怒) / hollow(空洞)。');
  out.push('     主题影响的是解读语料前缀，「（迷茫）」只是给你看的备注，可以改。');
  out.push('  4. 签诗：写在「签诗：」下面，四行、一句一行；行内不要用英文单引号，需要引号请用中文引号。');
  out.push('  5. 「# 签级判词」一节按签级分组，每条以「- 」开头；每档至少保留一条，会随机抽一条显示。');
  out.push('  6. 不要删除或改名各级标题行；改完后运行 sh build-lots.sh，把 LOTS_COPY.md 和 lots.js 一起提交。');
  out.push('  7. 脚本会校验签数、签号、签级、主题和签诗行数，出错会告诉你第几行，不会弄坏游戏。');
  out.push('-->');
  out.push('');
  out.push('# 《向克苏鲁许愿》64 签文案');
  out.push('');
  out.push('> 想改哪句直接改哪句；改完运行 `sh build-lots.sh` 即可写回游戏。');
  out.push('');
  out.push('---');
  out.push('');

  data.lots.forEach((lot) => {
    out.push(`## 第${lot.n}签 · ${lot.name}`);
    out.push('');
    out.push(`签级：${lot.grade}`);
    out.push(`主题：${lot.theme}（${THEMES[lot.theme] || ''}）`);
    out.push('签诗：');
    lot.poem.forEach((p) => out.push(p));
    out.push('');
  });

  out.push('---');
  out.push('');
  out.push('# 签级判词');
  out.push('');
  out.push('> 结果页「断曰」用到的判词，每个签级随机抽一条显示。');
  out.push('');
  GRADES.forEach((g) => {
    out.push(`## ${g}`);
    out.push('');
    (data.verdicts[g] || []).forEach((v) => out.push(`- ${v}`));
    out.push('');
  });
  out.push('<!-- 文件到此结束；上面的「签级判词」六节也请保留标题格式。 -->');
  out.push('');
  return out.join('\n');
}

/* 读取现有 lots.js 里的数据（--extract 用） */
function loadJsData() {
  const code = fs.readFileSync(JS_FILE, 'utf8');
  const result = vm.runInNewContext(
    code + '\n;({ LOTS, VERDICTS, SAN_RANGE });',
    {},
    { filename: JS_FILE }
  );
  return { lots: result.LOTS, verdicts: result.VERDICTS, san: result.SAN_RANGE };
}

function main(argv) {
  const arg = argv[2] || '';
  try {
    if (arg === '--extract') {
      process.stdout.write(renderLotsCopy(loadJsData()));
      return;
    }

    const md = fs.readFileSync(MD_FILE, 'utf8');
    const data = parseLotsCopy(md);
    const code = renderLotsJs(data);
    const old = fs.existsSync(JS_FILE) ? fs.readFileSync(JS_FILE, 'utf8') : null;

    if (arg === '--check') {
      if (old === code) {
        console.log('✓ lots.js 与 LOTS_COPY.md 一致');
      } else {
        console.error('× lots.js 不是最新：请运行  sh build-lots.sh');
        process.exitCode = 1;
      }
      return;
    }
    if (arg && arg !== '--write') {
      throw new BuildError(`未知参数「${arg}」；用法：node tools/lots_build.cjs [--check|--extract]`);
    }

    fs.writeFileSync(JS_FILE, code, 'utf8');
    if (old === code) {
      console.log('✓ lots.js 已是最新，无需改动');
    } else {
      console.log(`✓ 已写入 lots.js：${data.lots.length} 签 · ${GRADES.length} 档判词`);
    }
  } catch (e) {
    if (e instanceof BuildError) {
      console.error('文案文件有问题，没有生成 lots.js：\n' + e.message);
    } else {
      console.error((e && e.stack) || e);
    }
    process.exitCode = 1;
  }
}

module.exports = {
  parseLotsCopy,
  renderLotsJs,
  renderLotsCopy,
  loadJsData,
  GRADES,
  THEMES,
  SAN_RANGE,
  BuildError,
};

if (require.main === module) main(process.argv);
