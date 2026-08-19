(() => {
  'use strict';

  /* =========================================================
     SOS REIETTI - CONFIGURAZIONE FACILE
     =========================================================
     MODIFICA QUI SOLO "proxyUrl" dopo aver pubblicato il piccolo
     Worker/API proxy seguendo SOS-REIETTI-SETUP.txt.

     Esempio:
     proxyUrl: 'https://sos-reietti-api.nomeutente.workers.dev'

     NON inserire mai la chiave API-Football in questo file: il sito
     è pubblico e la chiave diventerebbe visibile a chiunque.
     ========================================================= */
  window.SOS_REIETTI_CONFIG = Object.freeze({
    proxyUrl: 'https://sos-reietti-api.huftre.workers.dev',

    // Parametri della Lega. Cambiali qui solo se cambiano le regole dell'asta.
    leagueTeams: 14,
    budget: 800,
    roster: Object.freeze({ P: 3, D: 8, C: 8, A: 6 }),

    // Ripartizione di riferimento del budget per reparto.
    // La somma deve restare 100.
    roleBudgetPercent: Object.freeze({ P: 7, D: 16, C: 27, A: 50 })
  });
})();
