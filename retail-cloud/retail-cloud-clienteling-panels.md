---
description: Recolor the three Retail Cloud clienteling background panels (left, center, right) to a brand hex color. Use when building a custom-branded clienteling layout in Retail Cloud POS and the user needs colored panel background images.
---

# Retail Cloud Clienteling Panels

Generates brand-colored versions of the three clienteling layout background panel images (LeftPanel, CenterPanel, RightPanel) by replacing the black fill with a target hex color. Source panel shapes are bundled in this skills repo.

## Step 1 — Get the target color

Ask the user:

> "What brand hex color should the panels be? (e.g. `#80a344`)"

## Step 2 — Get the output directory

Ask:

> "Where should the output files be saved? (provide a folder path, e.g. `~/claude-projects/myproject/images/`)"

## Step 3 — Run the recolor

The source panel images are at:
- `~/.claude/commands/salesforce/retail-cloud/assets/LeftPanelBlack.jpg`
- `~/.claude/commands/salesforce/retail-cloud/assets/CenterPanelBlack.jpg`
- `~/.claude/commands/salesforce/retail-cloud/assets/RightPanelBlack.jpg`

Each is 456×222px. They are solid-black rounded-rectangle shapes on a transparent-ish background — the black pixels need to be replaced with the target color.

Use the hex color (without `#`) as the filename suffix, e.g. `LeftPanel80a344.png`.

```python
from PIL import Image
import os

def hex_to_rgb(hex_color):
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

def recolor_panel(src_path, dst_path, target_rgb, threshold=40):
    img = Image.open(src_path).convert("RGB")
    pixels = img.load()
    w, h = img.size
    count = 0
    for y in range(h):
        for x in range(w):
            r, g, b = pixels[x, y]
            if r < threshold and g < threshold and b < threshold:
                pixels[x, y] = target_rgb
                count += 1
    img.save(dst_path)
    return count

assets_dir = os.path.expanduser("~/.claude/commands/salesforce/retail-cloud/assets/")
out_dir = os.path.expanduser("<OUTPUT_DIR>")
os.makedirs(out_dir, exist_ok=True)

hex_color = "<HEX>"  # e.g. "80a344"
target_rgb = hex_to_rgb(hex_color)

panels = ["LeftPanel", "CenterPanel", "RightPanel"]
for panel in panels:
    src = os.path.join(assets_dir, f"{panel}Black.jpg")
    dst = os.path.join(out_dir, f"{panel}{hex_color}.png")
    n = recolor_panel(src, dst, target_rgb)
    print(f"{panel}: {n} pixels recolored → {dst}")
```

Replace `<OUTPUT_DIR>` with the user's folder and `<HEX>` with the hex value (no `#`).

Run the script and confirm each file was saved.

## Step 4 — Done

Tell the user:

> "Three panel images saved to `<output_dir>`:
> - `LeftPanel<hex>.png`
> - `CenterPanel<hex>.png`
> - `RightPanel<hex>.png`
>
> Upload these to your Retail Cloud CMS and assign them to the Left Panel Background, Center Panel Background, and Right Panel Background slots in your clienteling layout."

## Critical rules

- Save as PNG (not JPG) — preserves exact color fidelity
- The threshold for "black" is pixels where R, G, and B are all < 40 — this handles JPEG compression artifacts without touching near-white background pixels
- If Pillow is not installed: `pip3 install Pillow`
- Source files must not be modified — always read from assets, write to output dir
