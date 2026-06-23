"""
Generates 512x512 PNGs for each service icon category.
White Bootstrap Icon on Mike's Bikes dark blue (#003282) background.
Uses sips (macOS) to convert SVG->PNG, then Pillow to composite.
"""
import os
import re
import subprocess
import tempfile
from PIL import Image

ICONS_DIR = "/Users/rory.wickham/claude-projects/mikesbikes/icons"
BG_HEX = (0, 50, 130)  # #003282
SIZE = 512
PADDING = 96  # icon renders at 320x320

ICON_MAP = {
    "tune-up":    "tools",
    "brakes":     "stop-circle",
    "drivetrain": "gear",
    "wheels":     "circle",
    "suspension": "arrow-down-up",
    "build":      "wrench",
    "general":    "clipboard-check",
}

def svg_to_png(svg_path, out_path, size):
    subprocess.run(
        ["sips", "-s", "format", "png", "--resampleHeightWidth", str(size), str(size), svg_path, "--out", out_path],
        check=True, capture_output=True
    )

def make_icon_png(category, bootstrap_icon):
    svg_path = os.path.join(ICONS_DIR, f"{bootstrap_icon}.svg")

    icon_size = SIZE - PADDING * 2  # 320px

    # Use original SVG (sips ignores fill overrides; we'll invert in PIL)
    with tempfile.NamedTemporaryFile(suffix=".svg", delete=False, mode="w") as tmp_svg:
        with open(svg_path) as f:
            tmp_svg.write(f.read())
        tmp_svg_path = tmp_svg.name

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_png:
        tmp_png_path = tmp_png.name

    svg_to_png(tmp_svg_path, tmp_png_path, icon_size)

    icon_img = Image.open(tmp_png_path).convert("RGBA")

    # sips renders: black icon pixels on transparent background
    # Recolor: replace black pixels with white, keep alpha channel intact
    r, g, b, a = icon_img.split()
    white_icon = Image.merge("RGBA", (
        Image.new("L", icon_img.size, 255),  # R=255
        Image.new("L", icon_img.size, 255),  # G=255
        Image.new("L", icon_img.size, 255),  # B=255
        a,                                    # original alpha as mask
    ))

    # Create blue background
    bg = Image.new("RGBA", (SIZE, SIZE), BG_HEX + (255,))
    bg.paste(white_icon, (PADDING, PADDING), white_icon)

    out_path = os.path.join(ICONS_DIR, f"{category}.png")
    bg.convert("RGB").save(out_path)

    os.unlink(tmp_svg_path)
    os.unlink(tmp_png_path)

    print(f"  Saved {category}.png  ({bootstrap_icon})")

if __name__ == "__main__":
    print("Generating service icons...")
    for category, icon in ICON_MAP.items():
        make_icon_png(category, icon)
    print("Done.")
