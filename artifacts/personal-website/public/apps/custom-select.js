const controls = new WeakMap();
const managedControls = new Set();
const openControls = new Set();
let nextControlId = 1;
let lifecycleObserver;
let globalListenersReady = false;

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
    for (const control of openControls) {
      if (!control.trigger.contains(event.target) && !control.popup.contains(event.target)) {
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
      if (!control.select.isConnected) control.dispose();
    }
  });
  lifecycleObserver.observe(document.body, { childList: true, subtree: true });
}

function labelTextFor(select) {
  const label = select.closest('label');
  if (!label) return { label, text: select.getAttribute('aria-label') || 'Choose an option' };

  const text = [...label.childNodes]
    .filter(node => node !== select)
    .map(node => node.textContent || '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { label, text: text || select.getAttribute('aria-label') || 'Choose an option' };
}

export function enhanceSelect(select) {
  if (!(select instanceof HTMLSelectElement) || controls.has(select)) return controls.get(select) || null;
  if (!document.body) return null;

  const { label, text: labelText } = labelTextFor(select);
  const controlNumber = nextControlId++;
  const triggerId = `standard-select-trigger-${controlNumber}`;
  const popupId = `standard-select-popup-${controlNumber}`;
  const labelId = `standard-select-label-${controlNumber}`;
  const anchorName = `--standard-select-anchor-${controlNumber}`;

  const wrapper = document.createElement('span');
  wrapper.className = 'standard-select-control';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.id = triggerId;
  trigger.className = 'util-action standard-select-trigger';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', popupId);
  trigger.setAttribute('aria-valuetext', '');
  trigger.dataset.value = '';

  const valueDisplay = document.createElement('span');
  valueDisplay.className = 'standard-select-value';
  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevron.setAttribute('viewBox', '0 0 24 24');
  chevron.setAttribute('aria-hidden', 'true');
  chevron.classList.add('standard-select-chevron');
  const chevronPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  chevronPath.setAttribute('d', 'm6 9 6 6 6-6');
  chevron.append(chevronPath);
  trigger.append(valueDisplay, chevron);

  const popup = document.createElement('div');
  popup.id = popupId;
  popup.className = 'menu-popover standard-select-popup';
  popup.setAttribute('role', 'listbox');
  popup.setAttribute('aria-label', labelText);

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

  const field = document.createElement('div');
  field.className = `standard-select-field${label?.className ? ` ${label.className}` : ''}`;
  if (label) {
    const labelElement = document.createElement('label');
    labelElement.id = labelId;
    labelElement.className = 'standard-select-label';
    labelElement.htmlFor = triggerId;
    labelElement.textContent = labelText;
    trigger.setAttribute('aria-labelledby', labelId);
    label.replaceWith(field);
    field.append(labelElement);
  } else {
    trigger.setAttribute('aria-label', labelText);
    select.parentElement?.replaceChild(field, select);
  }
  wrapper.append(trigger);
  field.append(wrapper);

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

  field.append(select);
  const popupHost = select.closest('dialog') || document.body;
  popupHost.append(popup);

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
    const width = Math.min(Math.max(rect.width, Math.min(224, viewportWidth - 16)), viewportWidth - 16);
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
    field,
    trigger,
    popup,
    anchorSupported,
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
  popup.addEventListener('toggle', event => {
    if (hasPopover) setOpenState(event.newState === 'open');
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
