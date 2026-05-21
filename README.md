# Axis Mirror Tool

An online image mirror tool based on **arbitrary custom symmetry axes**. Supports both static images and GIF animations. Place two draggable control points to define the mirror axis and preview the effect in real time.

[中文文档](./README-cn.md)

## Features

- **Custom Symmetry Axis**: Place two draggable anchor points on the image to define a mirror axis at any angle and position
- **Swap Mirror Side**: Toggle which side of the axis to keep with one click
- **Multi-layer Mirroring**: Apply the result as a new source for repeated symmetrical transformations
- **GIF Support**: Decode GIF animations, apply mirror transforms to every frame, and re-encode for export
- **Random Frame Order**: Shuffle GIF frames for unpredictable animation effects
- **Auto-detect Language**: Switches between Chinese and English based on browser language, no manual toggle needed
- **Dark/Light Mode**: Follows system preference or toggle manually
- **Responsive Design**: Side-by-side on desktop, stacked on mobile
- **Touch Optimized**: Control points support finger dragging on mobile devices

## Usage

### 1. Open the Page
Open `index.html` directly in a browser (no build tools or server required, though some browsers need an HTTP server to access local files).

If you encounter CORS issues, run:
```bash
# Python simple HTTP server
python3 -m http.server 8080
# Then visit http://localhost:8080
```

### 2. Upload an Image
- Click the upload area to select a file, or drag & drop an image
- Supported formats: PNG, JPG, GIF, WebP
- Max file size: 50MB

### 3. Adjust the Mirror Axis
- Two colored dots (A and B) appear on the image, defining an infinite mirror axis
- **Drag A or B** to change the axis position and angle
- A semi-transparent dashed line shows the axis extension
- A blue arrow indicates the current kept side (normal direction)

### 4. Swap Mirror Side
Click **"Swap Mirror Side"** to toggle which side of the axis is preserved; the preview updates instantly.

### 5. Use This Result
Click **"Use This Result →"** to set the processed image on the right as the new source on the left — allowing repeated stacked mirror effects.

### 6. Export
- **Static Image**: Click **"Download PNG"** to export the current result
- **GIF**: Click **"Download GIF"** to export the processed animation
- For GIFs, check **"Random Frame Order"** to shuffle animation frames

## Project Structure

```
axis-mirror-tool/
├── index.html         # Page structure
├── styles.css         # Responsive styles + dark mode
├── app.js             # Main logic (UI, canvas, events)
├── mirror.js          # Core mirror algorithm (pixel reflection + bilinear interpolation)
├── gif-handler.js     # GIF decode/encode, per-frame processing, shuffling
├── i18n.js            # i18n (auto-switch Chinese/English)
├── README.md          # This file (English)
├── README-cn.md       # Chinese documentation
└── .gitignore         # Git ignore rules
```

## Technical Details

### Mirror Algorithm (`mirror.js`)
- An infinite straight line is defined by two points (P1, P2)
- Uses cross product to compute signed distance from a pixel to the line, determining which side to keep
- Pixels on the discarded side are reflected by projecting onto the line and mirroring across it
- Bilinear interpolation samples from the source for sub-pixel accuracy and smooth edges

### GIF Processing (`gif-handler.js`)
- Uses [gifuct-js](https://github.com/matt-way/gifuct-js) to decode GIFs
- Correctly handles disposal types (frame compositing and background restoration)
- Applies the mirror transform independently to each frame
- Uses [gif.js](https://github.com/jnordberg/gif.js) for re-encoding and export

### i18n (`i18n.js`)
- Language detection based on `navigator.language`
- All UI texts fetched via `getText(key)`
- Listens for `languagechange` events for live switching

### Responsive Design (`styles.css`)
- CSS Flexbox layout + Media Queries
- Desktop ≥768px: side-by-side panels
- Mobile <768px: stacked vertically
- Touch targets minimum 44×44px for usability

## Browser Compatibility

- Chrome / Edge (latest)
- Firefox (latest)
- Safari / iOS Safari (latest)

## License

MIT License
