# Axis Mirror Tool

An online image mirror tool with arbitrary custom symmetry axis. Supports static images and GIF animations.

**Online Demo:** [https://goldenfish123321.github.io/axis-mirror-tool/](https://goldenfish123321.github.io/axis-mirror-tool/)

---

## Features

- **Custom Mirror Axis** — drag two anchor points to define any angle and position
- **Swap Mirror Side** — toggle which side of the axis to keep
- **Multi-layer Mirroring** — apply result as new source for repeated transforms
- **GIF Support** — decode → mirror per-frame → re-encode with compression
- **Random Frame Order** — shuffle GIF frames
- **Background Color** — custom color + opacity to fill empty mirrored area
- **Responsive** — side-by-side on desktop, stacked on mobile

## Usage

| Step | Action |
|------|--------|
| 1 | Open `index.html` in browser (or `python3 -m http.server 8080` if CORS blocks) |
| 2 | Upload image (PNG/JPG/GIF/WebP) |
| 3 | Drag red/green dots on preview to adjust mirror axis |
| 4 | Click "Swap Mirror Side" to flip kept side |
| 5 | Click "Use This Result →" to stack another mirror |
| 6 | Export: Download PNG / Download GIF |

## Project Structure

```
axis-mirror-tool/
├── index.html         # Entry point
├── styles.css         # Responsive styles + dark mode
├── app.js             # Main logic (UI, canvas, events)
├── mirror.js          # Mirror algorithm (pixel reflection + bilinear interpolation)
├── gif-handler.js     # GIF decode/encode, per-frame processing, shuffling
├── i18n.js            # i18n (auto-detect zh/en)
├── lib/
│   ├── omggif.js      # GIF decoder (local, no CDN)
│   ├── gif.js         # GIF encoder (local, no CDN)
│   └── gif.worker.js  # GIF encoder worker
├── README.md          # This file
└── README-cn.md       # Chinese documentation
```

## License

MIT
