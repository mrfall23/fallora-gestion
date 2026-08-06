/*
 * Service worker Fallora — volontairement prudent.
 *
 * - Navigations (HTML)   : network-first → jamais de page perimee ; la version
 *                          en cache ne sert qu'en secours hors-ligne.
 * - Assets statiques Next : cache-first → sûr car Next hache les noms de fichiers.
 * - Tout le cross-origin (Supabase, polices Google) : ignore → aucune donnee
 *   metier n'est jamais mise en cache.
 *
 * Bump CACHE pour invalider l'ancien cache lors d'une mise a jour.
 */
const CACHE = 'fallora-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.add('/')).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // ne touche pas Supabase/Google

  // Navigations : reseau d'abord, cache en secours hors-ligne
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('/', net.clone());
        return net;
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match('/')) || Response.error();
      }
    })());
    return;
  }

  // Assets statiques immuables : cache d'abord
  if (url.pathname.startsWith('/_next/static') || /\.(png|svg|ico|woff2?)$/.test(url.pathname)) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const net = await fetch(req);
        if (net.ok) cache.put(req, net.clone());
        return net;
      } catch {
        return hit || Response.error();
      }
    })());
  }
});

// ── Notifications de vente (Web Push) ──
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { /* payload non-JSON */ }
  const title = data.title || 'Nouvelle vente';
  e.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'vente',
      data: { url: data.url || '/admin' },
      vibrate: [80, 40, 80],
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const cible = (e.notification.data && e.notification.data.url) || '/admin';
  e.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of fenetres) {
      if ('focus' in c) { try { await c.navigate(cible); } catch {} return c.focus(); }
    }
    if (self.clients.openWindow) return self.clients.openWindow(cible);
  })());
});
