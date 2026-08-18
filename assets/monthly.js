(() => {
  'use strict';

  const C = window.ReiettiCore;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  let selectedPeriod = 0;

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
      const monthly = C.calculateMonthlyRankings(rows, teams, config);
      renderBranding(config, rows, teams, demoMode);
      $('#period-prize').textContent = C.formatCurrency(config.monthlyPrize, config.currency);
      renderNavigation(monthly, config, map);
      selectInitialPeriod(monthly, rows, config, map);
      C.activateLogoFallbacks();
    } catch (error) {
      console.error(error);
      $('#monthly-table-body').innerHTML = '<tr class="empty-row"><td colspan="5">Impossibile caricare i dati.</td></tr>';
    }
  }

  function renderBranding(config, rows, teams, demoMode) {
    $('#league-name').textContent = config.leagueName;
    $('#season-label').textContent = `Stagione ${config.season}`;
    $('#footer-season').textContent = config.season;
    document.title = `${config.leagueName} — Reietto del Mese`;
    const latest = C.latestCompleteDay(rows, teams, config, false);
    $('#last-updated').textContent = demoMode ? 'Modalità demo' : latest ? C.matchdayLabel(latest, config, true) : 'In attesa dei fantapunti';
  }

  function renderNavigation(monthly, config, map) {
    $('#period-nav').innerHTML = monthly.map((period, index) => `
      <button class="period-button ${period.complete ? 'complete' : ''}" type="button" role="tab" data-index="${index}" aria-selected="false">
        <strong>Blocco ${period.index}</strong>
        <span>Serie A ${period.start}–${period.end}</span>
      </button>`).join('');

    $$('.period-button').forEach(button => {
      button.addEventListener('click', () => {
        selectedPeriod = Number(button.dataset.index);
        renderPeriod(monthly[selectedPeriod], config, map);
      });
    });
  }

  function selectInitialPeriod(monthly, rows, config, map) {
    const latestDay = rows.filter(row => row.fantapunti !== null).reduce((max, row) => Math.max(max, row.giornata), Number(config.startMatchday));
    selectedPeriod = Math.max(0, Math.min(monthly.length - 1, Math.floor((latestDay - Number(config.startMatchday)) / Number(config.monthlyBlockSize))));
    renderPeriod(monthly[selectedPeriod], config, map);
  }

  function renderPeriod(period, config, map) {
    $$('.period-button').forEach((button, index) => {
      button.classList.toggle('active', index === selectedPeriod);
      button.setAttribute('aria-selected', String(index === selectedPeriod));
    });

    const totalDays = period.end - period.start + 1;
    const progress = Math.round((period.completedDays.length / totalDays) * 100);
    $('#period-status').textContent = period.complete ? `Blocco ${period.index} concluso` : `Blocco ${period.index} in corso`;
    $('#period-title').textContent = `Serie A: giornate ${period.start}–${period.end}`;
    $('#period-league-title').textContent = `${C.leagueDayFromSerieA(period.start, config)}ª–${C.leagueDayFromSerieA(period.end, config)}ª giornata di Lega`;
    $('#period-progress-label').textContent = `${period.completedDays.length} di ${totalDays} giornate completate`;
    $('#period-progress-percent').textContent = `${progress}%`;
    $('#period-progress-bar').style.width = `${progress}%`;
    renderRanking(period, map);
  }

  function renderRanking(period, map) {
    const tbody = $('#monthly-table-body');
    if (!period.ranking.length || period.ranking.every(item => item.appearances === 0)) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Nessun fantapunto disponibile per questo blocco.</td></tr>';
      return;
    }

    const winners = period.complete ? C.monthlyPrizeWinners(period).map(item => item.teamId) : [];
    tbody.innerHTML = period.ranking.map((item, index) => {
      const team = C.getTeam(map, item.teamId);
      const isWinner = winners.includes(item.teamId);
      return `
        <tr class="${isWinner ? 'winner-row' : ''}">
          <td><span class="${index < 3 ? 'rank top' : 'rank'}">${index + 1}</span></td>
          <td><div class="team-cell team-cell-with-logo">${C.teamLogoHtml(team)}<div><strong>${C.escapeHtml(team.name)}</strong><small>${C.escapeHtml(team.shortName || '')}</small></div></div></td>
          <td class="numeric">${item.appearances}</td>
          <td class="numeric"><strong>${C.formatPoints(item.total)}</strong></td>
          <td class="numeric">${item.appearances ? C.formatPoints(item.average) : '—'}</td>
        </tr>`;
    }).join('');
    C.activateLogoFallbacks(tbody);
  }
})();
