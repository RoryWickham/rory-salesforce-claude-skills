---
description: Generate a hosted color swatch PNG image from a hex color code, ready to use as a product image URL in Retail Cloud. Use when someone needs a solid-color swatch image for a product variant (e.g. shoe color options).
---

# Retail Cloud Color Swatch Generator

Generates a solid-color PNG swatch image on demand via a live Cloudflare Worker. No files to upload — just a URL you paste directly into the Retail Cloud product image field.

## The worker

**Live URL:** https://color-swatches.rory-wickham.workers.dev  
**Source:** `~/claude-projects/color-swatches/worker.js`  
**Deploy:** `cd ~/claude-projects/color-swatches && npx wrangler deploy`

## URL format

```
https://color-swatches.rory-wickham.workers.dev/{HEX}
https://color-swatches.rory-wickham.workers.dev/{HEX}?size={pixels}
```

- `{HEX}` — 6-digit hex color, no `#`, case-insensitive
- `size` — optional, 16–500px, default 100

**Examples:**
```
https://color-swatches.rory-wickham.workers.dev/B59FC4        ← lavender, 100×100
https://color-swatches.rory-wickham.workers.dev/FF5733        ← orange, 100×100
https://color-swatches.rory-wickham.workers.dev/003087?size=200  ← navy, 200×200
```

## How to use in Retail Cloud

Paste the URL directly into the **Image Link** or **Additional Image Link** field on a product or variant. No upload needed — Retail Cloud loads it like any external image URL.

## How to generate a swatch

When the user gives you a hex color (e.g. `b59fc4`, `#FF5733`, `003087`):

1. Strip any `#`, uppercase the hex
2. Construct the URL: `https://color-swatches.rory-wickham.workers.dev/{HEX}`
3. Return the URL to the user — they can paste it directly into Retail Cloud

If the user gives you a color name instead of a hex (e.g. "navy", "coral", "slate grey"), look up a reasonable hex match and confirm it with the user before returning the URL.

## Bulk swatches

If the user gives you a list of colors or a CSV with a color column, generate all URLs at once:

```
B59FC4 → https://color-swatches.rory-wickham.workers.dev/B59FC4
FF5733 → https://color-swatches.rory-wickham.workers.dev/FF5733
003087 → https://color-swatches.rory-wickham.workers.dev/003087
```

## Modifying the worker

The worker is pure JavaScript with no dependencies. To modify swatch size defaults or add new features, edit `~/claude-projects/color-swatches/worker.js` directly and redeploy:

```bash
cd ~/claude-projects/color-swatches && npx wrangler deploy
```
