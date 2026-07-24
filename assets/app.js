(() => {
  'use strict';

  const state = {
    config: null,
    teams: [],
    teamMap: new Map(),
    rows: [],
    periods: [],
    selectedPeriod: 0,
    seasonRanking: []
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    try {
      const demoMode = new URLSearchParams(window.location.search).get('demo') === '1';
      const [config, teams, csvText] = await Promise.all([
        fetchJson('data/config.json'),
        fetchJson('data/teams.json'),
        fetchText(demoMode ? 'data/results.demo.csv' : 'data/results.csv')
      ]);

      state.config = config;
      state.teams = teams;
      state.teamMap = new Map(teams.map(team => [team.id, team]));
      state.rows = normalizeRows(parseCsv(csvText));
      state.periods = buildPeriods(config.startMatchday, config.endMatchday, config.monthlyBlockSize);

      applyBranding();
      if (demoMode) {
        $('#last-updated').textContent = 'Modalità demo';
        showToast('Stai visualizzando dati dimostrativi.');
      }
      renderAll();
      bindFilters();
    } catch (error) {
      console.error(error);
      showToast('Impossibile caricare i dati. Controlla i file nella cartella data.');
    }
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Errore nel caricamento di ${url}`);
    return response.json();
  }

  async function fetchText(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Errore nel caricamento di ${url}`);
    return response.text();
  }

  function parseCsv(text) {
    const rows = [];
    let current = '';
    let record = [];
    let inQuotes = false;

    const pushCell = () => {
      record.push(current.trim());
      current = '';
    };
    const pushRecord = () => {
      if (record.some(cell => cell !== '')) rows.push(record);
      record = [];
    };

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];
      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        pushCell();
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && next === '\n') i += 1;
        pushCell();
        pushRecord();
      } else {
        current += char;
      }
    }
    if (current.length || record.length) {
      pushCell();
      pushRecord();
    }

    if (rows.length < 2) return [];
    const headers = rows[0].map(header => header.toLowerCase());
    return rows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
  }

  function normalizeRows(rows) {
    return rows
      .map(row => ({
        giornata: toNumber(row.giornata),
        squadra: String(row.squadra || '').trim(),
        avversario: String(row.avversario || '').trim(),
        fantapunti: toOptionalNumber(row.fantapunti),
        golFatti: toOptionalNumber(row.gol_fatti),
        golSubiti: toOptionalNumber(row.gol_subiti)
      }))
      .filter(row => Number.isInteger(row.giornata) && row.squadra)
      .sort((a, b) => a.giornata - b.giornata || a.squadra.localeCompare(b.squadra, 'it'));
  }

  function toNumber(value) {
    const number = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(number) ? number : NaN;
  }

  function toOptionalNumber(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const number = Number(raw.replace(',', '.'));
    return Number.isFinite(number) ? number : null;
  }

  function applyBranding() {
    const { leagueName, season, monthlyPrize, currency, lastUpdated } = state.config;
    $('#league-name').textContent = leagueName;
    $('#season-label').textContent = `Stagione ${season}`;
    $('#footer-season').textContent = season;
    $('#period-prize').textContent = formatCurrency(monthlyPrize, currency);
    const latestDay = state.rows.filter(row => row.fantapunti !== null).reduce((max, row) => Math.max(max, row.giornata), 0);
    $('#last-updated').textContent = lastUpdated ? `Aggiornato: ${lastUpdated}` : (latestDay ? `Dati fino alla ${latestDay}ª giornata` : 'Aggiornamento manuale via CSV');
    document.title = `${leagueName} — Dashboard ${season}`;
  }

  function renderAll() {
    const belt = calculateBelt();
    renderBelt(belt);

    const monthly = calculateMonthlyRankings();
    renderPeriodNavigation(monthly);
    selectInitialPeriod(monthly);

    state.seasonRanking = calculateRanking(state.rows);
    renderSeasonRanking(state.seasonRanking);
  }

  function buildPeriods(start, end, size) {
    const periods = [];
    let cursor = start;
    let index = 1;
    while (cursor <= end) {
      periods.push({ index, start: cursor, end: Math.min(cursor + size - 1, end) });
      cursor += size;
      index += 1;
    }
    return periods;
  }

  function rowsForDay(day) {
    return state.rows.filter(row => row.giornata === day);
  }

  function team(id) {
    return state.teamMap.get(id) || { id, name: id || 'Squadra non indicata', shortName: '?', emoji: '⚽' };
  }

  function isCompleteDay(day) {
    const rows = rowsForDay(day).filter(row => row.fantapunti !== null);
    return new Set(rows.map(row => row.squadra)).size === state.teams.length;
  }

  function calculateBelt() {
    const start = state.config.startMatchday;
    const initialRows = rowsForDay(start).filter(row => row.fantapunti !== null);

    if (new Set(initialRows.map(row => row.squadra)).size < state.teams.length) {
      return { holder: null, events: [], holders: [], currentDefenses: 0, acquiredDay: null, lastProcessedDay: null, tie: false };
    }

    const maxPoints = Math.max(...initialRows.map(row => row.fantapunti));
    const initialLeaders = initialRows.filter(row => row.fantapunti === maxPoints);
    if (initialLeaders.length !== 1) {
      return { holder: null, events: [], holders: [], currentDefenses: 0, acquiredDay: null, lastProcessedDay: start, tie: true, tiedTeams: initialLeaders.map(row => row.squadra), tiedPoints: maxPoints };
    }

    let holder = initialLeaders[0].squadra;
    let acquiredDay = start;
    let currentDefenses = 0;
    let lastProcessedDay = start;
    const holders = [holder];
    const events = [{
      day: start,
      type: 'assignment',
      holderAfter: holder,
      points: maxPoints,
      text: `${team(holder).name} conquista la prima Cintura con ${formatPoints(maxPoints)} fantapunti.`
    }];

    for (let day = start + 1; day <= state.config.endMatchday; day += 1) {
      const holderRow = rowsForDay(day).find(row => row.squadra === holder);
      if (!holderRow || holderRow.golFatti === null || holderRow.golSubiti === null || !holderRow.avversario) break;

      const previousHolder = holder;
      if (holderRow.golFatti < holderRow.golSubiti) {
        holder = holderRow.avversario;
        acquiredDay = day;
        currentDefenses = 0;
        if (!holders.includes(holder)) holders.push(holder);
        events.push({
          day,
          type: 'transfer',
          holderBefore: previousHolder,
          holderAfter: holder,
          score: `${holderRow.golFatti}-${holderRow.golSubiti}`,
          text: `${team(holder).name} batte ${team(previousHolder).name} ${holderRow.golSubiti}-${holderRow.golFatti} e conquista la Cintura.`
        });
      } else {
        currentDefenses += 1;
        const resultWord = holderRow.golFatti === holderRow.golSubiti ? 'pareggia' : 'batte';
        events.push({
          day,
          type: 'defense',
          holderAfter: holder,
          opponent: holderRow.avversario,
          score: `${holderRow.golFatti}-${holderRow.golSubiti}`,
          text: `${team(holder).name} ${resultWord} con ${team(holderRow.avversario).name} (${holderRow.golFatti}-${holderRow.golSubiti}) e conserva la Cintura.`
        });
      }
      lastProcessedDay = day;
    }

    const nextDay = lastProcessedDay ? lastProcessedDay + 1 : start;
    const nextFixture = state.rows.find(row => row.giornata === nextDay && row.squadra === holder && row.avversario);

    return { holder, events, holders, currentDefenses, acquiredDay, lastProcessedDay, nextFixture, tie: false };
  }

  function renderBelt(belt) {
    if (belt.tie) {
      const names = belt.tiedTeams.map(id => team(id).name).join(' e ');
      setText('#belt-holder', 'Parità da risolvere');
      setText('#belt-detail', `${names} hanno chiuso la 4ª giornata a ${formatPoints(belt.tiedPoints)} FP.`);
      setText('#belt-holder-large', 'Assegnazione sospesa');
      setText('#belt-streak', 'Serve applicare il criterio di spareggio previsto dal regolamento.');
      setText('#belt-avatar', '⚖️');
      return;
    }

    if (!belt.holder) {
      setText('#belt-holder', 'In attesa della 4ª giornata');
      setText('#belt-detail', 'La Cintura sarà assegnata quando saranno presenti i fantapunti di tutte le 14 squadre.');
      setText('#belt-holder-large', 'Da assegnare');
      setText('#belt-streak', 'Nessuna difesa registrata');
      setText('#belt-avatar', 'R');
      setText('#belt-won-day', '—');
      setText('#belt-defenses', '0');
      setText('#belt-holders-count', '0');
      setText('#belt-history-count', '0 eventi');
      renderBeltTimeline([]);
      return;
    }

    const holderTeam = team(belt.holder);
    const defenseLabel = belt.currentDefenses === 1 ? '1 difesa consecutiva' : `${belt.currentDefenses} difese consecutive`;
    setText('#belt-holder', holderTeam.name);
    setText('#belt-detail', `Cintura conquistata alla ${belt.acquiredDay}ª giornata · ${defenseLabel}.`);
    setText('#belt-holder-large', holderTeam.name);
    setText('#belt-streak', defenseLabel);
    setText('#belt-avatar', holderTeam.emoji || holderTeam.shortName);
    setText('#belt-won-day', `${belt.acquiredDay}ª`);
    setText('#belt-defenses', String(belt.currentDefenses));
    setText('#belt-holders-count', String(belt.holders.length));
    setText('#belt-history-count', `${belt.events.length} ${belt.events.length === 1 ? 'evento' : 'eventi'}`);

    renderBeltTimeline(belt.events);
  }

  function renderBeltTimeline(events) {
    const container = $('#belt-timeline');
    if (!events.length) {
      container.innerHTML = '<div class="timeline-empty">La cronologia comparirà dopo la 4ª giornata.</div>';
      return;
    }

    container.innerHTML = [...events].reverse().map(event => {
      const icon = event.type === 'assignment' ? '🏆' : event.type === 'transfer' ? '🔄' : '🛡️';
      const className = event.type === 'transfer' ? 'transfer' : '';
      return `
        <div class="timeline-item">
          <div class="timeline-node" aria-hidden="true">${icon}</div>
          <div class="timeline-content">
            <strong class="${className}">${event.day}ª giornata</strong>
            <p>${escapeHtml(event.text)}</p>
          </div>
        </div>`;
    }).join('');
  }

  function calculateMonthlyRankings() {
    return state.periods.map(period => {
      const periodRows = state.rows.filter(row => row.giornata >= period.start && row.giornata <= period.end && row.fantapunti !== null);
      const ranking = calculateRanking(periodRows);
      const completedDays = [];
      for (let day = period.start; day <= period.end; day += 1) {
        if (isCompleteDay(day)) completedDays.push(day);
      }
      return {
        ...period,
        ranking,
        completedDays,
        complete: completedDays.length === (period.end - period.start + 1)
      };
    });
  }

  function calculateRanking(rows) {
    const aggregates = new Map(state.teams.map(t => [t.id, { teamId: t.id, total: 0, appearances: 0, best: null }]));

    rows.forEach(row => {
      if (row.fantapunti === null || !aggregates.has(row.squadra)) return;
      const current = aggregates.get(row.squadra);
      current.total += row.fantapunti;
      current.appearances += 1;
      current.best = current.best === null ? row.fantapunti : Math.max(current.best, row.fantapunti);
    });

    return [...aggregates.values()]
      .map(item => ({ ...item, average: item.appearances ? item.total / item.appearances : 0 }))
      .sort((a, b) => b.total - a.total || b.average - a.average || team(a.teamId).name.localeCompare(team(b.teamId).name, 'it'));
  }

  function renderPeriodNavigation(monthly) {
    const container = $('#period-nav');
    container.innerHTML = monthly.map((period, index) => `
      <button class="period-button ${period.complete ? 'complete' : ''}" type="button" role="tab" data-index="${index}" aria-selected="false">
        <strong>Blocco ${period.index}</strong>
        <span>G. ${period.start}–${period.end}</span>
      </button>`).join('');

    $$('.period-button').forEach(button => {
      button.addEventListener('click', () => {
        state.selectedPeriod = Number(button.dataset.index);
        renderSelectedPeriod(monthly[state.selectedPeriod]);
      });
    });
  }

  function selectInitialPeriod(monthly) {
    const latestDay = state.rows.filter(row => row.fantapunti !== null).reduce((max, row) => Math.max(max, row.giornata), state.config.startMatchday);
    const activeIndex = Math.max(0, Math.min(monthly.length - 1, Math.floor((latestDay - state.config.startMatchday) / state.config.monthlyBlockSize)));
    state.selectedPeriod = activeIndex;
    renderSelectedPeriod(monthly[activeIndex]);
    renderMonthlyStatus(monthly[activeIndex]);
  }

  function renderSelectedPeriod(period) {
    $$('.period-button').forEach((button, index) => {
      button.classList.toggle('active', index === state.selectedPeriod);
      button.setAttribute('aria-selected', String(index === state.selectedPeriod));
    });

    const totalDays = period.end - period.start + 1;
    const progress = Math.round((period.completedDays.length / totalDays) * 100);
    setText('#period-status', period.complete ? `Blocco ${period.index} concluso` : `Blocco ${period.index} in corso`);
    setText('#period-title', `Giornate ${period.start}–${period.end}`);
    setText('#period-progress-label', `${period.completedDays.length} di ${totalDays} giornate completate`);
    setText('#period-progress-percent', `${progress}%`);
    $('#period-progress-bar').style.width = `${progress}%`;

    renderRankingTable($('#monthly-table-body'), period.ranking, {
      includeBest: false,
      winner: period.complete,
      periodAppearances: true
    });
  }

  function renderMonthlyStatus(period) {
    const leaders = leadersOf(period.ranking);
    if (!leaders.length || leaders[0].appearances === 0) {
      setText('#monthly-leader', 'Nessun dato disponibile');
      setText('#monthly-leader-detail', `Blocco ${period.index}: giornate ${period.start}–${period.end}.`);
      return;
    }

    const leaderNames = leaders.map(item => team(item.teamId).name).join(' / ');
    setText('#monthly-leader', leaderNames);
    setText('#monthly-leader-detail', `${formatPoints(leaders[0].total)} FP nel blocco ${period.index} · giornate ${period.start}–${period.end}.`);
  }

  function leadersOf(ranking) {
    if (!ranking.length || ranking[0].appearances === 0) return [];
    return ranking.filter(item => Math.abs(item.total - ranking[0].total) < 0.0001);
  }

  function renderSeasonRanking(ranking, query = '') {
    const normalizedQuery = query.trim().toLocaleLowerCase('it');
    const filtered = normalizedQuery
      ? ranking.filter(item => team(item.teamId).name.toLocaleLowerCase('it').includes(normalizedQuery))
      : ranking;

    renderRankingTable($('#season-table-body'), filtered, { includeBest: true, winner: false, positionSource: ranking });
  }

  function renderRankingTable(tbody, ranking, options = {}) {
    if (!ranking.length || ranking.every(item => item.appearances === 0)) {
      const colspan = options.includeBest ? 6 : 5;
      tbody.innerHTML = `<tr class="empty-row"><td colspan="${colspan}">Nessun fantapunto disponibile.</td></tr>`;
      return;
    }

    const positionSource = options.positionSource || ranking;
    tbody.innerHTML = ranking.map(item => {
      const position = 1 + positionSource.filter(entry => entry.total > item.total + 0.0001).length;
      const itemTeam = team(item.teamId);
      const winnerClass = options.winner && position === 1 ? 'winner-row' : '';
      const rankClass = position <= 3 ? 'rank top' : 'rank';
      return `
        <tr class="${winnerClass}">
          <td><span class="${rankClass}">${position}</span></td>
          <td>
            <div class="team-cell">
              <span class="team-avatar">${escapeHtml(itemTeam.emoji || itemTeam.shortName)}</span>
              <div><strong>${escapeHtml(itemTeam.name)}</strong><small>${escapeHtml(itemTeam.shortName || '')}</small></div>
            </div>
          </td>
          <td class="numeric">${item.appearances}</td>
          <td class="numeric"><strong>${formatPoints(item.total)}</strong></td>
          <td class="numeric">${item.appearances ? formatPoints(item.average) : '—'}</td>
          ${options.includeBest ? `<td class="numeric">${item.best === null ? '—' : formatPoints(item.best)}</td>` : ''}
        </tr>`;
    }).join('');
  }

  function bindFilters() {
    $('#team-filter').addEventListener('input', event => renderSeasonRanking(state.seasonRanking, event.target.value));
  }

  function formatPoints(value) {
    return Number(value).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  }

  function formatCurrency(value, currency = '€') {
    return `${currency}${Number(value).toLocaleString('it-IT', { maximumFractionDigits: 0 })}`;
  }

  function setText(selector, text) {
    const element = $(selector);
    if (element) element.textContent = text;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  let toastTimer;
  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
  }
})();
