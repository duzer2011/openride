const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  const htmlPath = 'file:///' + path.resolve('C:/OpenRide.bike/pdfs/natchez-trace-cover.html').replace(/\\/g, '/');
  await page.goto(htmlPath, { waitUntil: 'networkidle0' });

  // Wait for Google Fonts to load
  await new Promise(r => setTimeout(r, 2000));

  await page.pdf({
    path: 'C:/OpenRide.bike/pdfs/natchez-trace-cover.pdf',
    width: '8.5in',
    height: '11in',
    printBackground: true,
    margin: { top: 0, bottom: 0, left: 0, right: 0 }
  });

  await browser.close();
  console.log('Cover PDF generated.');
})();
