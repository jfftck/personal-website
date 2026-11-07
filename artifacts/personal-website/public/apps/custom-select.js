const controls = new WeakMap();
const managedControls = new Set();
const openControls = new Set();
const appSelectUpgradeGuard = new WeakSet();
let nextControlId = 1;
let lifecycleObserver;
let globalListenersReady = false;

const SELECT_COMPONENT_STYLES = `
  <style>
    :host {
      --select-field-display: grid;
      --select-field-align-items: stretch;
      --select-field-justify-content: initial;
      --select-field-gap: .3rem;
      --select-label-flex: none;
      --select-label-color: var(--app-text, currentColor);
      --select-label-font-size: inherit;
      --select-trigger-width: 100%;
      --select-trigger-flex: 0 1 auto;
      --select-trigger-min-height: 2.4rem;
      --select-trigger-padding: .5rem .75rem;
      --select-trigger-border: 1px solid var(--app-border, currentColor);
      --select-trigger-radius: .65rem;
      --select-trigger-background: var(--util-surface, color-mix(in srgb, var(--app-bg, #171d22) 92%, var(--app-text, #fff) 8%));
      --select-trigger-color: var(--app-text, currentColor);
      --select-trigger-font-size: inherit;
      --select-trigger-hover: var(--util-surface-strong, var(--btn-hover, color-mix(in srgb, var(--app-bg, #171d22) 82%, var(--app-text, #fff) 18%)));
      --select-trigger-active: var(--btn-active, color-mix(in srgb, var(--app-bg, #171d22) 78%, var(--app-text, #fff) 22%));
      display: block;
      width: 100%;
      min-width: 0;
      color: var(--app-text, inherit);
      font: inherit;
    }
    .standard-select-field {
      display: var(--select-field-display, grid);
      align-items: var(--select-field-align-items, stretch);
      justify-content: var(--select-field-justify-content, initial);
      gap: var(--select-field-gap, .3rem);
      min-width: 0;
    }
    .standard-select-label {
      display: block;
      flex: var(--select-label-flex, none);
      min-width: 0;
      color: var(--select-label-color, var(--app-text, currentColor));
      font-size: var(--select-label-font-size, inherit);
    }
    .standard-select-label[hidden] { display: none; }
    .standard-select-control {
      display: block;
      flex: var(--select-trigger-flex, 0 1 auto);
      width: var(--select-trigger-width, 100%);
      min-width: 0;
    }
    .standard-select-trigger {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .65rem;
      width: 100%;
      min-width: 0;
      min-height: var(--select-trigger-min-height, 2.4rem);
      padding: var(--select-trigger-padding, .5rem .75rem);
      border: var(--select-trigger-border, 1px solid var(--app-border, currentColor));
      border-radius: var(--select-trigger-radius, .65rem);
      background: var(--select-trigger-background, var(--app-bg, transparent));
      color: var(--select-trigger-color, var(--app-text, currentColor));
      font: inherit;
      font-size: var(--select-trigger-font-size, inherit);
      text-align: left;
      cursor: pointer;
      transition: background-color 140ms ease, border-color 140ms ease;
    }
    .standard-select-trigger:hover { background: var(--select-trigger-hover, var(--btn-hover, transparent)); }
    .standard-select-trigger:active { background: var(--select-trigger-active, var(--btn-active, transparent)); }
    .standard-select-trigger:disabled { cursor: not-allowed; opacity: .45; }
    .standard-select-trigger:focus-visible {
      outline: 2px solid var(--focus-color, currentColor);
      outline-offset: 2px;
    }
    .standard-select-value { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .standard-select-chevron {
      width: .9rem;
      height: .9rem;
      flex: none;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      transition: transform 140ms ease;
    }
    .standard-select-trigger[aria-expanded="true"] .standard-select-chevron { transform: rotate(180deg); }
    .standard-select-popup {
      position: fixed;
      inset: auto;
      z-index: 12000;
      display: grid;
      gap: 1px;
      box-sizing: border-box;
      width: min(14rem, calc(100vw - 1rem));
      max-width: calc(100vw - 1rem);
      max-height: min(19rem, 45dvh);
      overflow: auto;
      margin: .25rem 0 0;
      padding: .25rem;
      border: 1px solid var(--topbar-border, var(--app-border, currentColor));
      border-radius: .625rem;
      background: var(--overlay-card, var(--app-bg, Canvas));
      color: var(--app-text, CanvasText);
      box-shadow: 0 8px 28px rgba(0, 0, 0, .45);
      -webkit-backdrop-filter: var(--backdrop, blur(12px));
      backdrop-filter: var(--backdrop, blur(12px));
      scrollbar-width: thin;
      scrollbar-color: var(--scrollbar-thumb, var(--accent, currentColor)) transparent;
    }
    .standard-select-popup[popover]:not(:popover-open),
    .standard-select-popup[hidden] { display: none; }
    .standard-select-popup[popover]:popover-open { display: grid; }
    @supports (position-area: block-end span-inline-start) {
      .standard-select-popup[data-anchor-positioned="true"] {
        position-area: block-end span-inline-start;
      }
    }
    @supports (position-try-fallbacks: flip-block, flip-inline) {
      .standard-select-popup[data-anchor-positioned="true"] {
        position-try-fallbacks: flip-block, flip-inline;
      }
    }
    .standard-select-option {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      width: 100%;
      min-height: 2.35rem;
      padding: .4375rem .625rem;
      border: 0;
      border-radius: .375rem;
      background: transparent;
      color: var(--app-text, CanvasText);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .standard-select-option:hover,
    .standard-select-option.is-active { background: var(--btn-hover, transparent); }
    .standard-select-option[aria-selected="true"] {
      border: 1px solid var(--focus-color, currentColor);
      background: var(--btn-active, transparent);
    }
    .standard-select-option[aria-disabled="true"] { opacity: .48; cursor: not-allowed; }
    ::slotted(.standard-select-native) {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      padding: 0 !important;
      margin: -1px !important;
      overflow: hidden !important;
      clip: rect(0, 0, 0, 0) !important;
      clip-path: inset(50%) !important;
      white-space: nowrap !important;
      border: 0 !important;
    }
  </style>
  <div class="standard-select-field">
    <label class="standard-select-label" hidden></label>
    <div class="standard-select-control">
      <button type="button" class="standard-select-trigger" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-valuetext="" data-value="">
        <span class="standard-select-value"></span>
        <svg class="standard-select-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
      </button>
    </div>
  </div>
  <div class="standard-select-popup" role="listbox"></div>
  <slot name="native"></slot>
`;

function supportsAnchoring(anchorName) {
  return Boolean(window.CSS?.supports
    && CSS.supports('anchor-name', anchorName)
    && CSS.supports('position-anchor', anchorName)
    && CSS.supports('position-area', 'block-end span-inline-start'));
}

function optionText(option) {
  return (option.label || option.textContent || '').trim();
}

function ensureGlobalListeners() {
  if (globalListenersReady || !document.body) return;
  globalListenersReady = true;

  document.addEventListener('pointerdown', event => {
    const eventPath = event.composedPath();
    for (const control of openControls) {
      if (!eventPath.includes(control.host)) {
        control.close(false);
      }
    }
  }, true);

  window.addEventListener('resize', () => {
    for (const control of openControls) control.updatePosition();
  });
  document.addEventListener('scroll', () => {
    for (const control of openControls) {
      if (!control.anchorSupported) control.updatePosition();
    }
  }, true);

  lifecycleObserver = new MutationObserver(() => {
    for (const control of managedControls) {
      if (control.select.isConnected) control.connectedOnce = true;
      else if (control.connectedOnce) control.dispose();
    }
  });
  lifecycleObserver.observe(document.body, { childList: true, subtree: true });
}

function labelTextFor(select) {
  const label = select.closest('label');
  if (!label) return { label, text: select.getAttribute('aria-label') || 'Choose an option' };

  const text = [...label.childNodes]
    .filter(node => node !== select && !(node.nodeType === 1 && node.contains(select)))
    .map(node => node.textContent || '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { label, text: text || select.getAttribute('aria-label') || 'Choose an option' };
}

export function enhanceSelect(select) {
  if (!(select instanceof HTMLSelectElement) || controls.has(select)) return controls.get(select) || null;
  if (!document.body) return null;

  let host = select.closest('app-select');
  if (!host) {
    const source = select.closest('label') || select;
    const parent = source.parentNode;
    const nextSibling = source.nextSibling;
    host = document.createElement('app-select');
    appSelectUpgradeGuard.add(select);
    host.append(source);
    if (parent) parent.insertBefore(host, nextSibling);
    appSelectUpgradeGuard.delete(select);
  }

  const { label, text: labelText } = labelTextFor(select);
  const controlNumber = nextControlId++;
  const triggerId = `standard-select-trigger-${controlNumber}`;
  const popupId = `standard-select-popup-${controlNumber}`;
  const labelId = `standard-select-label-${controlNumber}`;
  const anchorName = `--standard-select-anchor-${controlNumber}`;

  const root = host.shadowRoot;
  const trigger = root.querySelector('.standard-select-trigger');
  const valueDisplay = root.querySelector('.standard-select-value');
  const popup = root.querySelector('.standard-select-popup');
  const componentLabel = root.querySelector('.standard-select-label');
  trigger.id = triggerId;
  trigger.setAttribute('aria-controls', popupId);
  popup.id = popupId;
  popup.setAttribute('aria-label', labelText);
  componentLabel.id = labelId;
  componentLabel.textContent = labelText;
  componentLabel.hidden = !label;
  componentLabel.htmlFor = triggerId;
  if (label) {
    trigger.setAttribute('aria-labelledby', labelId);
    if (label.id && !host.id) host.id = label.id;
    for (const className of label.classList) host.classList.add(className);
  } else {
    trigger.setAttribute('aria-label', labelText);
  }
  host.classList.add('standard-select-field', 'standard-select-control');

  const hasPopover = typeof popup.showPopover === 'function'
    && typeof popup.hidePopover === 'function';
  if (hasPopover) popup.setAttribute('popover', 'auto');
  else popup.hidden = true;

  const anchorSupported = supportsAnchoring(anchorName);
  if (anchorSupported) {
    trigger.style.setProperty('anchor-name', anchorName);
    popup.style.setProperty('position-anchor', anchorName);
    popup.dataset.anchorPositioned = 'true';
  }

  if (label) {
    if (label.closest('app-select') === host) {
      label.replaceWith(select);
    } else if (label.contains(host)) {
      const parent = label.parentNode;
      if (parent) {
        parent.insertBefore(host, label);
        label.remove();
      }
    }
  }
  if (select.parentElement !== host) host.append(select);
  select.slot = 'native';

  select.classList.remove('util-select');
  select.classList.add('standard-select-native');
  select.setAttribute('aria-hidden', 'true');
  select.tabIndex = -1;
  select.removeAttribute('aria-label');
  select.dataset.customSelectTrigger = triggerId;
  select.dataset.customSelectPopup = popupId;
  if (select.required) {
    select.dataset.customSelectRequired = 'true';
    select.removeAttribute('required');
    trigger.setAttribute('aria-required', 'true');
  }

  let optionElements = [];
  let activeIndex = -1;
  let isOpen = false;
  let typeahead = '';
  let typeaheadTime = 0;

  function selectedIndex() {
    const index = select.selectedIndex;
    return index >= 0 ? index : 0;
  }

  function isOptionDisabled(index) {
    const option = select.options[index];
    return !option || option.disabled || Boolean(option.parentElement?.disabled);
  }

  function firstEnabledIndex(start = 0, direction = 1) {
    const count = select.options.length;
    for (let step = 0; step < count; step += 1) {
      const index = (start + step * direction + count) % count;
      if (!isOptionDisabled(index)) return index;
    }
    return -1;
  }

  function updateActive(index, scroll = true) {
    if (index < 0 || isOptionDisabled(index)) return;
    activeIndex = index;
    optionElements.forEach((option, optionIndex) => {
      option.classList.toggle('is-active', optionIndex === activeIndex);
    });
    if (isOpen && optionElements[activeIndex]) {
      trigger.setAttribute('aria-activedescendant', optionElements[activeIndex].id);
      if (scroll) optionElements[activeIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  function syncValue() {
    const selected = select.options[selectedIndex()];
    const text = optionText(selected) || labelText;
    valueDisplay.textContent = text;
    trigger.dataset.value = select.value;
    trigger.setAttribute('aria-valuetext', text);
    trigger.disabled = select.disabled;
    optionElements.forEach((option, index) => {
      option.setAttribute('aria-selected', String(index === selectedIndex()));
    });
    if (select.value) trigger.removeAttribute('aria-invalid');
  }

  function optionSignature() {
    return [...select.options]
      .map(option => `${option.value}\u0000${optionText(option)}\u0000${option.disabled}\u0000${Boolean(option.parentElement?.disabled)}`)
      .join('\u0001');
  }
  let renderedSignature = '';

  function renderOptions() {
    renderedSignature = optionSignature();
    popup.replaceChildren();
    optionElements = [...select.options].map((option, index) => {
      const item = document.createElement('div');
      item.id = `${popupId}-option-${index}`;
      item.className = 'standard-select-option';
      item.setAttribute('role', 'option');
      item.dataset.value = option.value;
      item.textContent = optionText(option);
      if (isOptionDisabled(index)) item.setAttribute('aria-disabled', 'true');
      item.addEventListener('pointerenter', () => updateActive(index, false));
      item.addEventListener('click', () => {
        if (isOptionDisabled(index)) return;
        select.value = option.value;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        syncValue();
        close(true);
      });
      popup.append(item);
      return item;
    });
    syncValue();
  }

  function updatePosition() {
    if (!isOpen || !trigger.isConnected) return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const gameSettingsDialog = select.closest('.game-settings-dialog');
    const width = gameSettingsDialog
      ? Math.min(rect.width, viewportWidth - 16)
      : Math.min(Math.max(rect.width, Math.min(224, viewportWidth - 16)), viewportWidth - 16);
    popup.style.width = `${width}px`;

    if (anchorSupported) {
      popup.style.removeProperty('left');
      popup.style.removeProperty('top');
      return;
    }

    const height = Math.min(popup.scrollHeight, viewportHeight - 16);
    let left = rect.left;
    let top = rect.bottom + 4;
    if (left + width > viewportWidth - 8) left = viewportWidth - width - 8;
    if (top + height > viewportHeight - 8) top = rect.top - height - 4;
    popup.style.left = `${Math.max(8, left)}px`;
    popup.style.top = `${Math.max(8, top)}px`;
  }

  function setOpenState(open) {
    isOpen = open;
    trigger.setAttribute('aria-expanded', String(open));
    trigger.classList.toggle('is-open', open);
    if (open) {
      openControls.add(control);
      activeIndex = firstEnabledIndex(selectedIndex());
      updateActive(activeIndex, false);
      requestAnimationFrame(updatePosition);
    } else {
      openControls.delete(control);
      trigger.removeAttribute('aria-activedescendant');
      optionElements.forEach(option => option.classList.remove('is-active'));
      activeIndex = -1;
    }
  }

  function open() {
    if (select.disabled || isOpen) return;
    for (const other of openControls) {
      if (other !== control) other.close(false);
    }
    if (renderedSignature !== optionSignature()) renderOptions();
    if (hasPopover) {
      if (!popup.matches(':popover-open')) {
        try {
          popup.showPopover({ source: trigger });
        } catch {
          if (!popup.matches(':popover-open')) popup.showPopover();
        }
      }
    } else {
      popup.hidden = false;
    }
    setOpenState(true);
    updatePosition();
  }

  function close(returnFocus = false) {
    if (!isOpen && (hasPopover ? !popup.matches(':popover-open') : popup.hidden)) return;
    if (hasPopover && popup.matches(':popover-open')) popup.hidePopover();
    else if (!hasPopover) popup.hidden = true;
    setOpenState(false);
    if (returnFocus) trigger.focus({ preventScroll: true });
  }

  function moveActive(direction) {
    const next = firstEnabledIndex(Math.max(0, activeIndex + direction), direction);
    if (next >= 0) updateActive(next);
  }

  function selectActive() {
    if (activeIndex < 0 || isOptionDisabled(activeIndex)) return;
    optionElements[activeIndex]?.click();
  }

  function typeaheadSelect(character) {
    const now = Date.now();
    typeahead = now - typeaheadTime > 700 ? character : `${typeahead}${character}`;
    typeaheadTime = now;
    const start = Math.max(activeIndex, selectedIndex());
    for (let offset = 1; offset <= select.options.length; offset += 1) {
      const index = (start + offset) % select.options.length;
      if (!isOptionDisabled(index) && optionText(select.options[index]).toLocaleLowerCase().startsWith(typeahead.toLocaleLowerCase())) {
        if (!isOpen) open();
        updateActive(index);
        break;
      }
    }
  }

  const control = {
    select,
    field: host,
    host,
    trigger,
    popup,
    anchorSupported,
    connectedOnce: select.isConnected,
    open,
    close,
    updatePosition,
    refresh() {
      if (renderedSignature !== optionSignature()) renderOptions();
      else syncValue();
    },
  };

  trigger.addEventListener('click', () => {
    if (isOpen) close(false);
    else open();
  });
  trigger.addEventListener('keydown', event => {
    if (event.key === 'Tab') {
      close(false);
      return;
    }
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) open();
      else moveActive(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Home' && isOpen) {
      event.preventDefault();
      updateActive(firstEnabledIndex(0));
      return;
    }
    if (event.key === 'End' && isOpen) {
      event.preventDefault();
      updateActive(firstEnabledIndex(select.options.length - 1, -1));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isOpen) selectActive();
      else open();
      return;
    }
    if (event.key === 'F4' || (event.altKey && event.key === 'ArrowDown')) {
      event.preventDefault();
      if (isOpen) close(false);
      else open();
      return;
    }
    if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
      typeaheadSelect(event.key);
    }
  });
  popup.addEventListener('toggle', () => {
    const shouldBeOpen = popup.matches(':popover-open');
    if (hasPopover && isOpen !== shouldBeOpen) setOpenState(shouldBeOpen);
  });
  select.addEventListener('change', syncValue);
  select.addEventListener('input', syncValue);
  const selectObserver = new MutationObserver(() => {
    if (renderedSignature !== optionSignature()) renderOptions();
    else syncValue();
  });
  selectObserver.observe(select, { attributes: true, childList: true, subtree: true, characterData: true });
  control.dispose = () => {
    close(false);
    selectObserver.disconnect();
    popup.remove();
    managedControls.delete(control);
    openControls.delete(control);
  };

  renderOptions();
  controls.set(select, control);
  managedControls.add(control);
  ensureGlobalListeners();
  if (select.form) {
    select.form.addEventListener('reset', () => requestAnimationFrame(syncValue));
  }
  return control;
}

export function enhanceSelects(container) {
  if (!container) return [];
  return [...container.querySelectorAll('select')].map(enhanceSelect).filter(Boolean);
}

export function refreshCustomSelect(select) {
  const control = controls.get(select);
  control?.refresh();
}

export function focusCustomSelect(select) {
  const control = controls.get(select);
  (control?.trigger || select)?.focus({ preventScroll: true });
}

export function setCustomSelectInvalid(select, invalid = true) {
  const trigger = controls.get(select)?.trigger;
  if (!trigger) return;
  if (invalid) trigger.setAttribute('aria-invalid', 'true');
  else trigger.removeAttribute('aria-invalid');
}

class AppSelectElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = SELECT_COMPONENT_STYLES;
  }

  connectedCallback() {
    const select = this.querySelector('select');
    if (select && !appSelectUpgradeGuard.has(select)) enhanceSelect(select);
  }

  focus(options) {
    const select = this.querySelector('select');
    if (select) focusCustomSelect(select);
    else super.focus?.(options);
  }

  refresh() {
    const select = this.querySelector('select');
    if (select) refreshCustomSelect(select);
  }
}

if (!customElements.get('app-select')) customElements.define('app-select', AppSelectElement);
