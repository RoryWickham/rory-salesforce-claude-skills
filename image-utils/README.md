# Image Utils Skills

General-purpose image manipulation skills for demo asset preparation.

## Skills

### `image-shade`
Apply a dark overlay to one or more images. Useful for darkening banner images so overlaid text is more readable.

**Invoke:** `/salesforce/image-utils/image-shade`

### `image-slice`
Split a large image into equal tiles or horizontal strips. Useful for breaking a sprite sheet or composite banner into individual asset files.

**Invoke:** `/salesforce/image-utils/image-slice`

### `favicon-fetch`
Download a storefront's `favicon.ico`, save it to the project folder, and export the largest embedded frame as a PNG. Useful for grabbing a brand icon for demo asset prep.

**Invoke:** `/salesforce/image-utils/favicon-fetch`

## Requirements

- Python 3
- `Pillow` (`pip3 install Pillow`)
