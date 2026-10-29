/**
 * Platform detection — runs synchronously before paint to prevent FOUC.
 * Applied as <script src="/platform-detect.js"> in index.html.
 * CSP-safe: no inline script, no eval.
 */
(function(){
  var d = document.documentElement;
  var c = window.Capacitor;
  if (c) {
    d.classList.add('platform-' + c.getPlatform());
  } else {
    var u = navigator.userAgent;
    if (/android/i.test(u)) d.classList.add('platform-android');
    else if (/Windows NT/.test(u)) d.classList.add('platform-windows');
    else if (/Linux/.test(u)) d.classList.add('platform-linux');
    else d.classList.add('platform-web');
  }
})();
