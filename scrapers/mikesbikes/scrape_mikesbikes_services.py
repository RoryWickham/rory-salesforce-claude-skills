import csv
import re
import random
from playwright.sync_api import sync_playwright

OUTPUT = "/Users/rory.wickham/claude-projects/mikesbikes/mikesbikes_services_feed.csv"

OUT_HEADERS = [
    "id", "title", "description", "price", "product_class", "product_type",
]

def clean(text):
    return re.sub(r'\s+', ' ', text).replace("&amp;", "&").replace("&nbsp;", " ").strip()

def scrape():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 900}
        )
        page.goto("https://mikesbikes.com/pages/bike-services", timeout=30000, wait_until="commit")
        page.wait_for_timeout(4000)
        html = page.content()
        browser.close()

    services = []

    # --- Tune-up packages (no fixed price — dynamic per location) ---
    pkg_pattern = r'((?:COMP|PRO|SUPER) TUNE-UP)\s+SEE AVAILABILITY FOR PRICING\s+(.*?)(?=(?:COMP|PRO|SUPER) TUNE-UP|INDIVIDUAL REPAIR|$)'
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'\s+', ' ', text)

    for m in re.finditer(pkg_pattern, text, re.DOTALL | re.I):
        title = clean(m.group(1).title())
        desc = clean(m.group(2))
        # Trim description at "What's included?" and keep the intro sentence
        intro = re.match(r'^(.*?)\s*(?:What\'s included|•)', desc)
        description = clean(intro.group(1)) if intro else desc[:200]
        services.append({
            "id": str(random.randint(1000000, 9999999)),
            "title": title,
            "description": description,
            "price": "",
            "product_class": "Service",
            "product_type": "SERVICES/TUNE-UPS",
        })

    print(f"Tune-up packages found: {len(services)}")

    # --- Individual repair services (Tables 5–8 — have real prices) ---
    tables = re.findall(r'<table[^>]*>(.*?)</table>', html, re.DOTALL | re.I)
    repair_services = []
    for table in tables:
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', table, re.DOTALL | re.I)
        for row in rows:
            tds = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL | re.I)
            tds = [clean(re.sub(r'<[^>]+>', '', td)) for td in tds]
            # Must have exactly 2 cells: name + price starting with $
            if len(tds) == 2 and tds[1].startswith("$") and tds[0]:
                repair_services.append((tds[0], tds[1]))

    # Deduplicate (same service appears in multiple columns)
    seen = set()
    for name, price in repair_services:
        key = name.lower()
        if key not in seen:
            seen.add(key)
            # Extract first price if format is "$30 / $40"
            first_price = re.search(r'\$[\d.]+', price)
            services.append({
                "id": str(random.randint(1000000, 9999999)),
                "title": name,
                "description": "",
                "price": first_price.group(0).replace("$", "") if first_price else "",
                "product_class": "Service",
                "product_type": "SERVICES/REPAIR",
            })

    print(f"Individual repair services found: {len(seen)}")
    print(f"Total services: {len(services)}")

    with open(OUTPUT, "w", newline="\n", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUT_HEADERS)
        writer.writeheader()
        writer.writerows(services)

    print(f"Written to {OUTPUT}")
    print("\n--- Sample rows ---")
    for row in services[:5]:
        print(f"  {row['title'][:40]:40} | price={row['price']:8} | type={row['product_type']}")

scrape()
