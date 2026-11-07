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
