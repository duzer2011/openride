/* Builds public/tours/<slug>/index.html (the FREE layer) from content/tours/<slug>/tour.json.
   Run after editing the public part of tour.json:  node scripts/build-tour-page.js
   The output is committed so the free layer is in the page source without JavaScript.
   Paid days, lodging and logistics are NOT written here; the browser fetches them
   from the tour-content function after checking the purchase. */
const fs = require('fs');
const path = require('path');

const SLUG = 'natchez-lower';
const ROOT = path.join(__dirname, '..');
const tour = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'tours', SLUG, 'tour.json'), 'utf8'));
const R = require(path.join(ROOT, 'public', 'tours', SLUG, 'render.js'));
const esc = R.esc;

const URL = `https://openride.bike/tours/${SLUG}/`;
const IMG = 'https://openride.bike/images/natchez-hero-road-ahead.jpg';
const TITLE = `${tour.name} | OpenRide`;
const DESC = 'Six days from Jackson to Natchez on the Natchez Trace Parkway, sleeping in historic inns. Est. 150-190 miles, best in March, April and October. Self-guided.';
if (DESC.length < 150 || DESC.length > 160) throw new Error('description length ' + DESC.length);
const PRICE = '19.00';

const pub = tour.public;
const sample = tour.days.find(d => d.n === 4);

const faqLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: pub.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
};
const productLd = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: tour.name,
  description: DESC,
  image: IMG,
  brand: { '@type': 'Brand', name: 'OpenRide' },
  offers: { '@type': 'Offer', price: PRICE, priceCurrency: 'USD', availability: 'https://schema.org/InStock', url: URL }
};
const tripLd = {
  '@context': 'https://schema.org',
  '@type': 'TouristTrip',
  name: tour.name,
  description: DESC,
  touristType: ['Cyclists', 'Inn-to-inn travelers'],
  itinerary: {
    '@type': 'ItemList',
    itemListElement: [
      'Jackson, MS',
      'Vicksburg, MS (two nights)',
      'Canemount Plantation Inn, Lorman, MS',
      'Natchez, MS (two nights)'
    ].map((name, i) => ({ '@type': 'ListItem', position: i + 1, name }))
  },
  provider: { '@type': 'Organization', name: 'OpenRide', url: 'https://openride.bike/' },
  url: URL
};
const ld = o => `<script type="application/ld+json">\n${JSON.stringify(o, null, 2)}\n</script>`;

const glance = pub.at_a_glance.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('\n');
const summaries = pub.day_summaries.map((s, i) => {
  const text = esc(s);
  return i === 3 ? `<li><a href="#day-4">${text}</a> Full sample below.</li>` : `<li>${text}</li>`;
}).join('\n');
const faqs = pub.faq.map(f =>
  `<div class="faq-item"><div class="faq-question">${esc(f.q)}</div><div class="faq-answer">${esc(f.a)}</div></div>`).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(TITLE)}</title>
<meta name="description" content="${esc(DESC)}">
<link rel="canonical" href="${URL}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="OpenRide">
<meta property="og:title" content="${esc(TITLE)}">
<meta property="og:description" content="${esc(DESC)}">
<meta property="og:url" content="${URL}">
<meta property="og:image" content="${IMG}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(TITLE)}">
<meta name="twitter:description" content="${esc(DESC)}">
<meta name="twitter:image" content="${IMG}">
<meta name="theme-color" content="#2C4A2E">
<link rel="manifest" href="/manifest.json">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/tours/${SLUG}/tour.css">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
${ld(productLd)}
${ld(tripLd)}
${ld(faqLd)}
</head>
<body>
<div class="print-head"><strong>${esc(tour.name)}</strong> &middot; openride.bike/tours/${SLUG}</div>

<nav class="nav">
  <a class="nav-logo" href="/">Open<span>Ride</span>.bike</a>
  <div class="nav-links">
    <a href="/natchez-trace-lower.html">Lower Trace</a>
    <a href="/profile.html">Account</a>
  </div>
</nav>

<header class="hero">
  <div class="wrap">
    <span class="kicker">Lower Natchez Trace &middot; Self-guided</span>
    <h1>${esc(tour.name)}</h1>
    <p>${esc(pub.overview[0])}</p>
    <div class="stats">
      <div class="stat"><b>6 days</b><span>5 nights</span></div>
      <div class="stat"><b>Est. 150-190</b><span>Miles</span></div>
      <div class="stat"><b>Mar-Apr, Oct</b><span>Best months</span></div>
    </div>
  </div>
</header>

<main>
<section class="wrap" aria-label="Get access">
  <div class="access" id="access">
    <div class="price">$19</div>
    <p><strong>One payment, yours for good.</strong> Every day of the tour, every inn with phone numbers and price ranges, getting there and getting home, and a print view for each day. When something changes, the page changes.</p>
    <div class="actions">
      <a class="btn" id="buy" href="/checkout?route=${SLUG}">Get access</a>
      <a href="/?login=true&amp;redirect=/tours/${SLUG}/">Already bought? Sign in</a>
    </div>
    <p id="status" role="status" aria-live="polite"></p>
  </div>
  <p id="owner" class="pull" hidden></p>
</section>

<section class="section" id="overview">
  <div class="wrap">
    <h2>The tour</h2>
${pub.overview.map(p => `    <p>${esc(p)}</p>`).join('\n')}
    <div class="table-wrap"><table class="glance"><tbody>
${glance}
    </tbody></table></div>
    <div class="pull"><p><b>Direction.</b> ${esc(pub.direction)}</p></div>
    <div class="pull"><p><b>Why Sunday to Saturday.</b> ${esc(pub.why_sunday)}</p></div>
    <div class="pull"><p><b>The bad hour.</b> ${esc(pub.bad_hour)}</p></div>
    <h3>Best months</h3>
    <p>${esc(pub.best_months)}</p>
  </div>
</section>

<section class="section" id="summary">
  <div class="wrap">
    <h2>Day by day, in a line</h2>
    <ol class="summaries" id="summaries">
${summaries}
    </ol>
  </div>
</section>

<section class="section" id="sample">
  <div class="wrap">
    <span class="kicker">Free sample day</span>
    <h2>Day 4: Canemount to Natchez</h2>
    <p>This is what every day in the paid tour looks like: the route, the road, where to eat and where to fill bottles.</p>
${R.renderDay(sample, tour)}
  </div>
</section>

<div id="paid" hidden></div>

<section class="section" id="faq">
  <div class="wrap">
    <h2>Frequently asked questions</h2>
${faqs}
  </div>
</section>
</main>

<section class="cta">
  <h2>Ready to ride?</h2>
  <p>$19 opens the full tour. Every day, every inn, every way home.</p>
  <p><a class="btn" href="/checkout?route=${SLUG}">Get access</a></p>
</section>
<footer class="footer">OpenRide.bike &middot; <a href="/natchez-trace-lower.html">Lower Natchez Trace overview</a></footer>

<script src="/config.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/offline.js"></script>
<script src="/tours/${SLUG}/render.js"></script>
<script src="/tours/${SLUG}/tour.js"></script>
</body>
</html>
`;

const out = path.join(ROOT, 'public', 'tours', SLUG, 'index.html');
fs.writeFileSync(out, html);
console.log('wrote', path.relative(ROOT, out), html.length, 'bytes');
