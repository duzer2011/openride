const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Set viewport to letter size at 2x for crisp rendering
  await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: 2 });

  const htmlPath = path.resolve(__dirname, 'pdfs', 'natchez-trace-cover.html');
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 15000 });

  // Wait for fonts to load
  await page.evaluateHandle('document.fonts.ready');

  await page.screenshot({
    path: path.resolve(__dirname, 'pdfs', 'natchez-trace-cover-preview.png'),
    fullPage: false
  });

  console.log('Screenshot saved to pdfs/natchez-trace-cover-preview.png');
  await browser.close();
})();
