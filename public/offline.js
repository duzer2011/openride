/* Offline copy of paid tour content. Lives in its own cache so the service worker never
   touches it and sign-out can wipe it. Loaded on every page that can show or sign out. */
(function (root) {
  var PAID = 'openride-paid-v1';
  var FLAG = 'openride:saved:';
  var key = function (slug) { return '/offline/tour/' + slug + '.json'; };

  function hasAuthToken() {
    try {
      for (var i = 0; i < localStorage.length; i++) if (/^sb-.+-auth-token$/.test(localStorage.key(i))) return true;
    } catch (e) { /* storage blocked */ }
    return false;
  }

  async function clearPaid() {
    try { if ('caches' in root) await caches.delete(PAID); } catch (e) { /* ignore */ }
    try {
      Object.keys(localStorage).filter(function (k) { return k.indexOf(FLAG) === 0; })
        .forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { /* ignore */ }
  }

  async function save(slug, tour, userId) {
    var rec = { synced_at: new Date().toISOString(), user_id: userId || null, tour: tour };
    var c = await caches.open(PAID);
    await c.put(key(slug), new Response(JSON.stringify(rec), { headers: { 'Content-Type': 'application/json' } }));
    try { localStorage.setItem(FLAG + slug, rec.synced_at); } catch (e) { /* ignore */ }
    return rec;
  }

  async function read(slug) {
    try {
      if (!('caches' in root)) return null;
      var c = await caches.open(PAID);
      var r = await c.match(key(slug));
      return r ? await r.json() : null;
    } catch (e) { return null; }
  }

  async function remove(slug) {
    try { var c = await caches.open(PAID); await c.delete(key(slug)); } catch (e) { /* ignore */ }
    try { localStorage.removeItem(FLAG + slug); } catch (e) { /* ignore */ }
  }

  function isSaved(slug) {
    try { return !!localStorage.getItem(FLAG + slug); } catch (e) { return false; }
  }

  function label(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch (e) { return iso; }
  }

  // Signed out anywhere (or never signed in): no paid copy stays on this device.
  if (!hasAuthToken()) clearPaid();

  root.OpenRideOffline = { clearPaid: clearPaid, save: save, read: read, remove: remove, isSaved: isSaved, label: label, hasAuthToken: hasAuthToken };
})(typeof window !== 'undefined' ? window : this);
