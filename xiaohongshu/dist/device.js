/* 从 index.html 头部外置：容器 CSP 禁止内联脚本 */
/* 设备探测：渲染前打标到 <html>，CSS/JS 双通道取用（window.__device） */
(function () {
  var ua = navigator.userAgent || '';
  var coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  var ipad = /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;
  var mobileUA = /Android|webOS|iPhone|iPad|iPod|Mobile/i.test(ua) || ipad;
  var d = window.__device = {
    touch: coarse || ('ontouchstart' in window),
    mobile: mobileUA || (coarse && Math.min(screen.width, screen.height) < 820),
    coarse: coarse
  };
  var root = document.documentElement;
  root.classList.add(d.touch ? 'is-touch' : 'is-mouse');
  if (d.mobile) root.classList.add('is-mobile');
})();

