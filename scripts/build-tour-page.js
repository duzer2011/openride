/* Builds public/tours/<slug>/index.html (the PUBLIC layer) from content/tours/<slug>/tour.json.
   Run after editing the public part of tour.json:  node scripts/build-tour-page.js
   The output is committed so the public layer is in the page source without JavaScript.
   Paid days, lodging and logistics are NOT written here; the browser fetches them from the
   tour-content function after checking the purchase. The one free sample day (Day 4) is rendered
   with the same renderer the buyer app uses. */
const fs = require('fs');
const path = require('path');

const SLUG = 'natchez-lower';
const SAMPLE_DAY = 4;
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
// These two repeat the key facts and the buyer's Riding notes, so they stay out of the public FAQ.
const faq = pub.faq.filter(f => !/^How long is the Natchez Trace Inn-to-Inn/.test(f.q) && !/^What is the bad hour/.test(f.q));
const sample = tour.days.find(d => d.n === SAMPLE_DAY);

const faqLd = {
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
};
const productLd = {
  '@context': 'https://schema.org', '@type': 'Product', name: tour.name, description: DESC, image: IMG,
  brand: { '@type': 'Brand', name: 'OpenRide' },
  offers: { '@type': 'Offer', price: PRICE, priceCurrency: 'USD', availability: 'https://schema.org/InStock', url: URL }
};
const tripLd = {
  '@context': 'https://schema.org', '@type': 'TouristTrip', name: tour.name, description: DESC,
  touristType: ['Cyclists', 'Inn-to-inn travelers'],
  itinerary: {
    '@type': 'ItemList',
    itemListElement: ['Jackson, MS', 'Vicksburg, MS (two nights)', 'Canemount Plantation Inn, Lorman, MS', 'Natchez, MS (two nights)']
      .map((name, i) => ({ '@type': 'ListItem', position: i + 1, name }))
  },
  provider: { '@type': 'Organization', name: 'OpenRide', url: 'https://openride.bike/' }, url: URL
};
const ld = o => `<script type="application/ld+json">\n${JSON.stringify(o, null, 2)}\n</script>`;

// What the page needs to print the free sample day. Nothing paid.
const sampleData = { name: tour.name, hours_checked: tour.hours_checked, public: { key_facts: pub.key_facts }, days: [sample] };

const faqHtml = faq.map(f =>
  `<details class="faq-item"><summary>${esc(f.q)}${R.ICON.chev}</summary><div class="faq-answer">${esc(f.a)}</div></details>`).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
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
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
<link rel="preload" as="font" type="font/woff2" crossorigin href="/fonts/source-sans-3-latin.woff2">
<link rel="stylesheet" href="/tours/${SLUG}/tour.css">
<link rel="stylesheet" href="/tours/${SLUG}/print.css" media="print">
${ld(productLd)}
${ld(tripLd)}
${ld(faqLd)}
</head>
<body>
<div id="public">
<header class="site-bar"><div class="wrap">
  <a class="wordmark" href="/">Open<span>Ride</span>.bike</a>
  <nav aria-label="Site"><a href="/natchez-trace-lower.html">Lower Trace</a><a href="/account/">My tours</a></nav>
</div></header>

<section class="hero"><div class="wrap">
  <span class="eyebrow">Lower Natchez Trace · Self-guided</span>
  <h1>${esc(tour.name)}</h1>
  <p class="route">Jackson → Natchez</p>
  <p>${esc(pub.overview[0])}</p>
</div></section>

<main class="wrap">
  ${R.renderKeyFacts(pub)}

  <section class="card buy" id="access">
    <h2 class="price num">$19</h2>
    <p><strong>One payment, yours for good.</strong> This buys the guide. It does not book rooms, rides or reservations.</p>
    <ul>
${pub.buy_includes.map(x => `      <li>${esc(x)}</li>`).join('\n')}
    </ul>
    <div class="btn-row">
      <a class="btn primary big" id="buy" href="/checkout?route=${SLUG}">Get access</a>
      <a class="btn ghost big" href="#day-${SAMPLE_DAY}">See free Day ${SAMPLE_DAY}</a>
    </div>
    <p class="hint"><a href="/?login=true&amp;redirect=/tours/${SLUG}/">Already bought? Sign in</a></p>
    <p id="status" role="status" aria-live="polite"></p>
  </section>

  <section class="public-section" id="route-section">
    <h2>The route</h2>
    <div class="card"><div id="route-diagram"></div></div>
  </section>

  <section class="public-section" id="days">
    <h2>Six days</h2>
    ${R.renderDayRows(tour, { sampleDay: SAMPLE_DAY })}
    ${R.renderBeforeCommit(pub)}
  </section>

  <section class="public-section" id="sample">
    <div class="sample-head"><span class="eyebrow">Free sample day</span><h2>Day ${SAMPLE_DAY}, in full</h2>
    <p class="hint">This is what every day looks like: the route, the road, where to eat and where to fill bottles. The other five days are included with access.</p></div>
    ${R.renderDayScreen(sample, tour, { buyer: false })}
  </section>

  <section class="public-section" id="faq">
    <h2>Questions</h2>
${faqHtml}
  </section>
</main>

<section class="cta">
  <h2>Ready to ride?</h2>
  <p>$19 opens all six days, every inn, and every way home.</p>
  <p><a class="btn primary big" href="/checkout?route=${SLUG}">Get access</a></p>
</section>
<footer class="footer">OpenRide.bike · <a href="/natchez-trace-lower.html">Lower Natchez Trace overview</a></footer>
</div>

<div id="app" hidden></div>
<div id="guidebook" aria-hidden="true"></div>
<script type="application/json" id="sample-data">${JSON.stringify(sampleData).replace(/</g, '\\u003c')}</script>

<script src="/config.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/offline.js"></script>
<script src="/tours/${SLUG}/render.js"></script>
<script src="/tours/${SLUG}/guidebook.js"></script>
<script src="/tours/${SLUG}/journal.js"></script>
<script src="/tours/${SLUG}/tour.js"></script>
</body>
</html>
`;

const out = path.join(ROOT, 'public', 'tours', SLUG, 'index.html');
fs.writeFileSync(out, html);
console.log('wrote', path.relative(ROOT, out), html.length, 'bytes');
