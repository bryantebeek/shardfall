// Shardfall's service worker: network first (so updates arrive), and a cached copy of everything
// the game has loaded, so it still starts without a connection.
// ponytail: the cache is never pruned; old hashed builds pile up. Clear by bumping CACHE if it matters.
const CACHE = 'shardfall-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      return (await cache.match(req)) ?? (req.mode === 'navigate' && (await cache.match('./'))) ?? Response.error();
    }
  })());
});
