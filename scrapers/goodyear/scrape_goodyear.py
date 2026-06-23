import asyncio
import csv
from playwright.async_api import async_playwright

LISTING_URL = "https://www.goodyear.com/en-us/tires/all-tires"
BASE_URL = "https://www.goodyear.com"
CONCURRENCY = 5  # PDPs to scrape in parallel


async def scrape_listing(page):
    print("Loading listing page...")
    await page.goto(LISTING_URL, wait_until="domcontentloaded", timeout=60000)
    await page.wait_for_timeout(2000)

    clicks = 0
    while True:
        try:
            load_more = page.locator("button:has-text('Load More')")
            if await load_more.count() == 0:
                break
            clicks += 1
            print(f"Loading more tires... (click {clicks})")
            await load_more.first.scroll_into_view_if_needed()
            await load_more.first.click()
            await page.wait_for_timeout(3000)
        except Exception as e:
            print(f"Load More stopped: {e}")
            break

    print("Extracting listing data...")
    return await page.evaluate("""
        (BASE_URL) => {
            const items = [];
            const titleLinks = document.querySelectorAll('a[data-qa-id^="ProductListing-ProductCard-card-title"]');

            titleLinks.forEach(titleLink => {
                const card = titleLink.closest('[data-product-id]');
                const productId = card?.getAttribute('data-product-id') || '';
                const name = titleLink.querySelector('h2')?.innerText?.trim() || titleLink.innerText?.trim() || '';
                const path = titleLink.getAttribute('href') || '';
                const url = path.startsWith('http') ? path : BASE_URL + path;
                const brand = titleLink.previousElementSibling?.innerText?.trim() || 'Goodyear';

                // Main listing image (highest res from srcset)
                const img = card?.querySelector('img[data-qa-id^="ProductListing-ProductCard-card-image"]') ||
                            titleLink.closest('[class*="flex"]')?.querySelector('img');
                const srcset = img?.getAttribute('srcset') || '';
                let listingImageUrl = img?.getAttribute('src') || '';
                if (srcset) {
                    const largest = srcset.split(',').map(s => s.trim()).reduce((best, entry) => {
                        const parts = entry.split(' ');
                        const w = parseInt(parts[1]) || 0;
                        return w > best.width ? { url: parts[0], width: w } : best;
                    }, { url: '', width: 0 });
                    if (largest.url) listingImageUrl = largest.url;
                }

                // Tags
                const tagEls = card?.querySelectorAll('[data-qa-id^="tag-label"]') || [];
                const tags = Array.from(tagEls).map(t => t.getAttribute('title') || t.innerText.trim()).filter(Boolean);
                const warranty = tags.find(t => /warranty/i.test(t)) || '';
                const season = tags.find(t => /season|summer|winter/i.test(t)) || '';
                const categories = tags.filter(t => !/warranty/i.test(t) && !/season|summer|winter/i.test(t)).join(', ');

                // Promo
                const promoEl = card?.querySelector('[data-qa-id="callout-message"] p');
                const promo = promoEl?.innerText?.trim() || '';

                if (name) {
                    items.push({ productId, brand, name, warranty, season, categories, promo, listingImageUrl, url });
                }
            });

            return items;
        }
    """, BASE_URL)


async def scrape_pdp(context, tire):
    page = await context.new_page()
    variants = []
    try:
        await page.goto(tire['url'], wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(2500)

        # Grab master-level fields (same across all variants)
        master = await page.evaluate("""
            () => {
                // Thumbnail images (all angles)
                const thumbImgs = Array.from(document.querySelectorAll('[data-qa-id^="product-thumbnail-image"]'))
                    .map(img => img.src).filter(Boolean);

                // Features
                const featureBlocks = document.querySelectorAll('[data-qa-id^="ProductFeature-TwoThreeFourColumnContainer-small-content-block"]');
                const features = Array.from(featureBlocks).map(block => {
                    const title = block.querySelector('h3, h4, strong, b, [class*="heading"]')?.innerText?.trim() || '';
                    const desc = block.innerText?.trim() || '';
                    return title ? `${title}: ${desc.replace(title, '').trim()}` : desc;
                }).filter(Boolean);

                // Warranties
                const warrantyBlocks = document.querySelectorAll('[data-qa-id^="ProductWarranty-TwoThreeFourColumnContainer-small-content-block"]');
                const warranties = Array.from(warrantyBlocks).map(block => {
                    const title = block.querySelector('h3, h4, strong, b, [class*="heading"]')?.innerText?.trim() || '';
                    const desc = block.innerText?.trim() || '';
                    return title ? `${title}: ${desc.replace(title, '').trim()}` : desc;
                }).filter(Boolean);

                // Price range
                const priceRangeEl = document.querySelector('[data-qa-id="price-range-section"]');
                const priceRangeText = priceRangeEl?.innerText?.trim() || '';
                const priceRangeMatch = priceRangeText.match(/\$[\d,]+\.\d{2}\s*-\s*\$[\d,]+\.\d{2}/);
                const priceRange = priceRangeMatch ? priceRangeMatch[0] : '';

                // All rim diameters available
                const rimEls = document.querySelectorAll('[data-qa-id^="product-specification-rim-diameters-variant-option"]');
                const rimDiameters = Array.from(rimEls).map(el => el.innerText.trim().replace(/^Unavailable\s*/i, '').trim()).filter(Boolean);

                return {
                    thumbImages: thumbImgs.join(' | '),
                    features: features.join(' | '),
                    warranties: warranties.join(' | '),
                    priceRange,
                    rimDiameters,
                };
            }
        """)

        # Click each rim diameter and collect sizes + price for each
        for rim in master['rimDiameters']:
            try:
                rim_label = page.locator(f'[data-qa-id="product-specification-rim-diameters-variant-option-{rim}"]')
                await rim_label.click()
                await page.wait_for_timeout(800)

                sizes = await page.evaluate("""
                    () => {
                        const sizeEls = document.querySelectorAll('[data-qa-id^="product-specification-tire-sizes-variant-option"]');
                        return Array.from(sizeEls).map(el => {
                            // Strip "Unavailable" prefix and whitespace that appears on out-of-stock sizes
                            return el.innerText.trim().replace(/^Unavailable\\s*/i, '');
                        }).filter(Boolean);
                    }
                """)

                for size in sizes:
                    try:
                        safe_size = size.replace('/', '-')
                        size_label = page.locator(f'[data-qa-id="product-specification-tire-sizes-variant-option-{size}"]')
                        await size_label.click()
                        await page.wait_for_timeout(600)

                        price = await page.evaluate("""
                            () => {
                                const priceContainer = document.querySelector('[data-qa-id="unqualified-product-information-container"]');
                                const priceText = priceContainer?.innerText || '';
                                const priceMatch = priceText.match(/\$([\d,]+\.\d{2})/);
                                return priceMatch ? '$' + priceMatch[1] : '';
                            }
                        """)

                        variant_id = f"{tire['productId']}-{rim}-{safe_size}"
                        variants.append({
                            **tire,
                            'variantId': variant_id,
                            'rimDiameter': rim,
                            'tireSize': size,
                            'price': price,
                            'priceRange': master['priceRange'],
                            'thumbImages': master['thumbImages'],
                            'features': master['features'],
                            'warranties': master['warranties'],
                        })
                    except Exception as e:
                        print(f"  Error clicking size {size} (rim {rim}) for {tire['name']}: {e}")
                        safe_size = size.replace('/', '-')
                        variant_id = f"{tire['productId']}-{rim}-{safe_size}"
                        variants.append({
                            **tire,
                            'variantId': variant_id,
                            'rimDiameter': rim,
                            'tireSize': size,
                            'price': '',
                            'priceRange': master['priceRange'],
                            'thumbImages': master['thumbImages'],
                            'features': master['features'],
                            'warranties': master['warranties'],
                        })

            except Exception as e:
                print(f"  Error clicking rim {rim} for {tire['name']}: {e}")

        # Fallback: if no variants found, add one row with no size info
        if not variants:
            variants.append({
                **tire,
                'variantId': tire['productId'],
                'rimDiameter': '',
                'tireSize': '',
                'price': '',
                'priceRange': master['priceRange'],
                'thumbImages': master['thumbImages'],
                'features': master['features'],
                'warranties': master['warranties'],
            })

    except Exception as e:
        print(f"  ERROR scraping {tire['url']}: {e}")
        variants.append({
            **tire,
            'variantId': tire['productId'],
            'rimDiameter': '', 'tireSize': '', 'price': '', 'priceRange': '',
            'thumbImages': '', 'features': '', 'warranties': '',
        })
    finally:
        await page.close()

    return variants


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
        tires = await scrape_listing(listing_page)
        await listing_page.close()

        print(f"\nFound {len(tires)} tires. Fetching PDP variants ({CONCURRENCY} at a time)...\n")

        all_variants = []
        for i in range(0, len(tires), CONCURRENCY):
            batch = tires[i:i + CONCURRENCY]
            batch_nums = f"{i+1}-{min(i+len(batch), len(tires))}"
            print(f"Scraping tires {batch_nums} of {len(tires)}...")
            batch_results = await asyncio.gather(*[scrape_pdp(context, t) for t in batch])
            for variant_list in batch_results:
                all_variants.extend(variant_list)

        await browser.close()
        print(f"\nTotal variants: {len(all_variants)}")
        return all_variants


OUTPUT = "/Users/rory.wickham/claude-projects/goodyearWork/goodyear_tires_feed.csv"
MERCH_OUTPUT = "/Users/rory.wickham/claude-projects/goodyearWork/goodyear_merch_feed.csv"

HEADERS = [
    "id", "item_group_id", "title", "description",
    "link", "image_link", "additional_image_link",
    "product_type", "ProductClass", "manufacturer", "color", "colorswatchurl",
    "size", "tax", "sale_price", "price",
    "onlineinventory", "CurrencyCode", "gtin",
    "Rim Diameter", "Warranties & Guarantees",
    "ProductRecommendations", "addOnSKU",
]


def hires(url):
    """Strip Scene7 thumbnail params and replace with high-res settings."""
    if not url or "scene7.com" not in url:
        return url
    base = url.split("?")[0]
    return f"{base}?fmt=png-alpha&qlt=95&wid=800&resMode=sharp2"


def save_to_csv(variants):
    import random

    # Load merch ItemGroupIDs for recommendations
    merch_ids = []
    try:
        with open(MERCH_OUTPUT) as f:
            merch_ids = list({row['ItemGroupID'] for row in csv.DictReader(f)})
    except Exception:
        pass

    def clean(val):
        return str(val).replace("\n", " ").replace("\r", " ").strip()

    # Assign consistent reccos per ItemGroupID
    item_group_reccos = {}

    with open(OUTPUT, "w", newline="\n", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=HEADERS, extrasaction="ignore")
        writer.writeheader()
        for v in variants:
            price_raw = clean(v.get("price", "")).replace("$", "").replace(",", "")
            category = clean(v.get("categories", "") or v.get("season", ""))
            gid = v.get("productId", "")
            if gid not in item_group_reccos:
                if merch_ids:
                    picks = random.sample(merch_ids, min(random.randint(2, 4), len(merch_ids)))
                    item_group_reccos[gid] = "|".join(picks)
                else:
                    item_group_reccos[gid] = ""
            thumb_imgs = [img for img in v.get("thumbImages", "").split(" | ") if img]
            writer.writerow({
                "id": clean(v.get("variantId", "")),
                "item_group_id": gid,
                "title": clean(v.get("name", "")),
                "description": clean(v.get("features", "")),
                "link": clean(v.get("url", "")),
                "image_link": hires(thumb_imgs[0]) if thumb_imgs else hires(clean(v.get("listingImageUrl", ""))),
                "additional_image_link": "|".join(hires(img) for img in thumb_imgs[1:]) if len(thumb_imgs) > 1 else "",
                "product_type": category,
                "ProductClass": "Merchandise",
                "manufacturer": clean(v.get("brand", "")) or "GOODYEAR",
                "color": "Black",
                "colorswatchurl": "",
                "size": clean(v.get("tireSize", "")),
                "tax": "CLT",
                "sale_price": price_raw,
                "price": price_raw,
                "onlineinventory": str(random.randint(5, 500)),
                "CurrencyCode": "USD",
                "gtin": str(random.randint(1000000, 9999999)),
                "Rim Diameter": clean(v.get("rimDiameter", "")),
                "Warranties & Guarantees": clean(v.get("warranties", "")),
                "ProductRecommendations": item_group_reccos[gid],
                "addOnSKU": "211119|155212|155193",
            })
    print(f"Saved {len(variants)} variant rows to {OUTPUT}")


async def main():
    variants = await scrape_all()
    if variants:
        save_to_csv(variants)
    else:
        print("No data found.")


asyncio.run(main())
