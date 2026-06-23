# Goodyear — Scrapers & Workers

Demo assets for the Goodyear Retail Cloud demo.

## Scrapers

| File | What it does |
|---|---|
| `scrape_goodyear.py` | Scrapes tire catalog → raw data (requires anti-detection: real Chrome, hide navigator.webdriver) |
| `scrape_goodyear_merch.py` | Scrapes merch (hoodies, hats, etc.) |
| `scrape_goodyear_services.py` | Scrapes service catalog (12 services incl. oil change) |
| `convert_goodyear_to_feed.py` | Converts scraped data → Retail Cloud feed CSV format |
| `add_fitment.py` | Adds FitmentYear/Make/Model data to tire feed |
| `fill_fitment.py` | Fills gaps in fitment data |
| `fill_recommendations.py` | Populates ProductRecommendations and addOnSKU fields |

## Workers / Tiles

| Folder | What it does | Live URL |
|---|---|---|
| `vin-lookup-worker/` | POS tile — VIN lookup, shows vehicle details + service history, assigns bay & technician | https://vin-lookup.rory-wickham.workers.dev |

## Anti-detection (required for goodyear.com scraping)

Goodyear.com blocks headless Chromium. Scrapers must use:
- `channel="chrome"` (real Chrome binary)
- `--disable-blink-features=AutomationControlled`
- `add_init_script` to hide `navigator.webdriver`

## Deploy

```bash
cd <worker-folder>
npx wrangler deploy
```
