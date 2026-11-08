import { wrapAppButton } from './app-controls.js';

let activeController = null;
let nextPanelId = 0;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function normalizeSelection(value, choices) {
  const allowed = new Set(choices.map(([key]) => key));
  if (Array.isArray(value)) return [...new Set(value.filter(key => allowed.has(key)))];
  if (value === 'none') return [];
  if (value === 'random') return choices.map(([key]) => key);
  return allowed.has(value) ? [value] : [];
}

export function createAnimationPickerController(host, {
  label = 'Animation options',
  onOpen = () => {},
  onClose = () => {},
} = {}) {
  const layer = element('div', 'animation-picker-layer');
  layer.hidden = true;
  const scrim = element('button', 'animation-picker-scrim');
  scrim.type = 'button';
  scrim.setAttribute('aria-label', `Close ${label.toLowerCase()}`);
  const drawer = element('section', 'animation-picker-drawer');
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  const heading = element('h2', 'animation-picker-heading');
  const description = element('p', 'animation-picker-description');
  const closeButton = element('button', 'animation-picker-close', 'Done');
  closeButton.type = 'button';
  const header = element('header', 'animation-picker-header');
  header.append(heading, wrapAppButton(closeButton));
  const options = element('div', 'animation-picker-options');
  options.id = `animation-picker-options-${++nextPanelId}`;
  drawer.append(header, description, options);
  layer.append(scrim, drawer);
  host.append(layer);

  let active = null;
  let priorFocus = null;
  let savedInert = [];
  let closeTimer = 0;
  let destroyed = false;

  function refreshOptions() {
    if (!active) return;
    const focusedValue = options.contains(document.activeElement)
      ? document.activeElement.dataset.animationValue
      : null;
    active.trigger.setAttribute('aria-expanded', 'true');
    active.trigger.setAttribute('aria-label', `${active.label}: ${active.summary()}`);
    active.summaryNode.textContent = active.summary();
    options.replaceChildren();

    const none = element('label', 'animation-picker-option animation-picker-none');
    const noneInput = document.createElement('input');
    noneInput.type = 'checkbox';
    noneInput.dataset.animationValue = '';
    noneInput.checked = active.selected.length === 0;
    noneInput.setAttribute('aria-label', 'No animation');
    none.append(noneInput, element('span', '', 'None'));
    noneInput.addEventListener('change', () => {
      active.selected = noneInput.checked ? [] : active.choices.map(([key]) => key);
      refreshOptions();
      active.onChange([...active.selected]);
    });
    options.append(none);

    for (const [key, title, detail = ''] of active.choices) {
      const row = element('label', 'animation-picker-option');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.animationValue = key;
      input.checked = active.selected.includes(key);
      input.setAttribute('aria-label', title);
      row.append(input, element('span', 'animation-picker-copy'));
      row.querySelector('.animation-picker-copy').append(
        element('strong', '', title),
        ...(detail ? [element('small', '', detail)] : []),
      );
      input.addEventListener('change', () => {
        active.selected = input.checked
          ? [...active.selected, key]
          : active.selected.filter(item => item !== key);
        active.selected = normalizeSelection(active.selected, active.choices);
        refreshOptions();
        active.onChange([...active.selected]);
      });
      options.append(row);
    }
    if (focusedValue !== null) {
      [...options.querySelectorAll('input')].find(input => input.dataset.animationValue === focusedValue)
        ?.focus({ preventScroll: true });
    }
  }

  function close({ restoreFocus = true, notify = true } = {}) {
    if (!active) return;
    const closing = active;
    active = null;
    layer.classList.remove('is-open');
    closing.trigger.setAttribute('aria-expanded', 'false');
    closing.trigger.setAttribute('aria-label', `${closing.label}: ${closing.summary()}`);
    drawer.setAttribute('aria-hidden', 'true');
    drawer.inert = true;
    for (const { node, inert } of savedInert) node.inert = inert;
    savedInert = [];
    if (activeController === close) activeController = null;
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      if (!active) layer.hidden = true;
    }, 240);
    if (restoreFocus) {
      const target = priorFocus?.isConnected ? priorFocus : closing.trigger;
      target?.focus({ preventScroll: true });
    }
    priorFocus = null;
    if (notify) onClose(closing.id);
  }

  function open(picker) {
    if (activeController && activeController !== close) activeController({ restoreFocus: false, notify: false });
    window.clearTimeout(closeTimer);
    active = picker;
    activeController = close;
    priorFocus = document.activeElement;
    heading.textContent = picker.label;
    description.textContent = picker.description;
    drawer.setAttribute('aria-label', `${picker.label} options`);
    drawer.setAttribute('aria-hidden', 'false');
    drawer.inert = false;
    savedInert = [...host.children]
      .filter(node => node !== layer)
      .map(node => ({ node, inert: node.inert }));
    savedInert.forEach(({ node }) => { node.inert = true; });
    onOpen(picker.id);
    layer.hidden = false;
    picker.trigger.setAttribute('aria-expanded', 'true');
    refreshOptions();
    requestAnimationFrame(() => {
      if (!active) return;
      layer.classList.add('is-open');
      options.querySelector('input')?.focus({ preventScroll: true });
    });
  }

  function onKeyDown(event) {
    if (!active) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...drawer.querySelectorAll('button:not([disabled]), input:not([disabled])')];
    if (!focusable.length) return;
    if (event.shiftKey && document.activeElement === focusable[0]) {
      event.preventDefault();
      focusable.at(-1).focus();
    } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
      event.preventDefault();
      focusable[0].focus();
    }
  }

  scrim.addEventListener('click', () => close());
  closeButton.addEventListener('click', () => close());
  layer.addEventListener('keydown', onKeyDown);

  function createPicker({ id, label: pickerLabel, description: pickerDescription = '', choices, selected, onChange }) {
    const picker = {
      id,
      label: pickerLabel,
      description: pickerDescription || 'Select one or more effects. When multiple are selected, one is chosen at random.',
      choices: choices.map(([key, title, detail = '']) => [key, title, detail]),
      selected: normalizeSelection(selected, choices),
      onChange,
    };
    const root = element('div', 'animation-picker-control');
    const trigger = element('button', 'animation-picker-trigger');
    trigger.type = 'button';
    trigger.setAttribute('aria-expanded', 'false');
    const name = element('span', 'animation-picker-trigger-name', pickerLabel);
    const summary = element('span', 'animation-picker-trigger-summary');
    const chevron = element('span', 'animation-picker-trigger-chevron', '›');
    chevron.setAttribute('aria-hidden', 'true');
    trigger.append(name, summary, chevron);
    picker.trigger = trigger;
    picker.summaryNode = summary;
    picker.summary = () => picker.selected.length === 0
      ? 'None'
      : picker.selected.length === 1
        ? picker.choices.find(([key]) => key === picker.selected[0])?.[1] || '1 selected'
        : `${picker.selected.length} selected`;
    summary.textContent = picker.summary();
    trigger.addEventListener('click', () => active === picker ? close() : open(picker));
    root.append(wrapAppButton(trigger));
    root.dataset.animationPicker = id;
    trigger.setAttribute('aria-label', `${pickerLabel}: ${picker.summary()}`);
    trigger.setAttribute('aria-controls', options.id);
    return root;
  }

  return {
    element: layer,
    createPicker,
    close,
    get isOpen() { return active !== null; },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      close({ restoreFocus: false });
      if (activeController === close) activeController = null;
      layer.remove();
    },
  };
}
