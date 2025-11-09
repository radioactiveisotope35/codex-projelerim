const CACHE_NAME = 'kingshot-td-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './js/main.js',
  './js/renderer.js',
  './js/map.js',
  './js/waves.js',
  './js/economy.js',
  './js/upgrades.js',
  './js/balance.js',
  './js/entities.js', // AKTİF SİSTEM İÇİN EKLENDİ
  './js/utils.js',    // util.js SİLİNDİ, BU EKLENDİ
  './js/abilities.js',// AKTİF SİSTEM İÇİN EKLENDİ
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
