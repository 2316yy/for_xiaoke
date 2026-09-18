/* ============================================================
 * 向克苏鲁许愿 · game2.0 声音引擎
 * 全程序化 Web Audio 合成，无外部音频资源：
 *   - 深海嗡鸣（环境底声，双正弦拍频 + 低通噪声）
 *   - 摇签沙沙（晃动速度联动的带通噪声簇）
 *   - 出签钟磬（泛音列 + 低频鼓点）
 *   - 揭签气流（上升滤波扫频）
 *   - 轻触气泡音（心情选择）
 * 首次用户手势后启动；静音状态存入 localStorage。
 * ============================================================ */
(function () {
  const LS_KEY = 'cth_muted';
  let ctx = null;
  let master = null;
  let ambientOn = false;
  let muted = false;
  try { muted = localStorage.getItem(LS_KEY) === '1'; } catch (e) { /* ignore */ }

  function ensureCtx() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
      return true;
    } catch (e) { return false; }
  }

  function noiseBuffer(seconds = 2) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* ---------- 深海嗡鸣 ---------- */
  function startAmbient() {
    if (!ensureCtx() || ambientOn) return;
    ambientOn = true;
    try {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(master);

      // 双正弦拍频（55 / 55.4 Hz）——深海的脉搏
      [55, 55.4].forEach((f) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const og = ctx.createGain();
        og.gain.value = 0.5;
        o.connect(og); og.connect(g);
        o.start();
      });

      // 极低通噪声——远处的水
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer(4);
      noise.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 160; lp.Q.value = 0.4;
      const ng = ctx.createGain(); ng.gain.value = 0.35;
      noise.connect(lp); lp.connect(ng); ng.connect(g);
      noise.start();

      // 缓慢呼吸
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoG = ctx.createGain(); lfoG.gain.value = 0.02;
      lfo.connect(lfoG); lfoG.connect(g.gain);
      lfo.start();

      g.gain.linearRampToValueAtTime(0.075, ctx.currentTime + 3.5);
    } catch (e) { /* 静默失败 */ }
  }

  /* ---------- 摇签沙沙（与晃动速度联动） ---------- */
  let lastRustle = 0;
  function rustle(intensity) {
    if (!ctx || muted) return;
    const now = performance.now();
    if (now - lastRustle < 70) return;
    lastRustle = now;
    try {
      const v = Math.min(1, intensity);
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(0.12);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 700 + Math.random() * 900 + v * 600;
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.001 + v * 0.12, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09 + Math.random() * 0.05);
      src.connect(bp); bp.connect(g); g.connect(master);
      src.start();
      src.stop(t + 0.16);
    } catch (e) { /* 静默失败 */ }
  }

  /* ---------- 出签钟磬 + 低频鼓点 ---------- */
  function bell() {
    if (!ctx || muted) return;
    try {
      const t = ctx.currentTime;
      const base = 528;
      [1, 1.51, 2.24, 2.94].forEach((r, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = base * r;
        const g = ctx.createGain();
        const amp = 0.11 / (i + 1);
        g.gain.setValueAtTime(amp, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6 - i * 0.35);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + 2.8);
      });
      // 低频鼓点
      const d = ctx.createOscillator();
      d.type = 'sine';
      d.frequency.setValueAtTime(82, t);
      d.frequency.exponentialRampToValueAtTime(44, t + 0.7);
      const dg = ctx.createGain();
      dg.gain.setValueAtTime(0.22, t);
      dg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      d.connect(dg); dg.connect(master);
      d.start(t); d.stop(t + 1);
    } catch (e) { /* 静默失败 */ }
  }

  /* ---------- 揭签气流（上升扫频） ---------- */
  function riser() {
    if (!ctx || muted) return;
    try {
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(2.2);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = 2.2;
      bp.frequency.setValueAtTime(220, t);
      bp.frequency.exponentialRampToValueAtTime(1600, t + 1.9);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
      src.connect(bp); bp.connect(g); g.connect(master);
      src.start(t); src.stop(t + 2.2);
    } catch (e) { /* 静默失败 */ }
  }

  /* ---------- 轻触气泡音 ---------- */
  function tick() {
    if (!ctx || muted) return;
    try {
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(980, t);
      o.frequency.exponentialRampToValueAtTime(620, t + 0.07);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.035, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.1);
    } catch (e) { /* 静默失败 */ }
  }

  /* ---------- game2.5：积木落子的木石叩击（强度 0..1） ---------- */
  function knock(strength) {
    if (!ctx || muted) return;
    const s = Math.max(0.1, Math.min(1, strength == null ? 1 : strength));
    try {
      const t = ctx.currentTime;
      /* 低频体 */
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(196 * (0.9 + Math.random() * 0.2), t);
      o.frequency.exponentialRampToValueAtTime(72, t + 0.09);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.16 * s, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.18);
      /* 表面咔哒 */
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(0.05);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 2400;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.05 * s, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      src.connect(hp); hp.connect(ng); ng.connect(master);
      src.start(t); src.stop(t + 0.05);
    } catch (e) { /* 静默失败 */ }
  }

  /* ---------- game2.5：宝石降临的星屑琶音 ---------- */
  function shimmer() {
    if (!ctx || muted) return;
    try {
      const t = ctx.currentTime;
      [1568, 1975.5, 2349.3, 3136].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = ctx.createGain();
        const t0 = t + i * 0.09;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.06 / (i * 0.5 + 1), t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
        o.connect(g); g.connect(master);
        o.start(t0); o.stop(t0 + 1.5);
      });
    } catch (e) { /* 静默失败 */ }
  }

  /* ---------- 对外接口 ---------- */
  window.__audio = {
    /* 首次用户手势调用：解锁 AudioContext 并启动环境声 */
    unlock() {
      if (!ensureCtx()) return;
      if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); }
      startAmbient();
    },
    rustle,
    bell,
    riser,
    tick,
    knock,
    shimmer,
    setMuted(m) {
      muted = m;
      try { localStorage.setItem(LS_KEY, m ? '1' : '0'); } catch (e) { /* ignore */ }
      if (master) master.gain.value = m ? 0 : 0.9;
    },
    get muted() { return muted; },
  };
})();
