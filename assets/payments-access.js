(() => {
  'use strict';

  // =========================================================
  // CODICE PAGAMENTI - MODIFICA QUI se in futuro vuoi cambiarlo.
  // Essendo un sito statico, è una barriera di cortesia e non un login server.
  // =========================================================
  const PAYMENT_ACCESS_CODE = '2023';
  const SESSION_KEY = 'i-reietti-payments-access';

  document.addEventListener('DOMContentLoaded', () => {
    const gate = document.querySelector('#payments-access-gate');
    const content = document.querySelector('#payments-private-content');
    const form = document.querySelector('#payments-access-form');
    const input = document.querySelector('#payments-access-code');
    const error = document.querySelector('#payments-access-error');
    if (!gate || !content || !form || !input || !error) return;

    const unlock = () => {
      sessionStorage.setItem(SESSION_KEY, 'authorized');
      gate.hidden = true;
      content.hidden = false;
      window.scrollTo({ top: 0, behavior: 'auto' });
    };

    if (sessionStorage.getItem(SESSION_KEY) === 'authorized') {
      unlock();
      return;
    }

    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 4);
      error.hidden = true;
    });

    form.addEventListener('submit', event => {
      event.preventDefault();
      if (input.value === PAYMENT_ACCESS_CODE) {
        unlock();
        return;
      }
      error.hidden = false;
      input.value = '';
      input.focus();
    });
  });
})();
