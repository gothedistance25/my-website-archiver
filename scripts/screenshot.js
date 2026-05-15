const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const CHROMIUM_PATH = '/usr/bin/chromium-browser';
const BASE_URL = 'https://www.mystockalgo.com';
const BENCHMARK_TICKERS = ['DJI', 'S&P 500', 'Nasdaq'];
// ipcodeIdx is always 0 per the frontend's registryModelToConfig
const IPCODE_IDX = 0;

// ── HTTP helper ──────────────────────────────────────────────────────────────

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'GitHubActionScreenshotBot/2.0' } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error(`JSON parse error for ${url}: ${e.message}`)); }
      });
    });
    req.on('error', reject);
  });
}

// ── HTML template ─────────────────────────────────────────────────────────────

function fmt$(v) {
  if (v == null) return 'N/A';
  const sign = v < 0 ? '-$' : '$';
  return sign + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function growthColor(v) {
  if (v == null) return '';
  return v >= 0 ? 'color:#16a34a' : 'color:#dc2626';
}

function buildRows(period, liveData) {
  const allItems = ['Portfolio', ...period.tickers, ...BENCHMARK_TICKERS];
  return allItems.map((label) => {
    const series = liveData[label];
    let finalGrowth = null;
    if (Array.isArray(series) && series.length > 0) {
      for (let i = series.length - 1; i >= 0; i--) {
        if (series[i] !== null && !isNaN(series[i])) { finalGrowth = series[i]; break; }
      }
    }

    const isAggregate = label === 'Portfolio' || BENCHMARK_TICKERS.includes(label);
    const sv = isAggregate ? period.start_capital : period.start_capital / period.tickers.length;
    const fv = finalGrowth != null ? sv * (1 + finalGrowth) : null;
    return {
      label,
      isPortfolio: label === 'Portfolio',
      isBenchmark: BENCHMARK_TICKERS.includes(label),
      growth: finalGrowth != null ? finalGrowth * 100 : null,
      startValue: sv,
      finalValue: fv,
      earnings: fv != null ? fv - sv : null,
    };
  });
}

function buildHtml(model, period, liveData, date) {
  const rows = buildRows(period, liveData);

  const today = new Date();
  const startDt = new Date(period.start_date + 'T00:00:00');
  const endDt = new Date(period.end_date + 'T00:00:00');
  const msPerDay = 86400000;
  const totalDays = Math.round((endDt - startDt) / msPerDay);
  const daysElapsed = Math.max(0, Math.min(Math.floor((today - startDt) / msPerDay), totalDays));
  const statusLabel = period.status === 'active' ? 'Ongoing' : 'Completed';
  const badgeStyle = period.status === 'active'
    ? 'background:#dcfce7;color:#16a34a'
    : 'background:#f1f5f9;color:#64748b';

  const rowsHtml = rows.map((r) => {
    const rowStyle = r.isPortfolio
      ? 'background:#eef2ff;font-weight:700'
      : r.isBenchmark ? 'color:#6b7280;font-style:italic' : '';
    return `<tr style="${rowStyle}">
      <td style="padding:7px 12px">${r.label}</td>
      <td style="padding:7px 12px;text-align:right;font-family:monospace">${fmt$(r.startValue)}</td>
      <td style="padding:7px 12px;text-align:right;font-family:monospace">${fmt$(r.finalValue)}</td>
      <td style="padding:7px 12px;text-align:right;font-family:monospace;${growthColor(r.earnings)}">${fmt$(r.earnings)}</td>
      <td style="padding:7px 12px;text-align:right;font-family:monospace;font-weight:600;${growthColor(r.growth)}">${r.growth != null ? r.growth.toFixed(1) + '%' : 'N/A'}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${model.display_name} — Live Portfolio Snapshot</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#f8fafc;padding:24px}
  .card{background:#fff;border-radius:12px;box-shadow:0 1px 6px rgba(0,0,0,.08);padding:28px;max-width:920px;margin:0 auto}
  h1{font-size:22px;color:#1e293b;margin-bottom:4px}
  .sub{color:#64748b;font-size:13px;margin-bottom:20px}
  .badge{display:inline-block;padding:3px 12px;border-radius:999px;font-size:12px;font-weight:600}
  .header-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
  .meta{display:grid;grid-template-columns:repeat(7,1fr);gap:12px;background:#f1f5f9;border-radius:8px;padding:16px;margin-bottom:24px}
  .meta label{display:block;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px}
  .meta span{font-size:14px;font-weight:600;color:#1e293b}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;padding:8px 12px;color:#64748b;font-weight:500;border-bottom:2px solid #e2e8f0;white-space:nowrap}
  th:not(:first-child){text-align:right}
  tr{border-bottom:1px solid #f1f5f9}
  .holdings{font-size:12px;color:#64748b;margin-top:14px;line-height:1.5}
  .footer{margin-top:18px;font-size:11px;color:#94a3b8;text-align:right;border-top:1px solid #f1f5f9;padding-top:10px}
</style>
</head>
<body>
<div class="card">
  <div class="header-row">
    <h1>${model.display_name}</h1>
    <span class="badge" style="${badgeStyle}">${statusLabel}</span>
  </div>
  <p class="sub">Live Portfolio Audit Snapshot — ${date}</p>
  <div class="meta">
    <div><label>Period</label><span>${period.period_number}</span></div>
    <div><label>Start</label><span>${period.start_date}</span></div>
    <div><label>End</label><span>${period.end_date}</span></div>
    <div><label>Length</label><span>${totalDays}d</span></div>
    <div><label>Elapsed</label><span>${daysElapsed}d</span></div>
    <div><label>Capital</label><span>$${period.start_capital.toLocaleString()}</span></div>
    <div><label>Holdings</label><span>${period.tickers.length} stocks</span></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th>Starting Value</th>
        <th>Final Value</th>
        <th>Earnings</th>
        <th>Growth %</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <p class="holdings"><strong>Holdings:</strong> ${period.tickers.join(', ')}</p>
  <p class="footer">mystockalgo.com &nbsp;|&nbsp; Captured: ${new Date().toUTCString()}</p>
</div>
</body>
</html>`;
}

// ── Snapshot one model ────────────────────────────────────────────────────────

async function takeSnapshot(browser, model, period, liveData, date, archiveDir, hashLogPath) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 800 });

  const html = buildHtml(model, period, liveData, date);
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const slug = `model-${model.model_number}`;
  const pngName = `archive_${slug}_${date}.png`;
  const jsonName = `archive_${slug}_${date}.json`;
  const pngPath = path.join(archiveDir, pngName);
  const jsonPath = path.join(archiveDir, jsonName);

  await page.screenshot({ path: pngPath, fullPage: true });
  await page.close();

  // Raw snapshot JSON — independently auditable alongside the PNG
  const snapshot = { date, model, period, liveData };
  fs.writeFileSync(jsonPath, JSON.stringify(snapshot, null, 2));

  const pngHash = crypto.createHash('sha256').update(fs.readFileSync(pngPath)).digest('hex');
  const jsonHash = crypto.createHash('sha256').update(fs.readFileSync(jsonPath)).digest('hex');
  fs.appendFileSync(hashLogPath, `${date},${slug},${pngName},${pngHash}\n`);
  fs.appendFileSync(hashLogPath, `${date},${slug}_json,${jsonName},${jsonHash}\n`);

  console.log(`Saved ${pngName} + ${jsonName}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  // Step 1: fetch active model list
  const registry = await fetchJson(`${BASE_URL}/api/registry`);
  const models = (registry.models || []);
  if (models.length === 0) {
    console.log('No active models in registry. Nothing to snapshot.');
    process.exit(0);
  }
  console.log(`Registry: ${models.length} active model(s) — ${models.map((m) => m.display_name).join(', ')}`);

  // Step 2: fetch live_periods.json once (keyed by "model_N")
  const livePeriods = await fetchJson(`${BASE_URL}/static/live_periods.json`).catch((e) => {
    console.warn(`Could not fetch live_periods.json: ${e.message}`);
    return {};
  });

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const date = new Date().toISOString().split('T')[0];
  const archiveDir = path.join(__dirname, '..', 'archives');
  const hashLogPath = path.join(archiveDir, 'hashlog.csv');
  if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });

  let successCount = 0;
  for (const model of models) {
    const modelPeriods = livePeriods[`model_${model.model_number}`] || [];

    // Prefer active period; fall back to latest completed period
    const period = modelPeriods.find((p) => p.status === 'active')
      ?? modelPeriods[modelPeriods.length - 1];

    if (!period) {
      console.warn(`${model.display_name}: no period data in live_periods.json — skipping.`);
      continue;
    }

    // Step 3: fetch performance data for this period
    const dataUrl = `${BASE_URL}/static/s${model.strat_idx}_p${IPCODE_IDX}/live_performance_data_${period.start_date}.json`;
    const liveData = await fetchJson(dataUrl).catch((e) => {
      console.warn(`${model.display_name}: could not fetch performance data (${e.message}) — skipping.`);
      return null;
    });
    if (!liveData) continue;

    await takeSnapshot(browser, model, period, liveData, date, archiveDir, hashLogPath);
    successCount++;
  }

  await browser.close();
  console.log(`Done. ${successCount}/${models.length} model(s) snapshotted.`);
})();
