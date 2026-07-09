# B2C Build XML — Storefront Site Archive Generator

Generates a full Salesforce B2C Commerce site archive from a live brand website:
- One master catalog XML per master catalog group
- One navigation/storefront catalog XML
- Pricebook XML (list prices + sale prices if applicable)
- Inventory list XML
- Downloaded images ready for WebDAV upload

**Source code:** `~/claude-projects/b2c-storefront/scripts/build_storefront.py`

---

## Before Running

### Step 0 — Confirm Toolkit deployment (required)

Before running this skill, confirm:

> "Have you deployed the latest B2C Commerce Toolkit to this sandbox, including RefArch, RefArch Global, and NTO? And have you created a separate custom site in the Toolkit for this brand?"

If **no** — stop here. The Toolkit must be deployed first. It creates the base infrastructure (site configs, OCAPI settings, stripped-down NTO base) AND the blank custom site that this skill will populate.

If **yes** — continue.

**Important:** This skill only touches the custom brand site. It creates net-new catalogs, pricebooks, and inventory lists scoped to that site. NTO, RefArch, and RefArch Global are never modified.

### What you need
1. **Brand site URL** — must have a publicly accessible product catalog
2. **Target sandbox hostname** — e.g. `zzsb-007.dx.commercecloud.salesforce.com`
3. **Target site ID** — the site the SE created in the Toolkit for this brand (e.g. `meatchurch`)
4. **dw.json** — WebDAV credentials for that sandbox
5. **b2c CLI** — run `npx @salesforce/b2c-cli --version` to verify

---

## Run the script

```bash
cd ~/claude-projects/b2c-storefront
python3 scripts/build_storefront.py
```

The script will prompt you for:
- Brand site URL
- Brand slug (used in all catalog/pricebook/inventory IDs)
- Master catalog ID
- Storefront catalog ID  
- Pricebook and inventory IDs
- Output directory (defaults to `./{brand}-site-archive`)
- Category structure (flat single-category or custom tree)

---

## What gets generated

```
{brand}-site-archive/
  catalogs/
    {master-catalog-id}/catalog.xml         ← master catalog (products, variants, images, variations)
    {storefront-catalog-id}/catalog.xml     ← nav catalog (categories, assignments, refinements)
  pricebooks/
    {pricebook-id}/pricebook.xml            ← list prices
    {sale-pricebook-id}/pricebook.xml       ← sale prices (only created if any variants have sale prices)
  inventory-lists/
    {inventory-id}/inventory.xml            ← stock levels
  images/
    {product-id}/                           ← downloaded images, one folder per product
```

---

## Upload and import

**Step 1 — Upload images first (critical — must happen before catalog import):**
```bash
cd {output-dir}
npx @salesforce/b2c-cli webdav put ./images {master-catalog-id}/images --root=catalogs
```

Verify the WebDAV image path in Business Manager:
Merchant Tools → Products and Catalogs → Catalogs → {master-catalog-id} → Image Settings

**Step 2 — Import the site archive:**
```bash
npx @salesforce/b2c-cli job import {output-dir} --show-log
```

---

## After import — Business Manager configuration

1. **Assign master catalog to site:**
   Merchant Tools → Sites → {site} → Settings → Catalogs → add master catalog

2. **Set storefront catalog:**
   Same screen → Storefront Catalog → select {storefront-catalog-id}

3. **Assign pricebook:**
   Merchant Tools → Pricing → Pricebooks → assign to site

4. **Assign inventory list:**
   Merchant Tools → Products and Catalogs → Inventory → assign to site

---

## Site support

Currently supported:
- **Shopify** — uses Shopify storefront JSON API (`/products.json`); auto-detected

Planned (long-term goal: auto-detect platform and route to the right scraper):
- **commercetools** — REST API-based
- **Oracle Commerce (ATG)** — likely needs Playwright
- **SFRA / PWA Kit** — needs Playwright
- **Static HTML** — custom per-site

---

## Catalog architecture reminder

- **Master catalog** owns products and variants. Its category structure is internal only.
- **Navigation/storefront catalog** owns the shopper-facing menu. Categories here reference products from one or more master catalogs by product ID.
- A single storefront catalog can pull from multiple master catalogs — the script handles this automatically if products declare different master catalog IDs.

## Image rule

Always download images locally. Never reference the brand's CDN in catalog XML — external URLs break when they replatform. The script handles this automatically.
