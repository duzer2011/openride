const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: 2 });

  // Collect console messages
  const logs = [];
  page.on('console', msg => logs.push(msg.type() + ': ' + msg.text()));
  page.on('pageerror', err => logs.push('ERROR: ' + err.message));

  // Inject guide data before navigation
  const guideData = fs.readFileSync('C:/OpenRide.bike/pdfs/guide-data.json', 'utf-8');
  await page.evaluateOnNewDocument((data) => {
    window.__GUIDE_DATA = JSON.parse(data);
  }, guideData);

  const htmlPath = 'file:///' + path.resolve('C:/OpenRide.bike/pdfs/guide-template.html').replace(/\\/g, '/');
  await page.goto(htmlPath, { waitUntil: 'networkidle0', timeout: 15000 });

  // Wait for fonts + JS render
  await page.evaluateHandle('document.fonts.ready');
  await new Promise(r => setTimeout(r, 3000));

  // Count pages
  const pageCount = await page.evaluate(() => document.querySelectorAll('.page').length);
  console.log(`Pages rendered: ${pageCount}`);

  // Screenshot page 1
  await page.screenshot({
    path: 'C:/OpenRide.bike/pdfs/guide-preview-p1.png',
    clip: { x: 0, y: 0, width: 816, height: 1056 }
  });

  // Screenshot page 2
  if (pageCount >= 2) {
    const p2y = await page.evaluate(() => {
      const pages = document.querySelectorAll('.page');
      return pages[1] ? pages[1].getBoundingClientRect().top + window.scrollY : 1056;
    });
    await page.screenshot({
      path: 'C:/OpenRide.bike/pdfs/guide-preview-p2.png',
      clip: { x: 0, y: p2y, width: 816, height: 1056 }
    });
  }

  // Print errors
  const errors = logs.filter(l => l.startsWith('error') || l.startsWith('ERROR'));
  if (errors.length) {
    console.log('JS Errors:');
    errors.forEach(e => console.log('  ' + e));
  } else {
    console.log('No JS console errors.');
  }

  console.log('Screenshots saved.');
  await browser.close();
})();
