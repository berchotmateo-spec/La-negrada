/*
 * Service worker: guarda los archivos de la app para que abra sin internet.
 * Primero intenta la red (así llegan las actualizaciones) y si no hay conexión usa la copia guardada.
 * Los datos del bar (ventas, stock) no pasan por acá: están en el localStorage del navegador.
 */
var CACHE = 'la-negrada-v3';
var ARCHIVOS = [
  './', './index.html', './css/styles.css', './js/store.js', './js/app.js',
  './img/logo.jpg', './img/favicon.png', './img/icono-192.png', './img/icono-512.png', './manifest.json'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ARCHIVOS); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (claves) {
    return Promise.all(claves.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(function (resp) {
      var copia = resp.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copia); });
      return resp;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (r) { return r || caches.match('./index.html'); });
    })
  );
});
