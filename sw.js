// sw.js — Cache dos arquivos estaticos do app, para abrir mesmo sem internet.
// Estrategia: network-first para index.html (sempre atualizado), cache-first para o resto.

var CACHE_NAME = 'nankin-shell-v5';
var SHELL_FILES = [
  './db-local.js',
  './sync.js',
  './pdf.min.js',
  './pdf.worker.min.js',
  './manifest.json'
];

self.addEventListener('install', function (event) {
  self.skipWaiting(); // Ativa imediatamente sem esperar fechar abas
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL_FILES).catch(function () {});
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (n) { return n !== CACHE_NAME; }).map(function (n) { return caches.delete(n); })
      );
    }).then(function () { return self.clients.claim(); }) // Toma controle imediato de todas as abas
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  var isOwnFile = url.origin === self.location.origin;
  var isIndexHtml = isOwnFile && (url.pathname.endsWith('/') || url.pathname.endsWith('index.html'));

  if (isIndexHtml) {
    // Network-first para o index.html: sempre busca versão nova, usa cache só se offline
    event.respondWith(
      fetch(req).then(function (networkRes) {
        var clone = networkRes.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(req, clone); });
        return networkRes;
      }).catch(function () {
        return caches.match(req);
      })
    );
  } else if (isOwnFile) {
    // Cache-first para os outros arquivos do app
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
  // Requisições externas (Supabase, CDNs) seguem direto pela rede
});
