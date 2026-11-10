const CACHE = 'thumbs-studio-v4';
const SHELL = [
  '/',
  '/index.html',
  '/src/app.js',
  '/src/ui.js',
  '/src/model.js',
  '/src/storage.js',
  '/src/sync.js',
  '/src/style.css',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('thumbs-studio-') && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Never cache private API responses, uploads or third-party requests.
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  if (!SHELL.includes(url.pathname)) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
        }
        return response;
      })
      .catch(() =>
        caches
          .match(event.request)
          .then(
            (response) =>
              response ||
              new Response('Abra o app online uma vez antes de usar offline.', { status: 503 }),
          ),
      ),
  );
});
