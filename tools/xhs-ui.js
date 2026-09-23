/* ============================================================
 * 小红书小工具 3D 版 UI 补丁（经典脚本 / ES2017）
 *   1. 容器禁用剪贴板：提供「可选中文本 + 手动复制」浮层
 *   2. Flex gap 行为检测（Chrome 61 基线用 margin 兜底）
 *   3. 3D 失败兜底：WebGL 初始化失败 / app3d.js 报错 / 8s 未 ready 时，
 *      收掉 loader 并切换静态页面（UI 仍可用），必要时补 Canvas 2D 星空
 * ============================================================ */
(function () {
  'use strict';

  window.__xhsMini = true;

  /* ---------- 内嵌模型：base64 → ArrayBuffer → GLTFLoader.parse ----------
   * 容器只允许 jpg/css/gif/svg/png/js/jpeg/json/html/woff2/webp/woff，
   * 所以模型以 base64 放进 model-*.js，包内不再出现 .glb。
   * 同时关掉 createImageBitmap，强制 GLTFLoader 用 TextureLoader(<img> blob:)
   * 读取 GLB 内嵌贴图，避免 ImageBitmapLoader 内部走 fetch。 */
  try { window.createImageBitmap = undefined; } catch (e) { /* 旧内核忽略 */ }

  function base64ToArrayBuffer(b64) {
    var bin = window.atob(b64);
    var len = bin.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  window.__xhsLoadGLB = function (loader, name, onLoad, onProgress, onError) {
    try {
      var b64 = window.__XHS_MODELS && window.__XHS_MODELS[name];
      if (!b64) throw new Error('embedded model missing: ' + name);
      loader.parse(base64ToArrayBuffer(b64), '', onLoad, onError);
    } catch (err) {
      if (onError) onError(err);
    }
  };

  /* ---------- 复制浮层（替代容器不提供的剪贴板能力） ---------- */
  function ensureCopyLayer() {
    var veil = document.getElementById('xhs-copy');
    if (veil) return veil;
    veil = document.createElement('div');
    veil.id = 'xhs-copy';
    veil.className = 'xhs-copy-veil';

    var box = document.createElement('div');
    box.className = 'xhs-copy-box';
    var title = document.createElement('h4');
    title.textContent = '谶 言';
    var textarea = document.createElement('textarea');
    textarea.className = 'xhs-copy-text';
    textarea.readOnly = true;
    textarea.setAttribute('aria-label', '可选中文本');
    var tip = document.createElement('p');
    tip.className = 'xhs-copy-tip';
    tip.textContent = '长按选中文本后手动复制';
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'xhs-copy-close';
    close.textContent = '收 起';

    box.appendChild(title);
    box.appendChild(textarea);
    box.appendChild(tip);
    box.appendChild(close);
    veil.appendChild(box);
    document.body.appendChild(veil);

    close.addEventListener('click', function () { veil.classList.remove('on'); });
    veil.addEventListener('click', function (e) { if (e.target === veil) veil.classList.remove('on'); });
    return veil;
  }

  window.__xhsShowCopy = function (text) {
    var veil = ensureCopyLayer();
    var textarea = veil.querySelector('.xhs-copy-text');
    textarea.value = String(text || '');
    veil.classList.add('on');
    try {
      textarea.focus();
      if (textarea.setSelectionRange) textarea.setSelectionRange(0, textarea.value.length);
      else textarea.select();
    } catch (e) { /* 旧内核忽略自动选中 */ }
    if (window.showToast) window.showToast('长 按 选 中 复 制');
  };

  /* ---------- Flex gap 行为检测（不是语法检测） ---------- */
  try {
    var probe = document.createElement('div');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.display = 'flex';
    probe.style.flexDirection = 'column';
    probe.style.rowGap = '1px';
    probe.appendChild(document.createElement('div'));
    probe.appendChild(document.createElement('div'));
    document.body.appendChild(probe);
    if (probe.scrollHeight === 1) {
      document.documentElement.classList.add('supports-flex-gap');
    }
    document.body.removeChild(probe);
  } catch (e) { /* compat.css 的 margin 基线兜底 */ }

  /* ---------- 3D 失败兜底 ---------- */
  var fallbackDone = false;

  function canvasFallback() {
    var app = document.getElementById('app');
    if (!app || app.querySelector('canvas')) return;
    var canvas = document.createElement('canvas');
    canvas.className = 'xhs-sky';
    canvas.setAttribute('aria-hidden', 'true');
    app.appendChild(canvas);
    var ctx = null;
    try { ctx = canvas.getContext && canvas.getContext('2d'); } catch (e) { ctx = null; }
    if (!ctx) { canvas.style.display = 'none'; return; }
    var stars = [];
    var w = 0;
    var h = 0;
    var raf = 0;
    var makeStars = function () {
      var n = Math.max(28, Math.min(90, Math.round(w * h / 11000)));
      stars = [];
      for (var i = 0; i < n; i++) {
        stars.push({ x: Math.random() * w, y: Math.random() * h, r: 0.25 + Math.random(), p: Math.random() * 6.28, s: 0.35 + Math.random() * 0.8 });
      }
    };
    var resize = function () {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w; canvas.height = h;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      makeStars();
    };
    var draw = function (t) {
      ctx.clearRect(0, 0, w, h);
      var g = ctx.createRadialGradient(w / 2, h * 0.42, 10, w / 2, h * 0.42, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(38,29,66,.85)');
      g.addColorStop(0.45, 'rgba(13,11,26,.45)');
      g.addColorStop(1, 'rgba(5,6,12,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        ctx.globalAlpha = 0.2 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.001 * s.s + s.p));
        ctx.fillStyle = '#e8e4f5';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 6.283185);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = window.requestAnimationFrame(draw);
    };
    var stop = function () { if (raf) { window.cancelAnimationFrame(raf); raf = 0; } };
    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else if (!raf) raf = window.requestAnimationFrame(draw); });
    raf = window.requestAnimationFrame(draw);
  }

  function fallback3d(reason) {
    if (fallbackDone) return;
    fallbackDone = true;
    document.documentElement.classList.add('no-3d');
    var loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';
    canvasFallback();
    window.__ready = true;
    if (window.showToast && reason) window.showToast(reason);
  }

  /* app3d.js 本身抛错时，xhs-ui.js 已先加载，能接住 */
  window.addEventListener('error', function (e) {
    if (fallbackDone || window.__ready) return;
    if (!e || !e.filename || e.filename.indexOf('app3d.js') >= 0) fallback3d('3D 初始化失败 · 已切静态场景');
  });
  window.addEventListener('unhandledrejection', function () {
    if (!fallbackDone && !window.__ready) fallback3d('3D 初始化失败 · 已切静态场景');
  });

  /* 3D 资源迟迟没 ready：收 loader，保证 UI 可用 */
  setTimeout(function () {
    if (!window.__ready) fallback3d('3D 资源加载超时 · 已切静态场景');
  }, 8000);
})();
