# Jeffrey M. Tackett — Personal Website

## Project Overview
A personal website for Jeffrey M. Tackett. The site is a fully static project served by `static-web-server` on port 80.

### Pages
- `index.html` — The current live personal page (curtain animation, article grid, theme selector)
- `desktop.html` — **New:** Niri-style tiling window manager desktop (to replace index.html eventually)

### Tech stack
- Vanilla HTML5, CSS3 (custom properties, scroll-snap, backdrop-filter, logical properties)
- Vanilla ES-module JavaScript (no frameworks, no build tools)
- `static-web-server` for serving files
- `signal.js` — custom reactive signals (used in gallery, not in desktop)

### Key files
| File | Purpose |
|---|---|
| `index.html / index.css / index.js` | Current main page |
| `desktop.html / desktop.css / desktop.js` | New Niri-style desktop page |
| `signal.js` | Reactive signals primitive |
| `gallery.js` | ArrowJS-based gallery component (in progress) |
| `jmt.svg` | Site logo |

## User Preferences
- No frameworks or build tools — stay vanilla HTML/CSS/JS
- New pages are added alongside existing ones; don't replace `index.html` without explicit instruction
- Keep responsive breakpoints: small portrait (≤640px portrait), medium (641px–1023px), large (≥1024px)
