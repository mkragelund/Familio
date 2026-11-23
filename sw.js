// Familio service worker – gør appen installerbar og hurtig at starte.
// HTML hentes altid fra nettet først (så opdateringer slår igennem), resten fra cache.
var CACHE = 'familio-1.11.0';
var SHELL = [
  './', './index.html', './tablet.html', './css/familio.css',
  './js/config.js', './js/model.js', './js/store.js', './js/ui.js', './js/admin.js', './js/tablet.js', './js/sound.js', './js/weather.js', './js/occasions.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  './manifest.webmanifest', './manifest-tablet.webmanifest'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') { return; }
  var url = new URL(req.url);
  if (url.origin !== location.origin) { return; } // Firebase og skrifttyper håndteres af browseren
  if (/version\.json$/.test(url.pathname)) { return; } // altid fra nettet
  var isPage = req.mode === 'navigate' || /\.(html|js|css)$/.test(url.pathname);
  if (isPage) {
    // netværk først, cache som reserve (offline)
    e.respondWith(fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () { return caches.match(req).then(function (r) { return r || caches.match('./index.html'); }); }));
  } else {
    e.respondWith(caches.match(req).then(function (r) { return r || fetch(req); }));
  }
});
