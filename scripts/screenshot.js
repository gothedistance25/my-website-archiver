const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const BASE_URL = 'https://mystockalgo-backend.fly.dev';
const BENCHMARK_TICKERS = ['DJI', 'S&P 500', 'Nasdaq'];
// ipcodeIdx is always 0 per the frontend's registryModelToConfig
const IPCODE_IDX = 0;

// Registry status -> the tag the site shows next to the model name (lib/models.ts modelStatusLabel)
const MODEL_STATUS_TAG = { upcoming: 'Coming soon', discontinued: 'Not currently offered' };

// ── HTTP helper ──────────────────────────────────────────────────────────────

function fetchJson(url, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 5) { reject(new Error(`Too many redirects for ${url}`)); return; }
    const req = https.get(url, { headers: { 'User-Agent': 'GitHubActionScreenshotBot/2.0' } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        res.resume();
        const loc = res.headers['location'];
        if (!loc) { reject(new Error(`Redirect with no Location header from ${url}`)); return; }
        const next = loc.startsWith('http') ? loc : new URL(loc, url).toString();
        resolve(fetchJson(next, hops + 1));
        return;
      }
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

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function fmt$(v) {
  if (v == null) return 'N/A';
  const sign = v < 0 ? '-$' : '$';
  return sign + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function signClass(v) {
  if (v == null) return '';
  return v >= 0 ? 'pos' : 'neg';
}

function lastValid(series) {
  if (!Array.isArray(series)) return null;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i] !== null && !isNaN(series[i])) return series[i];
  }
  return null;
}

function buildRows(period, liveData) {
  const allItems = ['Portfolio', ...period.tickers, ...BENCHMARK_TICKERS];
  return allItems.map((label) => {
    const finalGrowth = lastValid(liveData[label]);
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
      // Portfolio is a composite: no single share price applies (same as the site's price view)
      startPrice: label === 'Portfolio' ? null : (liveData[`${label}_startPrice`]?.[0] ?? null),
      finalPrice: label === 'Portfolio' ? null : (liveData[`${label}_finalPrice`]?.[0] ?? null),
    };
  });
}

// Same rules as the site's PeriodSummaryHeader (LivePortfolioSection.tsx)
function periodState(period) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDt = new Date(period.start_date + 'T00:00:00');
  const endDt = new Date(period.end_date + 'T00:00:00');
  const msPerDay = 86400000;
  const totalDays = Math.round((endDt - startDt) / msPerDay);

  if (period.status === 'completed' || today > endDt) {
    return { statusLabel: 'Completed', totalDays, daysElapsed: totalDays, daysRemaining: 0 };
  }
  if (today < startDt) {
    return { statusLabel: 'Not Started', totalDays, daysElapsed: 0, daysRemaining: totalDays };
  }
  const daysElapsed = Math.min(Math.floor((today - startDt) / msPerDay), totalDays);
  return { statusLabel: 'Ongoing', totalDays, daysElapsed, daysRemaining: totalDays - daysElapsed };
}

function buildHtml(model, period, liveData, date) {
  const rows = buildRows(period, liveData);
  const { statusLabel, totalDays, daysElapsed, daysRemaining } = periodState(period);
  const modelTag = MODEL_STATUS_TAG[model.status];
  const lastDate = Array.isArray(liveData.date) && liveData.date.length ? liveData.date[liveData.date.length - 1] : null;

  const stats = [
    ['Start', period.start_date],
    ['End', period.end_date],
    ['Length', `${totalDays} days`],
    ['Capital', `$${period.start_capital.toLocaleString('en-US')}`],
    ['Portfolio', `${period.tickers.length} stocks`],
    ['Elapsed', `${daysElapsed} days`],
    ['Remaining', `${daysRemaining} days`],
  ];

  const rowsHtml = rows.map((r) => {
    const cls = r.isPortfolio ? 'portfolio' : r.isBenchmark ? 'bench' : '';
    return `<tr class="${cls}">
      <td>${esc(r.label)}</td>
      <td class="num">${fmt$(r.startValue)}</td>
      <td class="num">${fmt$(r.finalValue)}</td>
      <td class="num ${signClass(r.earnings)}">${fmt$(r.earnings)}</td>
      <td class="num">${fmt$(r.startPrice)}</td>
      <td class="num">${fmt$(r.finalPrice)}</td>
      <td class="num growth ${signClass(r.growth)}">${r.growth != null ? r.growth.toFixed(1) + '%' : 'N/A'}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(model.display_name)} — Live Portfolio Snapshot</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&family=Zilla+Slab:wght@500&display=swap">
<style>
  :root{--surface:#fff;--ink:#12161c;--rule:#e2e5e9;--rule-strong:#c9ced5;--panel:#f3f5f7;--primary:#2c323b;--muted:#5d6570;--pos:#16a34a;--neg:#dc2626}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Geist,system-ui,sans-serif;background:var(--panel);color:var(--ink);padding:24px}
  .mono,.num,.label,td.num{font-family:'Geist Mono',ui-monospace,monospace}
  .card{background:var(--surface);border:1px solid var(--rule);padding:28px;max-width:960px;margin:0 auto}
  .head{display:flex;justify-content:space-between;align-items:baseline;gap:16px}
  h1{font-family:'Zilla Slab',Rockwell,Georgia,serif;font-weight:500;font-size:28px;line-height:1.15}
  .tag{font-size:13px;color:var(--muted);margin-left:8px;font-family:Geist,system-ui,sans-serif}
  .sub{color:var(--muted);font-size:13px;margin:6px 0 22px}
  .label{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
  .period-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
  .period-row h2{font-size:17px;font-weight:600}
  .badge{border:1px solid var(--rule);color:var(--muted);padding:2px 10px;font-size:12px;font-weight:500}
  .badge.on{border-color:var(--primary);color:var(--ink)}
  .stats{display:grid;grid-template-columns:repeat(7,1fr);gap:12px 16px;margin-bottom:16px}
  .stats .v{display:block;margin-top:2px;font-family:'Geist Mono',ui-monospace,monospace;font-size:13.5px;font-variant-numeric:tabular-nums}
  .holdings{font-size:13px;margin-bottom:22px}
  .holdings .label{display:inline;margin-right:8px}
  .holdings .mono{color:var(--ink)}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{padding:8px 10px;color:var(--muted);font-weight:500;border-bottom:1px solid var(--rule-strong);white-space:nowrap;text-align:right}
  th:first-child{text-align:left}
  td{padding:7px 10px;border-bottom:1px solid var(--rule)}
  td.num{text-align:right;font-size:12.5px;font-variant-numeric:tabular-nums}
  td.growth{font-weight:500;font-size:13px}
  tr.portfolio{font-weight:700;background:var(--panel)}
  tr.bench{color:var(--muted);font-style:italic}
  .pos{color:var(--pos)} .neg{color:var(--neg)}
  .note{margin-top:18px;border:1px solid var(--rule);background:var(--panel);padding:10px 14px;font-size:11.5px;line-height:1.55;color:var(--muted)}
  .footer{margin-top:16px;font-size:11px;color:var(--muted);display:flex;justify-content:space-between;border-top:1px solid var(--rule);padding-top:10px}
</style>
</head>
<body>
<div class="card">
  <div class="head">
    <h1>${esc(model.display_name)}${modelTag ? `<span class="tag">(${modelTag})</span>` : ''}</h1>
    <span class="label">Live portfolio audit snapshot</span>
  </div>
  <p class="sub">Captured ${date}${lastDate ? ` &middot; data through ${esc(lastDate)}` : ''}</p>

  <div class="period-row">
    <h2>Period ${period.period_number}</h2>
    <span class="badge${statusLabel === 'Ongoing' ? ' on' : ''}">${statusLabel}</span>
  </div>
  <div class="stats">
    ${stats.map(([k, v]) => `<div><span class="label">${k}</span><span class="v">${esc(v)}</span></div>`).join('')}
  </div>
  <p class="holdings"><span class="label">Holdings</span><span class="mono">${period.tickers.map(esc).join(', ')}</span></p>

  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th>Starting Value</th>
        <th>Final Value</th>
        <th>Earnings</th>
        <th>Start Price</th>
        <th>End Price</th>
        <th>Growth %</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <p class="note">This is the portfolio the model selected for an entry date of ${esc(period.start_date)}. The model
  generates a new portfolio for each entry date, so a signal purchased on a different date will likely contain
  different stocks and may perform differently. Past performance does not guarantee future results.
  Portfolio is a composite, so no single share price applies.</p>
  <p class="footer"><span>mystockalgo.com</span><span class="mono">Captured: ${new Date().toUTCString()}</span></p>
</div>
</body>
</html>`;
}

// ── Directory helpers ─────────────────────────────────────────────────────────

function dateSubdir(baseDir, date) {
  const [year, month] = date.split('-');
  const dir = path.join(baseDir, year, month);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Move any flat files in archives/ root into archives/YYYY/MM/ based on their date suffix
function reorganizeExisting(baseDir) {
  const DATE_RE = /_(\d{4}-\d{2}-\d{2})\.(png|json)$/;
  let moved = 0;
  for (const name of fs.readdirSync(baseDir)) {
    const fullPath = path.join(baseDir, name);
    if (!fs.statSync(fullPath).isFile()) continue;
    const m = name.match(DATE_RE);
    if (!m) continue;
    const dest = path.join(dateSubdir(baseDir, m[1]), name);
    fs.renameSync(fullPath, dest);
    moved++;
  }
  if (moved) console.log(`Reorganized ${moved} existing file(s) into date subdirectories.`);
}

// ── Snapshot one model ────────────────────────────────────────────────────────

async function takeSnapshot(browser, model, period, liveData, date, baseDir, hashLogPath) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1040, height: 800 });

  const html = buildHtml(model, period, liveData, date);
  // Wait for the font stylesheet to load (up to 15s); if it doesn't, carry on with fallback fonts.
  await page.setContent(html, { waitUntil: 'load', timeout: 15000 }).catch(() => {
    console.warn(`${model.display_name}: page load timed out, using fallback fonts.`);
  });
  // Then wait for the font files themselves (up to 10s). With display=swap, text is visible either way.
  await Promise.race([
    page.evaluate(() => document.fonts.ready.then(() => true)),
    new Promise((r) => setTimeout(r, 10000)),
  ]).catch(() => {});

  const slug = `model-${model.model_number}`;
  const pngName = `archive_${slug}_${date}.png`;
  const jsonName = `archive_${slug}_${date}.json`;
  const dayDir = dateSubdir(baseDir, date);
  const pngPath = path.join(dayDir, pngName);
  const jsonPath = path.join(dayDir, jsonName);

  await page.screenshot({ path: pngPath, fullPage: true });
  await page.close();

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
  // Step 1: fetch the models the site shows. Each carries a status: active (on sale),
  // upcoming (never sold yet) or discontinued (sold before, not offered now).
  const registry = await fetchJson(`${BASE_URL}/api/registry`);
  const models = (registry.models || []);
  if (models.length === 0) {
    console.log('No visible models in registry. Nothing to snapshot.');
    process.exit(0);
  }
  console.log(`Registry: ${models.length} visible model(s) — ${models.map((m) => `${m.display_name} [${m.status ?? 'active'}]`).join(', ')}`);

  // Step 2: fetch live_periods.json once (keyed by "model_N")
  const livePeriods = await fetchJson(`${BASE_URL}/static/live_periods.json`).catch((e) => {
    console.warn(`Could not fetch live_periods.json: ${e.message}`);
    return {};
  });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const date = new Date().toISOString().split('T')[0];
  const baseDir = path.join(__dirname, '..', 'archives');
  const hashLogPath = path.join(baseDir, 'hashlog.csv');
  fs.mkdirSync(baseDir, { recursive: true });

  reorganizeExisting(baseDir);

  let successCount = 0;
  for (const model of models) {
    const modelPeriods = livePeriods[`model_${model.model_number}`] || [];

    const period = modelPeriods.find((p) => p.status === 'active')
      ?? modelPeriods[modelPeriods.length - 1];

    if (!period) {
      console.warn(`${model.display_name}: no period data in live_periods.json — skipping.`);
      continue;
    }

    const dataUrl = `${BASE_URL}/static/s${model.strat_idx}_p${IPCODE_IDX}/live_performance_data_${period.start_date}.json`;
    const liveData = await fetchJson(dataUrl).catch((e) => {
      console.warn(`${model.display_name}: could not fetch performance data (${e.message}) — skipping.`);
      return null;
    });
    if (!liveData) continue;

    await takeSnapshot(browser, model, period, liveData, date, baseDir, hashLogPath);
    successCount++;
  }

  await browser.close();
  console.log(`Done. ${successCount}/${models.length} model(s) snapshotted.`);
})();
