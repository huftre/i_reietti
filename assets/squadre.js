(() => {
  'use strict';
  const C = window.ReiettiCore;
  const $ = selector => document.querySelector(selector);

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    try {
      const [config, teams] = await Promise.all([
        C.fetchJson('data/config.json'),
        C.fetchJson('data/teams.json')
      ]);
      $('#league-name').textContent = config.leagueName;
      $('#season-label').textContent = `Stagione ${config.season}`;
      $('#footer-season').textContent = config.season;
      document.title = `${config.leagueName} — Squadre`;

      // MODIFICA FACILE: nome/logo sono in data/teams.json; il motto è il campo "motto".
      $('#teams-showcase').innerHTML = teams.map(team => `
        <article class="team-showcase-card">
          ${C.teamLogoHtml(team, 'team-logo-roster')}
          <div class="team-showcase-copy">
            <span class="team-showcase-code">${C.escapeHtml(team.shortName || '')}</span>
            <h2>${C.escapeHtml(team.name)}</h2>
            <p>${C.escapeHtml(team.motto || '')}</p>
          </div>
        </article>`).join('');
      C.activateLogoFallbacks();
    } catch (error) {
      console.error(error);
      $('#teams-showcase').innerHTML = '<div class="teams-loading">Impossibile caricare le squadre.</div>';
    }
  }
})();
