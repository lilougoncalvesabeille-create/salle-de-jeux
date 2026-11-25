// Service worker : garde tous les jeux en cache pour jouer hors connexion.
// VERSION est changée automatiquement par deploy.ps1 à chaque mise en ligne.
const VERSION = 'salle-de-jeux-20261125-131036';
const FILES = [
  './', 'index.html', 'manifest.webmanifest',
  'mobile.css', 'common.js', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'snake.html', 'echecs.html', 'shooter.html', 'casse-briques.html', 'survivant.html',
  'defense.html', 'pong.html', 'morpion.html', 'puissance4.html', 'morpion-extreme.html', 'clicker.html',
  'runner.html', 'gemmes.html', 'golf.html', 'course.html', 'donjon.html'
];

// Télécharge (sans passer par le cache HTTP du navigateur) tous les fichiers qui manquent dans le cache.
// Les fichiers sont téléchargés un par un avec plusieurs essais : une coupure réseau ne bloque pas tout.
async function fillCache(report) {
  const cache = await caches.open(VERSION);
  let done = 0, failed = 0;
  for (const f of FILES) {
    if (await cache.match(f)) { done++; report && report(done, failed); continue; }
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        const res = await fetch(new Request(f, { cache: 'reload' }));
        if (res.ok) { await cache.put(f, res); ok = true; }
      } catch (e) { /* on réessaie */ }
    }
    if (ok) done++; else failed++;
    report && report(done, failed);
  }
  return { done, failed, total: FILES.length };
}

// Installation : tout est téléchargé avant que la nouvelle version remplace l'ancienne.
self.addEventListener('install', e => {
  e.waitUntil(fillCache(broadcast).then(r => {
    if (r.failed) throw new Error('fichiers manquants'); // on garde l'ancienne version complète
    return self.skipWaiting();
  }));
});

// Activation : l'ancien cache n'est supprimé qu'une fois le nouveau complet.
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    await fillCache();
    const keys = await caches.keys();
    // Seulement les caches de la salle de jeux : les autres applis du même site (ex. Swipe Dressing) gardent les leurs.
    await Promise.all(keys.filter(k => k.startsWith('salle-de-jeux-') && k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function broadcast(done, failed) {
  const list = await self.clients.matchAll({ includeUncontrolled: true });
  for (const c of list) c.postMessage({ type: 'offline-progress', version: VERSION, done, failed, total: FILES.length });
}

// La page d'accueil demande de vérifier / compléter le cache hors connexion.
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'ensure-offline') return;
  e.waitUntil(fillCache(broadcast).then(r => broadcast(r.done, r.failed)));
});

// Réseau d'abord (pour avoir toujours la dernière version), cache si pas de réseau ou réseau trop lent.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const network = fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
      if (res.ok) cache.put(e.request.url.split('?')[0], res.clone()); // une seule entrée par fichier
      return res;
    });
    const timeout = new Promise(r => setTimeout(r, 4000, null));
    try {
      const res = await Promise.race([network, timeout]);
      if (res) return res;
    } catch (err) { /* hors connexion */ }
    const cached = await cache.match(e.request, { ignoreSearch: true })
      || await caches.match(e.request, { ignoreSearch: true }); // n'importe quelle version, faute de mieux
    if (cached) { e.waitUntil(network.catch(() => {})); return cached; }
    try { return await network; } catch (err) {}
    return (await cache.match('index.html')) || Response.error();
  })());
});
