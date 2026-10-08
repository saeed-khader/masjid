/* تخزين الشاشة داخل الجهاز حتى تعمل بدون إنترنت بعد أول فتح */
var CACHE = 'prayer-screen-v1';
var FILES = ['./'].concat(['./assets/fonts/amiri-arabic-400-normal.woff2', './assets/fonts/amiri-arabic-700-normal.woff2', './assets/fonts/amiri-latin-400-normal.woff2', './assets/fonts/amiri-latin-700-normal.woff2', './assets/fonts/ibm-plex-sans-arabic-arabic-300-normal.woff2', './assets/fonts/ibm-plex-sans-arabic-arabic-500-normal.woff2', './assets/fonts/ibm-plex-sans-arabic-arabic-700-normal.woff2', './assets/fonts/ibm-plex-sans-arabic-latin-300-normal.woff2', './assets/fonts/ibm-plex-sans-arabic-latin-500-normal.woff2', './assets/fonts/ibm-plex-sans-arabic-latin-700-normal.woff2', './assets/fonts/noto-kufi-arabic-arabic-300-normal.woff2', './assets/fonts/noto-kufi-arabic-arabic-400-normal.woff2', './assets/fonts/noto-kufi-arabic-arabic-500-normal.woff2', './assets/fonts/noto-kufi-arabic-arabic-700-normal.woff2', './assets/fonts/noto-kufi-arabic-arabic-800-normal.woff2', './assets/fonts/noto-kufi-arabic-latin-300-normal.woff2', './assets/fonts/noto-kufi-arabic-latin-400-normal.woff2', './assets/fonts/noto-kufi-arabic-latin-500-normal.woff2', './assets/fonts/noto-kufi-arabic-latin-700-normal.woff2', './assets/fonts/noto-kufi-arabic-latin-800-normal.woff2', './css/fonts.css', './css/style.css', './index.html', './js/adhkar.js', './js/app.js', './js/config.js', './js/prayer-times.js']);

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* يعرض النسخة المحفوظة فورًا، ويحدّثها من الإنترنت إذا كان متوفرًا */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(e.request, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(e.request).then(function (res) {
        if (res && res.ok) c.put(e.request, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});
