const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: 2 });

  const pdfPath = 'file:///' + path.resolve('C:/OpenRide.bike/pdfs/natchez-trace-cover.pdf').replace(/\\/g, '/');
  await page.goto(pdfPath, { waitUntil: 'networkidle0', timeout: 15000 });

  // PDF viewer in Chrome - wait for it to render
  await new Promise(r => setTimeout(r, 3000));

  await page.screenshot({
    path: path.resolve('C:/OpenRide.bike/pdfs/cover-pdf-preview.png'),
    fullPage: false
  });

  console.log('PDF preview saved');
  await browser.close();
})();
