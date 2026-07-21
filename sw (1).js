// sw.js — Cache dos arquivos estaticos do app, para abrir mesmo sem internet.
// Estrategia: cache-first para os arquivos do proprio app; network-first para tudo externo (CDNs, Supabase).

var CACHE_NAME = 'nankin-shell-v4';
var SHELL_FILES = [
  './',
  './index.html',
  './db-local.js',
  './sync.js',
  './pdf.min.js',
  './pdf.worker.min.js',
  './manifest.json'
];

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL_FILES).catch(function () {
        // se algum arquivo nao existir ainda, nao trava a instalacao
      });
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (n) { return n !== CACHE_NAME; }).map(function (n) { return caches.delete(n); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  var isOwnFile = url.origin === self.location.origin;

  if (isOwnFile) {
    // Cache-first para os arquivos do proprio app: abre instantaneo e offline.
    event.respondWith(
      caches.match(req).then(function (cached) {
        var fetchPromise = fetch(req).then(function (networkRes) {
          if (networkRes && networkRes.ok) {
            var clone = networkRes.clone();
            caches.open(CACHE_NAME).then(function (cache) { cache.put(req, clone); });
          }
          return networkRes;
        }).catch(function () { return cached; });
        return cached || fetchPromise;
      })
    );
  }
  // Requisicoes externas (Supabase, CDNs de fonte/icone) seguem direto pela rede,
  // sem interceptar — o app ja trata a falta de rede via db-local.js / sync.js.
});
