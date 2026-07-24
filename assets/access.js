(() => {
  'use strict';

  // Il codice non viene inviato a nessun servizio esterno.
  // Nel sito è conservata soltanto la sua impronta SHA-256.
  // Essendo una pagina statica, questo blocco è una barriera di cortesia e non
  // una protezione paragonabile a un vero login lato server.
  const ACCESS_HASH = '38713943e3b19b391c0dce360033c4ebef500213345584453806b137f219efa9';
  const SESSION_KEY = 'i-reietti-admin-access';
  const SESSION_VALUE = 'authorized-v1';

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  document.addEventListener('DOMContentLoaded', () => {
    const accessModal = $('#access-modal');
    const unauthorizedModal = $('#unauthorized-modal');
    const codeInput = $('#access-code');
    const form = $('#access-form');

    $$('.js-admin-access').forEach(button => {
      button.addEventListener('click', () => openModal(accessModal, codeInput));
    });

    $$('[data-close-modal]').forEach(button => {
      button.addEventListener('click', () => closeModal(accessModal));
    });

    $$('[data-close-unauthorized]').forEach(button => {
      button.addEventListener('click', () => {
        closeModal(unauthorizedModal);
        openModal(accessModal, codeInput);
      });
    });

    [accessModal, unauthorizedModal].forEach(modal => {
      modal.addEventListener('click', event => {
        if (event.target === modal) closeModal(modal);
      });
    });

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (!accessModal.hidden) closeModal(accessModal);
      if (!unauthorizedModal.hidden) closeModal(unauthorizedModal);
    });

    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const submittedCode = codeInput.value.trim();
      const submittedHash = await sha256(submittedCode);

      if (submittedHash === ACCESS_HASH) {
        sessionStorage.setItem(SESSION_KEY, SESSION_VALUE);
        window.location.assign('admin.html');
        return;
      }

      codeInput.value = '';
      closeModal(accessModal);
      openModal(unauthorizedModal);
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'required') {
      openModal(accessModal, codeInput);
      history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    }
  });

  function openModal(modal, focusElement = null) {
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => {
      modal.classList.add('visible');
      focusElement?.focus();
    });
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('visible');
    window.setTimeout(() => {
      modal.hidden = true;
      if (document.querySelectorAll('.modal-backdrop.visible').length === 0) {
        document.body.classList.remove('modal-open');
      }
    }, 160);
  }

  async function sha256(value) {
    const data = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
})();
