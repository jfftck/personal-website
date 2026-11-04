class AppButton extends HTMLElement {
  connectedCallback() {
    const button = this.querySelector(':scope > button');
    if (!button) return;

    button.classList.add('util-action');
    button.dataset.appButtonSize = this.getAttribute('size') || 'standard';
    button.dataset.appButtonVariant = this.getAttribute('variant') || 'standard';
  }
}

if (!customElements.get('app-button')) {
  customElements.define('app-button', AppButton);
}

export function wrapAppButton(button, { size = 'standard', variant = 'standard' } = {}) {
  if (!(button instanceof HTMLButtonElement)) {
    throw new TypeError('app-button must wrap a native button.');
  }

  const parent = button.parentNode;
  const nextSibling = button.nextSibling;
  const component = document.createElement('app-button');
  component.setAttribute('size', size);
  component.setAttribute('variant', variant);
  component.append(button);
  if (parent) parent.insertBefore(component, nextSibling);
  return component;
}

class AppDialogActions extends HTMLElement {
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

if (!customElements.get('app-dialog-actions')) {
  customElements.define('app-dialog-actions', AppDialogActions);
}
