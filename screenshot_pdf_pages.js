const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: 2 });

  // Re-render the guide template with injected data to screenshot individual pages
  const guideData = fs.readFileSync('C:/OpenRide.bike/pdfs/guide-data.json', 'utf-8');
  await page.evaluateOnNewDocument((data) => {
    window.__GUIDE_DATA = JSON.parse(data);
  }, guideData);

  const htmlPath = 'file:///' + path.resolve('C:/OpenRide.bike/pdfs/guide-template.html').replace(/\\/g, '/');
  await page.goto(htmlPath, { waitUntil: 'networkidle0', timeout: 15000 });
  await page.evaluateHandle('document.fonts.ready');
  await new Promise(r => setTimeout(r, 3000));

  const pageCount = await page.evaluate(() => document.querySelectorAll('.page').length);
  console.log(`Total pages: ${pageCount}`);

  // Screenshot all pages
  for (let i = 0; i < pageCount; i++) {
    const yOffset = await page.evaluate((idx) => {
      const pages = document.querySelectorAll('.page');
      return pages[idx] ? pages[idx].getBoundingClientRect().top + window.scrollY : 0;
    }, i);

    await page.screenshot({
      path: `C:/OpenRide.bike/pdfs/guide-page-${i + 1}.png`,
      clip: { x: 0, y: yOffset, width: 816, height: 1056 }
    });
    console.log(`Page ${i + 1} screenshot saved`);
  }

  await browser.close();
})();
