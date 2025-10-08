# Daily Screenshot Archiver

This GitHub Action uses Puppeteer to take full-page screenshots of multiple pages from [https://www.mystockalgo.com](https://www.mystockalgo.com) every day, rendering all JavaScript. Screenshots are saved in [/archives](cci:7://file:///c:/Users/david/my-website-archiver/archives:0:0-0:0), and each is logged with a SHA256 hash for integrity verification.

### Pages Captured:
- **Model No. 1**: `https://www.mystockalgo.com/?model=model_1`
- **Model No. 2**: `https://www.mystockalgo.com/?model=model_2`

### Files:
- `archives/archive_model-1_YYYY-MM-DD.png` – Daily screenshot of Model 1
- `archives/archive_model-2_YYYY-MM-DD.png` – Daily screenshot of Model 2
- `archives/hashlog.csv` – Date + model name + filename + SHA256 hash

### Automation:
Runs daily at 7:00 UTC via GitHub Actions.