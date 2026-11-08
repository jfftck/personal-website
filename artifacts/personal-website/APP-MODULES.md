# Desktop app module boundaries

The desktop is a small shell around independent apps. `public/desktop.js` owns window lifecycle, session restore, the launcher, shared desktop services, and the app-loading contract. It must not import an app's entry module.

## App descriptors and registry

- Each top-level app has a lightweight `public/apps/<app>.app.js` descriptor. A descriptor owns the app's type, title, icons, entry URL, stylesheet list, builder export, module ownership, and state interface.
- `public/apps/app-registry.js` aggregates descriptor metadata. It is imported by the desktop shell, but does not import app entry modules.
- `public/apps/game-center.app.js` describes Game Center as one launcher entry and creates window descriptors for its internal games. The saved game type strings remain the window IDs/types used by session restore.
- `public/apps/games/catalog.js` owns Game Center's rules/game list and submenu. A game engine or game UI module belongs under `public/apps/games/`; it must not become a root launcher item.
- App descriptors list their implementation modules and styles. The shell uses those lists for loading and prefetch scheduling without knowing an app's internal implementation.

## Ownership and dependencies

| Owner | Implementation |
| --- | --- |
| Document Viewer | `apps/doc-viewer.js` |
| Image Viewer | `apps/img-viewer.js` |
| File Manager | `apps/file-manager.js` |
| Media Player | `apps/media-player.js` |
| Calendar | `apps/calendar.js` |
| World Clock | `apps/world-clock.js` |
| Calculator | `apps/calculator.js`, `apps/calculator-*.js` |
| Sticky Notes | `apps/sticky-notes.js`, `apps/sticky-notes-data.js` |
| Weather | `apps/weather.js` |
| Settings | `apps/settings.js` |
| Game Center | `apps/game-center.js`, all of `apps/games/**` |

App implementation modules may import their own app's internal modules and shared services. They should not import another top-level app's implementation. Reusable controls, icons, toolbar helpers, animation selection, and shared tokens belong in `public/shared/`. Storage access stays behind the existing `public/data-handler.js`; retry behavior stays in `public/shared/retry.js`.

## App state contract

Descriptor `state` metadata records where an app persists its state, which initial state argument is used for restore, the optional session snapshot method, disposal method, and commands exposed to the shell. Keep existing saved formats and API method names stable while refining this contract.

## Static output

The static build copies `public/` without rewriting module paths. App and shared JavaScript must use browser-native ES modules, and styles must be listed on descriptors rather than imported as CSS side effects from JavaScript. This keeps direct static serving and development previews on the same module graph.
