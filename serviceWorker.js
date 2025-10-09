const CACHE = 'kanban-pro-cache-v1';
const ASSETS = [
  '.',
  './index.html',
  './manifest.json',
  './assets/css/style.css',
  './assets/js/main.js',
  './assets/js/storage.js',
  './assets/js/ui.js',
  './assets/js/dragdrop.js',
  './assets/js/modal.js',
  './assets/js/themes.js',
  './assets/js/utils.js'
];

// Install
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

// Activate
self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

// Fetch
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(resp => resp || fetch(e.request).catch(()=> caches.match('./index.html')))
  );
});
