# Desktop styles and shared controls

Use the shared controls in `public/shared/` and the shared tokens in `public/desktop.css` before adding an app-specific version. Keep app-specific layout and artwork where they communicate a distinct task or game theme.

## Style families

| Family | Source | Role and boundaries |
| --- | --- | --- |
| Desktop shell | `public/desktop.css` | Light/dark theme tokens, top bar, launcher, desktop stage, toolbar surfaces, shared menus, and desktop chrome. Window content should inherit these tokens instead of defining another global palette. |
| Window and overview frame | `public/desktop-windows.css` | Shared window frame, focus outline, open/close transitions, overview mode, and overview controls. Loaded immediately after `desktop.css`; keep app-specific refinements in later stylesheets. |
| Utility apps | `public/desktop.css`, `public/apps/utility-apps.css`, `public/apps/calculator.css` | Shared utility colors, fields, and actions stay in `desktop.css`. Calendar, World Clock, Sticky Notes, and Weather layouts (including their container queries) live in `utility-apps.css`. Calculator layout, keypad, graph, and dialog styles live in its lazy `calculator.css` stylesheet. Use the shared button, field, select, and menu patterns for routine controls; keep calculator math entry and sticky-note color choices specialized. |
| Document and media viewers | `public/apps/viewer-apps.css` | Document reading/sidebar styles, image stage/thumbnails, and media-player presentation are loaded for their respective viewers. Shared toolbars and controls remain in `desktop.css`. |
| File Manager | `public/apps/file-manager.css` | File tree/sidebar, tile and list views, and their container-query breakpoints. Toolbar actions use the shared quiet-button pattern; the active view retains a visible selected border. |
| Settings | `public/apps/settings.css` | Uses the desktop theme with a distinct sidebar, section headings, and card hierarchy. Preserve that information architecture; routine buttons and fields should still use shared controls. |
| Game surfaces and boards | `public/apps/games/games.css` | Game toolbar and board layouts with per-game rules, board colors, and tactile table treatments. Reuse the common toolbar button base, but retain game-specific board geometry, status, and rules. |
| Game material and artwork | `public/apps/games/glass.css`, `public/apps/games/artwork.css` | Glass is a board/piece material overlay. Artwork selects card faces/backs and chess/reversi piece styles. These are intentionally independent from the app/window color theme. Do not flatten them into utility-app colors. |
| Animation picker | `public/shared/animation-picker.css` | A shared right-side drawer used by desktop and game animation settings. It inherits the active window/game theme and keeps its own overlay, drawer, and animation behavior. Its trigger and Done action use the shared button base. |
| Legacy landing page | `public/index-legacy.html`, `public/index.css` | Separate editorial landing-page styling; it is not the desktop app stylesheet. Keep it separate unless the landing page itself is being redesigned. |

### Intentional differences

- The top bar and app launcher are desktop chrome, not utility-app controls.
- Settings cards, theme swatches, selected categories, and calendar view segments communicate selection; their selected appearance is not a keyboard-focus ring.
- Calculator math keys, expression/function inputs, and graph-choice segments need math-specific sizing, typography, or selected treatment.
- Sticky-note colors, game boards, game pieces, and playing-card artwork remain independently themed.
- Game start/win/error screens and board cells have game-specific interaction and layering. Do not replace them with generic dialogs or tiles.

## Control inventory

| Control | Shared pattern | Current use and allowed variation |
| --- | --- | --- |
| Standard action button | `<app-button><button …></button></app-button>` and `.util-action` | Settings navigation/reset/order actions, animation-picker trigger/Done, viewer and File Manager toolbars, calendar navigation, and routine Weather, World Clock, Sticky Notes, and Calculator actions. Native buttons remain the semantic and event target. Variants: `size="icon"` or `size="compact"`; `variant="primary"` or `variant="quiet"` when needed. A specific app may add layout classes, but should not restyle the common border, surface, focus, or disabled state. |
| Game toolbar action | Native button with `.util-action` | Game toolbar controls share the action surface and focus behavior while `games.css` supplies the game palette and icon dimensions. Preserve game-specific pressed states such as Minesweeper Flag mode. |
| Text input | `.util-field` on the native input/textarea | Shared border, surface, text, and placeholder styling. Keep labels and descriptions in the app so the visible and accessible names remain meaningful. Sticky-note title/body fields use the shared field focus behavior with a transparent paper-like surface. Calculator expression, function, and graph-range inputs remain specialized. |
| Select/menu | `public/shared/app-select.js`; `<app-select>` around a native `<select>` | The native select remains the value/form source; the shared component supplies the accessible listbox, keyboard handling, popover/anchor positioning, and fallback. Do not introduce a parallel dropdown for ordinary option lists. |
| Popover list | `.menu-popover` and the standard select popover styles | Shared tinted/blurred surface and stacking behavior for app menus. Keep menu items and placement app-specific, and ensure the popover overlays nearby content. |
| Dialog footer | `<app-dialog-actions>` inside a native `<dialog>` | Shared Cancel-before-primary ordering and Cancel behavior. Keep apply/save behavior in the owning app. Game overlays that must coexist with game screens remain a separate, explicitly managed pattern. |
| Checkbox / radio / range | `<app-checkbox>`, `<app-radio>`, and `<app-range>` wrapping native inputs | Shared component-owned styling with native form values and accessible checkbox, radio, and slider semantics. Keep names, labels, checked/disabled state, and event handlers on the native input. |
| Toggle / selected choice | Native checkbox or button with `aria-pressed` / `aria-checked` | Use the state that matches the control semantics. A selected item gets its selected appearance; `:focus-visible` alone gets the keyboard focus ring. |
| Focus treatment | `--focus-color` and `:focus-visible` | Use the same focus color across apps. Do not add persistent focus rings to selected tiles or swatches. |

## Recommended style boundaries

- Keep one shared base for ordinary button border, surface, focus, and disabled states. App-specific classes should primarily set placement, sizing, and content; game toolbars may additionally use the game palette.
- Quiet actions share their transparent resting surface and hover/active feedback; use the shared quiet variant instead of repeating toolbar surface rules in an app stylesheet.
- Keep text fields and option menus on `.util-field` and `<app-select>`. The calculator’s math editor, segmented views, color swatches, and game-specific choices need their own geometry, not a second general-purpose control style.
- Keep the selected state separate from keyboard focus. Selected categories and choices can use the focus color for their border, while the visible focus ring only appears on the element currently reached by keyboard.
- Keep popover stacking and surface treatment shared so menus stay readable above nearby content. Do not copy menu background, blur, or z-index rules into each app.
- Preserve the game board, piece, card, sticky-note, and window-material themes as distinct visual systems; share their controls without merging their artwork or surfaces.
- Keep app-specific layout and responsive rules in the corresponding lazy-loaded family stylesheet. Do not copy family rules back into `desktop.css`; only true shell, shared control, and desktop-widget styles belong there.

## Stylesheet loading and cascade

`desktop.css` and `desktop-windows.css` load with the desktop shell. App family styles are registered on lightweight app descriptors and loaded before that app is built. The loader deduplicates stylesheet links, appends them after the shell styles, and prefetches registered app styles during idle time. Keep each family's base rules and container/media-query overrides together in source order; do not depend on the order in which unrelated apps are opened.

Settings remains in `public/apps/settings.css`. Game boards and artwork remain in their separate game stylesheets; these are not part of the utility, viewer, or File Manager families.

## Using shared controls

Import shared behavior from `public/shared/`: `app-select.js` owns the standard select enhancer, `app-toolbar.js` owns toolbar buttons and responsive overflow, and `animation-picker.js` plus its descriptor-loaded stylesheet owns the shared animation drawer. Shared UI modules must not import app implementation modules.

Import `wrapAppButton` from `public/shared/app-controls.js` when creating a standard button in JavaScript. It wraps a native button without moving its event listeners or changing its accessible name:

```js
import { wrapAppButton } from '../shared/app-controls.js';

const save = document.createElement('button');
save.type = 'button';
save.textContent = 'Save';
container.append(wrapAppButton(save, { variant: 'primary' }));
```

For markup strings, use the same custom element directly:

```html
<app-button size="icon">
  <button type="button" aria-label="Close" title="Close">…</button>
</app-button>
```

The inner native button remains the actual control, so keep `type`, accessible names, `disabled`, `aria-pressed` / `aria-checked`, and event handlers on it. Use icon-only controls only when they have an accessible name and tooltip. Do not wrap board cells, card tiles, segmented-choice cards, or controls whose specialized visual treatment is part of the app.

For fields, keep an explicit `<label>` and use `.util-field` on text inputs and textareas. Wrap checkbox, radio, and range inputs with `wrapAppControl()` or call `upgradeAppControls(container)` after rendering a page:

```js
import { upgradeAppControls, wrapAppControl } from '../shared/app-controls.js';

const enabled = document.createElement('input');
enabled.type = 'checkbox';
enabled.setAttribute('aria-label', 'Enable feature');
container.append(wrapAppControl(enabled));

// For a rendered subtree, upgrade all native checkbox/radio/range inputs once.
upgradeAppControls(container);
```

Checkbox and radio hosts expose `checked`, `value`, `disabled`, and `focus()`; range hosts expose `value`, `min`, `max`, `step`, `disabled`, and `focus()`. The checkbox and radio inputs remain in light DOM; range controls keep a form-value input and expose a styled native range input inside the component shadow root. Attach application listeners to the original input so its normal `input` and `change` events remain the source of truth. Keep a real label and accessible name on every control. For menus, use `<app-select>` for option selection and the shared `.menu-popover` surface for other popovers. Use `<app-dialog-actions>` for native dialog footers rather than creating another footer layout.

## Dialog actions

Put Cancel before the primary action and mark Cancel with `data-action="cancel"`; the shared component closes its nearest native dialog. Keep the apply button's action in the owning app.

```html
<app-dialog-actions>
  <button type="button" data-action="cancel">Cancel</button>
  <button type="button" class="primary-action">Apply</button>
</app-dialog-actions>
```

## Labels and accessibility

App-window buttons use title-case styling. Keep math input keys, expressions, and abbreviations in their intended case; the calculator excludes these from title-casing. Keep controls keyboard-operable, retain visible `:focus-visible` styling, and preserve responsive sizing, popover stacking, reduced-motion behavior, and dialog focus management when reusing a control.
