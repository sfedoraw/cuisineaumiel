// Service worker de cuisineaumiel.fr : le site s'installe comme une appli et les pages visitées
// (et les recettes du carnet) restent lisibles hors connexion.
const V = 'cam-v1';
const CORE = ['/', '/recettes/', '/carnet/', '/hors-ligne/', '/recettes.json', '/manifest.webmanifest', '/icon-192.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V && k !== 'cam-img').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
const trimImages = async () => {
  const c = await caches.open('cam-img'); const ks = await c.keys();
  for (const k of ks.slice(0, Math.max(0, ks.length - 150))) await c.delete(k);
};
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Photos Unsplash : depuis le cache d'abord (150 photos au plus).
  if (url.hostname === 'images.unsplash.com') {
    e.respondWith(caches.open('cam-img').then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); trimImages(); }
      return res;
    }).catch(() => fetch(req)));
    return;
  }
  if (url.origin !== location.origin) return;
  // Pages : réseau d'abord, copie en cache, page hors ligne en dernier recours.
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(V).then((c) => c.put(req, copy)); return res; })
      .catch(async () => (await caches.match(req, { ignoreSearch: true })) || caches.match('/hors-ligne/')));
    return;
  }
  // CSS, JS, données, images du site : cache puis mise à jour en arrière-plan.
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(V).then((c) => c.put(req, copy)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});
// Le carnet demande de garder ses recettes disponibles hors connexion.
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'carnet' && Array.isArray(e.data.urls)) {
    e.waitUntil(caches.open(V).then((c) => Promise.all(e.data.urls.filter((u) => /^\/recettes\/[a-z0-9-]+\/$/.test(u)).map((u) => c.add(u).catch(() => {})))));
  }
});
