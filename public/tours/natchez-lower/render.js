/* Shared renderer for the tour page. Runs in the browser (buyer app, print sheets) and in
   scripts/build-tour-page.js (public page, including the free Day 4 sample), so both produce the
   same markup from the same JSON. Every per-day field is optional; missing fields render nothing. */
(function (root) {
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var PHONE = /\b(\d{3})-(\d{3})-(\d{4})\b/;
  function telHref(num) { return 'tel:+1' + String(num).replace(/-/g, ''); }
  // Escape, then turn phone numbers into tap-to-call links.
  function rich(s) {
    return esc(s).replace(/\b(\d{3})-(\d{3})-(\d{4})\b/g, function (m, a, b, c) {
      return '<a href="tel:+1' + a + b + c + '">' + m + '</a>';
    });
  }
  function arr(v) { return Array.isArray(v) ? v : (v ? [v] : []); }
  function phoneIn(s) { var m = String(s || '').match(PHONE); return m ? m[0] : null; }
  function mapsHref(q) { return 'https://www.google.com/maps/search/?api=1&amp;query=' + encodeURIComponent(q); }

  var ICON = {
    lock: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    warn: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v5M12 18v.01"/></svg>',
    chev: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>'
  };

  function fmtDate(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return iso || '';
    var m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+p[1] - 1];
    return m + ' ' + (+p[2]) + ', ' + p[0];
  }

  function dayOf(tour, n) { return tour.days.filter(function (d) { return d.n === n; })[0]; }
  function optionOf(d, id) {
    var o = arr(d.route_options);
    return o.filter(function (x) { return x.id === id; })[0] || o.filter(function (x) { return x.checked; })[0] || o[0] || null;
  }
  function milesValue(d, optId) {
    var o = optionOf(d, optId);
    if (o) return 'Est. ' + o.miles + ' mi';
    if (d.kind === 'travel' || !d.miles_est) return 'No riding';
    return (d.miles_is_estimate === false ? '' : 'Est. ') + d.miles_est + ' mi';
  }
  function rowRight(d) {
    if (d.kind === 'travel') return 'No riding';
    if (d.kind === 'layover') return 'Layover';
    return milesValue(d);
  }
  function oneLine(s) { return String(s || '').replace(/\s*Est\. [^.]*\.$/, '').replace(/^[A-Z][a-z]+ layover\.\s*/, ''); }
  function stopFor(tour, d) {
    if (!d.tonight_town || !tour.lodging) return null;
    return tour.lodging.stops.filter(function (s) { return s.town === d.tonight_town; })[0] || null;
  }

  // ---------- small pieces ----------
  function chip(k, v, id) {
    return '<div class="chip"><span class="chip-k"' + (id ? ' id="' + id + '-k"' : '') + '>' + esc(k) + '</span><span class="chip-v num"' + (id ? ' id="' + id + '"' : '') + '>' + esc(v) + '</span></div>';
  }
  // Miles chip: "Est." moves to the label so the number stays on one line.
  function milesChip(d, optId) {
    var v = milesValue(d, optId), est = /^Est\. /.test(v);
    return { k: est ? 'Miles (est.)' : 'Miles', v: v.replace(/^Est\. /, '') };
  }
  function action(href, label, kind, ext) {
    return '<a class="btn ' + (kind || '') + '" href="' + href + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + esc(label) + '</a>';
  }
  function confirmList(d, ctx) {
    var items = arr(d.call_ahead && d.call_ahead.length ? d.call_ahead : d.unconfirmed);
    if (!items.length) return '';
    var h = '<section class="card"><h3>Call ahead checklist</h3><ul class="checks">';
    items.forEach(function (it, i) {
      var key = 'openride:check:natchez-lower:' + d.n + ':' + i;
      var on = ctx && ctx.isChecked && ctx.isChecked(key);
      h += '<li><label class="check"><input type="checkbox" data-check="' + key + '"' + (on ? ' checked' : '') + '><span>' + rich(it) + '</span></label></li>';
    });
    return h + '</ul><p class="checked">Hours last checked ' + esc(fmtDate(d.hours_checked || (ctx && ctx.hoursChecked))) + '.</p></section>';
  }

  function essentials(d, tour, ctx) {
    var rows = [['Breakfast', d.breakfast], ['Lunch', d.lunch], ['Snacks', d.snacks], ['Dinner', d.dinner], ['Water', d.water]]
      .filter(function (r) { return r[1]; });
    var stop = ctx && ctx.buyer ? stopFor(tour, d) : null;
    if (!rows.length && !stop) return '';
    var h = '<section class="card"><h3>Today\'s essentials</h3><ul class="ess">';
    rows.forEach(function (r) {
      var ph = phoneIn(r[1]);
      h += '<li class="ess-row"><span class="ess-k">' + r[0] + '</span><span class="ess-v">' + rich(r[1]) + '</span>' +
        (ph ? '<span class="ess-a"><a class="btn ghost" href="' + telHref(ph) + '">Call to confirm</a></span>' : '') + '</li>';
    });
    if (stop) {
      var acts = '';
      if (stop.phone) acts += '<a class="btn primary big" href="' + telHref(stop.phone) + '">Call ' + esc(stop.short || stop.name) + '</a>';
      acts += '<a class="btn ghost" href="' + mapsHref(stop.maps_query) + '">Directions</a>';
      if (stop.url) acts += '<a class="btn ghost" href="' + esc(stop.url) + '" target="_blank" rel="noopener">Book or view</a>';
      h += '<li class="ess-row tonight"><span class="ess-k">Tonight</span><span class="ess-v"><strong>' + esc(stop.name) + '</strong>, ' + esc(stop.town) +
        '. ' + esc(stop.price) + ' a night.</span><span class="ess-a">' + acts + '</span></li>';
    }
    return h + '</ul></section>';
  }

  function mapFigure(d) {
    if (!d.map) return '';
    var partial = d.map.partial
      ? '<span class="map-badge">Trace section only: MP ' + d.map.from_mp + ' → MP ' + d.map.to_mp + '. Full day route coming.</span>' : '';
    return '<figure class="day-map card" data-map="' + esc(JSON.stringify(d.map)) + '" data-day="' + d.n + '">' + partial +
      '<div class="day-map-canvas" role="img" aria-label="Route line for day ' + d.n + '"></div>' +
      '<figcaption>' + esc(d.map.note) + ' Route line: OpenStreetMap contributors.</figcaption>' +
      '<button type="button" class="btn ghost" data-locate>Show my position</button>' +
      '<p class="locate-status" role="status"></p></figure>';
  }

  function optionsBlock(d) {
    var o = arr(d.route_options);
    if (o.length < 2) return '';
    var sel = optionOf(d);
    var h = '<section class="card"><h3>Route options</h3><div class="opts" role="radiogroup" aria-label="Route for day ' + d.n + '">';
    o.forEach(function (x) {
      var on = sel && sel.id === x.id;
      h += '<button type="button" class="opt" role="radio" aria-checked="' + (on ? 'true' : 'false') + '" data-opt="' + esc(x.id) + '" data-day="' + d.n + '">' +
        '<span class="opt-t">' + esc(x.label) + '</span><span class="opt-m num">Est. ' + esc(x.miles) + ' mi</span><span class="opt-s">' + esc(x.summary) + '</span></button>';
    });
    return h + '</div></section>';
  }
  function stagesList(d, optId) {
    var o = optionOf(d, optId);
    var items = (o && o.stage1 ? [o.stage1] : []).concat(arr(d.stages));
    if (!items.length) return '';
    return '<ol class="stages">' + items.map(function (s) { return '<li>' + rich(s) + '</li>'; }).join('') + '</ol>';
  }
  function stagesBlock(d) {
    var l = stagesList(d);
    return l ? '<section class="card"><h3>The ride, in stages</h3><div id="stages-' + d.n + '">' + l + '</div></section>' : '';
  }

  function storiesBlock(d) {
    var s = arr(d.stories);
    if (!s.length) return '';
    var h = '<section class="block"><h3 class="block-h">Stories along the way</h3>';
    s.forEach(function (x) {
      h += '<details class="story"><summary>' +
        (x.photo ? '<img src="' + esc(x.photo) + '" alt="" loading="lazy">' : '') +
        '<span class="story-txt"><span class="story-where">' + esc(x.where) + '</span><span class="story-title">' + esc(x.title) +
        '</span><span class="story-teaser">' + esc(x.teaser) + '</span></span>' + ICON.chev + '</summary><div class="story-body"><p>' + esc(x.body) + '</p>' +
        (arr(x.sources).length ? '<p class="src">Sources: ' + x.sources.map(esc).join('; ') + '</p>' : '') +
        (x.verified === false ? '<p class="draft">Draft: the history in this story is not yet verified.</p>' : '') + '</div></details>';
    });
    return h + '</section>';
  }

  function journalBlock(d) {
    return '<section class="card journal" data-journal="' + d.n + '"><h3>From the road</h3>' +
      '<label class="sr" for="jr-' + d.n + '">How was today?</label>' +
      '<textarea id="jr-' + d.n + '" rows="5" placeholder="How was today?"></textarea>' +
      '<div class="j-row"><label class="btn ghost file-btn">Photo / video<input class="sr-file" type="file" accept="image/*,video/*" multiple></label>' +
      '<span class="j-status" role="status">Saved on this phone</span></div>' +
      '<div class="thumbs"></div><p class="hint j-note"></p></section>';
  }

  // ---------- the day screen ----------
  function renderDayScreen(d, tour, ctx) {
    ctx = ctx || {};
    var hours = d.hours_checked || tour.hours_checked;
    var h = '<article class="day-screen" id="day-' + d.n + '" data-day="' + d.n + '">';
    h += '<header class="ds-head"><span class="eyebrow">' + esc(d.weekday) + ' · ' + esc(d.tag || '') + '</span><h2>' + esc(d.title_short || d.title) + '</h2>' +
      (d.subtitle ? '<p class="sub">' + esc(d.subtitle) + '</p>' : '') + '</header>';
    var mc = milesChip(d);
    h += '<div class="chips">' + chip(mc.k, mc.v, 'miles-' + d.n) + chip('Surface', d.surface || '—') +
      chip('Climbing', d.climbing_ft ? Number(d.climbing_ft).toLocaleString('en-US') + ' ft' : '—') + '</div>';
    if (d.briefing) h += '<section class="card briefing"><h3>Your day</h3><p class="lead">' + esc(d.briefing) + '</p></section>';
    arr(d.warnings).forEach(function (w) {
      h += '<div class="banner" role="note">' + ICON.warn + '<div><strong>Heads up</strong><p>' + rich(w) + '</p></div></div>';
    });
    h += essentials(d, tour, ctx);
    h += mapFigure(d);
    h += optionsBlock(d);
    h += stagesBlock(d);
    h += storiesBlock(d);
    if (d.guide_note) h += '<section class="card note"><h3>Guide\'s note</h3><p>' + esc(d.guide_note) + '</p></section>';
    if (arr(d.side_trips).length) {
      h += '<section class="block"><h3 class="block-h">Worth the detour</h3>' +
        d.side_trips.map(function (s) { return '<div class="card detour"><p>' + rich(s) + '</p></div>'; }).join('') + '</section>';
    }
    h += confirmList(d, { isChecked: ctx.isChecked, hoursChecked: hours });
    var about = arr(d.route).concat(arr(d.road_notes));
    if (about.length) {
      h += '<details class="acc"><summary>About this ride' + ICON.chev + '</summary><div class="acc-body">' +
        arr(d.route).map(function (p) { return '<p>' + rich(p) + '</p>'; }).join('') +
        (arr(d.road_notes).length ? '<h4>Road notes</h4><ul>' + d.road_notes.map(function (p) { return '<li>' + rich(p) + '</li>'; }).join('') + '</ul>' : '') +
        '</div></details>';
    }
    if (ctx.buyer) h += journalBlock(d);
    h += '<div class="day-actions">' +
      '<button type="button" class="btn" data-print-day-sheets="' + d.n + '">Print this day</button>' +
      '<a class="btn ghost" href="mailto:hello@openride.bike?subject=' + encodeURIComponent('Change on Day ' + d.n + ': ' + tour.name) + '">Report a change</a></div>';
    return h + '</article>';
  }

  // ---------- overview pieces (shared by public and buyer) ----------
  function renderKeyFacts(pub) {
    return '<div class="facts">' + pub.key_facts.map(function (f) {
      return '<div class="fact"><span class="fact-v num">' + esc(f[0]) + '</span><span class="fact-k">' + esc(f[1]) + '</span></div>';
    }).join('') + '</div>';
  }
  function renderDayRows(tour, ctx) {
    ctx = ctx || {};
    return '<ol class="day-rows">' + tour.days.map(function (d, i) {
      var open = ctx.buyer || d.n === ctx.sampleDay;
      var line = oneLine((tour.public.day_summaries || [])[i]);
      var inner = '<span class="dr-n num">' + d.n + '</span><span class="dr-txt"><span class="dr-t">' + esc(d.title_short || d.title) + '</span>' +
        '<span class="dr-s">' + esc(line) + '</span>' +
        (d.hardest ? '<span class="flag">Hardest day</span>' : '') +
        (!ctx.buyer && d.n === ctx.sampleDay ? '<span class="flag free">Free sample</span>' : '') + '</span>' +
        '<span class="dr-r num">' + esc(rowRight(d)) + '</span>' + (open ? ICON.chev : ICON.lock);
      return open
        ? '<li><a class="day-row" href="#day-' + d.n + '" data-open-day="' + d.n + '">' + inner + '</a></li>'
        : '<li><div class="day-row locked" aria-label="Day ' + d.n + ', included with access">' + inner + '</div></li>';
    }).join('') + '</ol>';
  }
  function renderBeforeCommit(pub) {
    return '<section class="card amber"><h3>Before you commit</h3><ul>' + pub.before_you_commit.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></section>';
  }

  // ---------- planning accordions (buyer) ----------
  function acc(title, body, open) {
    return '<details class="acc"' + (open ? ' open' : '') + '><summary>' + esc(title) + ICON.chev + '</summary><div class="acc-body">' + body + '</div></details>';
  }
  function bullets(items) { return '<ul>' + arr(items).map(function (i) { return '<li>' + rich(i) + '</li>'; }).join('') + '</ul>'; }
  function lodgingCards(tour) {
    var L = tour.lodging;
    var h = '<p>' + rich(L.intro) + '</p><div class="stack">';
    L.stops.forEach(function (s) {
      h += '<div class="card"><span class="kicker">Night ' + esc(s.night) + ' · ' + esc(s.town) + '</span><h4 class="card-h">' + esc(s.name) + '</h4>' +
        '<p class="num">' + esc(s.price) + ' a night</p><p>Breakfast: ' + rich(s.breakfast) + '</p><p>Dinner: ' + rich(s.dinner) + '</p><p>Backup: ' + rich(s.backup) + '</p>' +
        (s.note ? '<p>' + rich(s.note) + '</p>' : '') +
        (arr(s.unconfirmed).length ? '<p class="confirm-inline"><strong>Call ahead to confirm:</strong> ' + s.unconfirmed.map(esc).join(', ') + '.</p>' : '') +
        '<div class="btn-row">' + (s.phone ? '<a class="btn primary big" href="' + telHref(s.phone) + '">Call ' + esc(s.short || s.name) + '</a>' : '') +
        '<a class="btn ghost" href="' + mapsHref(s.maps_query) + '">Directions</a>' +
        (s.url ? '<a class="btn ghost" href="' + esc(s.url) + '" target="_blank" rel="noopener">Book or view</a>' : '') + '</div></div>';
    });
    return h + '</div><p>' + rich(L.budget) + '</p><p>' + rich(L.camping) + '</p>';
  }
  function gettingBlock(tour) {
    var g = tour.getting_there, o = tour.getting_home;
    var h = '<h4>Getting to Jackson</h4><p>' + rich(g.intro) + '</p><ul>' + g.items.map(function (i) {
      return '<li><strong>' + esc(i.title) + '.</strong> ' + rich(i.body) + '</li>';
    }).join('') + '</ul><h4>Getting home from Natchez</h4><p>' + rich(o.intro) + '</p><div class="stack">';
    o.options.forEach(function (r) {
      var ph = phoneIn(r.notes);
      h += '<div class="card"><h4 class="card-h">' + esc(r.option) + '</h4><p class="num">' + esc(r.cost) + '</p><p>' + rich(r.notes) + '</p>' +
        '<div class="btn-row">' + (ph ? '<a class="btn ghost" href="' + telHref(ph) + '">Call to confirm</a>' : '') +
        (r.url ? '<a class="btn ghost" href="' + esc(r.url) + '" target="_blank" rel="noopener">Details</a>' : '') + '</div></div>';
    });
    return h + '</div><p>' + rich(o.notes) + '</p>';
  }
  function renderPlanning(tour) {
    var c = tour.conditions;
    return '<div class="accs">' +
      acc('Lodging and prices', lodgingCards(tour)) +
      acc('Getting there and home', gettingBlock(tour)) +
      acc('Road safety and conditions', '<p>' + rich(c.road_status) + ' <a href="' + esc(c.road_status_url) + '" target="_blank" rel="noopener">Check the current status</a></p>' +
        '<h4>On the Trace</h4>' + bullets(c.on_the_trace) + '<h4>Season</h4>' + bullets(c.season)) +
      acc('E-bikes and luggage', '<h4>E-bike riders</h4>' + bullets(tour.ebike) + '<h4>Luggage</h4>' + bullets(tour.luggage)) +
      acc('Riding notes', '<h4>Direction</h4><p>' + esc(tour.public.direction) + '</p><h4>Why Sunday to Saturday</h4><p>' + esc(tour.public.why_sunday) +
        '</p><h4>The bad hour</h4><p>' + esc(tour.public.bad_hour) + '</p>') + '</div>';
  }
  function renderTakeWithYou(tour) {
    var nums = tour.days.map(function (d) { return '<button type="button" class="num-btn" data-print-day-sheets="' + d.n + '" aria-label="Print day ' + d.n + '">' + d.n + '</button>'; }).join('');
    return '<section class="card"><h3>Take it with you</h3>' +
      '<button type="button" class="btn primary big block-btn" data-print="guidebook">Print the guidebook</button>' +
      '<p class="hint">Cover, then a day sheet and a stories sheet for each day. Letter or A4.</p>' +
      '<p class="mini-h">Print one day</p><div class="num-row">' + nums + '</div>' +
      '<button type="button" class="btn ghost block-btn" data-print="phones">Phone list only</button></section>';
  }
  function renderUpdates(tour) {
    return '<section class="block"><h3 class="block-h">Updates</h3><ul class="updates">' +
      tour.updates.map(function (u) { return '<li><strong>' + esc(fmtDate(u.date)) + '.</strong> ' + rich(u.text) + '</li>'; }).join('') + '</ul></section>';
  }

  var api = {
    esc: esc, rich: rich, fmtDate: fmtDate, dayOf: dayOf, optionOf: optionOf, milesValue: milesValue, milesChip: milesChip, rowRight: rowRight, stopFor: stopFor,
    phoneIn: phoneIn, telHref: telHref, ICON: ICON, stagesList: stagesList, mapFigure: mapFigure, oneLine: oneLine,
    renderDayScreen: renderDayScreen, renderKeyFacts: renderKeyFacts, renderDayRows: renderDayRows, renderBeforeCommit: renderBeforeCommit,
    renderPlanning: renderPlanning, renderTakeWithYou: renderTakeWithYou, renderUpdates: renderUpdates
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TourRender = api;
})(typeof window !== 'undefined' ? window : this);
