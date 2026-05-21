---
description: Scrape a website and generate a Retail Cloud (Predict Spring) product import CSV. Use when the user wants to scrape products from a website and create an import file for Retail Cloud.
---

# Retail Cloud Product Feed Scraper

This skill guides you through scraping a website and generating a properly formatted Retail Cloud (Predict Spring) product import CSV.

## Step 1 — Get the target URL

Ask the user: "What is the URL of the site you want to scrape?"

Once they provide it, say: "Great. How would you like to proceed?

1. **Single category first** — recommended if this is the first time scraping this site. I'll scrape one category to make sure everything looks right before going further. Do you have a category in mind, or would you like me to suggest one based on the site's navigation?
2. **Full site** — I'll crawl the home page navigation to discover all categories and scrape everything in one go.

Which would you prefer?"

- If they choose a single category: scrape that category only, verify output, then ask if they want to continue with the rest of the site
- If they choose full site: crawl the home page to discover all navigable category URLs, then **recursively follow subcategory links** from each category page to build a complete list of all leaf-level category URLs. Deduplicate product URLs across all categories before scraping PDPs — a product that appears in multiple categories should only be scraped once. Combine all results into a single output file.

## Step 2 — Column template

Tell the user: "I'll use the standard Retail Cloud column set as the template. If you have your own import file you'd like to use instead, share the file path and I'll use that."

- If they provide a file: read it and use its headers as the output columns
- If not: use the following default column set:
  `id, item_group_id, title, description, link, image_link, additional_image_link, color, size, gtin, sale_price, price, ProductClass, manufacturer, product_type, CurrencyCode, onlineinventory`

## Step 3 — Field customizations

Tell the user the following defaults up front:
- **gtin** will be auto-populated with a random 7-digit number if the site doesn't provide one
- **ProductClass** will be set to `Merchandise` unless they'd like something different
- **onlineinventory** will be set to a random number between 5 and 500 per variant — does that work, or would you prefer a fixed value or a different range?

Then ask:
1. "Would you like to change any of those defaults?"
2. "Are there any other fields to hardcode with a fixed value? (e.g. `manufacturer = 'Nike'`, `CurrencyCode = 'USD'`)"
3. "Are there any specific fields from the product page you want captured? (e.g. material, weight, brand, category breadcrumb)"

- If they provide a fixed inventory value: use that value for all rows
- If they provide a range: use `random.randint(min, max)` per variant row
- If they confirm the default: use `random.randint(5, 500)` per variant row

## Step 4 — Assess the site and build the scraper

Before writing any scraper code, investigate how the site is structured:

1. **Check if it's Shopify first** — look for `/collections/[name]/products.json?limit=250&page=1` which returns all product and variant data as clean JSON with no scraping needed. Page through until fewer than 250 results are returned. This is the fastest and most reliable approach for Shopify stores.
2. **Check if it's a Salesforce PWA Kit / Storefront Next site** — signs: `/mobify/bundle/` in asset URLs, org ID like `f_ecom_zzrf_041` in HTML source, `/MarketStreet/en-US/` style path prefix. These are JS-rendered React apps but product data is fully embedded as JSON-LD in each PDP's HTML — no API interception needed. Use Playwright to render the page, then extract `<script type="application/ld+json">` with `@type: Product`. The JSON-LD contains name, description, price, all images, colors, and sizes. Category pages render product links you can collect with Playwright; SCAPI proxy endpoints (`/mobify/proxy/api/...`) are not publicly accessible.
3. **Check for a first-party JSON API** — if the site is a React/Vue/Angular SPA (the HTML is just a `<div id="root"></div>` shell), download the main JS bundle and search it for a fetch wrapper and API base URL. Look for patterns like `fetch(baseUrl + "/products")`, `axios.get("/api/catalog")`, or a constant like `const API_BASE = "/api"`. Many custom storefronts expose clean REST endpoints (`/api/products`, `/api/products/:id`, `/api/categories`) that return all product and variant data in one call — no scraping needed. Test candidate endpoints directly with curl.
4. **Check for a sitemap next** — try `/sitemap.xml` then `/sitemap_index.xml`. If found, use it to get product URLs rather than scraping category pages (which are often bot-protected).
5. **Test if PDPs are accessible via plain HTTP** — even if category pages return 429, individual product pages often load fine with a standard User-Agent. Use `curl -s -o /dev/null -w "%{http_code}"` to check.
6. **Prefer curl over Playwright** — Python 3.9 has SSL issues with aiohttp. Use `subprocess` calls to curl + `concurrent.futures.ThreadPoolExecutor` for concurrency instead. Only fall back to Playwright if the page requires JavaScript to render product data.
7. **Look for embedded JSON data** — most modern sites embed product data as JSON in the HTML. Check for:
   - `<script type="application/ld+json">` blocks (JSON-LD) — usually has name, price, description, image, productID, and for PWA Kit sites: full color/size arrays in `additionalProperty`
   - JS variable assignments like `masterData = {...}` or `app.product.data.cache[...] = {...}` — often has full variant data (color, size, UPC/GTIN)
   - `window.__STATE__` or similar SSR data blobs

Write a Python scraper (`scrape_[sitename].py`) in `~/claude-projects/[sitename]/` that:
- Gets product URLs from the sitemap (preferred) or listing pages
- If crawling category pages: recursively follow subcategory links from each category page to reach all leaf-level categories. Track **all categories each product appears in** (a product can belong to multiple categories). Deduplicate product URLs before scraping — each product should only be scraped once. Write `product_type` as a pipe-separated list of all category names the product belongs to (e.g. `"women|new-arrivals"`).
- If using a listing page: clicks "Load More" buttons until all products are loaded, using a fixed `wait_for_timeout(3000)` after each click — do NOT use `wait_for_load_state("networkidle")` as it times out
- Scrapes each PDP concurrently (CONCURRENCY = 10 for curl-based, 5 for Playwright)
- For curl-based scrapers: use `subprocess.run(["curl", "-s", "--max-time", "30", url] + HEADERS, ...)` with `ThreadPoolExecutor`
- Saves output directly to CSV (or raw data to Excel if a separate conversion step is needed)
- Use `%2C` not `,` in image URLs — bare commas in URLs cause CSV column mismatches when the field isn't quoted

Run the scraper. Verify the product count looks complete before proceeding.

## Step 5 — Image URLs

For alternate images:
- **If data comes from JSON-LD**: the `image` array already contains all available images. Use `images[0]` as `imageURL` and pipe-join `images[1:]` into `AlternateImageURL`. No discovery needed. For multi-color products, filter images by color slug in the URL to get per-color image sets.
- **If images must be discovered**: try incrementing a suffix (e.g. `ALT100`, `ALT110`, `ALT120`...) with HEAD/GET requests to find which exist.
- Put multiple alternate image URLs pipe-separated (`|`) in the `AlternateImageURL` / `additional_image_link` field
- Make sure image URLs don't contain bare commas — encode as `%2C`

## Step 6 — Build and run the conversion script (if needed)

If the scraper outputs raw data (Excel), write a conversion script (`convert_[sitename]_to_feed.py`) in `~/claude-projects` that:
- Reads the raw file
- Maps scraped fields to the output column template
- Strips ALL commas and newlines from every text field (these cause `feed.entry.size.mismatch` errors on import)
- Removes any rows where SalePrice or ListPrice is blank
- Outputs a CSV file (`[sitename]_product_feed.csv`) in `~/claude-projects`

Run the conversion script.

## Step 7 — Verify the output

Do a spot check:
- Confirm total line count = 1 header + N data rows (no embedded newlines breaking rows)
- Confirm no fields contain commas
- Print a sample of 5 rows showing key fields (ID, Title, Color, Size, SalePrice)

Report the results to the user and confirm the file is ready to import.

If any custom fields were added beyond the standard column set, remind the user:
> "You have custom fields in this feed. To make them visible on the PDP in Retail Cloud, go to **CMS → Field Mapping** and map each custom field to one of the available **CustomString** fields (e.g. CustomString1, CustomString2, etc.)."

## Step 8 — Next steps

Ask the user: "The file is ready to import. Would you like to scrape another category, or shall we go ahead and try scraping all categories at once?"

- If another category: repeat from Step 1 with the new category URL
- If all categories: update the scraper to loop through all navigable storefront categories and combine into a single output file

## Critical rules

- This skill is for **Retail Cloud (Predict Spring) imports ONLY** — not B2B Commerce, B2C Commerce, or any other platform
- Always strip commas AND newlines from all text fields — both cause `feed.entry.size.mismatch` on import
- Always remove blank-price rows
- Output must be CSV, not Excel
- Never use bare commas in URLs — encode as `%2C`
- After the scraper runs, always verify the product count looks complete before proceeding to conversion
- If Playwright or openpyxl are not installed, install them with pip3 before running
- Category pages protected by Cloudflare/Kasada often return 429 — try individual PDPs and sitemaps instead
