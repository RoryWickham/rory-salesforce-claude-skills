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

### `retail-cloud-clienteling-panels`

Recolors the three Retail Cloud clienteling layout background panel images (LeftPanel, CenterPanel, RightPanel) from black to a brand hex color. Source panel assets (456×222px rounded-rectangle shapes) are bundled in this skills repo.

**Invoke:** `/salesforce/retail-cloud/retail-cloud-clienteling-panels`

**What it does:**
- Takes a target brand hex color and output folder
- Replaces all black pixels in the bundled source panels with the target color
- Outputs `LeftPanel<hex>.png`, `CenterPanel<hex>.png`, `RightPanel<hex>.png` ready to upload to Retail Cloud CMS

**Requirements:**
- Python 3
- `Pillow` (`pip3 install Pillow`)

### `retail-cloud-color-swatch`

Generates a hosted solid-color PNG swatch image from a hex code, ready to paste as a product image URL in Retail Cloud.

**Invoke:** `/salesforce/retail-cloud/retail-cloud-color-swatch`

**What it does:**
- Takes a hex color code and returns a direct image URL (no upload needed)
- Images served from a live Cloudflare Worker at `color-swatches.rory-wickham.workers.dev`
- Optional `?size=` param (16–500px, default 100)
- Works for single colors or bulk lists

**Requirements:**
- None — worker is already deployed

## Examples

`examples/scrape_marketstreet.py` — Playwright scraper for the Market Street Salesforce PWA Kit demo storefront.
