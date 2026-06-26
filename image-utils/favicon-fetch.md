---
description: Fetch a storefront's favicon.ico, save it to the project folder, and produce a PNG version from the largest embedded frame. Use when you need a brand icon for demo assets.
---

# Favicon Fetch

Downloads a storefront's `favicon.ico`, saves it alongside the project files, then converts the largest embedded frame to PNG using PIL.

## Step 1 — Get inputs

Ask:
1. "What is the storefront URL? (e.g. `https://www.crocs.com`)"
2. "What is the project folder path where the files should be saved? (e.g. `~/claude-projects/crocs`)"
3. "What base name should the files use? (e.g. `crocs` → saves `crocs.ico` and `crocs.png`; default: domain name)"

If the user doesn't provide a base name, derive it from the domain (strip `www.` and the TLD — e.g. `www.crocs.com` → `crocs`).

## Step 2 — Fetch the ICO

Use `curl` to download the favicon. Sites commonly block Python's `urllib` but accept browser-style user agents.

```bash
curl -L -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
  -o "<project_folder>/<base_name>.ico" \
  "<storefront_url>/favicon.ico"
```

- Follow redirects with `-L`
- If the direct `/favicon.ico` path returns a 404 or tiny file (<100 bytes), fetch the storefront HTML first and look for a `<link rel="icon" ...>` tag to get the real favicon path, then retry with that URL
- Confirm the file was saved and report its size

## Step 3 — Inspect and convert

```python
from PIL import Image
import os

ico_path = "<project_folder>/<base_name>.ico"
png_path = "<project_folder>/<base_name>.png"

img = Image.open(ico_path)
sizes = list(img.info.get('sizes', [(img.width, img.height)]))
print(f"Frames available: {sorted(sizes, reverse=True)}")

# Select the largest frame
best = max(sizes, key=lambda s: s[0] * s[1])
img.size = best          # PIL ICO: set this to select the frame
out = img.convert('RGBA')
out.save(png_path)
print(f"Saved {best[0]}×{best[1]} PNG → {png_path}")
```

- Always convert to RGBA before saving to preserve transparency
- If PIL/Pillow is not installed, run `pip3 install Pillow` first

## Step 4 — Report

Tell the user:
- Full path to the saved `.ico`
- Full path to the saved `.png`
- The dimensions of the PNG (the frame that was selected)
- All available frame sizes found in the ICO (so they can request a different size if needed)

## Critical rules

- Never overwrite an existing file without asking first
- If the ICO contains only one frame, skip the frame-selection logic and convert it directly
- If `favicon.ico` is actually a PNG already (some CDNs serve it that way), PIL will open it fine — just copy it to `<base_name>.ico` anyway and convert normally
- Expand `~` in all paths before use (`os.path.expanduser`)
