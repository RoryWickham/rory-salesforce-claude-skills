# Mike's Bikes — Scrapers & Workers

Demo assets for the Mike's Bikes Retail Cloud demo (mikesbikes.com Shopify store).

## Scrapers

| File | What it does |
|---|---|
| `scrape_mikesbikes.py` | Scrapes bikes + apparel from Shopify collections API → `mikesbikes_feed.csv` |
| `scrape_mikesbikes_services.py` | Scrapes service menu from mikesbikes.com/pages/bike-services → `mikesbikes_services_feed.csv` |
| `generate_service_icons.py` | Generates category icon PNGs (Bootstrap Icons on Mike's Bikes blue #003282) |

## Workers / Tiles

| Folder | What it does | Live URL |
|---|---|---|
| `mikesbikes-icons-worker/` | Serves service category icons as base64-embedded PNGs | https://mikesbikes-icons.rory-wickham.workers.dev |
| `mikesbikes-service-desk-tile/` | POS tile — shows tech bay availability, assigns service, fires PunchOut AddToCart + GoToCart | https://mikesbikes-service-desk.rory-wickham.workers.dev |

## Feed columns

Merchandise feed: `id, item_group_id, title, description, link, image_link, additional_image_link, color, size, gtin, sale_price, price, product_class, product_type, brand, model_year, riding_style, bike_size, build_type`

Services feed: same schema + `AdditionalCharges` (10 on all rows — waste fee)

## Deploy

```bash
cd <worker-folder>
npx wrangler deploy
```
