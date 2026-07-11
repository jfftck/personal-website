---
name: Desktop module split
description: How desktop.js was split into ES modules and how the new per-window drag system works.
---

## Module structure

| File | Role |
|---|---|
| `desktop-state.js` | Exports `S` — single shared mutable object. All modules import this same instance. |
| `desktop-drag.js` | `initDrag(cb)` + `wireColEvents(colEl)` + internal `startWindowDrag`. No colId param on wireColEvents. |
| `apps/toolbar.js` | `ICONS` map + `toolBtn(action, icon, label)` template helper. |
| `apps/doc-viewer.js` | `buildDocViewer(id, ctx)` + inline markdown renderer. |
| `apps/img-viewer.js` | `buildImgViewer(id, ctx)` |
| `apps/media-player.js` | `buildMediaPlayer(id, ctx)` |
| `apps/file-manager.js` | `buildFileManager(id, ctx)` |
| `desktop.js` | WM core — imports all above, owns DOM, defines APP_DEFS and appCtx, calls initDrag. |

## App context pattern

`appCtx = { appApis: S.appApis, appTitles: S.appTitles, setAppTitle, toast, requestOpenFile }`

Builders receive `ctx` and write `ctx.appApis[id] = { openFile }` — mutations go directly into `S.appApis` since it's the same reference.

**Why:** Avoids circular imports (builders can't import desktop.js) while still sharing state.

## New drag model (per-window, not per-column)

- `.win-drag-handle` added to each `.app-window` in `openApp()`, appears on `.app-window:hover`
- Ghost: a lightweight `div.app-window.win-drag-ghost` with icon + title (no DOM clone)
- Placeholder: `.win-placeholder` on the dragged window; `.col-placeholder` on the column only if it was the sole window

### 3-zone drop system

| Zone | Condition | Action |
|---|---|---|
| Left viewport edge (1/6 vw) | colIdx > 0 | Window becomes new leftmost column |
| Right viewport edge (1/6 vw) | colIdx < columns.length-1 | Window becomes new rightmost column |
| Stack zone at opposite end of source col | col has other windows | Reorder within column |

Stack zone placement: `posInCol === 0` → bottom strip; else → top strip.

## Key ordering in desktop.js

`appCtx` → `APP_DEFS` → `initDrag(...)` → `restoreSession()` call. APP_DEFS must be defined before initDrag and before restoreSession() is called, but after appCtx. Function declarations are hoisted so order of definition doesn't matter for the functions themselves.

## Session key

`'desktop-session-v2'` — unchanged. V1 migration still supported.
