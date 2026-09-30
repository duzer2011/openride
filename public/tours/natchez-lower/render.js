/* Shared renderer for the tour page. Runs in the browser (paid layer) and in
   scripts/build-tour-page.js (free layer, including the Day 4 sample), so both
   produce identical markup. Input is the tour JSON; output is HTML strings. */
(function (root) {
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Escape, then turn phone numbers into tap-to-call links.
  function rich(s) {
    return esc(s).replace(/\b(\d{3})-(\d{3})-(\d{4})\b/g, function (m, a, b, c) {
      return '<a href="tel:+1' + a + b + c + '">' + m + '</a>';
    });
  }

  function arr(v) { return Array.isArray(v) ? v : (v ? [v] : []); }

  function mapsLink(query, label) {
    return '<a class="maps" href="https://www.google.com/maps/search/?api=1&amp;query=' +
      encodeURIComponent(query) + '">' + esc(label || 'Open in Maps') + '</a>';
  }

  function ext(url, label) {
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(label) + '</a>';
  }

  function milesLabel(d) {
    if (!d.miles_est) return '';
    return (d.miles_is_estimate === false ? '' : 'est. ') + d.miles_est + ' miles';
  }

  function confirmList(items) {
    if (!items || !items.length) return '';
    return '<div class="confirm"><strong>Call ahead to confirm</strong><ul>' +
      items.map(function (i) { return '<li>' + rich(i) + '</li>'; }).join('') + '</ul></div>';
  }

  function fmtDate(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return iso || '';
    var m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+p[1] - 1];
    return m + ' ' + (+p[2]) + ', ' + p[0];
  }

  function renderDay(d, tour) {
    var meals = [['Breakfast', d.breakfast], ['Lunch', d.lunch], ['Snacks', d.snacks], ['Dinner', d.dinner], ['Water', d.water]]
      .filter(function (r) { return r[1]; });
    var h = '<article class="day" id="day-' + d.n + '" data-day="' + d.n + '">';
    h += '<header class="day-head"><div><span class="day-kicker">Day ' + d.n + ' &middot; ' + esc(d.weekday) + '</span>' +
      '<h3>' + esc(d.title) + '</h3></div>';
    var ml = milesLabel(d);
    if (ml) h += '<span class="day-miles">' + esc(ml) + '</span>';
    h += '</header>';
    h += '<div class="day-body">';
    arr(d.route).forEach(function (p) { h += '<p>' + rich(p) + '</p>'; });
    if (arr(d.warnings).length) {
      h += '<div class="warn"><strong>Heads up</strong><ul>' +
        d.warnings.map(function (w) { return '<li>' + rich(w) + '</li>'; }).join('') + '</ul></div>';
    }
    if (arr(d.road_notes).length) {
      h += '<h4>Road notes</h4><ul>' + d.road_notes.map(function (w) { return '<li>' + rich(w) + '</li>'; }).join('') + '</ul>';
    }
    if (meals.length) {
      h += '<h4>Food and water</h4><table class="meals"><tbody>' +
        meals.map(function (r) { return '<tr><th scope="row">' + r[0] + '</th><td>' + rich(r[1]) + '</td></tr>'; }).join('') +
        '</tbody></table>';
    }
    if (arr(d.side_trips).length) {
      h += '<h4>Worth the detour</h4><ul>' + d.side_trips.map(function (w) { return '<li>' + rich(w) + '</li>'; }).join('') + '</ul>';
    }
    h += confirmList(d.unconfirmed);
    h += '<p class="checked">Hours last checked ' + esc(fmtDate(tour.hours_checked)) + '.</p>';
    h += '<button type="button" class="btn ghost no-print" data-print-day="' + d.n + '">Print this day</button>';
    h += '</div></article>';
    return h;
  }

  function renderLodging(tour) {
    var L = tour.lodging;
    var h = '<section class="section printable" id="lodging"><div class="wrap"><h2>Where you sleep</h2>' +
      '<p>' + rich(L.intro) + '</p><div class="cards">';
    L.stops.forEach(function (s) {
      h += '<div class="card"><span class="kicker">Night ' + esc(s.night) + ' &middot; ' + esc(s.town) + '</span>' +
        '<h3>' + esc(s.name) + '</h3><dl>' +
        '<dt>Price</dt><dd>' + esc(s.price) + ' a night</dd>' +
        '<dt>Breakfast</dt><dd>' + rich(s.breakfast) + '</dd>' +
        '<dt>Dinner</dt><dd>' + rich(s.dinner) + '</dd>' +
        '<dt>Backup</dt><dd>' + rich(s.backup) + '</dd></dl>';
      if (s.note) h += '<p>' + rich(s.note) + '</p>';
      h += confirmList(s.unconfirmed);
      h += '<div class="actions no-print">';
      if (s.phone) h += '<a class="btn" href="tel:+1' + s.phone.replace(/-/g, '') + '">Call ' + esc(s.phone) + '</a>';
      if (s.url) h += '<a class="btn ghost" href="' + esc(s.url) + '" target="_blank" rel="noopener">Book or view</a>';
      h += mapsLink(s.maps_query, 'Directions');
      h += '</div></div>';
    });
    h += '</div><p>' + rich(L.budget) + '</p><p>' + rich(L.camping) + '</p></div></section>';
    return h;
  }

  function renderGetting(tour) {
    var g = tour.getting_there, o = tour.getting_home;
    var h = '<section class="section printable" id="getting"><div class="wrap"><h2>Getting there and getting home</h2>' +
      '<h3>Getting to Jackson</h3><p>' + rich(g.intro) + '</p><ul>';
    g.items.forEach(function (i) {
      h += '<li><strong>' + esc(i.title) + '.</strong> ' + rich(i.body) + (i.url ? ' ' + ext(i.url, 'Details') : '') + '</li>';
    });
    h += '</ul><h3>Getting home from Natchez</h3><p>' + rich(o.intro) + '</p>' +
      '<div class="table-wrap"><table class="grid"><thead><tr><th>Option</th><th>Cost</th><th>Notes</th></tr></thead><tbody>';
    o.options.forEach(function (r) {
      h += '<tr><td data-label="Option">' + (r.url ? ext(r.url, r.option) : esc(r.option)) + '</td>' +
        '<td data-label="Cost">' + esc(r.cost) + '</td><td data-label="Notes">' + rich(r.notes) + '</td></tr>';
    });
    h += '</tbody></table></div><p>' + rich(o.notes) + '</p></div></section>';
    return h;
  }

  function bullets(items) {
    return '<ul>' + arr(items).map(function (i) { return '<li>' + rich(i) + '</li>'; }).join('') + '</ul>';
  }

  function renderConditions(tour) {
    var c = tour.conditions;
    return '<section class="section printable" id="conditions"><div class="wrap"><h2>Conditions, e-bikes and luggage</h2>' +
      '<h3>Road status</h3><p>' + rich(c.road_status) + ' ' + ext(c.road_status_url, 'Check the current status') + '</p>' +
      '<h3>Season</h3>' + bullets(c.season) +
      '<h3>On the Trace</h3>' + bullets(c.on_the_trace) +
      '<h3>E-bike riders</h3>' + bullets(tour.ebike) +
      '<h3>Luggage</h3>' + bullets(tour.luggage) + '</div></section>';
  }

  function renderUpdates(tour) {
    return '<section class="section" id="updates"><div class="wrap"><h2>Updates</h2><ul class="updates">' +
      tour.updates.map(function (u) { return '<li><strong>' + esc(fmtDate(u.date)) + '.</strong> ' + rich(u.text) + '</li>'; }).join('') +
      '</ul></div></section>';
  }

  function renderPaid(tour) {
    var h = '<section class="section printable" id="days"><div class="wrap"><div class="section-head"><h2>Day by day</h2>' +
      '<button type="button" class="btn no-print" data-print-full>Print full tour</button></div>';
    tour.days.forEach(function (d) { h += renderDay(d, tour); });
    h += '</div></section>';
    return h + renderLodging(tour) + renderGetting(tour) + renderConditions(tour) + renderUpdates(tour);
  }

  var api = { esc: esc, rich: rich, renderDay: renderDay, renderPaid: renderPaid, fmtDate: fmtDate, milesLabel: milesLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TourRender = api;
})(typeof window !== 'undefined' ? window : this);
