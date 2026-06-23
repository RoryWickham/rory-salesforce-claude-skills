import asyncio
import csv
import random
from playwright.async_api import async_playwright

LISTING_URL = "https://www.goodyear.com/en-us/signature-shop/signature-merchandise"
BASE_URL = "https://www.goodyear.com"
OUTPUT = "/Users/rory.wickham/claude-projects/goodyearWork/goodyear_merch_feed.csv"
CONCURRENCY = 5

OUT_HEADERS = [
    "id", "item_group_id", "title", "description",
    "link", "image_link", "additional_image_link",
    "product_type", "ProductClass", "manufacturer", "color", "colorswatchurl",
    "size", "tax", "sale_price", "price", "onlineinventory", "CurrencyCode", "gtin",
    "ProductRecommendations",
]


def hires(url):
    if not url or "scene7.com" not in url:
        return url
    base = url.split("?")[0]
    return f"{base}?fmt=png-alpha&qlt=95&wid=800&resMode=sharp2"


async def scrape_listing(page):
    print("Loading merchandise listing page...")
    await page.goto(LISTING_URL, wait_until="domcontentloaded", timeout=60000)
    await page.wait_for_timeout(5000)

    clicks = 0
    while True:
        try:
            load_more = page.locator("button:has-text('Load More')")
            if await load_more.count() == 0:
                break
            clicks += 1
            print(f"Loading more products... (click {clicks})")
            await load_more.first.scroll_into_view_if_needed()
            await load_more.first.click()
            await page.wait_for_timeout(3000)
        except Exception as e:
            print(f"Load More stopped: {e}")
            break

    print("Extracting listing links...")
    links = await page.query_selector_all('a[href*="/en-us/signature-shop/"]')
    seen = set()
    products = []
    for link in links:
        href = await link.get_attribute("href")
        if href and "Master" in href and href not in seen:
            seen.add(href)
            url = href if href.startswith("http") else BASE_URL + href
            product_id = href.split("_Master-")[-1] if "_Master-" in href else href.split("/")[-1]
            name_slug = href.split("/")[-1].split("_Master-")[0].replace("-", " ").title()
            products.append({"productId": product_id, "name": name_slug, "url": url})

    return products


async def scrape_pdp(context, product):
    page = await context.new_page()
    try:
        await page.goto(product["url"], wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(2500)

        try:
            specs_btn = page.locator('button:has-text("Specs")')
            if await specs_btn.count() > 0:
                await specs_btn.first.click()
                await page.wait_for_timeout(500)
        except Exception:
            pass

        data = await page.evaluate("""
            () => {
                const titleEl = document.querySelector('h1');
                const title = titleEl?.innerText?.trim() || '';

                const priceText = document.body.innerText || '';
                const priceMatch = priceText.match(/\\$([\d,]+\\.\\d{2})/);
                const price = priceMatch ? priceMatch[1] : '';

                let description = '';
                const scripts = document.querySelectorAll('script[type="application/ld+json"]');
                for (const s of scripts) {
                    try {
                        const data = JSON.parse(s.textContent);
                        if (data.description) { description = data.description; break; }
                    } catch(e) {}
                }

                // Grab ALL scene7 images
                const imgs = Array.from(document.querySelectorAll('img[src*="scene7"], img[src*="GoodyearSites"]'))
                    .map(img => img.src)
                    .filter(Boolean);

                const colorFromTitle = title.includes(' - ') ? title.split(' - ').pop().trim() : '';
                const colors = colorFromTitle ? [colorFromTitle] : [];

                const sizeEls = document.querySelectorAll('[data-qa-id^="ProductDetails-product-variants-variant-option-"]');
                const sizes = Array.from(sizeEls).map(el => el.innerText?.trim().replace(/^Unavailable\\s*/i, '').trim()).filter(Boolean);

                return { title, price, description, imgs, colors, sizes };
            }
        """)

        title = data["title"] or product["name"]
        price = data["price"].replace(",", "")
        description = data["description"].replace(",", "").replace("\n", " ").replace("\r", "")
        pid = product["productId"]
        imgs = [hires(img) for img in data["imgs"] if pid in img]
        # Deduplicate while preserving order
        seen_imgs = []
        for img in imgs:
            if img not in seen_imgs:
                seen_imgs.append(img)
        imgs = seen_imgs
        image_link = imgs[0] if imgs else ""
        additional_image_link = "|".join(imgs[1:]) if len(imgs) > 1 else ""

        colors = data["colors"] or [""]
        sizes = data["sizes"] or ["One Size"]
        has_sizes = bool(data["sizes"])

        variants = []
        for color in colors:
            for size in sizes:
                if has_sizes and size.lower() != "one size":
                    variant_id = f"{product['productId']}-{size.replace(' ', '')}"
                else:
                    variant_id = product["productId"]
                variants.append({
                    "id": variant_id,
                    "item_group_id": product["productId"],
                    "title": title.replace(",", ""),
                    "description": description,
                    "link": product["url"],
                    "image_link": image_link,
                    "additional_image_link": additional_image_link,
                    "color": color,
                    "colorswatchurl": "",
                    "size": size,
                    "tax": "CLT",
                    "gtin": str(random.randint(1000000, 9999999)),
                    "sale_price": price,
                    "price": price,
                    "onlineinventory": str(random.randint(5, 500)),
                    "CurrencyCode": "USD",
                    "product_type": "Apparel",
                    "ProductClass": "Merchandise",
                    "manufacturer": "GOODYEAR",
                    "ProductRecommendations": "211119|GOY24104V",
                })

        return variants if variants else [{
            "id": product["productId"],
            "item_group_id": product["productId"],
            "title": title.replace(",", ""),
            "description": description,
            "link": product["url"],
            "image_link": image_link,
            "additional_image_link": additional_image_link,
            "color": "",
            "colorswatchurl": "",
            "size": "One Size",
            "tax": "CLT",
            "gtin": str(random.randint(1000000, 9999999)),
            "sale_price": price,
            "price": price,
            "onlineinventory": str(random.randint(5, 500)),
            "CurrencyCode": "USD",
            "product_type": "Apparel",
            "ProductClass": "Merchandise",
            "manufacturer": "GOODYEAR",
            "ProductRecommendations": "211119|GOY24104V",
        }]

    except Exception as e:
        print(f"  ERROR scraping {product['url']}: {e}")
        return [{
            "id": product["productId"], "item_group_id": product["productId"],
            "title": product["name"], "description": "", "link": product["url"],
            "image_link": "", "additional_image_link": "", "color": "", "size": "One Size",
            "gtin": str(random.randint(1000000, 9999999)),
            "sale_price": "", "price": "", "product_type": "Apparel",
            "ProductClass": "Merchandise", "ProductRecommendations": "211119|GOY24104V",
        }]
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
        products = await scrape_listing(listing_page)
        await listing_page.close()

        print(f"\nFound {len(products)} products. Fetching PDPs ({CONCURRENCY} at a time)...\n")

        all_variants = []
        for i in range(0, len(products), CONCURRENCY):
            batch = products[i:i + CONCURRENCY]
            print(f"Scraping products {i+1}-{min(i+len(batch), len(products))} of {len(products)}...")
            batch_results = await asyncio.gather(*[scrape_pdp(context, prod) for prod in batch])
            for variant_list in batch_results:
                all_variants.extend(variant_list)

        await browser.close()
        print(f"\nTotal variants: {len(all_variants)}")
        return all_variants


async def main():
    variants = await scrape_all()
    if not variants:
        print("No data found.")
        return

    with open(OUTPUT, "w", newline="\n", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUT_HEADERS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(variants)

    print(f"Written {len(variants)} rows to {OUTPUT}")


asyncio.run(main())
