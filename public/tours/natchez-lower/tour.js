/* Tour page behavior: unlock the paid layer for signed-in buyers, and print modes.
   The free layer is static HTML and works without this file. */
(function () {
  var SLUG = 'natchez-lower';
  var params = new URLSearchParams(location.search);
  var justPurchased = params.get('purchased') === '1';
  var $ = function (id) { return document.getElementById(id); };
  var sb = null;

  function setStatus(t) { var s = $('status'); if (s) s.textContent = t || ''; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function showPaid(tour, session) {
    var sample = $('sample');
    if (sample) sample.remove(); // avoid duplicate #day-4
    var access = $('access');
    if (access) access.hidden = true;
    var host = $('paid');
    host.innerHTML = window.TourRender.renderPaid(tour);
    host.hidden = false;
    // Every day summary now links to its day.
    var items = document.querySelectorAll('#summaries li');
    items.forEach(function (li, i) {
      if (!li.querySelector('a')) li.innerHTML = '<a href="#day-' + (i + 1) + '">' + li.innerHTML + '</a>';
    });
    var owner = $('owner');
    if (owner) { owner.textContent = 'You have access. Signed in as ' + session.user.email + '.'; owner.hidden = false; }
    if (location.hash) { var t = document.querySelector(location.hash); if (t) t.scrollIntoView(); }
  }

  async function fetchTour(token) {
    return fetch('/.netlify/functions/tour-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ route_slug: SLUG })
    });
  }

  async function init() {
    if (typeof supabase === 'undefined' || typeof CONFIG === 'undefined') return;
    sb = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnon);
    var res = await sb.auth.getSession();
    var session = res.data && res.data.session;
    if (!session) {
      if (justPurchased) setStatus('Sign in with the email you used at checkout to open your tour.');
      return;
    }
    setStatus('Checking your access...');
    var tries = justPurchased ? 8 : 1;
    var r;
    for (var i = 0; i < tries; i++) {
      r = await fetchTour(session.access_token);
      if (r.status === 200) { showPaid(await r.json(), session); setStatus(''); return; }
      if (r.status === 403 && i < tries - 1) { setStatus('Confirming your payment...'); await sleep(2500); continue; }
      break;
    }
    if (r.status === 403) setStatus('Signed in as ' + session.user.email + '. This account does not have access yet.');
    else if (r.status === 401) setStatus('Your session expired. Sign in again.');
    else setStatus('Could not load your tour. Refresh and try again.');
  }

  // ---- Print modes ----
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
    if (e.target.closest('[data-print-full]')) print('print-full', null);
  });

  init().catch(function () { setStatus('Could not check your access. Refresh and try again.'); });
})();
