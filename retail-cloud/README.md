# Retail Cloud Skills

Skills for [Salesforce Retail Cloud (Predict Spring)](https://www.salesforce.com/products/retail-cloud/) demos and implementations.

## Skills

### `retail-cloud-scrape`

Scrapes a retail website and generates a properly formatted Retail Cloud product import CSV.

**Invoke:** `/salesforce/retail-cloud/retail-cloud-scrape`

**What it does:**
- Detects site type (Shopify, Salesforce PWA Kit, custom SPA, or static HTML) and chooses the right scraping approach
- Offers single-category or full-site scraping
- Recursively walks subcategory navigation to find all leaf-level categories
- Deduplicates products that appear in multiple categories; pipe-joins all category names into `product_type`
- Generates a CSV ready to import directly into Retail Cloud

**Output columns:**
`id, item_group_id, title, description, link, image_link, additional_image_link, color, size, gtin, sale_price, price, ProductClass, manufacturer, product_type, CurrencyCode, onlineinventory`

**Requirements:**
- Python 3
- `playwright` (`pip3 install playwright && playwright install chromium`) — only needed for JS-rendered sites
- `curl` — used for static/Shopify sites

## Examples

`examples/scrape_marketstreet.py` — Playwright scraper for the Market Street Salesforce PWA Kit demo storefront.
