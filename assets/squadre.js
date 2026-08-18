(() => {
  'use strict';
  const C = window.ReiettiCore;
  const $ = selector => document.querySelector(selector);

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    try {
      const demoMode = new URLSearchParams(window.location.search).get('demo') === '1';
      const [config, teams, csvText] = await Promise.all([
        C.fetchJson('data/config.json'),
        C.fetchJson('data/teams.json'),
        C.fetchText(demoMode ? 'data/results.demo.csv' : 'data/results.csv', '')
      ]);
      const rows = C.normalizeResults(C.parseCsv(csvText));
      const standings = C.calculateLeagueStandings(rows, teams, config);
      const trophies = C.calculateTrophyCabinet(rows, teams, config);
      const prizeLedger = C.calculatePrizeLedger(rows, [], teams, config);

      $('#league-name').textContent = config.leagueName;
      $('#season-label').textContent = `Stagione ${config.season}`;
      $('#footer-season').textContent = config.season;
      document.title = `${config.leagueName} — Squadre`;

      // MODIFICA FACILE:
      // - nome/logo/motto: data/teams.json
      // - trofei storici: campo "trophies" di ogni squadra in data/teams.json
      //   (Campionato, Cintura, Reietto del Mese; niente Coppa Italia/Champions).
      $('#teams-showcase').innerHTML = teams.map(team => `
        <article class="team-showcase-card">
          <button class="team-profile-trigger team-profile-trigger-roster" type="button" data-team-profile="${C.escapeHtml(team.id)}" aria-label="Apri scheda di ${C.escapeHtml(team.name)}">
            ${C.teamLogoHtml(team, 'team-logo-roster')}
          </button>
          <div class="team-showcase-copy">
            <span class="team-showcase-code">${C.escapeHtml(team.shortName || '')}</span>
            <h2>${C.escapeHtml(team.name)}</h2>
            <p>${C.escapeHtml(team.motto || '')}</p>
          </div>
          ${C.trophyCabinetHtml(trophies.get(team.id) || {}, 'trophy-cabinet-roster')}
        </article>`).join('');
      C.activateLogoFallbacks();

      window.ReiettiTeamProfile?.init({ config, teams, rows, standings, trophies, prizeLedger });
    } catch (error) {
      console.error(error);
      $('#teams-showcase').innerHTML = '<div class="teams-loading">Impossibile caricare le squadre.</div>';
    }
  }
})();
