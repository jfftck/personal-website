const HTMLElementBase = globalThis.HTMLElement || class {};

class AppButton extends HTMLElementBase {
  connectedCallback() {
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
