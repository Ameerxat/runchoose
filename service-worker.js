// A simple service worker to cache game assets for offline play.
// When the service worker is installed it pre‑caches all game files.  During
// fetch events it serves cached responses if available.  This pattern
// is recommended for PWAs so that they work offline【92065133406526†L136-L163】.

const CACHE_NAME = 'run-choose-root-cache-v1';

// List of files to cache.  In this variant of the project all images live at
// the root, so we list each PNG directly.  If you add new assets you
// should include them here so they are available offline.
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/game.js',
  '/manifest.json',
  '/service-worker.js',
  '/hero.png',
  '/sword.png',
  '/wand.png',
  '/monster1.png',
  '/monster2.png',
  '/background.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  // Remove old caches when activating the new service worker.
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});