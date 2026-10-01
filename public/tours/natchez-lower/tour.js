/* Tour page behavior. The public page is static HTML and works without this file.
   This file: unlocks the buyer app for signed-in purchasers (app shell, Today/Days/Map/Trip),
   keeps an opt-in offline copy, draws route lines with the rider's GPS dot (no map tiles),
   runs the journal, and builds the printed guidebook. */
(function () {
  var SLUG = 'natchez-lower';
  var params = new URLSearchParams(location.search);
  var justPurchased = params.get('purchased') === '1';
  var Off = window.OpenRideOffline;
  var R = window.TourRender;
  var GB = window.TourGuidebook;
  var $ = function (id) { return document.getElementById(id); };
  var sb = null;
  var current = null;                 // { tour, session, source }
  var screen = 'days';
  var offline = { saved: false, syncedAt: null, update: false, busy: false, step: 0, steps: 0 };
  var selOpt = {};                    // day -> chosen route option id
  var deferredInstall = null;
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  var LAST_KEY = 'openride:lastday:' + SLUG, TRIP_KEY = 'openride:trip:' + SLUG;

  function setStatus(t) { var s = $('status'); if (s) s.textContent = t || ''; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ---------- service worker + install ----------
  window.addEventListener('load', function () { if (Off) Off.registerSW(); });
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; var b = $('install-btn'); if (b) b.hidden = false; });

  // ---------- route lines (SVG, no map tiles) ----------
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
  function lineOf(geo) {
    var pts = [];
    (geo.features || []).forEach(function (f) { if (f.geometry && f.geometry.type === 'LineString') pts = pts.concat(f.geometry.coordinates); });
    var cum = [0];
    for (var i = 1; i < pts.length; i++) cum.push(cum[i - 1] + miles(pts[i - 1], pts[i]));
    return { pts: pts, cum: cum };
  }
  function slice(geo, fromMp, toMp) {
    var L = lineOf(geo), lo = Math.min(fromMp, toMp), hi = Math.max(fromMp, toMp);
    var out = L.pts.filter(function (p, i) { return L.cum[i] >= lo && L.cum[i] <= hi; });
    return fromMp > toMp ? out.reverse() : out; // the line runs Natchez (MP 0) north
  }
  function fitter(pts, W, H, P) {
    var lons = pts.map(function (p) { return p[0]; }), lats = pts.map(function (p) { return p[1]; });
    var minLon = Math.min.apply(null, lons), maxLon = Math.max.apply(null, lons), minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
    var k = Math.cos(toRad((minLat + maxLat) / 2));
    var spanX = Math.max((maxLon - minLon) * k, 1e-6), spanY = Math.max(maxLat - minLat, 1e-6);
    var s = Math.min((W - 2 * P) / spanX, (H - 2 * P) / spanY), offX = (W - spanX * s) / 2, offY = (H - spanY * s) / 2;
    return { proj: function (lon, lat) { return [offX + (lon - minLon) * k * s, offY + (maxLat - lat) * s]; }, box: { minLon: minLon, maxLon: maxLon, minLat: minLat, maxLat: maxLat } };
  }
  function path(pts, proj) { return pts.map(function (p, i) { var q = proj(p[0], p[1]); return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join(''); }

  function drawMap(fig, pts, spec) {
    var W = 320, H = 240, f = fitter(pts, W, H, 26), d = path(pts, f.proj);
    var a = f.proj(pts[0][0], pts[0][1]), z = f.proj(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    fig.querySelector('.day-map-canvas').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">' +
      '<rect width="' + W + '" height="' + H + '" fill="#F4EFE4"/>' +
      '<path d="' + d + '" fill="none" stroke="#2C4A2E" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="' + d + '" fill="none" stroke="#C17F3A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + a[0] + '" cy="' + a[1] + '" r="6" fill="#4A7C59" stroke="#fff" stroke-width="2"/>' +
      '<circle cx="' + z[0] + '" cy="' + z[1] + '" r="6" fill="#2C4A2E" stroke="#fff" stroke-width="2"/>' +
      '<g class="me" hidden><circle r="14" fill="#2b7fff" opacity="0.2"/><circle r="6" fill="#2b7fff" stroke="#fff" stroke-width="2"/></g></svg>';
    var legend = document.createElement('p');
    legend.className = 'map-legend';
    legend.innerHTML = '<span class="dot start"></span> Start: ' + R.esc(spec.start_label || '') + ' &nbsp; <span class="dot end"></span> End: ' + R.esc(spec.end_label || '');
    fig.querySelector('.day-map-canvas').after(legend);
    fig._proj = f.proj; fig._box = f.box;
  }
  async function hydrateMaps(root) {
    var figs = Array.prototype.slice.call((root || document).querySelectorAll('.day-map:not([data-ready])'));
    for (var i = 0; i < figs.length; i++) {
      var fig = figs[i], spec;
      try { spec = JSON.parse(fig.getAttribute('data-map')); } catch (e) { fig.remove(); continue; }
      try {
        var pts = slice(await loadGeo(spec.geojson), spec.from_mp, spec.to_mp);
        if (pts.length < 2) throw new Error('no data');
        drawMap(fig, pts, spec);
        fig.setAttribute('data-ready', '1');
      } catch (e) {
        if (fig.classList.contains('sheet-map')) fig.outerHTML = '<div class="gb-mapspace">Map space</div>'; else fig.remove();
      }
    }
  }
  // Trip overview: the Trace line with the four sleeping towns placed schematically.
  async function drawOverview(el) {
    if (!el || el.getAttribute('data-ready')) return;
    try {
      var L = lineOf(await loadGeo('/routes/natchez-lower.geojson')), P = L.pts;
      var at = function (mp) { for (var i = 0; i < P.length; i++) if (L.cum[i] >= mp) return P[i]; return P[P.length - 1]; };
      var towns = [
        { n: 1, name: 'Jackson', ll: [-90.185, 32.299], join: at(89), note: 'Sunday night' },
        { n: 2, name: 'Vicksburg', ll: [-90.878, 32.353], join: at(67), note: 'Two nights' },
        { n: 3, name: 'Canemount, Lorman', ll: [-91.057, 31.857], join: at(30), note: 'One night' },
        { n: 4, name: 'Natchez', ll: [-91.403, 31.56], join: at(0), note: 'Two nights' }
      ];
      var all = P.concat(towns.map(function (t) { return t.ll; })), W = 320, H = 340, f = fitter(all, W, H, 30);
      var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Route diagram: Jackson, Vicksburg, Canemount and Natchez along the Natchez Trace"><rect width="' + W + '" height="' + H + '" fill="#F4EFE4"/>';
      towns.forEach(function (t) { var a = f.proj(t.join[0], t.join[1]), b = f.proj(t.ll[0], t.ll[1]); svg += '<path d="M' + a[0] + ' ' + a[1] + 'L' + b[0] + ' ' + b[1] + '" stroke="#4A7C59" stroke-width="2" stroke-dasharray="5 4" fill="none"/>'; });
      svg += '<path d="' + path(P, f.proj) + '" fill="none" stroke="#2C4A2E" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="' + path(P, f.proj) + '" fill="none" stroke="#C17F3A" stroke-width="2" stroke-linecap="round"/>';
      towns.forEach(function (t) { var q = f.proj(t.ll[0], t.ll[1]); svg += '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="12" fill="#2C4A2E" stroke="#fff" stroke-width="2"/><text x="' + q[0] + '" y="' + (q[1] + 5) + '" text-anchor="middle" font-size="14" font-weight="700" fill="#F4EFE4">' + t.n + '</text>'; });
      el.innerHTML = '<div class="day-map-canvas">' + svg + '</svg></div><ul class="legend-list">' + towns.map(function (t) { return '<li><b>' + t.n + '</b>' + R.esc(t.name) + ' · ' + R.esc(t.note) + '</li>'; }).join('') + '</ul>' +
        '<p class="diagram-note">Route diagram, not a navigation map. The Trace line is from OpenStreetMap contributors. Towns are placed schematically, and dashed lines show where the tour leaves the Trace.</p>';
      el.setAttribute('data-ready', '1');
    } catch (e) { el.innerHTML = '<p class="diagram-note">Route diagram unavailable offline until you have opened this page once with signal.</p>'; }
  }

  // ---------- GPS dot ----------
  function stopLocate(fig) {
    if (fig._watch != null) { navigator.geolocation.clearWatch(fig._watch); fig._watch = null; }
    var g = fig.querySelector('.me'); if (g) g.setAttribute('hidden', '');
    var btn = fig.querySelector('[data-locate]'); if (btn) btn.textContent = 'Show my position';
    var st = fig.querySelector('.locate-status'); if (st) st.textContent = '';
  }
  function startLocate(fig) {
    var st = fig.querySelector('.locate-status'), btn = fig.querySelector('[data-locate]');
    if (!navigator.geolocation) { st.textContent = 'This browser cannot share your location.'; return; }
    btn.textContent = 'Hide my position'; st.textContent = 'Finding you...';
    fig._watch = navigator.geolocation.watchPosition(function (pos) {
      var c = pos.coords, b = fig._box, pad = 0.05, g = fig.querySelector('.me');
      if (c.longitude < b.minLon - pad || c.longitude > b.maxLon + pad || c.latitude < b.minLat - pad || c.latitude > b.maxLat + pad) {
        g.setAttribute('hidden', ''); st.textContent = 'You are not near this part of the route.'; return;
      }
      var q = fig._proj(c.longitude, c.latitude);
      g.setAttribute('transform', 'translate(' + q[0].toFixed(1) + ' ' + q[1].toFixed(1) + ')'); g.removeAttribute('hidden');
      st.textContent = 'Updated ' + new Date(pos.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '. Accurate to about ' + Math.round(c.accuracy) + ' m.';
    }, function (err) {
      st.textContent = err.code === 1 ? 'Location is blocked for this site. Allow it in your browser settings.' : 'Could not get your location.';
      stopLocate(fig);
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
  }
  function stopAllLocate() { document.querySelectorAll('.day-map').forEach(function (f) { if (f._watch != null) stopLocate(f); }); }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopAllLocate(); });
  window.addEventListener('pagehide', stopAllLocate);

  // ---------- buyer app ----------
  var ICO = {
    today: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    days: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    map: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>',
    trip: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V4h6v3"/></svg>'
  };
  function lastDay() { var n = +LS.get(LAST_KEY, 1); return n >= 1 && n <= 6 ? n : 1; }
  function dateDay() {
    var start = LS.get(TRIP_KEY, '');
    if (!start) return null;
    var p = start.split('-'), now = new Date(); now.setHours(0, 0, 0, 0);
    var diff = Math.round((now - new Date(+p[0], +p[1] - 1, +p[2])) / 86400000);
    return diff >= 0 && diff <= 5 ? diff + 1 : null;
  }
  var ctx = function () { return { buyer: true, isChecked: function (k) { return LS.get(k, '') === '1'; } }; };

  function buildShell() {
    document.body.classList.add('app-mode');
    var host = $('app');
    host.hidden = false;
    host.innerHTML =
      '<header class="app-bar"><div class="wrap"><a class="wordmark" href="/">Open<span>Ride</span></a><span class="screen-name" id="screen-name">Days</span>' +
      '<span class="status-chip" id="chip">Access active</span></div></header>' +
      '<main class="wrap screen" id="screen" tabindex="-1"></main>' +
      '<nav class="bottom-nav" aria-label="Tour"><div class="wrap">' +
      [['today', 'Today'], ['days', 'Days'], ['map', 'Map'], ['trip', 'Trip']].map(function (x) {
        return '<button type="button" class="nav-btn" data-nav="' + x[0] + '">' + ICO[x[0]] + x[1] + '</button>';
      }).join('') + '</div></nav>';
  }

  function offlineLabel() {
    if (offline.busy) return 'Downloading, step ' + offline.step + ' of ' + offline.steps;
    if (offline.saved && offline.update) return 'Update available. Saved copy from ' + Off.label(offline.syncedAt);
    if (offline.saved) return 'Saved, updated ' + Off.label(offline.syncedAt);
    return 'Not saved';
  }
  function resumePanel() {
    var n = lastDay(), d = R.dayOf(current.tour, n);
    var btn = offline.busy ? '' : (!offline.saved ? '<button type="button" class="btn ghost" data-offline="save">Save for offline</button>'
      : (offline.update ? '<button type="button" class="btn ghost" data-offline="save">Update saved copy</button>' : ''));
    return '<section class="panel-dark" id="resume"><span class="eyebrow">Pick up where you left off</span><h3>Day ' + n + ': ' + R.esc(d.title_short || d.title) + '</h3>' +
      '<p><a class="btn primary big" href="#day-' + n + '">Open Day ' + n + '</a></p>' +
      '<div class="offline-state"><span id="offline-label">Offline: ' + R.esc(offlineLabel()) + '</span>' + btn + '</div>' +
      (offline.busy ? '<div class="progress" aria-hidden="true"><i style="width:' + Math.round(100 * offline.step / Math.max(1, offline.steps)) + '%"></i></div>' : '') + '</section>';
  }
  function chipText() { return current && current.source === 'cache' ? 'Offline copy' : (navigator.onLine === false ? 'Offline' : 'Access active'); }
  function paintChip() { var c = $('chip'); if (!c) return; c.textContent = chipText(); c.classList.toggle('off', chipText() !== 'Access active'); }

  function applyOpt(n, id) {
    var d = R.dayOf(current ? current.tour : window.__sample, n); if (!d) return;
    var grp = document.querySelector('.opts[aria-label="Route for day ' + n + '"]');
    if (grp) grp.querySelectorAll('.opt').forEach(function (o) { o.setAttribute('aria-checked', o.getAttribute('data-opt') === id ? 'true' : 'false'); });
    var mc = R.milesChip(d, id), mi = $('miles-' + n), mk = $('miles-' + n + '-k'); if (mi) mi.textContent = mc.v; if (mk) mk.textContent = mc.k;
    var st = $('stages-' + n); if (st) st.innerHTML = R.stagesList(d, id);
  }

  function render(name, dayN) {
    screen = name;
    var t = current.tour, pub = t.public, el = $('screen'), title = { today: 'Today', days: 'Days', map: 'Map', trip: 'Trip' }[name] || 'Days';
    var h = '', n = 0;
    if (name === 'today') {
      n = dayN || dateDay() || lastDay();
      LS.set(LAST_KEY, String(n));
      h = '<div class="day-picker"><button type="button" class="back" data-nav="days">← Back to Days</button><div class="picks">' +
        t.days.map(function (d) { return '<button type="button" class="pick" data-open-day="' + d.n + '"' + (d.n === n ? ' aria-current="true"' : '') + ' aria-label="Day ' + d.n + '">' + d.n + '</button>'; }).join('') + '</div></div>' +
        R.renderDayScreen(R.dayOf(t, n), t, ctx());
    } else if (name === 'days') {
      h = '<span class="eyebrow">Lower Natchez Trace · Self-guided</span><h1>' + R.esc(t.name) + '</h1><p class="lead">Jackson → Natchez. ' + R.esc(pub.overview[0]) + '</p>' +
        R.renderKeyFacts(pub) + resumePanel() +
        '<section class="card"><h3>Route</h3><div id="overview-diagram"></div></section>' +
        '<h2>Six days</h2>' + R.renderDayRows(t, { buyer: true }) + R.renderBeforeCommit(pub);
    } else if (name === 'map') {
      h = '<section class="card"><h3>Route</h3><div id="overview-diagram"></div></section>' +
        t.days.filter(function (d) { return d.map; }).map(function (d) { return '<h3 class="block-h">Day ' + d.n + ': ' + R.esc(d.title_short || d.title) + '</h3>' + R.mapFigure(d); }).join('') +
        '<p class="hint">Route lines are drawn for the days we have data for. Other days show no map. These are diagrams, not navigation. Load the route into a navigation app for turn-by-turn.</p>';
    } else {
      h = '<h2>Plan and reference</h2>' + R.renderPlanning(t) + R.renderTakeWithYou(t) +
        '<section class="card"><h3>Offline</h3><p id="offline-detail">' + R.esc(offlineLabel()) + '.</p><div class="btn-row">' +
        '<button type="button" class="btn" data-offline="save">' + (offline.saved ? 'Update saved copy' : 'Save for offline') + '</button>' +
        (offline.saved ? '<button type="button" class="btn ghost" data-offline="remove">Remove saved copy</button>' : '') + '</div>' +
        '<p class="hint">Sign out and the saved tour is removed from this phone. Journal drafts stay, tied to your account.</p></section>' +
        '<section class="card trip-dates"><h3>Trip dates</h3><label for="trip-start">Day 1 date (the Monday you ride out of Jackson)</label><div class="btn-row"><input type="date" id="trip-start" value="' + R.esc(LS.get(TRIP_KEY, '')) + '"><button type="button" class="btn ghost" id="trip-clear">Clear</button></div>' +
        '<p class="hint">With a date set, Today opens on the right day. Without one, Today opens on the last day you looked at.</p></section>' +
        '<section class="card"><h3>Put it on your home screen</h3><p>On iPhone tap Share, then Add to Home Screen. On Android open the browser menu and tap Install app.</p><button type="button" class="btn ghost" id="install-btn" hidden>Install OpenRide</button></section>' +
        R.renderUpdates(t);
    }
    el.innerHTML = h;
    $('screen-name').textContent = name === 'today' ? 'Day ' + n : title;
    document.querySelectorAll('.nav-btn').forEach(function (b) { b.removeAttribute('aria-current'); if (b.getAttribute('data-nav') === name) b.setAttribute('aria-current', 'page'); });
    window.scrollTo(0, 0);
    if (name === 'today' && selOpt[n]) applyOpt(n, selOpt[n]);
    hydrateMaps(el);
    drawOverview($('overview-diagram'));
    el.querySelectorAll('.journal[data-journal]').forEach(function (j) { if (window.OpenRideJournal) window.OpenRideJournal.mount(j); });
    var ib = $('install-btn'); if (ib && deferredInstall) ib.hidden = false;
    var tc = $('trip-clear'); if (tc) tc.addEventListener('click', function () { LS.del(TRIP_KEY); $('trip-start').value = ''; });
    var ts = $('trip-start'); if (ts) ts.addEventListener('change', function () { if (ts.value) LS.set(TRIP_KEY, ts.value); else LS.del(TRIP_KEY); });
    paintChip();
  }

  function route() {
    if (!current) return;
    var h = location.hash.replace(/^#/, ''), m = h.match(/^day-(\d)$/);
    if (m && +m[1] >= 1 && +m[1] <= 6) return render('today', +m[1]);
    if (['today', 'days', 'map', 'trip'].indexOf(h) >= 0) return render(h);
    render('days');
  }
  window.addEventListener('hashchange', route);

  // ---------- offline save ----------
  var SHELL_FILES = ['/tours/natchez-lower/', '/tours/natchez-lower/tour.css', '/tours/natchez-lower/render.js', '/tours/natchez-lower/tour.js', '/tours/natchez-lower/guidebook.js',
    '/tours/natchez-lower/journal.js', '/tours/natchez-lower/print.css', '/offline.js', '/config.js', '/account/', '/fonts/source-sans-3-latin.woff2', '/fonts/source-serif-4-latin.woff2', '/fonts/bebas-neue-latin.woff2', '/routes/natchez-lower.geojson'];
  async function saveOffline() {
    if (!current || !current.session) { note('Sign in while online to save this tour.'); return; }
    offline.busy = true; offline.steps = SHELL_FILES.length + 1; offline.step = 0; refreshOfflineUi();
    try {
      var r = await fetchTour(current.session.access_token);
      if (r.status !== 200) throw new Error('status ' + r.status);
      var tour = await r.json();
      offline.step = 1; refreshOfflineUi();
      for (var i = 0; i < SHELL_FILES.length; i++) { try { await fetch(SHELL_FILES[i]); } catch (e) { /* keep going */ } offline.step = i + 2; refreshOfflineUi(); }
      var rec = await Off.save(SLUG, tour, current.session.user.id); // the old copy stays until the new one is complete
      current.tour = tour; offline.saved = true; offline.update = false; offline.syncedAt = rec.synced_at;
    } catch (e) { offline.busy = false; refreshOfflineUi(); note('Could not save. Check your signal and try again. Your previous saved copy is unchanged.'); return; }
    offline.busy = false; refreshOfflineUi();
  }
  function note(msg) { var d = $('offline-label') || $('offline-detail'); if (d) d.textContent = msg; }
  function refreshOfflineUi() {
    if (screen === 'days') { var el = $('resume'); if (el) el.outerHTML = resumePanel(); }
    else if (screen === 'trip') { var s = $('offline-detail'); if (s) s.textContent = offlineLabel() + '.'; }
    paintChip();
  }

  // ---------- printing ----------
  async function printSheets(kind, n) {
    var tour = current ? current.tour : window.__sample;
    if (!tour) return;
    var bodies = {};
    try { if (window.OpenRideJournal) bodies = await window.OpenRideJournal.allBodies(); } catch (e) { /* no journal */ }
    var opts = { journal: bodies, tonight: !!current };
    if (kind === 'guidebook') opts.cover = true;
    else if (kind === 'phones') opts.phonesOnly = true;
    else opts.days = [n];
    var gb = $('guidebook');
    gb.innerHTML = GB.build(tour, opts);
    await hydrateMaps(gb);
    document.body.classList.add('print-guide');
    function cleanup() { document.body.classList.remove('print-guide'); gb.innerHTML = ''; window.removeEventListener('afterprint', cleanup); }
    window.addEventListener('afterprint', cleanup);
    window.print();
  }

  // ---------- events ----------
  document.addEventListener('click', function (e) {
    var t = e.target;
    var nav = t.closest('[data-nav]');
    if (nav && current) { e.preventDefault(); var to = nav.getAttribute('data-nav'); if (location.hash === '#' + to) route(); else location.hash = to; return; }
    var open = t.closest('[data-open-day]');
    if (open && current) { e.preventDefault(); var n = +open.getAttribute('data-open-day'); if (location.hash === '#day-' + n) render('today', n); else location.hash = 'day-' + n; return; }
    var pd = t.closest('[data-print-day-sheets]'); if (pd) { printSheets('day', +pd.getAttribute('data-print-day-sheets')); return; }
    var pr = t.closest('[data-print]'); if (pr) { printSheets(pr.getAttribute('data-print')); return; }
    var off = t.closest('[data-offline]');
    if (off) { if (off.getAttribute('data-offline') === 'save') saveOffline(); else Off.remove(SLUG).then(function () { offline.saved = false; offline.update = false; if (screen === 'trip') render('trip'); else refreshOfflineUi(); }); return; }
    var opt = t.closest('.opt');
    if (opt) { var dn = +opt.getAttribute('data-day'), id = opt.getAttribute('data-opt'); selOpt[dn] = id; applyOpt(dn, id); return; }
    var loc = t.closest('[data-locate]');
    if (loc) { var fig = loc.closest('.day-map'); if (fig._watch != null) stopLocate(fig); else startLocate(fig); return; }
    var ib = t.closest('#install-btn');
    if (ib && deferredInstall) { deferredInstall.prompt(); deferredInstall = null; ib.hidden = true; }
  });
  document.addEventListener('change', function (e) {
    var c = e.target.closest && e.target.closest('[data-check]');
    if (c) { if (c.checked) LS.set(c.getAttribute('data-check'), '1'); else LS.del(c.getAttribute('data-check')); }
  });
  window.addEventListener('online', paintChip);
  window.addEventListener('offline', paintChip);

  // ---------- unlock ----------
  function showApp(tour, session, source, syncedAt) {
    current = { tour: tour, session: session, source: source };
    if (window.OpenRideJournal) window.OpenRideJournal.setSession(sb, session);
    var pub = $('public'); if (pub) pub.remove();
    buildShell();
    route();
  }

  async function fetchTour(token) {
    var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, 10000); // weak signal must not hang the page
    try {
      return await fetch('/.netlify/functions/tour-content', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ route_slug: SLUG }), signal: ctl.signal });
    } finally { clearTimeout(timer); }
  }

  async function init() {
    var sampleEl = $('sample-data');
    if (sampleEl) { try { window.__sample = JSON.parse(sampleEl.textContent); } catch (e) { /* ignore */ } }
    hydrateMaps(document); drawOverview($('route-diagram'));
    document.querySelectorAll('.check input').forEach(function (i) { i.checked = LS.get(i.getAttribute('data-check'), '') === '1'; });
    var cached = Off ? await Off.read(SLUG) : null;
    offline.saved = !!cached; offline.syncedAt = cached && cached.synced_at;
    if (typeof supabase === 'undefined' || typeof CONFIG === 'undefined') { if (cached) showApp(cached.tour, null, 'cache', cached.synced_at); return; }
    sb = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnon);
    sb.auth.onAuthStateChange(function (event) { if (event === 'SIGNED_OUT' && Off) Off.clearPaid().then(function () { location.reload(); }); });
    var session = null;
    try { var res = await sb.auth.getSession(); session = res.data && res.data.session; } catch (e) { /* offline */ }
    if (!session) {
      if (cached && Off.hasAuthToken()) { showApp(cached.tour, null, 'cache', cached.synced_at); return; }
      if (justPurchased) setStatus('Sign in with the email you used at checkout to open your tour.');
      return;
    }
    setStatus('Checking your access...');
    var tries = justPurchased ? 8 : 1, r = null;
    for (var i = 0; i < tries; i++) {
      try { r = await fetchTour(session.access_token); } catch (e) { r = null; break; }
      if (r.status === 200) {
        var tour = await r.json();
        if (cached) offline.update = JSON.stringify(cached.tour) !== JSON.stringify(tour); // never overwrite the saved copy silently
        showApp(tour, session, 'network', offline.syncedAt); setStatus(''); return;
      }
      if (r.status === 403 && i < tries - 1) { setStatus('Confirming your payment...'); await sleep(2500); continue; }
      break;
    }
    if (!r || r.status >= 500) {
      if (cached && cached.user_id === session.user.id) { showApp(cached.tour, session, 'cache', cached.synced_at); setStatus(''); return; }
      setStatus(r ? 'Could not load your tour. Try again in a moment.' : 'No signal. Open this page once with signal and tap Save for offline.');
      return;
    }
    if (r.status === 403) setStatus('Signed in as ' + session.user.email + '. This account does not have access yet.');
    else if (r.status === 401) setStatus('Your session expired. Sign in again.');
    else setStatus('Could not load your tour. Refresh and try again.');
  }
  init().catch(function () { setStatus('Could not check your access. Refresh and try again.'); });
})();
