const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Hardcoded path to Chromium (adjust if needed)
const CHROMIUM_PATH = '/usr/bin/chromium-browser'; // this works in GitHub Actions

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('GitHubActionScreenshotBot/1.0'); 
  await page.goto('https://www.mystockalgo.com', { waitUntil: 'networkidle2' });

  const date = new Date().toISOString().split('T')[0];
  const filename = `archive_${date}.png`;
  const archiveDir = path.join(__dirname, '..', 'archives');
  const hashLogPath = path.join(archiveDir, 'hashlog.csv');

  if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir);

  const filepath = path.join(archiveDir, filename);
  await page.screenshot({ path: filepath, fullPage: true });

  const hash = crypto.createHash('sha256').update(fs.readFileSync(filepath)).digest('hex');
  fs.appendFileSync(hashLogPath, `${date},${filename},${hash}\n`);

  console.log(`✅ Screenshot saved and logged: ${filename}`);
  await browser.close();
})();

