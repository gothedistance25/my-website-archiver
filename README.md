# Daily Screenshot Archiver

This GitHub Action uses Puppeteer to take a full-page screenshot of [https://www.mystockalgo.com](https://www.mystockalgo.com) every day, rendering all JavaScript. Screenshots are saved in `/archives`, and each is logged with a SHA256 hash for integrity verification.

### Files:
- `archives/archive_YYYY-MM-DD.png` – Daily screenshot
- `archives/hashlog.csv` – Date + filename + SHA256 hash

### Automation:
Runs daily at 7:00 UTC via GitHub Actions.
