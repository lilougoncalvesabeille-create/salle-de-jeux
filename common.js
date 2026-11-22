// Script commun à toutes les pages de la salle de jeux.
(function () {
  // ---- Pas de zoom au pincement / double appui (iOS) ----
  for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });

  // ---- Règles : affichées automatiquement seulement à la toute première ouverture du jeu ----
  const rules = document.getElementById('rules');
  if (rules) {
    const key = 'regles-vues:' + (location.pathname.split('/').pop() || 'index.html');
    const root = document.documentElement;
    if (root.classList.contains('rules-seen')) {
      rules.classList.add('hidden');              // déjà vues : fermée d'office…
      root.classList.remove('rules-seen');        // …mais le bouton 📖 peut toujours l'ouvrir
    } else {
      const mark = () => { try { localStorage.setItem(key, '1'); } catch (e) {} };
      if (rules.classList.contains('hidden')) mark();
      else new MutationObserver((_, obs) => { if (rules.classList.contains('hidden')) { mark(); obs.disconnect(); } })
        .observe(rules, { attributes: true, attributeFilter: ['class'] });
    }
  }

  // ---- Plein écran ----
  // Bouton ⛶ dans la barre du haut (si le navigateur le permet : Android, ordinateur ; pas sur iPhone).
  // Le choix est retenu : en passant d'un jeu à l'autre, le plein écran revient au premier appui.
  const de = document.documentElement;
  const fsOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const fsCan = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const inApp = matchMedia('(display-mode: fullscreen)').matches;
  const want = v => { try { if (v === undefined) return localStorage.getItem('salle-fs') === '1'; localStorage.setItem('salle-fs', v ? '1' : '0'); } catch (e) { return false; } };
  function enterFs() { const r = de.requestFullscreen || de.webkitRequestFullscreen; if (r) try { const p = r.call(de, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  function exitFs() { const x = document.exitFullscreen || document.webkitExitFullscreen; if (x) try { const p = x.call(document); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  if (fsCan && !inApp) {
    const btn = document.createElement('button');
    btn.id = 'fs-btn'; btn.type = 'button';
    const sync = () => { btn.textContent = fsOn() ? '🗗' : '⛶'; btn.title = fsOn() ? 'Quitter le plein écran' : 'Plein écran'; };
    btn.onclick = () => { if (fsOn()) { want(false); exitFs(); } else { want(true); enterFs(); } };
    document.addEventListener('fullscreenchange', sync); document.addEventListener('webkitfullscreenchange', sync);
    sync();
    const bar = document.querySelector('.topbar');
    if (bar) {
      const ref = bar.querySelector('#pause-btn') || bar.querySelector('#rules-btn');
      bar.insertBefore(btn, ref || null);
    } else {
      btn.style.cssText = 'position:fixed;top:10px;right:10px;z-index:40;font-size:18px;padding:8px 11px;border:0;border-radius:10px;background:#1f2730;color:#e6edf3;cursor:pointer';
      document.body.appendChild(btn);
    }
    // Remet le plein écran au premier appui sur une nouvelle page si le joueur l'avait choisi.
    const again = () => { if (want() && !fsOn()) enterFs(); };
    document.addEventListener('pointerup', again, { once: true, capture: true });
  }
  // ---- Mode partie « bord à bord » (téléphone en portrait) ----
  // Pendant une partie, le jeu occupe tout l'écran : barre du haut cachée, seul un petit bouton pause reste.
  const isPhone = () => innerWidth <= 600 && innerHeight > innerWidth;
  let imm = false;
  window.SalleImmersive = on => {
    on = !!on && isPhone();
    if (on && fsCan && !inApp && !fsOn()) enterFs();
    if (on === imm) return;
    imm = on;
    document.body.classList.toggle('immersive', on);
    if (on) scrollTo(0, 0);
    dispatchEvent(new Event('resize'));
  };
  addEventListener('resize', () => { if (imm && !isPhone()) { imm = false; document.body.classList.remove('immersive'); } });

  // Quand on sort du plein écran avec le bouton retour du téléphone, on oublie le choix.
  document.addEventListener('fullscreenchange', () => { if (!fsOn() && document.visibilityState === 'visible') setTimeout(() => { if (!fsOn()) want(false); }, 50); });

  // ---- Sauvegardes : stockage persistant + copie de secours dans IndexedDB ----
  // Le navigateur ne doit pas effacer les sauvegardes pour libérer de la place.
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

  const DB = 'salle-de-jeux-backup', STORE = 'kv', SNAP = 'localStorage';
  function openDb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idb(mode, fn) {
    const db = await openDb();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => { db.close(); res(req && req.result); };
      tx.onerror = () => { db.close(); rej(tx.error); };
    });
  }
  function snapshot() {
    const o = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); }
    return o;
  }
  let lastJson = '';
  async function backup() {
    try {
      const snap = snapshot(), json = JSON.stringify(snap);
      if (json === lastJson || !Object.keys(snap).length) return;
      lastJson = json;
      // On garde l'union de l'ancienne copie et de l'état actuel : une clé disparue n'efface pas la copie.
      const old = (await idb('readonly', s => s.get(SNAP))) || {};
      await idb('readwrite', s => s.put(Object.assign(old, snap), SNAP));
    } catch (e) {}
  }
  async function restoreMissing() {
    try {
      const saved = await idb('readonly', s => s.get(SNAP));
      if (!saved) return false;
      let restored = 0;
      for (const k in saved) if (localStorage.getItem(k) === null) { localStorage.setItem(k, saved[k]); restored++; }
      return restored > 0;
    } catch (e) { return false; }
  }
  // Un effacement volontaire (bouton « réinitialiser ») doit aussi effacer la copie de secours.
  async function forget(keys) {
    try {
      const saved = (await idb('readonly', s => s.get(SNAP))) || {};
      for (const k of keys) delete saved[k];
      await idb('readwrite', s => s.put(saved, SNAP));
      lastJson = '';
    } catch (e) {}
  }
  try {
    const proto = Object.getPrototypeOf(localStorage);
    const rm = proto.removeItem, clr = proto.clear;
    proto.removeItem = function (k) { rm.call(this, k); forget([String(k)]); };
    proto.clear = function () { const keys = Object.keys(snapshot()); clr.call(this); forget(keys); };
  } catch (e) {}

  window.SalleSave = { snapshot, backup, restoreMissing, forget };

  if (!('indexedDB' in window)) return;
  restoreMissing().then(restored => {
    // Si des sauvegardes manquaient (navigateur nettoyé, mise à jour…), on recharge une fois pour que le jeu les lise.
    let reloaded = false;
    try { reloaded = sessionStorage.getItem('salle-restored') === '1'; } catch (e) {}
    if (restored && !reloaded) { try { sessionStorage.setItem('salle-restored', '1'); } catch (e) {} location.reload(); return; }
    backup();
    setInterval(backup, 15000);
    addEventListener('pagehide', backup);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') backup(); });
  });
})();
