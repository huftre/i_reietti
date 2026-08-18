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
      const belt = C.calculateBelt(rows, teams, config);
      const periods = C.calculateMonthlyRankings(rows, teams, config);

      renderBranding(config, rows, teams, demoMode);
      renderLeagueSummary(standings, map);
      renderBeltSummary(belt, config, map);
      renderMonthlySummary(periods, config, map);
      C.activateLogoFallbacks();
    } catch (error) {
      console.error(error);
      showToast('Impossibile caricare il riepilogo della Lega. Controlla i file nella cartella data.');
    }
  }

  function renderBranding(config, rows, teams, demoMode) {
    $('#league-name').textContent = config.leagueName;
    $('#season-label').textContent = `Stagione ${config.season}`;
    $('#footer-season').textContent = config.season;
    document.title = `${config.leagueName} — Home`;

    const latest = C.latestCompleteDay(rows, teams, config, true);
    const pill = $('#last-updated');
    if (demoMode) pill.textContent = 'Modalità demo';
    else if (latest !== null) pill.textContent = C.matchdayLabel(latest, config, true);
    else pill.textContent = 'Stagione da iniziare';
  }

  // HOME - PRIMO RIQUADRO: mostra il leader del Campionato solo quando esiste almeno una partita giocata.
  function renderLeagueSummary(standings, map) {
    const leader = standings.some(item => item.played > 0) ? standings[0] : null;
    if (!leader) {
      $('#home-league-leader').textContent = 'Da assegnare';
      $('#home-league-detail').textContent = 'Campionato non iniziato.';
      return;
    }
    const team = C.getTeam(map, leader.teamId);
    $('#home-league-leader').textContent = team.name;
    $('#home-league-detail').textContent = `${leader.points} punti · ${C.formatPoints(leader.fantasyPoints)} fantapunti`;
  }

  // HOME - SECONDO RIQUADRO: stessa logica della pagina Cintura, senza modificarne il calcolo.
  function renderBeltSummary(belt, config, map) {
    if (belt.tie) {
      const names = (belt.tiedTeams || []).map(id => C.getTeam(map, id).name).join(' · ');
      $('#home-belt-holder').textContent = 'Assegnazione in parità';
      $('#home-belt-detail').textContent = names || 'La prima assegnazione è ancora da risolvere.';
      return;
    }
    if (!belt.holder) {
      $('#home-belt-holder').textContent = 'Da assegnare';
      $('#home-belt-detail').textContent = `Prima assegnazione alla ${Number(config.beltStartMatchday || 3)}ª giornata di Serie A.`;
      return;
    }
    const team = C.getTeam(map, belt.holder);
    $('#home-belt-holder').textContent = team.name;
    $('#home-belt-detail').textContent = `${belt.currentDefenses} difese · conquistata alla ${belt.acquiredDay}ª giornata Serie A`;
  }

  // HOME - TERZO RIQUADRO: prende l'ULTIMO blocco del Reietto del Mese completamente concluso.
  function renderMonthlySummary(periods, config, map) {
    const completedPeriods = periods.filter(period => period.complete);
    const latestPeriod = completedPeriods.length ? completedPeriods[completedPeriods.length - 1] : null;

    if (!latestPeriod) {
      $('#home-monthly-winner').textContent = 'Nessun periodo concluso';
      $('#home-monthly-detail').textContent = 'Il primo blocco non è ancora completo.';
      return;
    }

    const winners = C.monthlyPrizeWinners(latestPeriod);
    if (!winners.length) {
      $('#home-monthly-winner').textContent = 'Nessun vincitore disponibile';
      $('#home-monthly-detail').textContent = `Blocco ${latestPeriod.index} concluso, dati da verificare.`;
      return;
    }

    const names = winners.map(item => C.getTeam(map, item.teamId).name);
    $('#home-monthly-winner').textContent = names.length === 1 ? names[0] : 'Premio condiviso';
    $('#home-monthly-detail').textContent = names.length === 1
      ? `Blocco ${latestPeriod.index} · ${latestPeriod.start}ª-${latestPeriod.end}ª Serie A · ${C.formatPoints(winners[0].total)} FP`
      : `Blocco ${latestPeriod.index} · ${names.join(' / ')} · premio diviso`;
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
