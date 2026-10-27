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
