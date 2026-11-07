const HTMLElementBase = globalThis.HTMLElement || class {};

class AppButton extends HTMLElementBase {
  connectedCallback() {
    if (!this.shadowRoot) {
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `
        <style>
          :host { display: contents; }
          ::slotted(.util-action) {
            box-sizing: border-box;
            min-height: 2.4rem;
            border: 1px solid var(--app-border, var(--game-line, currentColor));
            border-radius: .65rem;
            padding: .5rem .75rem;
            background: var(--util-surface, color-mix(in srgb, var(--app-bg, #171d22) 92%, var(--app-text, var(--game-ink, #fff)) 8%));
            color: var(--app-text, var(--game-ink, currentColor));
            font: inherit;
            cursor: pointer;
            transition: background-color 140ms ease, border-color 140ms ease;
          }
          ::slotted(.util-action:hover) {
            background: var(--util-surface-strong, var(--btn-hover, color-mix(in srgb, var(--app-bg, #171d22) 82%, var(--app-text, #fff) 18%)));
          }
          ::slotted(.util-action:active) {
            background: var(--util-surface-strong, var(--btn-active, color-mix(in srgb, var(--app-bg, #171d22) 78%, var(--app-text, #fff) 22%)));
          }
          ::slotted(.util-action:disabled) {
            opacity: .45;
            cursor: default;
            pointer-events: none;
          }
          ::slotted(.util-action:focus-visible) {
            outline: 2px solid var(--focus-color);
            outline-offset: 2px;
          }
          :host([size="icon"]) ::slotted(.util-action),
          ::slotted(.util-action[data-app-button-size="icon"]) {
            display: inline-grid;
            width: 2.4rem;
            min-width: 2.4rem;
            height: 2.4rem;
            min-height: 2.4rem;
            place-items: center;
            padding: .4rem;
            line-height: 1;
          }
          :host([size="compact"]) ::slotted(.util-action),
          ::slotted(.util-action[data-app-button-size="compact"]) {
            display: inline-grid;
            width: 1.75rem;
            min-width: 1.75rem;
            height: 1.75rem;
            min-height: 1.75rem;
            place-items: center;
            padding: 0;
            border-radius: .48rem;
            line-height: 1;
          }
          :host([variant="quiet"]) ::slotted(.util-action),
          ::slotted(.util-action[data-app-button-variant="quiet"]) {
            border-color: transparent;
            background: transparent;
          }
          :host([variant="quiet"]) ::slotted(.util-action:hover),
          ::slotted(.util-action[data-app-button-variant="quiet"]:hover) {
            background: var(--btn-hover, var(--util-surface-strong));
          }
          :host([variant="quiet"]) ::slotted(.util-action:active),
          ::slotted(.util-action[data-app-button-variant="quiet"]:active) {
            background: var(--btn-active, var(--util-surface-strong));
          }
          :host([variant="primary"]) ::slotted(.util-action),
          ::slotted(.util-action[data-app-button-variant="primary"]) {
            border-color: color-mix(in srgb, var(--accent) 86%, #000);
            background: color-mix(in srgb, var(--accent) 86%, #000);
            color: #fff;
          }
        </style>
        <slot></slot>
      `;
    }

    const button = this.querySelector(':scope > button');
    if (!button) return;

    button.classList.add('util-action');
    button.dataset.appButtonSize = this.getAttribute('size') || 'standard';
    button.dataset.appButtonVariant = this.getAttribute('variant') || 'standard';
  }
}

if (globalThis.customElements && !globalThis.customElements.get('app-button')) {
  globalThis.customElements.define('app-button', AppButton);
}

const FORM_CONTROL_STYLES = `
  <style>
    :host { display: contents; }

    ::slotted(input[type="checkbox"]),
    ::slotted(input[type="radio"]) {
      box-sizing: border-box;
      display: inline-grid;
      flex: none;
      place-content: center;
      width: 1rem;
      height: 1rem;
      margin: 0;
      appearance: none;
      -webkit-appearance: none;
      border: 1px solid color-mix(in srgb, var(--app-text) 42%, transparent);
      background: var(--btn-hover);
      color: var(--app-bg);
      cursor: pointer;
    }
    ::slotted(input[type="checkbox"]) { border-radius: .25rem; }
    ::slotted(input[type="radio"]) { border-radius: 50%; }
    ::slotted(input[type="checkbox"]:not(:checked):hover),
    ::slotted(input[type="radio"]:not(:checked):hover) { background: var(--btn-active); }
    ::slotted(input[type="checkbox"]:checked),
    ::slotted(input[type="radio"]:checked) {
      border-color: var(--focus-color);
      background-color: var(--focus-color);
    }
    ::slotted(input[type="checkbox"])::before {
      content: "";
      width: .52rem;
      height: .3rem;
      border: solid var(--app-bg);
      border-width: 0 0 2px 2px;
      opacity: 0;
      transform: translateY(-.08rem) rotate(-45deg);
    }
    ::slotted(input[type="checkbox"]:checked)::before { opacity: 1; }
    ::slotted(input[type="radio"])::before {
      content: "";
      width: .38rem;
      height: .38rem;
      border-radius: 50%;
      background: var(--app-bg);
      transform: scale(0);
      transition: transform 100ms ease-out;
    }
    ::slotted(input[type="radio"]:checked)::before { transform: scale(1); }
    ::slotted(input[type="checkbox"]:focus-visible),
    ::slotted(input[type="radio"]:focus-visible) {
      outline: 2px solid var(--focus-color);
      outline-offset: 2px;
    }
    ::slotted(input[type="checkbox"]:disabled),
    ::slotted(input[type="radio"]:disabled) { cursor: not-allowed; opacity: .55; }

    :host([placement="overlay"]) {
      position: absolute;
      inset-block-start: .38rem;
      inset-inline-end: .38rem;
      z-index: 2;
      display: inline-grid;
      width: 1rem;
      height: 1rem;
    }

    @media (forced-colors: active) {
      ::slotted(input[type="checkbox"]),
      ::slotted(input[type="radio"]) {
        appearance: auto;
        -webkit-appearance: auto;
        accent-color: Highlight;
      }
    }
  </style>
  <slot></slot>
`;

const RANGE_CONTROL_STYLES = `
  <style>
    :host { display: block; width: 100%; min-width: 0; }
    .app-range-track {
      display: block;
      position: relative;
      width: 100%;
      height: 2.75rem;
      touch-action: pan-y;
    }
    .app-range-track input[type="range"] {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0 .15rem;
      appearance: none;
      -webkit-appearance: none;
      background: transparent;
      cursor: pointer;
      touch-action: pan-y;
    }
    .app-range-track input[type="range"]::-webkit-slider-runnable-track {
      height: .4rem;
      border: 1px solid var(--app-border);
      border-radius: 999px;
      background: var(--btn-hover);
    }
    .app-range-track input[type="range"]::-webkit-slider-thumb {
      width: 1.45rem;
      height: 1.45rem;
      margin-top: -.57rem;
      appearance: none;
      -webkit-appearance: none;
      border: 3px solid var(--app-bg);
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--app-text) 35%, transparent), 0 .1rem .3rem #0005;
    }
    .app-range-track input[type="range"]::-moz-range-track {
      height: .4rem;
      border: 1px solid var(--app-border);
      border-radius: 999px;
      background: var(--btn-hover);
    }
    .app-range-track input[type="range"]::-moz-range-thumb {
      width: 1.1rem;
      height: 1.1rem;
      border: 3px solid var(--app-bg);
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--app-text) 35%, transparent), 0 .1rem .3rem #0005;
    }
    .app-range-track input[type="range"]:focus-visible { outline: none; }
    .app-range-track input[type="range"]:focus-visible::-webkit-slider-thumb,
    .app-range-track input[type="range"]:focus-visible::-moz-range-thumb {
      outline: 2px solid var(--focus-color);
      outline-offset: 3px;
    }
    .app-range-track input[type="range"]:disabled { cursor: not-allowed; opacity: .5; }
    @media (pointer: coarse) {
      .app-range-track input[type="range"]::-webkit-slider-thumb {
        width: 1.55rem;
        height: 1.55rem;
        margin-top: -.62rem;
      }
      .app-range-track input[type="range"]::-moz-range-thumb {
        width: 1.25rem;
        height: 1.25rem;
      }
    }
    @media (forced-colors: active) {
      .app-range-track input[type="range"]::-webkit-slider-runnable-track,
      .app-range-track input[type="range"]::-moz-range-track {
        border-color: CanvasText;
        background: Canvas;
      }
      .app-range-track input[type="range"]::-webkit-slider-thumb,
      .app-range-track input[type="range"]::-moz-range-thumb {
        border-color: Canvas;
        background: Highlight;
      }
    }
  </style>
  <label class="app-range-track">
    <input type="range">
  </label>
`;

class AppFormControl extends HTMLElementBase {
  connectedCallback() {
    if (!this.shadowRoot) {
      if (this.localName === 'app-range') this.connectRange();
      else this.attachShadow({ mode: 'open' }).innerHTML = FORM_CONTROL_STYLES;
    }
  }

  connectRange() {
    const source = this.querySelector(':scope > input[type="range"]');
    if (!source) return;
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = RANGE_CONTROL_STYLES;
    const control = root.querySelector('.app-range-track input');
    const copyAttributes = () => {
      for (const attribute of ['min', 'max', 'step', 'disabled', 'aria-valuetext', 'title']) {
        if (source.hasAttribute(attribute)) control.setAttribute(attribute, source.getAttribute(attribute));
        else control.removeAttribute(attribute);
      }
      const labelledByText = source.getAttribute('aria-labelledby')?.split(/\s+/)
        .map(id => document.getElementById(id)?.textContent?.trim())
        .filter(Boolean)
        .join(' ');
      const explicitLabelText = source.id
        ? document.querySelector(`label[for="${CSS.escape(source.id)}"]`)?.textContent?.trim()
        : '';
      const name = source.getAttribute('aria-label')
        || labelledByText
        || this.getAttribute('aria-label')
        || explicitLabelText
        || source.closest('label')?.textContent?.trim();
      control.removeAttribute('aria-labelledby');
      if (name) control.setAttribute('aria-label', name);
      else control.removeAttribute('aria-label');
      const description = source.getAttribute('aria-describedby')?.split(/\s+/)
        .map(id => document.getElementById(id)?.textContent?.trim())
        .filter(Boolean)
        .join(' ');
      if (description) control.setAttribute('aria-description', description);
      else control.removeAttribute('aria-description');
      control.value = source.value;
    };
    source.classList.add('app-control-native');
    source.tabIndex = -1;
    source.setAttribute('aria-hidden', 'true');
    copyAttributes();
    this._sourceFocusHandler = () => {
      if (root.activeElement !== control) control.focus({ preventScroll: true });
    };
    source.addEventListener('focus', this._sourceFocusHandler);
    this._associatedLabel = source.id
      ? document.querySelector(`label[for="${CSS.escape(source.id)}"]`)
      : null;
    this._associatedLabelHandler = () => requestAnimationFrame(() => control.focus({ preventScroll: true }));
    this._associatedLabel?.addEventListener('click', this._associatedLabelHandler);

    const dispatchSourceEvent = type => {
      source.value = control.value;
      source.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
    };
    control.addEventListener('input', () => dispatchSourceEvent('input'));
    control.addEventListener('change', () => dispatchSourceEvent('change'));

    const observer = new MutationObserver(copyAttributes);
    observer.observe(source, { attributes: true });
    this._rangeObserver = observer;
    this._sourceRange = source;
    this._copyRangeAttributes = copyAttributes;
    this._formResetHandler = () => requestAnimationFrame(() => this.sync());
    source.form?.addEventListener('reset', this._formResetHandler);
  }

  disconnectedCallback() {
    this._rangeObserver?.disconnect();
    this._rangeObserver = null;
    if (this._formResetHandler) this._sourceRange?.form?.removeEventListener('reset', this._formResetHandler);
    this._formResetHandler = null;
    if (this._sourceFocusHandler) this._sourceRange?.removeEventListener('focus', this._sourceFocusHandler);
    this._sourceFocusHandler = null;
    if (this._associatedLabelHandler) this._associatedLabel?.removeEventListener('click', this._associatedLabelHandler);
    this._associatedLabelHandler = null;
    this._associatedLabel = null;
  }

  focus(options) {
    const range = this.shadowRoot?.querySelector('.app-range-track input');
    if (range) range.focus(options);
    else this.querySelector('input')?.focus(options);
  }

  get control() {
    return this.localName === 'app-range'
      ? this.shadowRoot?.querySelector('.app-range-track input') || this._sourceRange
      : this.querySelector('input');
  }

  get value() {
    return this.control?.value ?? '';
  }

  set value(value) {
    if (this.localName === 'app-range') {
      const range = this.shadowRoot?.querySelector('.app-range-track input');
      if (range) range.value = value;
      if (this._sourceRange) this._sourceRange.value = value;
    } else if (this.control) {
      this.control.value = value;
    }
  }

  get checked() {
    return Boolean(this.querySelector('input[type="checkbox"], input[type="radio"]')?.checked);
  }

  set checked(value) {
    const input = this.querySelector('input[type="checkbox"], input[type="radio"]');
    if (input) input.checked = Boolean(value);
  }

  get disabled() {
    return Boolean(this._sourceRange?.disabled || this.querySelector('input')?.disabled);
  }

  set disabled(value) {
    const disabled = Boolean(value);
    const input = this.querySelector('input');
    if (input) input.disabled = disabled;
    const range = this.shadowRoot?.querySelector('.app-range-track input');
    if (range) range.disabled = disabled;
  }

  get min() {
    return this._sourceRange?.min ?? this.control?.min ?? '';
  }

  set min(value) {
    if (this._sourceRange) this._sourceRange.min = value;
    if (this.control) this.control.min = value;
  }

  get max() {
    return this._sourceRange?.max ?? this.control?.max ?? '';
  }

  set max(value) {
    if (this._sourceRange) this._sourceRange.max = value;
    if (this.control) this.control.max = value;
  }

  get step() {
    return this._sourceRange?.step ?? this.control?.step ?? '';
  }

  set step(value) {
    if (this._sourceRange) this._sourceRange.step = value;
    if (this.control) this.control.step = value;
  }

  sync() {
    if (this.localName === 'app-range') {
      const source = this._sourceRange || this.querySelector(':scope > input[type="range"]');
      if (source && !this.shadowRoot) this.connectRange();
      else if (source) this._copyRangeAttributes?.();
    }
  }
}

if (globalThis.customElements) {
  for (const tagName of ['app-checkbox', 'app-radio', 'app-range']) {
    if (!globalThis.customElements.get(tagName)) {
      globalThis.customElements.define(tagName, class extends AppFormControl {});
    }
  }
}

const INPUT_CONTROL_TAGS = {
  checkbox: 'app-checkbox',
  radio: 'app-radio',
  range: 'app-range',
};

export function wrapAppControl(input, { placement } = {}) {
  if (!globalThis.HTMLInputElement || !(input instanceof globalThis.HTMLInputElement)) {
    throw new TypeError('App form controls must wrap a native input.');
  }
  const tagName = INPUT_CONTROL_TAGS[input.type];
  if (!tagName) throw new TypeError(`Unsupported shared form control: ${input.type}`);
  if (input.parentElement?.localName === tagName) return input.parentElement;

  const component = globalThis.document.createElement(tagName);
  if (placement) component.setAttribute('placement', placement);
  input.classList.add('app-control-native');
  const parent = input.parentNode;
  const nextSibling = input.nextSibling;
  component.append(input);
  if (parent) parent.insertBefore(component, nextSibling);
  return component;
}

export function upgradeAppControls(container) {
  if (!container?.querySelectorAll) return [];
  return [...container.querySelectorAll('input[type="checkbox"], input[type="radio"], input[type="range"]')]
    .map(input => wrapAppControl(input));
}

export function wrapAppButton(button, { size = 'standard', variant = 'standard' } = {}) {
  if (!globalThis.HTMLButtonElement || !(button instanceof globalThis.HTMLButtonElement)) {
    throw new TypeError('app-button must wrap a native button.');
  }

  const parent = button.parentNode;
  const nextSibling = button.nextSibling;
  const component = globalThis.document.createElement('app-button');
  component.setAttribute('size', size);
  component.setAttribute('variant', variant);
  component.append(button);
  if (parent) parent.insertBefore(component, nextSibling);
  return component;
}

class AppDialogActions extends HTMLElementBase {
  connectedCallback() {
    if (this.dataset.cancelHandlerReady === 'true') return;
    this.dataset.cancelHandlerReady = 'true';
    this.classList.add('app-dialog-actions');
    this.addEventListener('click', event => {
      const button = event.target.closest('button[data-action="cancel"]');
      if (!button || !this.contains(button)) return;
      this.closest('dialog')?.close('cancel');
    });
  }
}

if (globalThis.customElements && !globalThis.customElements.get('app-dialog-actions')) {
  globalThis.customElements.define('app-dialog-actions', AppDialogActions);
}
