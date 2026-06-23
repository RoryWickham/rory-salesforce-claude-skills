import csv
import json
import random
import re
import subprocess

COLLECTIONS = ["bikes", "apparel"]
BASE_URL = "https://mikesbikes.com"
OUTPUT = "/Users/rory.wickham/claude-projects/mikesbikes/mikesbikes_feed.csv"
CURL_HEADERS = [
    "-H", "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
]

OUT_HEADERS = [
    "id", "item_group_id", "title", "description",
    "link", "image_link", "additional_image_link",
    "color", "size", "gtin",
    "sale_price", "price", "product_class", "product_type",
    "brand", "model_year", "riding_style", "bike_size", "build_type",
    "onlineinventory",
]


def curl_get(url):
    result = subprocess.run(
        ["curl", "-s", "--max-time", "30", url] + CURL_HEADERS,
        capture_output=True, text=True
    )
    return result.stdout


def clean(text):
    if not text:
        return ""
    return str(text).replace(",", "").replace("\n", " ").replace("\r", "").strip()


def strip_html(text):
    if not text:
        return ""
    return re.sub(r"<[^>]+>", " ", text).strip()


def parse_spec(body_html, label):
    # Pattern 1: <td><strong>Label:</strong></td><td>Value</td>
    m = re.search(rf'<td><strong>{re.escape(label)}:?\s*</strong></td>\s*<td>(.*?)</td>', body_html, re.IGNORECASE | re.DOTALL)
    if m:
        return clean(strip_html(m.group(1)))
    # Pattern 2: <strong>Label</strong>: </td><td>Value</td>
    m = re.search(rf'<strong>{re.escape(label)}</strong>[:\s]*</td>\s*<td>(.*?)</td>', body_html, re.IGNORECASE | re.DOTALL)
    if m:
        return clean(strip_html(m.group(1)))
    # Pattern 3: <th ...>Label</th><td ...>Value</td> (collection API format)
    m = re.search(rf'<th[^>]*>\s*{re.escape(label)}\s*</th>\s*<td[^>]*>(.*?)</td>', body_html, re.IGNORECASE | re.DOTALL)
    if m:
        return clean(strip_html(m.group(1)))
    return ""


def get_wheel_size(body_html):
    val = parse_spec(body_html, "Tires") or parse_spec(body_html, "Tire")
    if not val:
        return ""
    # Match: "700x26c", "29x2.4", "27.5 x 2.6", '24" x 1.95"'
    m = re.search(r'(\d{2,3}(?:\.\d+)?)\s*(?:x|")\s*[\d.]+', val, re.IGNORECASE)
    if m:
        diameter = m.group(1).split(".")[0]
        return f'{diameter}c' if len(diameter) == 3 else f'{diameter}"'
    return ""


def get_collection_products(collection):
    all_products = []
    page = 1
    while True:
        url = f"{BASE_URL}/collections/{collection}/products.json?limit=250&page={page}"
        print(f"  Fetching page {page}...")
        data = json.loads(curl_get(url))
        products = data.get("products", [])
        if not products:
            break
        all_products.extend(products)
        print(f"  Got {len(products)} products (total so far: {len(all_products)})")
        if len(products) < 250:
            break
        page += 1
    return all_products


def build_variants(product):
    pid = str(product["id"])
    title = clean(product.get("title", ""))
    body_html = product.get("body_html", "")
    description = clean(strip_html(body_html))
    handle = product.get("handle", "")
    link = f"{BASE_URL}/products/{handle}"
    vendor = clean(product.get("vendor", ""))
    product_type = clean(product.get("product_type", ""))

    # Images: build variant_id -> src lookup; unassigned images are fallback pool
    images = product.get("images", [])
    variant_image = {}  # variant_id (int) -> src
    unassigned = []
    for img in images:
        vids = img.get("variant_ids") or []
        if vids:
            for vid in vids:
                if vid not in variant_image:
                    variant_image[vid] = img["src"]
        else:
            unassigned.append(img["src"])
    fallback_image = images[0]["src"] if images else ""

    # Tag-derived fields
    tags = product.get("tags", [])
    model_year = ""
    riding_style = ""
    bike_size = ""
    build_type = ""
    for tag in tags:
        t = tag.strip()
        if re.match(r'^my\d{2,4}$', t, re.I):
            year_digits = re.sub(r'^my', '', t, flags=re.I)
            model_year = f"20{year_digits}" if len(year_digits) == 2 else year_digits
        elif t in ("Mountain Bikes", "Road Bikes", "Electric Bikes", "Gravel Bikes",
                   "Kids Bikes", "Active Bikes", "Commuter Bikes", "Cyclocross Bikes"):
            riding_style = t
        elif re.match(r'^(x-?small|small|medium|large|x-?large|xx-?large|\d+cm|\d+")', t, re.I):
            bike_size = t
        elif t == "Category_Frames":
            build_type = "Frame"

    # Options: figure out which option is color vs size
    options = product.get("options", [])
    color_idx = None
    size_idx = None
    for i, opt in enumerate(options):
        name = opt.get("name", "").lower()
        if "color" in name or "colour" in name:
            color_idx = i
        elif "size" in name:
            size_idx = i

    variants = []
    for v in product.get("variants", []):
        price_cents = v.get("price", "0")
        compare_price = v.get("compare_at_price")
        sale_price = f"{float(price_cents):.2f}" if price_cents else ""
        # Use compare_at_price as list price only if it's a positive number
        if compare_price and float(compare_price) > 0:
            list_price = f"{float(compare_price):.2f}"
        else:
            list_price = sale_price

        # Extract color and size from variant options
        color = ""
        size = ""
        if color_idx is not None:
            color = clean(v.get(f"option{color_idx + 1}", ""))
        if size_idx is not None:
            size = clean(v.get(f"option{size_idx + 1}", ""))

        # Fallback: parse from variant title "Color / Size"
        if not color and not size:
            parts = v.get("title", "").split(" / ")
            if len(parts) >= 2:
                color = clean(parts[0])
                size = clean(parts[1])
            elif len(parts) == 1:
                size = clean(parts[0])

        sku = v.get("sku", "") or str(random.randint(1000000, 9999999))
        variant_id = f"{pid}-{v['id']}"

        if not sale_price or not list_price:
            continue

        v_image = variant_image.get(v["id"], fallback_image)
        other_images = [src for src in (list(variant_image.values()) + unassigned) if src != v_image]
        # deduplicate while preserving order
        seen = set()
        alt_images = []
        for src in other_images:
            if src not in seen:
                seen.add(src)
                alt_images.append(src)
        v_additional = "|".join(alt_images) if alt_images else ""

        variants.append({
            "id": variant_id,
            "item_group_id": pid,
            "title": title,
            "description": description,
            "link": link,
            "image_link": v_image,
            "additional_image_link": v_additional,
            "color": color,
            "size": size,
            "gtin": str(random.randint(1000000, 9999999)),
            "sale_price": sale_price,
            "price": list_price,
            "product_class": "Merchandise",
            "product_type": product_type or vendor,
            "brand": vendor,
            "model_year": model_year,
            "riding_style": riding_style,
            "bike_size": bike_size,
            "build_type": build_type,
            "onlineinventory": random.randint(0, 50),
        })

    return variants


def main():
    all_variants = []
    seen_ids = set()

    for collection in COLLECTIONS:
        print(f"Fetching '{collection}' collection from {BASE_URL}...\n")
        products = get_collection_products(collection)
        print(f"  Total products in '{collection}': {len(products)}")
        for p in products:
            if p["id"] in seen_ids:
                continue
            seen_ids.add(p["id"])
            variants = build_variants(p)
            if variants:
                all_variants.extend(variants)
        print()

    print(f"Grand total variants: {len(all_variants)}")

    # Verify no commas in fields
    for row in all_variants:
        for k, v in row.items():
            if k not in ("image_link", "additional_image_link", "link") and "," in str(v):
                row[k] = str(v).replace(",", "")

    with open(OUTPUT, "w", newline="\n", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUT_HEADERS)
        writer.writeheader()
        writer.writerows(all_variants)

    print(f"Written to {OUTPUT}")

    print("\n--- Sample rows ---")
    for row in all_variants[:5]:
        print(f"  id={row['id']} | title={row['title'][:25]} | color={row['color']} | size={row['size']} | price={row['price']}")


main()
