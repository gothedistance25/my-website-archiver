const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Hardcoded path to Chromium (adjust if needed)
const CHROMIUM_PATH = '/usr/bin/chromium-browser'; // this works in GitHub Actions

// Define the pages to screenshot
const PAGES = [
  {
    url: 'https://www.mystockalgo.com/?model=model_1',
    name: 'model-1'
  },
  {
    url: 'https://www.mystockalgo.com/?model=model_2',
    name: 'model-2'
  }
];

async function takeScreenshot(browser, pageConfig, date, archiveDir, hashLogPath) {
  const page = await browser.newPage();
  await page.setUserAgent('GitHubActionScreenshotBot/1.0');
  
  console.log(`📸 Capturing ${pageConfig.name}...`);
  await page.goto(pageConfig.url, { waitUntil: 'networkidle2' });
  
  const filename = `archive_${pageConfig.name}_${date}.png`;
  const filepath = path.join(archiveDir, filename);
  
  await page.screenshot({ path: filepath, fullPage: true });
  
  const hash = crypto.createHash('sha256').update(fs.readFileSync(filepath)).digest('hex');
  fs.appendFileSync(hashLogPath, `${date},${pageConfig.name},${filename},${hash}\n`);
  
  console.log(`✅ Screenshot saved and logged: ${filename}`);
  await page.close();
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const date = new Date().toISOString().split('T')[0];
  const archiveDir = path.join(__dirname, '..', 'archives');
  const hashLogPath = path.join(archiveDir, 'hashlog.csv');

  if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir);

  // Take screenshots of all pages
  for (const pageConfig of PAGES) {
    await takeScreenshot(browser, pageConfig, date, archiveDir, hashLogPath);
  }

  await browser.close();
  console.log('🎉 All screenshots completed!');
})();