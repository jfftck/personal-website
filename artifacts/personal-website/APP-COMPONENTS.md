# Shared app controls

Use the shared controls in `public/shared/` instead of creating one-off dropdowns or dialog action rows.

## Select controls

Use a native `<select>` inside `<app-select>`. The component keeps the native select as the value and form source, and provides the app-wide accessible listbox, popover styling, keyboard navigation, and CSS Anchor/Popover behavior with a positioning fallback.

```html
<app-select>
  <label>
    Graph mode
    <select aria-label="Graph mode">
      <option value="cartesian">Cartesian</option>
      <option value="polar">Polar</option>
    </select>
  </label>
</app-select>
```

When creating controls in JavaScript, call `enhanceSelect(select)` or `enhanceSelects(container)` from `public/apps/custom-select.js`. They wrap native selects in `<app-select>` automatically. After changing a select's value programmatically, call `refreshCustomSelect(select)` so the visible combobox stays in sync.

## Dialog actions

Use `<app-dialog-actions>` as the footer of a native dialog. Put Cancel before the primary action and mark it with `data-action="cancel"`; the shared component closes its nearest dialog. Keep the apply button's action in the owning app.

```html
<app-dialog-actions>
  <button type="button" data-action="cancel">Cancel</button>
  <button type="button" class="primary-action">Apply</button>
</app-dialog-actions>
```

## Button labels

App-window buttons use shared title-case styling. Keep math input keys, expressions, and abbreviations in their intended case; the calculator already excludes these from title-casing.
