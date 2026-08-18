(() => {
  'use strict';

  const AUTH_KEY = 'i-reietti-admin-access';
  const AUTH_VALUE = 'authorized-v1';
  let toastTimer;

  document.addEventListener('DOMContentLoaded', () => {
    if (!isAuthorized()) {
      window.location.replace('index.html?auth=required');
      return;
    }

    document.querySelector('#admin-logout')?.addEventListener('click', logout);
    initTabs();
  });

  function isAuthorized() {
    try {
      return sessionStorage.getItem(AUTH_KEY) === AUTH_VALUE;
    } catch (error) {
      return false;
    }
  }

  function logout() {
    try { sessionStorage.removeItem(AUTH_KEY); } catch (error) { /* nessuna azione */ }
    window.location.assign('index.html');
  }

  function initTabs() {
    const buttons = [...document.querySelectorAll('[data-admin-tab]')];
    const panels = [...document.querySelectorAll('[data-admin-panel]')];
    if (!buttons.length) return;

    const activate = name => {
      buttons.forEach(button => {
        const active = button.dataset.adminTab === name;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
      });
      panels.forEach(panel => {
        panel.hidden = panel.dataset.adminPanel !== name;
      });
      if (history.replaceState) history.replaceState(null, '', `#${name}`);
    };

    buttons.forEach(button => button.addEventListener('click', () => activate(button.dataset.adminTab)));
    const requested = location.hash.replace('#', '');
    activate(buttons.some(button => button.dataset.adminTab === requested) ? requested : 'risultati');
  }

  function showToast(message) {
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  window.ReiettiAdmin = { isAuthorized, showToast };
})();
