/* "From the road" journal, step 1. Offline-first: text and media go to IndexedDB the moment the rider
   types or picks a file. When online and signed in they sync to the rider_journal table and the private
   rider-media bucket (both owner-only; see supabase/migrations). Until that migration is applied, sync
   fails quietly and everything stays on the phone. Private by default; no sharing. */
(function (root) {
  var SLUG = 'natchez-lower';
  var MAX_VIDEO_BYTES = 100 * 1024 * 1024;
  var MAX_VIDEO_SECONDS = 60;
  var MAX_IMAGE_SIDE = 2000;
  var st = { sb: null, session: null, uid: null };

  function openDb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('openride-journal', 1);
      r.onupgradeneeded = function () {
        var db = r.result;
        db.createObjectStore('entries', { keyPath: 'key' });
        db.createObjectStore('media', { keyPath: 'id' }).createIndex('entry', 'entry');
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  var dbp = null;
  function db() { if (!dbp) dbp = openDb(); return dbp; }
  function run(store, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, mode), s = t.objectStore(store), out = fn(s);
        t.oncomplete = function () { res(out && typeof out === 'object' && 'result' in out ? out.result : out); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }

  function userId() {
    if (st.uid) return st.uid;
    try { return localStorage.getItem('openride:uid') || 'anon'; } catch (e) { return 'anon'; }
  }
  function setSession(sb, session) {
    st.sb = sb; st.session = session;
    if (session && session.user) { st.uid = session.user.id; try { localStorage.setItem('openride:uid', st.uid); } catch (e) { /* ignore */ } }
  }
  var keyOf = function (day) { return userId() + ':' + SLUG + ':' + day; };

  // ---- text ----
  async function getEntry(day) { return (await run('entries', 'readonly', function (s) { return s.get(keyOf(day)); })) || null; }
  async function saveBody(day, body) {
    var rec = { key: keyOf(day), uid: userId(), slug: SLUG, day: day, body: body, updated_at: new Date().toISOString(), dirty: true };
    await run('entries', 'readwrite', function (s) { s.put(rec); });
    return rec;
  }
  async function allBodies() {
    var rows = await run('entries', 'readonly', function (s) { return s.getAll(); });
    var out = {};
    (rows || []).forEach(function (r) { if (r.uid === userId() && r.slug === SLUG && r.body && r.body.trim()) out[r.day] = r.body; });
    return out;
  }

  // ---- media ----
  async function listMedia(day) {
    var rows = await run('media', 'readonly', function (s) { return s.index('entry').getAll(keyOf(day)); });
    return (rows || []).sort(function (a, b) { return a.created - b.created; });
  }
  async function removeMedia(id) { await run('media', 'readwrite', function (s) { s.delete(id); }); }

  async function compressImage(file) {
    var bmp = await createImageBitmap(file);
    var scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bmp.width, bmp.height));
    var c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    var blob = await new Promise(function (res) { c.toBlob(res, 'image/jpeg', 0.8); });
    if (!blob) throw new Error('Could not read that photo.');
    return blob;
  }
  function videoSeconds(file) {
    return new Promise(function (res, rej) {
      var v = document.createElement('video'), url = URL.createObjectURL(file);
      v.preload = 'metadata';
      v.onloadedmetadata = function () { URL.revokeObjectURL(url); res(v.duration); };
      v.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Could not read that video.')); };
      v.src = url;
    });
  }
  // Returns { ok, message }. Messages are shown to the rider as-is.
  async function addMedia(day, file) {
    var id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var blob = file, type = file.type, name = file.name || 'media';
    if (/^image\//.test(type)) {
      try { blob = await compressImage(file); type = 'image/jpeg'; name = name.replace(/\.\w+$/, '') + '.jpg'; }
      catch (e) { return { ok: false, message: e.message }; }
    } else if (/^video\//.test(type)) {
      if (file.size > MAX_VIDEO_BYTES) return { ok: false, message: 'That video is over 100 MB. Trim it to 60 seconds or less and try again.' };
      try {
        var secs = await videoSeconds(file);
        if (secs > MAX_VIDEO_SECONDS + 0.5) return { ok: false, message: 'That video is ' + Math.round(secs) + ' seconds. Videos can be 60 seconds or less. Trim it and try again.' };
      } catch (e) { return { ok: false, message: e.message }; }
    } else {
      return { ok: false, message: 'Pick a photo or a video.' };
    }
    await run('media', 'readwrite', function (s) {
      s.put({ id: id, entry: keyOf(day), uid: userId(), day: day, name: name, type: type, size: blob.size, blob: blob, created: Date.now(), dirty: true });
    });
    return { ok: true };
  }

  // ---- sync ----
  var tableMissing = false;
  async function sync() {
    if (!st.sb || !st.session || !navigator.onLine) return { state: 'offline' };
    var uid = st.session.user.id;
    var entries = (await run('entries', 'readonly', function (s) { return s.getAll(); })).filter(function (e) { return e.dirty && e.uid === uid; });
    var media = (await run('media', 'readonly', function (s) { return s.getAll(); })).filter(function (m) { return m.dirty && m.uid === uid; });
    var failed = 0;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var r = await st.sb.from('rider_journal').upsert({ user_id: uid, route_slug: e.slug, day: e.day, body: e.body, updated_at: e.updated_at }, { onConflict: 'user_id,route_slug,day' });
      if (r.error) {
        if (/does not exist|schema cache|PGRST205|42P01/i.test((r.error.code || '') + ' ' + (r.error.message || ''))) { tableMissing = true; return { state: 'not-enabled' }; }
        failed++; continue;
      }
      var cur = await getEntryByKey(e.key);
      if (cur && cur.updated_at === e.updated_at) { cur.dirty = false; await run('entries', 'readwrite', function (s) { s.put(cur); }); }
    }
    for (var j = 0; j < media.length; j++) {
      var m = media[j];
      var ext = (m.name.match(/\.(\w+)$/) || [, 'bin'])[1].toLowerCase();
      var path = uid + '/' + SLUG + '/' + m.day + '/' + m.id + '.' + ext;
      var up = await st.sb.storage.from('rider-media').upload(path, m.blob, { contentType: m.type, upsert: true });
      if (up.error) {
        if (/bucket not found|not found/i.test(up.error.message || '')) { tableMissing = true; return { state: 'not-enabled' }; }
        failed++; continue;
      }
      m.dirty = false; m.remote = path;
      await run('media', 'readwrite', function (s) { s.put(m); });
    }
    return { state: failed ? 'partial' : 'synced' };
  }
  async function getEntryByKey(key) { return (await run('entries', 'readonly', function (s) { return s.get(key); })) || null; }

  // ---- UI ----
  function noteFor(res) {
    if (!res) return '';
    if (res.state === 'synced') return 'Backed up to your account.';
    if (res.state === 'offline') return 'Will back up when you have signal.';
    if (res.state === 'not-enabled') return 'Backup to your account is not turned on yet. Your notes are safe on this phone.';
    return 'Some items are waiting to back up.';
  }
  async function mount(el) {
    var day = +el.getAttribute('data-journal');
    var ta = el.querySelector('textarea'), status = el.querySelector('.j-status'), note = el.querySelector('.j-note');
    var thumbs = el.querySelector('.thumbs'), input = el.querySelector('input[type=file]');
    var urls = [];
    var entry = await getEntry(day);
    ta.value = entry ? entry.body : '';
    async function paintThumbs() {
      urls.forEach(function (u) { URL.revokeObjectURL(u); }); urls = [];
      var items = await listMedia(day);
      thumbs.innerHTML = '';
      items.forEach(function (m) {
        var u = URL.createObjectURL(m.blob); urls.push(u);
        var d = document.createElement('div'); d.className = 'thumb';
        d.innerHTML = (/^image\//.test(m.type) ? '<img alt="" src="' + u + '">' : '<video muted preload="metadata" src="' + u + '#t=0.1"></video><span class="play">Video</span>') +
          '<button type="button" class="thumb-x" aria-label="Remove ' + m.name.replace(/"/g, '') + '">×</button>';
        d.querySelector('.thumb-x').addEventListener('click', async function () { await removeMedia(m.id); paintThumbs(); status.textContent = 'Saved on this phone'; });
        thumbs.appendChild(d);
      });
    }
    var timer = null;
    ta.addEventListener('input', function () {
      status.textContent = 'Saving...';
      clearTimeout(timer);
      timer = setTimeout(async function () {
        await saveBody(day, ta.value);
        status.textContent = 'Saved on this phone';
        sync().then(function (r) { note.textContent = noteFor(r); }).catch(function () {});
      }, 350);
    });
    input.addEventListener('change', async function () {
      var files = Array.prototype.slice.call(input.files || []);
      input.value = '';
      var msgs = [];
      for (var i = 0; i < files.length; i++) {
        status.textContent = 'Saving ' + (i + 1) + ' of ' + files.length + '...';
        var r = await addMedia(day, files[i]);
        if (!r.ok) msgs.push(r.message);
      }
      await paintThumbs();
      status.textContent = 'Saved on this phone';
      note.textContent = msgs.join(' ');
      if (!msgs.length) sync().then(function (res) { note.textContent = noteFor(res); }).catch(function () {});
    });
    await paintThumbs();
    sync().then(function (r) { if (!note.textContent) note.textContent = noteFor(r); }).catch(function () {});
  }

  window.addEventListener('online', function () { sync().catch(function () {}); });
  root.OpenRideJournal = { setSession: setSession, mount: mount, allBodies: allBodies, sync: sync, _compress: compressImage };
})(typeof window !== 'undefined' ? window : this);
