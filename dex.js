/* ============================================================
 * 向克苏鲁许愿 · game2.5 —— dex.js 集曜图鉴数据层 + 浮层 UI
 *
 * 两个维度：
 *   时间 —— 七曜方（日/月/火/水/木/金/土）+ 隐藏宝石；按「所问之日」的
 *           真实曜日映射解锁，永不重复，最多 8 个；方块留在本地。
 *   次数 —— 求签次数不实体化，全部记录进对应曜日方；点方块倒叙翻阅。
 *
 * 数据（localStorage: cth_dex_v1）
 *   cubes:  { sun:{got:ts}, …, gem:{got:ts} }
 *   draws:  [{ n,grade,mood,q,target,wday,ts, verdict,empathy,abyss,rebirth,action,san }]
 *   layout: { sun:[i,j,k,ry], … }   积木摆放（由 cubes.js 写）
 *
 * 浮层：#cube-dex 集曜八格 / #lot-dex 六十四签谱 / #cube-recs 单方签录
 * 依赖：lots.js（LOTS）；game.js 的 MOODS 仅在调用期读取（本文件先加载）
 * ============================================================ */
(function () {
  'use strict';

  /* ============ 七曜定义（index = Date.getDay()） ============ */
  const WEEK = [
    { key: 'sun',    name: '日曜', full: '日曜日', file: 'sun.glb',        color: '#f0b45c' },
    { key: 'moon',   name: '月曜', full: '月曜日', file: 'moon.glb',       color: '#a8c8ff' },
    { key: 'fire',   name: '火曜', full: '火曜日', file: 'fire.glb',       color: '#e07856' },
    { key: 'water',  name: '水曜', full: '水曜日', file: 'water.glb',      color: '#6fb6cf' },
    { key: 'tree',   name: '木曜', full: '木曜日', file: 'tree.glb',       color: '#8fd0a8' },
    { key: 'golden', name: '金曜', full: '金曜日', file: 'golden.glb',     color: '#e8d078' },
    { key: 'earth',  name: '土曜', full: '土曜日', file: 'earth.glb',      color: '#c9a37e' },
  ];
  const GEM = { key: 'gem', name: '星宝石', full: '隐藏曜外之石', file: 'star_jewel.glb', color: '#d8b46a' };
  const ALL_CUBES = WEEK.concat([GEM]);
  const BY_KEY = {};
  ALL_CUBES.forEach(c => { BY_KEY[c.key] = c; });

  /* 心情色镜像（与 game.js MOODS 一致；本文件加载早，需自备） */
  const MOOD_META = {
    lost:   ['迷茫', '#9d7bff'], tired: ['疲惫', '#7f8fc9'], lonely: ['孤独', '#6fb6cf'],
    fear:   ['恐惧', '#6a7fd8'], angry: ['愤怒', '#e07856'], hollow: ['空洞', '#9d95b0'],
    joy:    ['欢喜', '#f0b45c'], calm:  ['平和', '#8fd0a8'], hope:   ['期待', '#e8d078'],
    grace:  ['感念', '#e8a0b8'],
  };

  const GEM_CHANCE = 0.05;   /* 每签 5%：深渊把私藏的宝石一并丢给你（未持有宝石时） */
  const LS_KEY = 'cth_dex_v1';

  /* ============ 持久化（含旧档清洗：坏 layout / 坏 draws 不崩 UI） ============ */
  const blank = () => ({ v: 1, cubes: {}, draws: [], layout: {} });
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function sanitizeState(p) {
    const s = blank();
    if (!p || typeof p !== 'object') return s;

    if (p.cubes && typeof p.cubes === 'object') {
      ALL_CUBES.forEach((c) => {
        const v = p.cubes[c.key];
        if (v && typeof v === 'object') {
          s.cubes[c.key] = { got: Number.isFinite(v.got) ? v.got : Date.now() };
        }
      });
    }

    if (Array.isArray(p.draws)) {
      s.draws = p.draws.filter((d) => d && typeof d === 'object'
        && Number.isFinite(d.n) && d.n >= 1 && d.n <= 64
        && Number.isFinite(d.ts)
        && Number.isFinite(d.wday) && d.wday >= 0 && d.wday <= 6
        && typeof d.grade === 'string'
        && typeof d.mood === 'string'
        && typeof d.target === 'string'
      ).slice(-2000);
    }

    if (p.layout && typeof p.layout === 'object') {
      ALL_CUBES.forEach((c) => {
        const v = p.layout[c.key];
        if (!Array.isArray(v) || v.length < 4) return;
        const nums = v.slice(0, 4).map(Number);
        if (!nums.every(Number.isFinite)) return;
        s.layout[c.key] = [
          clamp(Math.round(nums[0]), -16, 16),
          clamp(Math.round(nums[1]), -16, 16),
          clamp(Math.round(nums[2]), 0, 8),
          ((Math.round(nums[3]) % 4) + 4) % 4,
        ];
      });
    }
    return s;
  }
  let state = blank();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) state = sanitizeState(JSON.parse(raw));
  } catch (e) { /* 隐私模式 / 坏 JSON：内存态兜底 */ }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  /* ============ 日期工具 ============ */
  const pad2 = n => (n < 10 ? '0' : '') + n;
  function fmtDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parseDate(s) { const a = s.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); }
  function todayStr() { return fmtDate(new Date()); }
  function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return fmtDate(d); }
  function weekdayOf(s) { return parseDate(s).getDay(); }
  /* 与今天的相距天数（目标 - 今天） */
  function diffFromToday(s) {
    return Math.round((parseDate(s) - parseDate(todayStr())) / 86400000);
  }
  function relLabel(s) {
    const d = diffFromToday(s);
    if (d === 0) return '今天';
    if (d === 1) return '明天';
    if (d === 2) return '后天';
    if (d === -1) return '昨天';
    if (d === -2) return '前天';
    return d > 0 ? d + ' 天后' : (-d) + ' 天前';
  }
  function dateLabel(s) {
    const d = parseDate(s);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + WEEK[d.getDay()].name;
  }
  function tsLabel(ts) {
    const d = new Date(ts);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /* ============ 记录一签 ============ */
  function recordDraw({ lot, moodKey, question, targetDate, card }) {
    const wday = weekdayOf(targetDate);
    const cubeKey = WEEK[wday].key;
    const ts = Date.now();
    const isNewCube = !state.cubes[cubeKey];
    if (isNewCube) state.cubes[cubeKey] = { got: ts };

    /* 宝石判定：独立于曜方，未持有时每签 5% */
    let gemDropped = false;
    if (!state.cubes.gem && Math.random() < GEM_CHANCE) {
      state.cubes.gem = { got: ts };
      gemDropped = true;
    }

    state.draws.push({
      n: lot.n, grade: lot.grade, mood: moodKey, q: question,
      target: targetDate, wday, ts,
      verdict: card.verdict, empathy: card.empathy, abyss: card.abyss,
      rebirth: card.rebirth, action: card.action, san: card.san,
    });
    if (state.draws.length > 2000) state.draws = state.draws.slice(-2000);   /* 安全上限 */
    save();
    return { cubeKey, isNewCube, gemDropped, countForCube: drawsForCube(cubeKey).length };
  }

  /* ============ 查询 ============ */
  function drawsForCube(key) {
    const list = key === 'gem'
      ? state.draws.slice()
      : state.draws.filter(d => d.wday === WEEK.findIndex(w => w.key === key));
    return list.sort((a, b) => b.ts - a.ts);   /* 倒叙 */
  }
  function litLots() {
    const m = {};
    state.draws.forEach(d => { m[d.n] = (m[d.n] || 0) + 1; });
    return m;
  }
  function stats() {
    return {
      cubes: Object.keys(state.cubes).length,
      lots: Object.keys(litLots()).length,
      draws: state.draws.length,
    };
  }
  const hasCube = key => !!state.cubes[key];
  const cubeKeys = () => Object.keys(state.cubes);
  function saveLayout(layout) { state.layout = layout; save(); }

  /* ============ 浮层框架 ============ */
  const esc = s => String(s == null ? '' : s)
    .replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const openStack = [];
  function openVeil(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('on');
    if (!openStack.includes(id)) openStack.push(id);
    if (window.__audio) window.__audio.tick();
  }
  function closeVeil(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('on');
    const i = openStack.indexOf(id);
    if (i >= 0) openStack.splice(i, 1);
  }
  function closeTopVeil() {
    if (openStack.length) { closeVeil(openStack[openStack.length - 1]); return true; }
    return false;
  }
  const anyVeilOpen = () => openStack.length > 0;
  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-close]');
    if (c) { const v = c.closest('.veil'); if (v) closeVeil(v.id); }
    if (e.target.classList && e.target.classList.contains('veil')) closeVeil(e.target.id);
  });

  /* ============ 集曜八格 ============ */
  function renderCubeDex() {
    const grid = document.getElementById('yao-grid');
    const st = stats();
    document.getElementById('cube-dex-n').textContent = st.cubes + ' / 8';
    const sub = document.querySelector('#cube-dex .veil-head .sub');
    if (sub) {
      sub.innerHTML = st.cubes >= 8
        ? '八曜俱足 · 深渊再无可赠 —— 已集 <b>8 / 8</b>'
        : '七日之曜 · 一方一世界 —— 已集 <b>' + st.cubes + ' / 8</b>';
    }
    grid.innerHTML = '';
    ALL_CUBES.forEach((c) => {
      const owned = hasCube(c.key);
      const cell = document.createElement('button');
      cell.className = 'yao-cell ' + (owned ? 'lit' : 'dim');
      cell.style.setProperty('--c', c.color);
      const isGem = c.key === 'gem';
      const nm = owned || !isGem ? c.name : '？？？';
      const ct = owned
        ? (isGem ? '深渊私藏' : '收录 ' + drawsForCube(c.key).length + ' 签')
        : (isGem ? '偶随签落' : c.full + ' · 未入列');
      cell.innerHTML =
        '<span class="sw"></span>' +
        '<span class="nm">' + esc(nm) + '</span>' +
        '<span class="ct">' + esc(ct) + '</span>';
      if (owned) cell.onclick = () => openCubeRecs(c.key);
      grid.appendChild(cell);
    });
  }

  /* ============ 单方签录 ============ */
  function openCubeRecs(key) {
    const c = BY_KEY[key];
    const inner = document.getElementById('cube-recs-inner');
    const draws = drawsForCube(key);
    let html =
      '<div class="veil-head">' +
        '<h2>' + esc(c.name) + (key === 'gem' ? '' : '方') + '</h2>' +
        '<p class="sub">' + esc(c.full) + ' · 收录 <b>' + draws.length + '</b> 签 · 倒叙</p>' +
      '</div>';
    if (key === 'gem') {
      const st = stats();
      const first = state.draws.length ? state.draws[0].ts : null;
      html += '<p class="veil-meta" style="text-align:center;margin-bottom:26px">' +
        '深渊的私藏 · 曜外之石<br>' +
        '共祈愿 <em>' + st.draws + '</em> 次 · 集曜 <em>' + st.cubes + ' / 8</em> · 点亮签谱 <em>' + st.lots + ' / 64</em>' +
        (first ? '<br>始于 <em>' + esc(tsLabel(first)) + '</em>' : '') +
        '</p>';
    }
    if (!draws.length) {
      html += '<div class="rec-empty">此 方 尚 无 签 录</div>';
    } else {
      html += '<div class="rec-list">';
      draws.forEach((d, i) => {
        const mm = MOOD_META[d.mood] || ['?', '#888'];
        html +=
          '<button class="rec" data-i="' + i + '">' +
            '<span class="rdot" style="--c:' + mm[1] + '"></span>' +
            '<span class="rmain">' +
              '<span class="rtop">' +
                '<span class="rno">第 ' + esc(cn(d.n)) + ' 签</span>' +
                '<span class="rgd g-' + esc(d.grade) + '">' + esc(d.grade) + '</span>' +
                '<span class="rdate">' + esc(mm[0]) + ' · 问 ' + esc(dateLabel(d.target)) + '（' + esc(relLabel(d.target)) + '）</span>' +
              '</span>' +
              '<span class="rq">' + esc(d.q) + '</span>' +
            '</span>' +
          '</button>';
      });
      html += '</div>';
    }
    inner.innerHTML = html;
    inner.querySelectorAll('.rec').forEach((el) => {
      el.onclick = () => openDrawCard(draws[Number(el.dataset.i)], () => openCubeRecs(key));
    });
    openVeil('cube-recs');
  }

  /* ============ 签卡回看（浮层内复刻结果卡排版） ============ */
  function cardHtml(d, extraMeta) {
    const lot = LOTS.find(l => l.n === d.n);
    const mm = MOOD_META[d.mood] || ['?', '#888'];
    const hex = (typeof hexHtml === 'function' && lot) ? hexHtml(lot.name) : '';
    return (
      '<div class="head">' +
        '<span class="lot-no">第 ' + esc(cn(d.n)) + ' 签 · 六十四签</span>' +
        '<span class="grade-pill g-' + esc(d.grade) + '">' + esc(d.grade) + '</span>' +
      '</div>' +
      '<div class="hex-name">' + esc(lot ? lot.name : '') + hex + '</div>' +
      '<div class="question-line">你问：<em>' + esc(d.q) + '</em>（' + esc(mm[0]) + '之问）</div>' +
      '<p class="veil-meta">所问之日 <em>' + esc(dateLabel(d.target)) + '（' + esc(relLabel(d.target)) + '）</em>' +
        ' · 求于 <em>' + esc(tsLabel(d.ts)) + '</em>' + (extraMeta || '') + '</p>' +
      '<div class="poem" style="cursor:default;min-height:0">' + (lot ? esc(lot.poem.join('\n')).replace(/\n/g, '<br>') : '') + '</div>' +
      '<div class="block verdict"><h3>断 曰</h3><p>' + esc(d.verdict) + '</p></div>' +
      '<div class="block"><h3>回 响</h3><p>' + esc(d.empathy) + '</p></div>' +
      '<div class="block"><h3>深 渊</h3><p>' + esc(d.abyss) + '</p></div>' +
      '<div class="block"><h3>向 死 而 生</h3><p>' + esc(d.rebirth) + '</p></div>' +
      '<div class="block act"><h3>指 引</h3><p>' + esc(d.action) + '</p></div>' +
      '<div class="san">理 智 消 耗 <b>−' + esc(d.san) + '</b></div>'
    );
  }
  function openDrawCard(d, backFn) {
    const inner = document.getElementById('cube-recs-inner');
    inner.innerHTML =
      '<button class="veil-back">‹ 回 到 签 录</button>' +
      '<div class="card">' + cardHtml(d) + '</div>';
    inner.querySelector('.veil-back').onclick = backFn;
    document.getElementById('cube-recs').scrollTop = 0;
  }

  /* ============ 六十四签谱 ============ */
  function renderLotDex() {
    const inner = document.getElementById('lot-dex-inner');
    const lit = litLots();
    const n = Object.keys(lit).length;
    let html =
      '<div class="veil-head">' +
        '<h2>签 谱</h2>' +
        '<p class="sub">六十四签 · 求过即点亮 —— 已点亮 <b>' + n + ' / 64</b></p>' +
      '</div>' +
      '<div class="lot-grid">';
    LOTS.forEach((lot) => {
      const got = lit[lot.n];
      html +=
        '<button class="lot-cell' + (got ? ' lit' : '') + '" data-n="' + lot.n + '">' +
          '<span class="ln">' + esc(cn(lot.n)) + '</span>' +
          (got ? '<span class="lname">' + esc(lot.name) + '</span>' : '') +
        '</button>';
    });
    html += '</div>';
    html += '<p class="veil-meta" style="text-align:center;margin-top:30px">未亮的签仍在筒中等候 · 点已亮的签可回看签诗</p>';
    inner.innerHTML = html;
    inner.querySelectorAll('.lot-cell.lit').forEach((el) => {
      el.onclick = () => openLotDetail(Number(el.dataset.n));
    });
  }
  function openLotDetail(n) {
    const inner = document.getElementById('lot-dex-inner');
    const lot = LOTS.find(l => l.n === n);
    const mine = state.draws.filter(d => d.n === n).sort((a, b) => b.ts - a.ts);
    const hex = (typeof hexHtml === 'function') ? hexHtml(lot.name) : '';
    let meta = '你已求得 <em>' + mine.length + '</em> 次';
    if (mine.length) meta += ' · 最近 ' + esc(tsLabel(mine[0].ts));
    let html =
      '<button class="veil-back">‹ 回 到 签 谱</button>' +
      '<div class="card">' +
        '<div class="head">' +
          '<span class="lot-no">第 ' + esc(cn(n)) + ' 签 · 六十四签</span>' +
          '<span class="grade-pill g-' + esc(lot.grade) + '">' + esc(lot.grade) + '</span>' +
        '</div>' +
        '<div class="hex-name">' + esc(lot.name) + hex + '</div>' +
        '<p class="veil-meta">' + meta + '</p>' +
        '<div class="poem" style="cursor:default;min-height:0">' + esc(lot.poem.join('\n')).replace(/\n/g, '<br>') + '</div>' +
      '</div>';
    if (mine.length) {
      html += '<div class="rec-list" style="margin-top:8px">';
      mine.forEach((d, i) => {
        const mm = MOOD_META[d.mood] || ['?', '#888'];
        html +=
          '<button class="rec" data-i="' + i + '">' +
            '<span class="rdot" style="--c:' + mm[1] + '"></span>' +
            '<span class="rmain">' +
              '<span class="rtop"><span class="rdate">' + esc(mm[0]) + ' · 问 ' + esc(dateLabel(d.target)) + ' · 求于 ' + esc(tsLabel(d.ts)) + '</span></span>' +
              '<span class="rq">' + esc(d.q) + '</span>' +
            '</span>' +
          '</button>';
      });
      html += '</div>';
    }
    inner.innerHTML = html;
    inner.querySelector('.veil-back').onclick = renderLotDex;
    inner.querySelectorAll('.rec').forEach((el) => {
      el.onclick = () => {
        const d = mine[Number(el.dataset.i)];
        openDrawCardIn('lot-dex-inner', d, renderLotDex);
      };
    });
    document.getElementById('lot-dex').scrollTop = 0;
  }
  /* 在指定浮层容器里打开签卡（供签谱跳转而复用） */
  function openDrawCardIn(innerId, d, backFn) {
    const inner = document.getElementById(innerId);
    inner.innerHTML =
      '<button class="veil-back">‹ 返 回</button>' +
      '<div class="card">' + cardHtml(d) + '</div>';
    inner.querySelector('.veil-back').onclick = backFn;
    inner.closest('.veil').scrollTop = 0;
  }

  /* ============ 中文数字（与 game.js 同款，避免依赖加载顺序） ============ */
  const CN_D = '零一二三四五六七八九';
  function cn(n) {
    if (n < 10) return CN_D[n];
    if (n === 10) return '十';
    if (n < 20) return '十' + CN_D[n % 10];
    const t = Math.floor(n / 10), o = n % 10;
    return CN_D[t] + '十' + (o ? CN_D[o] : '');
  }

  /* ============ 统计入口刷新 ============ */
  function refreshStats() {
    const st = stats();
    const a = document.getElementById('stat-cubes-n');
    const b = document.getElementById('stat-lots-n');
    if (a) a.textContent = st.cubes + ' / 8';
    if (b) b.textContent = st.lots + ' / 64';
  }

  /* ============ 入口绑定 ============ */
  function bind() {
    const sc = document.getElementById('stat-cubes');
    const sl = document.getElementById('stat-lots');
    if (sc) sc.onclick = () => {
      renderCubeDex();
      openVeil('cube-dex');
      /* 镜头俯看积木阵，便于拖拽摆放 */
      if (window.__ritual && window.__ritual.toGarden && window.__cubes && window.__cubes.count() > 0) {
        window.__ritual.toGarden();
      }
    };
    if (sl) sl.onclick = () => { renderLotDex(); openVeil('lot-dex'); };
    const lr = document.getElementById('layout-reset');
    if (lr) lr.onclick = () => {
      if (window.__cubes) window.__cubes.resetLayout();
      if (window.__audio) window.__audio.tick();
    };
    refreshStats();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  /* ============ 对外 ============ */
  window.__dex = {
    WEEK, GEM, ALL_CUBES, BY_KEY,
    recordDraw, drawsForCube, litLots, stats, hasCube, cubeKeys,
    getLayout: () => state.layout || {},
    saveLayout,
    fmtDate, parseDate, todayStr, addDays, weekdayOf, relLabel, dateLabel, diffFromToday,
    refreshStats,
  };
  window.__dexUi = {
    openCube: openCubeRecs,
    openCubeDex() { renderCubeDex(); openVeil('cube-dex'); },
    openLotDex() { renderLotDex(); openVeil('lot-dex'); },
    closeTopVeil, anyVeilOpen,
  };
})();
