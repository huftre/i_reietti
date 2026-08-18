(() => {
  'use strict';
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const response = await fetch('data/config.json', { cache: 'no-store' });
      const config = await response.json();
      document.querySelector('#league-name').textContent = config.leagueName;
      document.querySelector('#season-label').textContent = `Stagione ${config.season}`;
      document.querySelector('#footer-season').textContent = config.season;
      document.title = `${config.leagueName} — Regolamento`;
    } catch (error) {
      console.warn('Configurazione non disponibile:', error);
    }
  });
})();
