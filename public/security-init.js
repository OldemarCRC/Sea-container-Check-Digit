/*
 * security-init.js — loaded synchronously in <head>, before first paint.
 * Kept as a separate same-origin file so the CSP needs no 'unsafe-inline'.
 */
(function () {
  'use strict';
  var root = document.documentElement;

  /*
   * SECURITY · Anti-clickjacking.
   * A <meta> CSP cannot carry `frame-ancestors`, and <meta> X-Frame-Options is
   * ignored by browsers, so on static hosting (GitHub Pages) we fall back to
   * the OWASP frame-busting defence:
   *   - top-level window → reveal the UI (styles.css hides it by default)
   *   - framed           → try to break out. Modern browsers usually block
   *                        cross-origin top navigation without a user gesture
   *                        (and sandboxed iframes always do); in that case the
   *                        UI simply stays hidden — the actual protection.
   */
  if (window.self === window.top) {
    root.classList.add('unframed');
  } else {
    try { window.top.location.replace(window.self.location.href); } catch (e) { /* stay hidden */ }
  }

  /*
   * Initial theme from the OS preference only.
   * SECURITY / PRIVACY: nothing is read from or written to localStorage,
   * sessionStorage or cookies — the app is fully stateless.
   */
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    root.classList.add('dark');
  }
})();
