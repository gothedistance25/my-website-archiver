# Daily Screenshot Archiver

This project uses Puppeteer to capture daily live portfolio snapshots for all active models on [mystockalgo.com](https://www.mystockalgo.com). For each model, it fetches live performance data from the Fly.io backend API, renders it as an HTML portfolio card, and screenshots the result. Screenshots and raw data are saved to `/archives`, and each file is logged with a SHA256 hash for integrity verification.

The backend is hosted on [Fly.io](https://fly.io) and deploys automatically via the native Fly GitHub integration on every push to `main`.

### What Gets Captured:
All active models are fetched dynamically from the registry. For each model, one PNG and one JSON snapshot are saved per day.

### Files:
- `archives/YYYY/MM/archive_model-N_YYYY-MM-DD.png` – Daily portfolio card screenshot
- `archives/YYYY/MM/archive_model-N_YYYY-MM-DD.json` – Raw performance data snapshot
- `archives/hashlog.csv` – Date + model name + filename + SHA256 hash (one row per file)

### Automation:
Runs daily at 7:00 UTC.

### Deployment:
Hosted on Fly.io. Deploys automatically on push to `main` via the Fly GitHub app.
