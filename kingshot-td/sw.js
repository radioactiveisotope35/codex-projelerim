const CACHE_NAME = 'kingshot-td-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './js/main.js',
  './js/engine.js',
  './js/renderer.js',
  './js/input.js',
  './js/scenes.js',
  './js/map.js',
  './js/pathfinding.js',
  './js/towers.js',
  './js/projectiles.js',
  './js/enemies.js',
  './js/waves.js',
  './js/economy.js',
  './js/upgrades.js',
  './js/ui.js',
  './js/save.js',
  './js/balance.js',
  './js/util.js',
  './maps/meadow.json',
  './maps/canyon.json',
  './maps/crossroads.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    }))
  );
});
