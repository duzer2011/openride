const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function renderGuide(htmlPath, jsonPath, outputPath) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  // Inject guide data before navigation
  const guideData = fs.readFileSync(jsonPath, 'utf-8');
  await page.evaluateOnNewDocument((data) => {
    window.__GUIDE_DATA = JSON.parse(data);
  }, guideData);

  // Serve files from local filesystem
  const absHtml = 'file:///' + path.resolve(htmlPath).replace(/\\/g, '/');
  await page.goto(absHtml, { waitUntil: 'networkidle0' });

  // Wait for fonts and render
  await new Promise(r => setTimeout(r, 3000));

  // Wait for guide to render
  await page.waitForSelector('.page', { timeout: 10000 });

  await page.pdf({
    path: outputPath,
    width: '8.5in',
    height: '11in',
    printBackground: true,
    margin: { top: 0, bottom: 0, left: 0, right: 0 }
  });

  await browser.close();
  console.log(`Guide PDF saved: ${outputPath}`);
}

renderGuide(
  'C:/OpenRide.bike/pdfs/guide-template.html',
  'C:/OpenRide.bike/pdfs/guide-data.json',
  'C:/OpenRide.bike/pdfs/natchez-lower-guide-new.pdf'
);
