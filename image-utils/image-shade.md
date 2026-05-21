---
description: Apply a dark overlay to one or more images to shade them. Use when the user wants to darken banner images or photos for demo asset prep.
---

# Image Shade

Applies a semi-transparent dark overlay to images using PIL.

## Step 1 — Get inputs

Ask:
1. "Which image(s) would you like to shade? Provide file path(s) or a glob pattern (e.g. `~/project/banners/*.png`)."
2. "How dark would you like the shade? Light (~20%), medium (~40%), or heavy (~60%)? Or give me a specific percentage."

## Step 2 — Confirm and back up

- Resolve all matching file paths
- List the files that will be modified and ask the user to confirm before proceeding
- Before modifying any file, save a backup alongside it: `filename_backup.ext`
  - Skip backup if a backup already exists for that file

## Step 3 — Apply shade

Use PIL to apply the overlay. Alpha values by shade level:
- Light (~20%): alpha = 50
- Medium (~40%): alpha = 100
- Heavy (~60%): alpha = 150
- Custom %: alpha = round(percentage / 100 * 255)

```python
from PIL import Image

def shade_image(path, alpha):
    img = Image.open(path).convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, alpha))
    shaded = Image.alpha_composite(img, overlay).convert("RGB")
    shaded.save(path)
```

Process all files, print a confirmation line for each one saved.

## Step 4 — Done

Report how many images were shaded. Remind the user that backups are saved as `filename_backup.ext` alongside each original.

## Critical rules

- Always back up before modifying
- Preserve original file format (PNG stays PNG, JPG stays JPG)
- If PIL/Pillow is not installed, install it with `pip3 install Pillow` before running
