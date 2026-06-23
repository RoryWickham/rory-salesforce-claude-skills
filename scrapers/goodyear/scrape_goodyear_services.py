"""
Goodyear Services feed scraper.
Discovers all service PDPs from the listing page, extracts data from JSON-LD,
and outputs a Retail Cloud-ready CSV.
"""

import asyncio
import csv
import json
import random
import re
from playwright.async_api import async_playwright

LISTING_URL = "https://www.goodyear.com/en-us/services/all-services"
BASE_URL = "https://www.goodyear.com"
OUTPUT = "/Users/rory.wickham/claude-projects/goodyearWork/goodyear_services_feed.csv"
CONCURRENCY = 5

OUT_HEADERS = [
    "id", "item_group_id", "title", "description",
    "link", "image_link", "additional_image_link",
    "product_type", "ProductClass", "manufacturer",
    "colorswatchurl", "size", "tax", "sale_price", "price",
    "CurrencyCode", "gtin",
]


def hires(url):
    if not url or "scene7.com" not in url:
        return url
    base = url.split("?")[0]
    return f"{base}?fmt=png-alpha&qlt=95&wid=800&resMode=sharp2"


def clean(val):
    return str(val or "").replace("\n", " ").replace("\r", " ").replace(",", " ").strip()


async def discover_services(page):
    print("Loading services listing page...")
    await page.goto(LISTING_URL, wait_until="domcontentloaded", timeout=60000)
    await page.wait_for_timeout(5000)

    links = await page.evaluate("""
        () => Array.from(document.querySelectorAll('a[href*="/services/"]'))
            .map(a => a.href)
            .filter(h => h.includes('goodyear.com') && /\\_\\d+/.test(h))
    """)
    seen = set()
    services = []
    for url in links:
        # Strip query params from URL
        clean_url = url.split("?")[0]
        if clean_url not in seen:
            seen.add(clean_url)
            product_id = clean_url.split("_")[-1]
            services.append({"id": product_id, "url": clean_url})

    print(f"Found {len(services)} services.")
    return services


async def scrape_pdp(context, service):
    page = await context.new_page()
    try:
        await page.goto(service["url"], wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(2000)

        data = await page.evaluate("""
            () => {
                // JSON-LD Service block
                let name = '', description = '', price = '';
                const scripts = document.querySelectorAll('script[type="application/ld+json"]');
                for (const s of scripts) {
                    try {
                        const d = JSON.parse(s.textContent);
                        if (d['@type'] === 'Service') {
                            name = d.name || '';
                            description = d.description || '';
                        }
                    } catch(e) {}
                }

                // Price
                const priceMatch = document.body.innerText.match(/\\$([\d,]+\\.\\d{2})/);
                price = priceMatch ? priceMatch[1] : '';

                // Primary product image — first non-blurred scene7 image
                const allImgs = Array.from(document.querySelectorAll('img'))
                    .filter(img => (img.src.includes('scene7') || img.src.includes('GoodyearSites'))
                        && !img.className.includes('blur')
                        && !img.src.includes('brand-logo'));
                const primarySrc = allImgs[0]?.src || '';
                const additionalImgs = allImgs.slice(1).map(img => img.src).filter(Boolean);

                return { name, description, price, primarySrc, additionalImgs };
            }
        """)

        image_link = hires(data["primarySrc"]) if data["primarySrc"] else ""
        additional_image_link = "|".join(
            hires(img) for img in list(dict.fromkeys(data["additionalImgs"])) if img
        )

        # Service prices require a store location to display — use demo defaults
        DEMO_PRICES = {
            "211141": "69.99",   # Oil Change
            "211129": "249.99",  # Brake Service & Repair
            "211119": "89.99",   # Wheel Alignment
            "211145": "24.99",   # Tire Rotation
            "211144": "29.99",   # Tire Repair
            "211130": "159.99",  # Battery Replacement
            "250026": "49.99",   # Seasonal Changeover
            "155212": "299.99",  # Shocks & Struts Service
            "155223": "0.00",    # Courtesy Tire & Maintenance Inspection (free)
            "155298": "189.99",  # Air Conditioning Service & Repair
            "155281": "99.99",   # Engine Diagnostic Service
            "155193": "19.99",   # Wheel Balancing Service
        }
        scraped_price = data["price"].replace(",", "") if data["price"] else ""
        price = scraped_price or DEMO_PRICES.get(service["id"], "")

        return {
            "id": service["id"],
            "item_group_id": service["id"],
            "title": clean(data["name"]),
            "description": clean(data["description"]),
            "link": service["url"],
            "image_link": image_link,
            "additional_image_link": additional_image_link,
            "product_type": "Services",
            "ProductClass": "Service",
            "manufacturer": "GOODYEAR",
            "colorswatchurl": "",
            "size": "One Size",
            "tax": "CLT",
            "sale_price": price,
            "price": price,
            "CurrencyCode": "USD",
            "gtin": str(random.randint(1000000, 9999999)),
        }

    except Exception as e:
        print(f"  ERROR scraping {service['url']}: {e}")
        return {
            "id": service["id"], "item_group_id": service["id"],
            "title": "", "description": "", "link": service["url"],
            "image_link": "", "additional_image_link": "",
            "product_type": "Services", "ProductClass": "Service",
            "manufacturer": "GOODYEAR", "colorswatchurl": "", "size": "One Size",
            "tax": "CLT", "sale_price": "", "price": "",
            "onlineinventory": str(random.randint(5, 500)), "CurrencyCode": "USD",
            "gtin": str(random.randint(1000000, 9999999)),
        }
    finally:
        await page.close()


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

        listing_page = await context.new_page()
        services = await discover_services(listing_page)
        await listing_page.close()

        print(f"\nScraping {len(services)} service PDPs ({CONCURRENCY} at a time)...\n")
        rows = []
        for i in range(0, len(services), CONCURRENCY):
            batch = services[i:i + CONCURRENCY]
            print(f"Scraping {i+1}-{min(i+len(batch), len(services))} of {len(services)}...")
            results = await asyncio.gather(*[scrape_pdp(context, s) for s in batch])
            rows.extend(results)

        await browser.close()
        return rows


def main():
    rows = asyncio.run(scrape_all())
    if not rows:
        print("No data found.")
        return

    with open(OUTPUT, "w", newline="\n", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUT_HEADERS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nSaved {len(rows)} rows to {OUTPUT}")


if __name__ == "__main__":
    main()
