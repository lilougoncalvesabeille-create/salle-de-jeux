// Service worker : garde tous les jeux en cache pour jouer hors connexion.
// Change VERSION quand tu modifies un jeu pour forcer la mise à jour du cache.
const VERSION = 'salle-de-jeux-20261122-230834';
const FILES = [
  './', 'index.html', 'manifest.webmanifest',
  'mobile.css', 'common.js', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'snake.html', 'echecs.html', 'shooter.html', 'casse-briques.html', 'survivant.html',
  'defense.html', 'pong.html', 'morpion.html', 'puissance4.html', 'morpion-extreme.html', 'clicker.html'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Réseau d'abord (pour avoir toujours la dernière version), cache si pas de réseau ou réseau trop lent.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const network = fetch(e.request, { cache: 'no-cache' }).then(res => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    });
    const timeout = new Promise(r => setTimeout(r, 4000, null));
    try {
      const res = await Promise.race([network, timeout]);
      if (res) return res;
    } catch (err) { /* hors connexion */ }
    const cached = await cache.match(e.request, { ignoreSearch: true });
    if (cached) { e.waitUntil(network.catch(() => {})); return cached; }
    try { return await network; } catch (err) {}
    return (await cache.match('index.html')) || Response.error();
  })());
});
