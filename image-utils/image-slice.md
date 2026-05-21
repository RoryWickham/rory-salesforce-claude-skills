---
description: Slice a large image into equal tiles or strips. Use when the user wants to split a banner or sprite sheet into individual images for demo asset prep.
---

# Image Slice

Splits a single image into multiple equal tiles or horizontal strips using PIL.

## Step 1 — Get inputs

Ask:
1. "What is the path to the image you want to slice?"
2. "How would you like to slice it?"
   - **By count** — e.g. "5 horizontal slices" or "3 columns × 2 rows"
   - **By dimensions** — e.g. "each tile should be 800×160 px"
3. "Where should the output files be saved? (default: same folder as the source image)"
4. "What should the output files be named? (e.g. `associateImage_1.png`, `associateImage_2.png`...)"

## Step 2 — Preview the math

Before slicing, print:
- Source image dimensions
- Number of tiles that will be produced
- Dimensions of each tile

Ask the user to confirm before proceeding.

## Step 3 — Slice

```python
from PIL import Image

def slice_image(input_path, output_dir, base_name, cols, rows):
    img = Image.open(input_path)
    w, h = img.size
    tile_w = w // cols
    tile_h = h // rows
    n = 1
    for row in range(rows):
        for col in range(cols):
            box = (col * tile_w, row * tile_h, (col + 1) * tile_w, (row + 1) * tile_h)
            tile = img.crop(box)
            tile.save(f"{output_dir}/{base_name}_{n}.png")
            print(f"Saved {base_name}_{n}.png")
            n += 1
```

## Step 4 — Done

Report how many tiles were saved and where.

## Critical rules

- If the image dimensions don't divide evenly, warn the user — edge tiles may be slightly smaller
- Preserve PNG format for output regardless of source format (safer for transparency)
- If PIL/Pillow is not installed, install it with `pip3 install Pillow` before running
