/* Printed guidebook: builds the print-only sheets from the tour JSON.
   Layout rule: the cover is page 1; every day is a DAY SHEET and a STORIES SHEET, each exactly one
   page, so day N starts on page 2N and its stories on page 2N+1 (the contents table uses that).
   Works with a partial tour (the public Day 4 sample) and with any per-day field missing. */
(function (root) {
  var R = root.TourRender || (typeof require !== 'undefined' ? require('./render.js') : null);
  var esc = R.esc;

  function box(k, v) { return '<div class="gb-box"><span class="gb-bk">' + esc(k) + '</span><span class="gb-bv">' + esc(v) + '</span></div>'; }
  function lines(n) { var s = ''; for (var i = 0; i < n; i++) s += '<div class="gb-line"></div>'; return s; }
  function phoneText(s) { return esc(s); } // numbers print as plain text, not links

  function head(tour, d) {
    return '<div class="gb-head"><span class="gb-run">' + esc(tour.name) + '</span>' +
      (d ? '<span class="gb-day">DAY ' + d.n + ' · ' + esc(String(d.weekday).toUpperCase()) + '</span>' : '') + '</div>';
  }
  function foot(tour, d, page, paged) {
    var checked = R.fmtDate((d && d.hours_checked) || tour.hours_checked);
    return '<div class="gb-foot"><span>Hours last checked ' + esc(checked) + ' · openride.bike</span><span>' +
      (paged ? 'Page ' + page : 'Day ' + (d ? d.n : '')) + '</span></div>';
  }

  function cover(tour, opts) {
    var pub = tour.public;
    var inns = (tour.lodging && tour.lodging.stops) || [];
    var rows = inns.map(function (s) {
      return '<tr><td>' + esc(s.name) + ', ' + esc(s.town) + '</td><td class="gb-num">' + (s.phone ? esc(s.phone) : '<span class="gb-blank">not verified: write it here</span>') + '</td></tr>';
    });
    ((tour.phones && tour.phones.extra) || []).forEach(function (x) {
      rows.push('<tr><td>' + esc(x.label) + '</td><td class="gb-num">' + esc(x.phone) + '</td></tr>');
    });
    rows.push('<tr><td>Emergency</td><td class="gb-num">' + esc((tour.phones && tour.phones.emergency) || '911') + '</td></tr>');
    var phones = '<section class="gb-phones"><h2>Phone numbers</h2><table class="gb-table">' + rows.join('') + '</table></section>';
    if (opts.phonesOnly) {
      return '<section class="gb-sheet gb-cover gb-phones-only">' + head(tour) + '<h1 class="gb-title">Phone numbers</h1>' + phones +
        '<p class="gb-printed">Printed ' + esc(opts.printedOn) + '. Hours and phones change: check openride.bike before you ride.</p></section>';
    }
    var toc = tour.days.map(function (d) {
      return '<tr><td>Day ' + d.n + ' · ' + esc(d.weekday) + ' · ' + esc(d.title_short || d.title) + '</td><td class="gb-num">' + (2 * d.n) + ' and ' + (2 * d.n + 1) + '</td></tr>';
    }).join('');
    return '<section class="gb-sheet gb-cover"><div class="gb-band"><span class="gb-mark">OPENRIDE.BIKE</span></div>' +
      '<h1 class="gb-title">' + esc(tour.name) + '</h1>' +
      '<div class="gb-boxes">' + pub.key_facts.map(function (f) { return box(f[1], f[0]); }).join('') + '</div>' +
      '<div class="gb-two"><section><h2>Inside</h2><table class="gb-table"><tr><td>Cover and phone numbers</td><td class="gb-num">1</td></tr>' + toc + '</table></section>' + phones + '</div>' +
      '<div class="gb-fill"><span>Rider <i></i></span><span>Start date <i></i></span><span>If found, call <i></i></span></div>' +
      '<p class="gb-printed">Printed ' + esc(opts.printedOn) + '. Hours and phones change: check openride.bike before you ride.</p></section>';
  }

  function essentialsTable(d, tour, withTonight) {
    var rows = [['Breakfast', d.breakfast], ['Lunch', d.lunch], ['Snacks', d.snacks], ['Dinner', d.dinner], ['Water', d.water]].filter(function (r) { return r[1]; });
    var stop = withTonight ? R.stopFor(tour, d) : null;
    var h = rows.map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + phoneText(r[1]) + '</td></tr>'; }).join('');
    if (stop) h += '<tr><th>Tonight</th><td><strong>' + esc(stop.name) + '</strong>, ' + esc(stop.town) + '. ' + esc(stop.price) + ' a night.' +
      (stop.phone ? ' Phone ' + esc(stop.phone) + '.' : ' Phone not verified yet.') + '</td></tr>';
    return h ? '<table class="gb-ess">' + h + '</table>' : '';
  }

  function daySheet(tour, d, page, opts) {
    var opt = R.optionOf(d);
    var options = (d.route_options || []).map(function (o) {
      return '<li><span class="gb-tick"></span><span><strong>' + esc(o.label) + ', est. ' + esc(o.miles) + ' mi.</strong> ' + esc(o.summary) + '</span></li>';
    }).join('');
    var stages = R.stagesList(d, opt && opt.id).replace('<ol class="stages">', '<ol class="gb-stages">');
    var checks = (d.call_ahead && d.call_ahead.length ? d.call_ahead : d.unconfirmed || []).map(function (x) {
      return '<li><span class="gb-tick"></span><span>' + phoneText(x) + '</span></li>';
    }).join('');
    var det = (d.side_trips || []).map(function (x) { return '<li>' + phoneText(x) + '</li>'; }).join('');
    var warns = (d.warnings || []).map(function (w) { return '<p>' + phoneText(w) + '</p>'; }).join('');
    return '<section class="gb-sheet gb-daysheet" data-day="' + d.n + '">' + head(tour, d) +
      '<div class="gb-titlerow"><h1 class="gb-h1">' + esc(d.title_short || d.title) + '</h1><div class="gb-metrics">' +
      box('Miles', R.milesValue(d)) + box('Climbing', d.climbing_ft ? Number(d.climbing_ft).toLocaleString('en-US') + ' ft' : '—') + '</div></div>' +
      (d.briefing ? '<p class="gb-brief">' + esc(d.briefing) + '</p>' : '') +
      (warns ? '<div class="gb-warn"><strong>Heads up</strong>' + warns + '</div>' : '') +
      '<div class="gb-cols"><div class="gb-col-l">' + essentialsTable(d, tour, opts.tonight) +
      (d.map ? '<figure class="day-map sheet-map" data-map="' + esc(JSON.stringify(d.map)) + '"><div class="day-map-canvas"></div></figure>' : '<div class="gb-mapspace">Map space</div>') +
      '<div class="gb-notes"><h3>Notes</h3>' + lines(2) + '</div></div>' +
      '<div class="gb-col-r">' + (options ? '<h3>Route options</h3><ul class="gb-ticks">' + options + '</ul>' : '') +
      (stages ? '<h3>The ride, in stages</h3>' + stages : '') +
      (checks ? '<h3>Call ahead</h3><ul class="gb-ticks">' + checks + '</ul>' : '') +
      (det ? '<h3>Worth the detour</h3><ul class="gb-plain">' + det + '</ul>' : '') + '</div></div>' +
      foot(tour, d, page, opts.paged) + '</section>';
  }

  function storiesSheet(tour, d, page, opts) {
    var stories = (d.stories || []).slice(0, 4).map(function (s) {
      return '<article class="gb-story"><div class="gb-photo">' + (s.photo ? '<img src="' + esc(s.photo) + '" alt="">' : '<span>Photo</span>') + '</div>' +
        '<span class="gb-where">' + esc(s.where) + '</span><h3>' + esc(s.title) + '</h3><p>' + esc(s.body) + '</p>' +
        (s.verified === false ? '<p class="gb-draft">Draft: history not yet verified.</p>' : '') + '</article>';
    }).join('');
    var text = (opts.journal && opts.journal[d.n]) || '';
    var write = '<div class="gb-writing"><h3>From the road · your day</h3><p class="gb-jmeta">Date <i></i> Miles <i></i> Weather <i></i></p>' +
      '<div class="gb-ruled">' + lines(30) + (text ? '<span class="gb-jtext">' + esc(text) + '</span>' : '') + '</div></div>';
    return '<section class="gb-sheet gb-storysheet" data-day="' + d.n + '">' + head(tour, d) +
      '<h1 class="gb-h1">Stories: ' + esc(d.title_short || d.title) + '</h1>' +
      (stories ? '<div class="gb-grid">' + stories + '</div>' : '<p class="gb-none">Stories for this day are coming.</p>') +
      write + foot(tour, d, page, opts.paged) + '</section>';
  }

  // opts: { days: [n...] (default all), cover: bool, phonesOnly: bool, journal: {n: text}, tonight: bool, printedOn: string }
  function build(tour, opts) {
    opts = opts || {};
    opts.printedOn = opts.printedOn || R.fmtDate(new Date().toISOString().slice(0, 10));
    var days = opts.days || tour.days.map(function (d) { return d.n; });
    var out = '';
    if (opts.cover || opts.phonesOnly) out += cover(tour, opts);
    if (!opts.phonesOnly) {
      opts.paged = !!opts.cover;
      days.forEach(function (n) {
        var d = R.dayOf(tour, n);
        if (!d) return;
        out += daySheet(tour, d, 2 * n, opts) + storiesSheet(tour, d, 2 * n + 1, opts);
      });
    }
    return out;
  }

  var api = { build: build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TourGuidebook = api;
})(typeof window !== 'undefined' ? window : this);
