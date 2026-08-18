(() => {
  'use strict';

  const C = window.ReiettiCore;
  const $ = selector => document.querySelector(selector);
  let toastTimer;

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
      const map = C.teamMap(teams);
      const standings = C.calculateLeagueStandings(rows, teams, config);
      const trophies = C.calculateTrophyCabinet(rows, teams, config);
      const prizeLedger = C.calculatePrizeLedger(rows, [], teams, config);
      renderBranding(config, rows, teams, demoMode);
      renderStatus(config, rows, teams, standings, map);
      renderStandings(config, rows, standings, map);
      C.activateLogoFallbacks();
      window.ReiettiTeamProfile?.init({ config, teams, rows, standings, trophies, prizeLedger });
    } catch (error) {
      console.error(error);
      showToast('Impossibile caricare la classifica. Controlla i file nella cartella data.');
    }
  }

  function renderBranding(config, rows, teams, demoMode) {
    $('#league-name').textContent = config.leagueName;
    $('#season-label').textContent = `Stagione ${config.season}`;
    $('#footer-season').textContent = config.season;
    document.title = `${config.leagueName} — Campionato ${config.season}`;

    const latest = C.latestCompleteDay(rows, teams, config, true);
    const pill = $('#last-updated');
    if (demoMode) pill.textContent = 'Modalità demo';
    else if (latest !== null) pill.textContent = C.matchdayLabel(latest, config, true);
    else pill.textContent = 'In attesa della 1ª giornata di Lega';
  }

  function renderStatus(config, rows, teams, standings, map) {
    const latest = C.latestCompleteDay(rows, teams, config, true);
    const anyPlayed = standings.some(item => item.played > 0);
    const leader = anyPlayed ? standings[0] : null;

    $('#current-matchday').textContent = latest === null
      ? 'Campionato non iniziato'
      : C.matchdayLabel(latest, config, false);
    $('#current-matchday-detail').textContent = latest === null
      ? 'La classifica partirà con la 3ª giornata di Serie A.'
      : `Risultati completi caricati fino alla ${latest}ª giornata di Serie A.`;

    if (leader) {
      const leaderTeam = C.getTeam(map, leader.teamId);
      $('#league-leader').textContent = leaderTeam.name;
      $('#league-leader-detail').textContent = `${leader.points} punti · ${C.formatPoints(leader.fantasyPoints)} fantapunti`;
    } else {
      $('#league-leader').textContent = 'Da assegnare';
      $('#league-leader-detail').textContent = 'Tutte le squadre partono da zero.';
    }
  }

  function renderStandings(config, rows, standings, map) {
    const tbody = $('#league-table-body');
    const competitionStarted = standings.some(item => item.played > 0);

    /*
     * CLASSIFICA PRIMA DELL'INIZIO:
     * Mostriamo comunque tutte le squadre con logo, nome e valori a zero.
     * Finché non viene caricata la prima giornata non evidenziamo un leader.
     */
    const displayStandings = competitionStarted
      ? standings
      : [...standings].sort((a, b) => {
          const teamA = C.getTeam(map, a.teamId);
          const teamB = C.getTeam(map, b.teamId);
          return String(teamA.name).localeCompare(String(teamB.name), 'it', { sensitivity: 'base' });
        });

    tbody.innerHTML = displayStandings.map((item, index) => {
      const team = C.getTeam(map, item.teamId);
      const rankClass = competitionStarted && index < 4 ? 'rank top' : 'rank';
      const position = competitionStarted ? index + 1 : '—';
      const form = C.calculateRecentForm(rows, item.teamId, config, 5);
      return `
        <tr class="${competitionStarted && index === 0 ? 'leader-row' : ''}">
          <td><span class="${rankClass}">${position}</span></td>
          <td>
            <div class="team-cell team-cell-with-logo">
              <button class="team-profile-trigger team-profile-trigger-table" type="button" data-team-profile="${C.escapeHtml(team.id)}" aria-label="Apri scheda di ${C.escapeHtml(team.name)}">
                ${C.teamLogoHtml(team)}
              </button>
              <div><strong>${C.escapeHtml(team.name)}</strong><small>${C.escapeHtml(team.shortName || '')}</small></div>
            </div>
          </td>
          <td class="numeric"><strong>${item.points}</strong></td>
          <td class="numeric">${item.played}</td>
          <td class="numeric">${item.wins}</td>
          <td class="numeric">${item.draws}</td>
          <td class="numeric">${item.losses}</td>
          <td class="numeric">${item.goalsFor}</td>
          <td class="numeric">${item.goalsAgainst}</td>
          <td class="numeric">${item.goalDifference > 0 ? '+' : ''}${item.goalDifference}</td>
          <td class="numeric">${C.formatPoints(item.fantasyPoints)}</td>
          <td class="form-cell">${renderForm(form)}</td>
        </tr>`;
    }).join('');
  }

  // FORMA RECENTE: V = vittoria, P = pareggio, S = sconfitta.
  function renderForm(form) {
    if (!form.length) return '<span class="form-empty">—</span>';
    return `<div class="form-strip">${form.map(match => {
      const title = `${match.day}ª Serie A · ${match.goalsFor}-${match.goalsAgainst}${match.opponent ? ` · ${match.opponent}` : ''}`;
      return `<span class="form-result form-${match.result.toLowerCase()}" title="${C.escapeHtml(title)}">${match.result}</span>`;
    }).join('')}</div>`;
  }

  function showToast(message) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
  }
})();
