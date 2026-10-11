/*
 * 同源外部脚本：被各 CSP 测试页以 <script src="csp-reporter.js"> 引入。
 * 因为 script-src 'self' 允许同源外部脚本，所以在四种 fixture 中都能加载，
 * 用来把页面内发生的 CSP violation 直接可视化到 #csp-log，方便肉眼取证。
 */
(function () {
  'use strict';
  var log = document.getElementById('csp-log');

  function line(txt, color) {
    if (!log) return;
    var d = document.createElement('div');
    d.textContent = txt;
    if (color) d.style.color = color;
    log.appendChild(d);
  }

  document.addEventListener('securitypolicyviolation', function (e) {
    line(
      '⛔ CSP violation → directive=' + e.violatedDirective +
      ' | blockedURI=' + e.blockedURI +
      ' | policy="' + e.originalPolicy + '"',
      '#e0245b'
    );
    console.warn('[csp-reporter] violation', {
      violatedDirective: e.violatedDirective,
      blockedURI: e.blockedURI,
      originalPolicy: e.originalPolicy,
    });
  });

  line('✓ csp-reporter.js 已加载（同源外部脚本，符合 script-src）', '#22c55e');
})();
