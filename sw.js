/* Offline cache. Bump CACHE when you change any file so phones pick up the update. */
var CACHE = "vetri-bill-v1";
var ASSETS = [
  "./", "index.html", "style.css", "app.js", "bill_pdf.js", "manifest.webmanifest",
  "lib/jspdf.umd.min.js", "fonts/NotoSans-Regular.ttf", "fonts/NotoSans-Bold.ttf",
  "logo.png", "icon-192.png", "icon-512.png"
];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(e.request).catch(function () { return caches.match("index.html"); });
  }));
});
