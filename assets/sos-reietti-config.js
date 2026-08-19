(() => {
  'use strict';

  /* =========================================================
     SOS REIETTI - CONFIGURAZIONE
     =========================================================
     MODIFICA FACILE:
     - proxyUrl: indirizzo del Worker Cloudflare.
     - leagueTeams: numero di squadre della lega.
     - budget: crediti iniziali per squadra.
     - roster: numero di giocatori per ruolo.
     - roleBudgetPercent: quota indicativa del budget per reparto.

     NON inserire mai qui le chiavi API: restano nei Secret Cloudflare.
     ========================================================= */

  window.SOS_REIETTI_CONFIG = Object.freeze({
    proxyUrl: 'https://sos-reietti-api.huftre.workers.dev',

    // PARAMETRI LEGA
    leagueTeams: 14,
    budget: 800,
    roster: Object.freeze({
      P: 3,
      D: 8,
      C: 8,
      A: 6
    }),

    // RIPARTIZIONE BUDGET PER REPARTO
    // MODIFICA QUI se in futuro vuoi cambiare la strategia economica.
    // La somma deve restare 100.
    roleBudgetPercent: Object.freeze({
      P: 7,
      D: 16,
      C: 27,
      A: 50
    })
  });
})();
