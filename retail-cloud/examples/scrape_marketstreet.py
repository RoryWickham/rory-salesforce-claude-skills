"""
Market Street — Retail Cloud product feed scraper
Scrapes all categories, extracts data from JSON-LD on each PDP.
Output: ~/claude-projects/market-street/marketstreet_product_feed.csv
"""

import asyncio
import csv
import json
import random
import re
from playwright.async_api import async_playwright

BASE_URL = "https://marketstreet-production.sfdc-8tgtt5-ecom1.exp-delivery.com/MarketStreet/en-US"
ROOT_CATEGORIES = ["women", "men", "kids", "new-arrivals"]
OUTPUT = "/Users/rory.wickham/claude-projects/market-street/marketstreet_product_feed.csv"
CONCURRENCY = 5

HEADERS = [
    "id", "item_group_id", "title", "description",
    "link", "image_link", "additional_image_link",
    "product_type", "ProductClass", "manufacturer",
    "color", "size", "gtin", "sale_price", "price",
    "CurrencyCode", "onlineinventory",
]


def clean(val):
    return str(val or "").replace("\n", " ").replace("\r", " ").replace(",", " ").strip()


async def discover_all_categories(page, root_categories):
    """Recursively walk category pages to find all subcategories."""
    visited = set()
    all_categories = []

    async def crawl(category_slug):
        if category_slug in visited:
            return
        visited.add(category_slug)
        url = f"{BASE_URL}/category/{category_slug}"
        try:
            await page.goto(url, wait_until="networkidle")
            await page.wait_for_timeout(2000)

            # Find subcategory links on this page
            subcats = await page.evaluate(f"""
                () => Array.from(document.querySelectorAll('a[href*="/category/"]'))
                    .map(a => new URL(a.href).pathname.split('/category/')[1]?.split('?')[0])
                    .filter(s => s && s !== '{category_slug}')
            """)
            subcats = list(dict.fromkeys([s for s in subcats if s]))

            if subcats:
                for sub in subcats:
                    await crawl(sub)
            else:
                # Leaf category — no subcats, add it
                all_categories.append(category_slug)
                print(f"  Found leaf category: {category_slug}")
        except Exception as e:
            print(f"  Error crawling category {category_slug}: {e}")

    for root in root_categories:
        await crawl(root)

    # Also include roots that may have products directly
    for root in root_categories:
        if root not in all_categories:
            all_categories.append(root)

    return all_categories


async def get_product_ids_from_category(page, category):
    url = f"{BASE_URL}/category/{category}"
    await page.goto(url, wait_until="networkidle")
    await page.wait_for_timeout(3000)

    # Click "Load More" if present
    clicks = 0
    while True:
        try:
            btn = page.locator("button:has-text('Load More'), button:has-text('Show More')")
            if await btn.count() == 0:
                break
            await btn.first.scroll_into_view_if_needed()
            await btn.first.click()
            await page.wait_for_timeout(3000)
            clicks += 1
        except Exception:
            break

    links = await page.evaluate("""
        () => Array.from(document.querySelectorAll('a[href*="/product/"]'))
            .map(a => {
                const url = new URL(a.href);
                return url.pathname.split('/product/')[1]?.split('?')[0];
            })
            .filter(Boolean)
    """)
    unique = list(dict.fromkeys(links))
    print(f"  {category}: {len(unique)} products (Load More clicks: {clicks})")
    return unique, category


async def scrape_pdp(context, product_id, categories):
    page = await context.new_page()
    rows = []
    try:
        url = f"{BASE_URL}/product/{product_id}"
        await page.goto(url, wait_until="networkidle")
        await page.wait_for_timeout(2000)

        ld_raw = await page.evaluate("""
            () => {
                const scripts = document.querySelectorAll('script[type="application/ld+json"]');
                for (const s of scripts) {
                    try {
                        const d = JSON.parse(s.textContent);
                        if (d['@type'] === 'Product') return d;
                    } catch(e) {}
                }
                return null;
            }
        """)

        if not ld_raw:
            return rows

        name        = ld_raw.get("name", "")
        description = re.sub(r'<[^>]+>', '', ld_raw.get("description", ""))
        price       = ld_raw.get("offers", {}).get("price", "")
        images      = ld_raw.get("image", [])
        if isinstance(images, str):
            images = [images]

        image_url = images[0] if images else ""
        alt_image  = images[1] if len(images) > 1 else ""

        # Parse colors and sizes from additionalProperty
        colors = []
        sizes  = []
        for prop in ld_raw.get("additionalProperty", []):
            pname = prop.get("name", "").lower()
            pval  = prop.get("value", "")
            if "color" in pname:
                colors = [c.strip() for c in pval.split(",") if c.strip()]
            elif "size" in pname:
                sizes = [s.strip() for s in pval.split(",") if s.strip()]

        # If no colors from additionalProperty, try top-level color field
        if not colors and ld_raw.get("color"):
            colors = [ld_raw["color"]]
        if not colors:
            colors = [""]
        if not sizes:
            sizes = ["One Size"]

        for color in colors:
            # Per-color images: JSON-LD images array includes all color variants
            # Try to find color-specific images by matching color slug in URL
            color_slug = color.lower().replace(" ", "-").replace("/", "-")
            color_imgs = [img for img in images if color_slug in img.lower()] if color else images
            if not color_imgs:
                color_imgs = images
            c_image_url = color_imgs[0] if color_imgs else image_url
            c_alt_image = "|".join(color_imgs[1:]) if len(color_imgs) > 1 else alt_image

            for size in sizes:
                if color and size and size != "One Size":
                    variant_id = f"{product_id}-{color.lower().replace(' ', '-')}-{size.lower()}"
                elif color:
                    variant_id = f"{product_id}-{color.lower().replace(' ', '-')}"
                elif size and size != "One Size":
                    variant_id = f"{product_id}-{size.lower()}"
                else:
                    variant_id = product_id

                rows.append({
                    "id":                   clean(variant_id),
                    "item_group_id":        clean(product_id),
                    "title":                clean(name),
                    "description":          clean(description),
                    "link":                 url,
                    "image_link":           c_image_url,
                    "additional_image_link": c_alt_image,
                    "product_type":         clean("|".join(categories)),
                    "ProductClass":         "Merchandise",
                    "manufacturer":         "Market Street",
                    "color":                clean(color),
                    "size":                 clean(size),
                    "gtin":                 str(random.randint(1000000, 9999999)),
                    "sale_price":           clean(price),
                    "price":                clean(price),
                    "CurrencyCode":         "USD",
                    "onlineinventory":      str(random.randint(5, 500)),
                })

    except Exception as e:
        print(f"  ERROR {product_id}: {e}")
    finally:
        await page.close()

    return rows


async def scrape_all():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            channel="chrome",
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 900},
        )
        await context.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

        # Recursively discover all categories then collect product IDs
        listing_page = await context.new_page()
        print("Discovering all categories (recursive)...")
        all_categories = await discover_all_categories(listing_page, ROOT_CATEGORIES)
        print(f"Total categories found: {len(all_categories)}\n")

        product_map = {}  # product_id -> list of categories
        for cat in all_categories:
            ids, category = await get_product_ids_from_category(listing_page, cat)
            for pid in ids:
                if pid not in product_map:
                    product_map[pid] = []
                if category not in product_map[pid]:
                    product_map[pid].append(category)
        await listing_page.close()

        product_ids = list(product_map.keys())
        print(f"\nTotal unique products: {len(product_ids)}")

        all_rows = []
        for i in range(0, len(product_ids), CONCURRENCY):
            batch = product_ids[i:i + CONCURRENCY]
            print(f"Scraping {i+1}-{min(i+len(batch), len(product_ids))} of {len(product_ids)}...")
            results = await asyncio.gather(*[scrape_pdp(context, pid, product_map[pid]) for pid in batch])
            for rows in results:
                all_rows.extend(rows)

        await browser.close()
        print(f"\nTotal variant rows: {len(all_rows)}")
        return all_rows


def main():
    rows = asyncio.run(scrape_all())
    if not rows:
        print("No data found.")
        return

    with open(OUTPUT, "w", newline="\n", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=HEADERS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    print(f"Saved to {OUTPUT}")


if __name__ == "__main__":
    main()
