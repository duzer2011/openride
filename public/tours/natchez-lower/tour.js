/* Tour page behavior. The free layer is static HTML and works without this file.
   This file: unlocks the paid layer for signed-in buyers, keeps an opt-in offline copy,
   drives the Today view, draws day route lines with the rider's GPS dot, and handles print. */
(function () {
  var SLUG = 'natchez-lower';
  var params = new URLSearchParams(location.search);
  var justPurchased = params.get('purchased') === '1';
  var Off = window.OpenRideOffline;
  var R = window.TourRender;
  var $ = function (id) { return document.getElementById(id); };
  var sb = null;
  var current = null; // { tour, session }
  var deferredInstall = null;

  function setStatus(t) { var s = $('status'); if (s) s.textContent = t || ''; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ---------- service worker + install ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  }
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredInstall = e;
    var b = $('install-btn');
    if (b) b.hidden = false;
  });

  // ---------- route line maps (no tiles) ----------
  var geoCache = {};
  function loadGeo(url) {
    if (!geoCache[url]) geoCache[url] = fetch(url).then(function (r) { if (!r.ok) throw new Error('geo'); return r.json(); });
    return geoCache[url];
  }
  function toRad(x) { return x * Math.PI / 180; }
  function miles(a, b) {
    var dLat = toRad(b[1] - a[1]), dLon = toRad(b[0] - a[0]);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * 3958.8 * Math.asin(Math.sqrt(h));
  }
  function slice(geo, fromMp, toMp) {
    var pts = [];
    (geo.features || []).forEach(function (f) { if (f.geometry && f.geometry.type === 'LineString') pts = pts.concat(f.geometry.coordinates); });
    var cum = [0];
    for (var i = 1; i < pts.length; i++) cum.push(cum[i - 1] + miles(pts[i - 1], pts[i]));
    var lo = Math.min(fromMp, toMp), hi = Math.max(fromMp, toMp);
    var out = pts.filter(function (p, i) { return cum[i] >= lo && cum[i] <= hi; });
    return fromMp > toMp ? out.reverse() : out; // line runs Natchez (MP 0) north
  }
  function drawMap(fig, pts, spec) {
    var W = 320, H = 240, P = 26;
    var lons = pts.map(function (p) { return p[0]; }), lats = pts.map(function (p) { return p[1]; });
    var minLon = Math.min.apply(null, lons), maxLon = Math.max.apply(null, lons);
    var minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
    var k = Math.cos(toRad((minLat + maxLat) / 2));
    var spanX = Math.max((maxLon - minLon) * k, 1e-6), spanY = Math.max(maxLat - minLat, 1e-6);
    var s = Math.min((W - 2 * P) / spanX, (H - 2 * P) / spanY);
    var offX = (W - spanX * s) / 2, offY = (H - spanY * s) / 2;
    var proj = function (lon, lat) { return [offX + (lon - minLon) * k * s, offY + (maxLat - lat) * s]; };
    var d = pts.map(function (p, i) { var q = proj(p[0], p[1]); return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join('');
    var a = proj(pts[0][0], pts[0][1]), z = proj(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    var esc = R.esc;
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">' +
      '<rect width="' + W + '" height="' + H + '" fill="#F4EFE4"/>' +
      '<path d="' + d + '" fill="none" stroke="#2C4A2E" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="' + d + '" fill="none" stroke="#C17F3A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + a[0] + '" cy="' + a[1] + '" r="6" fill="#4A7C59" stroke="#fff" stroke-width="2"/>' +
      '<circle cx="' + z[0] + '" cy="' + z[1] + '" r="6" fill="#2C4A2E" stroke="#fff" stroke-width="2"/>' +
      '<g class="me" hidden><circle r="14" fill="#2b7fff" opacity="0.2"/><circle r="6" fill="#2b7fff" stroke="#fff" stroke-width="2"/></g></svg>';
    fig.querySelector('.day-map-canvas').innerHTML = svg;
    var legend = document.createElement('p');
    legend.className = 'map-legend';
    legend.innerHTML = '<span class="dot start"></span> Start: ' + esc(spec.start_label || '') + ' &nbsp; <span class="dot end"></span> End: ' + esc(spec.end_label || '');
    fig.querySelector('.day-map-canvas').after(legend);
    fig._proj = proj;
    fig._box = { minLon: minLon, maxLon: maxLon, minLat: minLat, maxLat: maxLat };
  }
  async function hydrateMaps(root) {
    var figs = Array.prototype.slice.call((root || document).querySelectorAll('.day-map:not([data-ready])'));
    for (var i = 0; i < figs.length; i++) {
      var fig = figs[i], spec;
      try { spec = JSON.parse(fig.getAttribute('data-map')); } catch (e) { fig.remove(); continue; }
      try {
        var geo = await loadGeo(spec.geojson);
        var pts = slice(geo, spec.from_mp, spec.to_mp);
        if (pts.length < 2) throw new Error('no data');
        drawMap(fig, pts, spec);
        fig.setAttribute('data-ready', '1');
      } catch (e) {
        fig.remove(); // no route data for this day (or offline and never loaded): hide the map
      }
    }
  }
  function stopLocate(fig) {
    if (fig._watch != null) { navigator.geolocation.clearWatch(fig._watch); fig._watch = null; }
    var g = fig.querySelector('.me'); if (g) g.setAttribute('hidden', '');
    var btn = fig.querySelector('[data-locate]'); if (btn) btn.textContent = 'Show my position';
    var st = fig.querySelector('.locate-status'); if (st) st.textContent = '';
  }
  function startLocate(fig) {
    var st = fig.querySelector('.locate-status'), btn = fig.querySelector('[data-locate]');
    if (!navigator.geolocation) { st.textContent = 'This browser cannot share your location.'; return; }
    btn.textContent = 'Hide my position';
    st.textContent = 'Finding you...';
    fig._watch = navigator.geolocation.watchPosition(function (pos) {
      var c = pos.coords, b = fig._box, pad = 0.05;
      var g = fig.querySelector('.me');
      if (c.longitude < b.minLon - pad || c.longitude > b.maxLon + pad || c.latitude < b.minLat - pad || c.latitude > b.maxLat + pad) {
        g.setAttribute('hidden', '');
        st.textContent = 'You are not near this part of the route.';
        return;
      }
      var q = fig._proj(c.longitude, c.latitude);
      g.setAttribute('transform', 'translate(' + q[0].toFixed(1) + ' ' + q[1].toFixed(1) + ')');
      g.removeAttribute('hidden');
      st.textContent = 'Updated ' + new Date(pos.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '. Accurate to about ' + Math.round(c.accuracy) + ' m.';
    }, function (err) {
      st.textContent = err.code === 1 ? 'Location is blocked for this site. Allow it in your browser settings.' : 'Could not get your location.';
      stopLocate(fig);
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
  }
  // Location is used only while the page is open and visible.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) document.querySelectorAll('.day-map').forEach(function (f) { if (f._watch != null) stopLocate(f); });
  });
  window.addEventListener('pagehide', function () {
    document.querySelectorAll('.day-map').forEach(function (f) { if (f._watch != null) stopLocate(f); });
  });

  // ---------- Today view ----------
  var TRIP_KEY = 'openride:trip:' + SLUG;
  function getStart() { try { return localStorage.getItem(TRIP_KEY) || ''; } catch (e) { return ''; } }
  function setStart(v) { try { if (v) localStorage.setItem(TRIP_KEY, v); else localStorage.removeItem(TRIP_KEY); } catch (e) { /* ignore */ } }
  function localMidnight(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }

  function pickDay() {
    var start = getStart();
    if (!start) return { n: 1, text: 'Pick your day below, or set your trip date.' };
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var diff = Math.round((now - localMidnight(start)) / 86400000);
    if (diff < 0) return { n: 1, text: 'Your trip starts in ' + (-diff) + (diff === -1 ? ' day' : ' days') + '. Showing Day 1.' };
    if (diff > 5) return { n: 6, text: 'Your trip dates have passed. Showing Day 6.' };
    return { n: diff + 1, text: 'Today is Day ' + (diff + 1) + '.' };
  }
  function showDay(n) {
    if (!current) return;
    var card = $('today-card');
    if (card) card.innerHTML = R.renderToday(current.tour, n, new Date().getHours());
    document.querySelectorAll('#today .tab').forEach(function (t) {
      var on = +t.getAttribute('data-tab') === n;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
  function initToday() {
    var input = $('trip-start');
    if (input) input.value = getStart();
    var apply = function () { var p = pickDay(); $('today-status').textContent = p.text; showDay(p.n); };
    apply();
    input.addEventListener('change', function () { setStart(input.value); apply(); });
    $('trip-clear').addEventListener('click', function () { setStart(''); input.value = ''; apply(); });
    document.querySelectorAll('#today .tab').forEach(function (t) {
      t.addEventListener('click', function () { showDay(+t.getAttribute('data-tab')); });
    });
    var ib = $('install-btn');
    if (ib) {
      if (deferredInstall) ib.hidden = false;
      ib.addEventListener('click', function () { if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; ib.hidden = true; } });
    }
  }

  // ---------- Offline panel ----------
  function paintOffline(syncedAt) {
    var saved = Off && Off.isSaved(SLUG);
    var st = $('offline-status'), rm = $('offline-remove'), sv = $('offline-save');
    if (!st) return;
    if (saved) {
      st.textContent = 'Saved on this phone. Last synced ' + Off.label(syncedAt || localStorage.getItem('openride:saved:' + SLUG)) + '.';
      sv.textContent = 'Update saved copy';
      rm.hidden = false;
    } else {
      st.textContent = 'Load the whole tour onto this phone before you leave Wi-Fi.';
      sv.textContent = 'Save for offline';
      rm.hidden = true;
    }
  }
  function initOffline() {
    paintOffline();
    $('offline-save').addEventListener('click', async function () {
      var st = $('offline-status');
      if (!current || !current.session) { st.textContent = 'Sign in while online to save this tour.'; return; }
      st.textContent = 'Saving...';
      try {
        var r = await fetchTour(current.session.access_token);
        if (r.status !== 200) throw new Error('status ' + r.status);
        var tour = await r.json();
        var rec = await Off.save(SLUG, tour, current.session.user.id);
        // Warm the shell and route lines so the page opens with no signal.
        await Promise.allSettled([
          fetch('/tours/natchez-lower/'), fetch('/tours/natchez-lower/tour.css'), fetch('/tours/natchez-lower/render.js'),
          fetch('/tours/natchez-lower/tour.js'), fetch('/offline.js'), fetch('/config.js'), fetch('/account/'),
          fetch('/routes/natchez-lower.geojson')
        ]);
        current.tour = tour;
        paintOffline(rec.synced_at);
      } catch (e) {
        st.textContent = 'Could not save. Check your signal and try again.';
      }
    });
    $('offline-remove').addEventListener('click', async function () { await Off.remove(SLUG); paintOffline(); });
  }

  // ---------- paid layer ----------
  function showPaid(tour, session, source, syncedAt) {
    current = { tour: tour, session: session };
    var sample = $('sample');
    if (sample) sample.remove(); // avoid a duplicate #day-4
    var access = $('access');
    if (access) access.hidden = true;
    var host = $('paid');
    host.innerHTML = R.renderPaid(tour);
    host.hidden = false;
    document.querySelectorAll('#summaries li').forEach(function (li, i) {
      if (!li.querySelector('a')) li.innerHTML = '<a href="#day-' + (i + 1) + '">' + li.innerHTML + '</a>';
    });
    var owner = $('owner');
    if (owner) {
      owner.textContent = source === 'cache'
        ? 'You are offline. Showing the copy saved ' + Off.label(syncedAt) + '.'
        : 'You have access.' + (session ? ' Signed in as ' + session.user.email + '.' : '');
      owner.hidden = false;
    }
    initToday();
    initOffline();
    if (source === 'cache') paintOffline(syncedAt);
    hydrateMaps(host);
    if (location.hash) { var t = document.querySelector(location.hash); if (t) t.scrollIntoView(); }
  }

  async function fetchTour(token) {
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, 10000); // weak signal should not hang the page
    try {
      return await fetch('/.netlify/functions/tour-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ route_slug: SLUG }),
        signal: ctl.signal
      });
    } finally { clearTimeout(timer); }
  }

  async function init() {
    hydrateMaps(document); // the free Day 4 sample
    var cached = Off ? await Off.read(SLUG) : null;
    if (typeof supabase === 'undefined' || typeof CONFIG === 'undefined') {
      if (cached) showPaid(cached.tour, null, 'cache', cached.synced_at);
      return;
    }
    sb = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnon);
    sb.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT' && Off) Off.clearPaid().then(function () { location.reload(); });
    });
    var session = null;
    try { var res = await sb.auth.getSession(); session = res.data && res.data.session; } catch (e) { /* offline */ }
    if (!session) {
      if (cached && Off.hasAuthToken()) { showPaid(cached.tour, null, 'cache', cached.synced_at); return; }
      if (justPurchased) setStatus('Sign in with the email you used at checkout to open your tour.');
      return;
    }
    setStatus('Checking your access...');
    var tries = justPurchased ? 8 : 1;
    var r = null;
    for (var i = 0; i < tries; i++) {
      try {
        r = await fetchTour(session.access_token);
      } catch (e) {
        r = null; // no signal
        break;
      }
      if (r.status === 200) {
        var tour = await r.json();
        var syncedAt = null;
        if (Off && Off.isSaved(SLUG)) syncedAt = (await Off.save(SLUG, tour, session.user.id)).synced_at; // keep the saved copy fresh
        showPaid(tour, session, 'network', syncedAt);
        setStatus('');
        return;
      }
      if (r.status === 403 && i < tries - 1) { setStatus('Confirming your payment...'); await sleep(2500); continue; }
      break;
    }
    if (!r || r.status >= 500) {
      if (cached && cached.user_id === session.user.id) { showPaid(cached.tour, session, 'cache', cached.synced_at); setStatus(''); return; }
      setStatus(r ? 'Could not load your tour. Try again in a moment.' : 'No signal. Open this page once with signal and tap Save for offline.');
      return;
    }
    if (r.status === 403) setStatus('Signed in as ' + session.user.email + '. This account does not have access yet.');
    else if (r.status === 401) setStatus('Your session expired. Sign in again.');
    else setStatus('Could not load your tour. Refresh and try again.');
  }

  // ---------- clicks: print, maps ----------
  function print(mode, target) {
    var marked = [];
    document.body.classList.add(mode);
    if (target) {
      target.classList.add('print-target');
      for (var el = target.parentElement; el; el = el.parentElement) {
        if (el.classList && el.classList.contains('section')) { el.classList.add('print-keep'); marked.push(el); }
      }
    }
    function cleanup() {
      document.body.classList.remove(mode);
      if (target) target.classList.remove('print-target');
      marked.forEach(function (m) { m.classList.remove('print-keep'); });
      window.removeEventListener('afterprint', cleanup);
    }
    window.addEventListener('afterprint', cleanup);
    window.print();
  }

  document.addEventListener('click', function (e) {
    var day = e.target.closest('[data-print-day]');
    if (day) { print('print-day', document.querySelector('.day[data-day="' + day.getAttribute('data-print-day') + '"]')); return; }
    if (e.target.closest('[data-print-full]')) { print('print-full', null); return; }
    var loc = e.target.closest('[data-locate]');
    if (loc) {
      var fig = loc.closest('.day-map');
      if (fig._watch != null) stopLocate(fig); else startLocate(fig);
    }
  });

  init().catch(function () { setStatus('Could not check your access. Refresh and try again.'); });
})();
