(() => {
  'use strict';

  // Menu comune a tutte le pagine pubbliche.
  document.addEventListener('DOMContentLoaded', () => {
    injectAccessModals();
    initMobileMenu();
    initCompetitionMenu();
  });

  function initMobileMenu() {
    const toggle = document.querySelector('#menu-toggle');
    const nav = document.querySelector('#main-nav');
    if (!toggle || !nav) return;

    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });

    nav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  function initCompetitionMenu() {
    document.querySelectorAll('.nav-dropdown').forEach(dropdown => {
      const button = dropdown.querySelector('.nav-dropdown-toggle');
      if (!button) return;
      button.addEventListener('click', event => {
        event.stopPropagation();
        const open = dropdown.classList.toggle('is-open');
        button.setAttribute('aria-expanded', String(open));
      });
    });

    document.addEventListener('click', event => {
      document.querySelectorAll('.nav-dropdown.is-open').forEach(dropdown => {
        if (dropdown.contains(event.target)) return;
        dropdown.classList.remove('is-open');
        dropdown.querySelector('.nav-dropdown-toggle')?.setAttribute('aria-expanded', 'false');
      });
    });
  }

  function injectAccessModals() {
    if (document.querySelector('#access-modal')) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="modal-backdrop" id="access-modal" hidden>
        <section class="access-modal" role="dialog" aria-modal="true" aria-labelledby="access-title">
          <button class="modal-close" type="button" data-close-modal aria-label="Chiudi">×</button>
          <div class="modal-icon" aria-hidden="true">🔐</div>
          <span class="eyebrow">Area riservata</span>
          <h2 id="access-title">Inserisci il codice di accesso</h2>
          <p>Il pannello Admin gestisce risultati e contabilità della Lega.</p>
          <form id="access-form">
            <label class="field-label" for="access-code">Codice</label>
            <input id="access-code" class="access-code-input" type="password" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="••••••" required>
            <button class="button button-primary full-width" type="submit">Entra nel pannello</button>
          </form>
        </section>
      </div>
      <div class="modal-backdrop" id="unauthorized-modal" hidden>
        <section class="access-modal access-modal-small" role="alertdialog" aria-modal="true" aria-labelledby="unauthorized-title">
          <div class="modal-icon modal-icon-error" aria-hidden="true">⛔</div>
          <h2 id="unauthorized-title">Non sei autorizzato</h2>
          <p>Il codice inserito non è corretto.</p>
          <button class="button button-secondary full-width" type="button" data-close-unauthorized>Chiudi</button>
        </section>
      </div>`;
    while (wrapper.firstElementChild) document.body.appendChild(wrapper.firstElementChild);
  }
})();
