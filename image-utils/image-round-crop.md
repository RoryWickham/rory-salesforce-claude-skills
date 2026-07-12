---
description: Apply a rounded corner crop to an image, matching the radius from a reference file. Use when the user wants to round-crop an image to match an existing rounded asset.
---

# Image Round Crop

Applies a rounded corner crop to one or more images, measuring the corner radius from a reference JPEG.

## Step 1 — Get inputs

Ask:
1. "What is the path to the **reference image** — the one whose corner radius you want to match?"
2. "What is the path to the **image(s) you want to crop**? (single file or a folder)"
3. "Where should the output be saved? (default: same folder as input, with `_rounded` suffix)"

## Step 2 — Detect the corner radius from the reference

Write and run a Python script using Pillow to detect the corner radius from the reference JPEG:

- Open the reference image
- Sample pixels along the top edge from the left corner inward, and along the left edge downward from the top corner
- The background color is determined by sampling the outermost corner pixel (top-left, 1×1)
- Walk inward from each corner along both axes until the pixel color differs from the background by more than a threshold (Euclidean distance > 30 in RGB space)
- The corner radius is the distance from the corner to where the image content starts — take the average of the horizontal and vertical measurements across all 4 corners
- Print the detected radius so the user can confirm it looks right before proceeding

## Step 3 — Apply the rounded crop

For each target image:

1. Open the image with Pillow
2. Check if it has an alpha channel (mode `RGBA`). If not, convert to `RGBA`
3. Create a mask: solid black (`0`) canvas same size as image, draw a white (`255`) rounded rectangle filling the full image bounds using the detected radius
4. Apply the mask as the alpha channel
5. If the **original image had no alpha channel** (was JPEG/RGB): composite the masked image onto a solid `#F8F8F8` background and save as PNG
6. If the **original image already had an alpha channel**: save as PNG with transparency preserved — do not flatten onto a background
7. Save output as PNG (never JPEG — JPEG doesn't support transparency)

```python
from PIL import Image, ImageDraw
import math, os, sys

def detect_radius(ref_path):
    img = Image.open(ref_path).convert("RGB")
    w, h = img.size
    bg = img.getpixel((0, 0))

    def color_dist(a, b):
        return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))

    def find_edge(pixels, bg, threshold=30):
        for i, px in enumerate(pixels):
            if color_dist(px, bg) > threshold:
                return i
        return 0

    corners = [
        [img.getpixel((x, 0)) for x in range(min(200, w))],           # top-left horizontal
        [img.getpixel((0, y)) for y in range(min(200, h))],           # top-left vertical
        [img.getpixel((w - 1 - x, 0)) for x in range(min(200, w))],  # top-right horizontal
        [img.getpixel((w - 1, y)) for y in range(min(200, h))],       # top-right vertical
        [img.getpixel((x, h - 1)) for x in range(min(200, w))],       # bottom-left horizontal
        [img.getpixel((0, h - 1 - y)) for y in range(min(200, h))],   # bottom-left vertical
        [img.getpixel((w - 1 - x, h - 1)) for x in range(min(200, w))], # bottom-right horizontal
        [img.getpixel((w - 1, h - 1 - y)) for y in range(min(200, h))], # bottom-right vertical
    ]
    measurements = [find_edge(c, bg) for c in corners]
    measurements = [m for m in measurements if m > 0]
    return round(sum(measurements) / len(measurements)) if measurements else 20

def apply_rounded_crop(input_path, output_path, radius):
    img = Image.open(input_path)
    has_alpha = img.mode == "RGBA"
    img = img.convert("RGBA")
    w, h = img.size

    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), (w - 1, h - 1)], radius=radius, fill=255)
    img.putalpha(mask)

    if not has_alpha:
        bg = Image.new("RGBA", (w, h), (248, 248, 248, 255))
        bg.paste(img, mask=img.split()[3])
        bg.convert("RGB").save(output_path, "PNG")
    else:
        img.save(output_path, "PNG")
```

## Step 4 — Report results

Print each output file path and confirm the radius that was applied. If the detected radius looks wrong (e.g. 0 or unexpectedly large), tell the user and ask if they'd like to specify a radius manually.

## Critical rules

- Always output PNG — never JPEG
- Transparent source images get transparent output (composited over `#F8F8F8` only for opaque sources)
- If `ImageDraw.rounded_rectangle` is unavailable (Pillow < 8.2), fall back to drawing 4 corner arcs manually using `pieslice`
- If processing a folder, skip non-image files silently and report how many were processed
