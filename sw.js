/* 離線快取：第一次打開後，沒網路也能用。
 * 更新網站時把 VERSION 改掉，舊快取會在下次打開時被清掉。 */
var VERSION = 'toeic-cards-v10';
var SHELL = ['./', './index.html', './css/style.css', './js/srs.js', './js/app.js', './data/words.js', './js/sync.js', './js/firebase-config.js', './manifest.webmanifest', './icons/icon-192.png', './icons/apple-touch-icon.png', './favicon.ico'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
/* 同網域檔案：先給快取、背景更新（stale-while-revalidate）；其他（Google Fonts）：網路優先，失敗用快取 */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin === location.origin) {
    e.respondWith(caches.open(VERSION).then(function (c) {
      return c.match(e.request).then(function (hit) {
        var net = fetch(e.request).then(function (res) { if (res && res.ok) c.put(e.request, res.clone()); return res; }).catch(function () { return hit; });
        return hit || net;
      });
    }));
  } else {
    e.respondWith(fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(VERSION + '-ext').then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () { return caches.match(e.request); }));
  }
});
