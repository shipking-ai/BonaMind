/**
 * Boot recovery: runs before the app's main script, from index.html.
 *
 * If the page's own build files fail to load, the page HTML came from a build
 * that is no longer deployed (usually a service worker's cached copy). The
 * app's main script is one of those files, so nothing else can recover the
 * page; it stays blank. This drops the stale worker and its precache and
 * reloads once, so the browser fetches the live page. A one-minute guard stops
 * reload loops. Lazy chunks that fail later are handled in the app itself
 * (src/lib/staleDeployRecovery.ts).
 *
 * The installed apps ship every file, so they are left alone. CSP-safe: no
 * inline script, no eval. Tested in src/__tests__/bootRecovery.test.ts.
 */
(function () {
  var KEY = 'bonamind:boot-recovery-at';
  var WINDOW_MS = 60000;
  if (window.Capacitor || window.__TAURI_INTERNALS__) return;

  function fromBuild(target) {
    if (!target || (target.tagName !== 'SCRIPT' && target.tagName !== 'LINK')) return false;
    // Element src/href are absolute, so this is "our own /assets/ folder".
    var url = target.src || target.href || '';
    var origin = window.location && window.location.origin;
    return !!origin && url.indexOf(origin + '/assets/') === 0;
  }

  function claim() {
    try {
      var store = window.sessionStorage;
      var now = window.Date.now();
      var last = Number(store.getItem(KEY) || 0);
      if (last && now - last < WINDOW_MS) return false;
      store.setItem(KEY, String(now));
      return true;
    } catch (e) {
      // No storage, no loop guard: better a blank page than a reload loop.
      return false;
    }
  }

  function recover() {
    if (!claim()) return;
    var done = false;
    function go() {
      if (done) return;
      done = true;
      window.location.reload();
    }
    var tasks = [];
    var sw = window.navigator && window.navigator.serviceWorker;
    if (sw && sw.getRegistrations) {
      tasks.push(
        sw.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (r) { return r.unregister(); }));
        })
      );
    }
    var caches = window.caches;
    if (caches && caches.keys) {
      // Only the precache holds the stale page; keep the on-demand caches.
      tasks.push(
        caches.keys().then(function (keys) {
          return Promise.all(
            keys
              .filter(function (k) { return k.indexOf('workbox-precache') === 0; })
              .map(function (k) { return caches.delete(k); })
          );
        })
      );
    }
    Promise.all(tasks).then(go, go);
    window.setTimeout(go, 3000);
  }

  window.addEventListener(
    'error',
    function (event) {
      if (fromBuild(event && event.target)) recover();
    },
    true
  );
})();
