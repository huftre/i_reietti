(() => {
  'use strict';

  // =========================================================
  // FUNZIONI CONDIVISE DELLA LEGA
  // MODIFICA FACILE: i valori della stagione, dei premi e delle
  // giornate si cambiano in data/config.json, non in questo file.
  // LOGHI SQUADRE: inserisci i PNG in assets/teams/.
  // Il nome del file viene ricavato dal nome della squadra sostituendo gli spazi con _.
  // Esempio: Suino FC -> assets/teams/Suino_FC.png
  // Se in data/teams.json e' presente un campo 'logo', quel percorso ha la precedenza.
  // =========================================================

  const EPSILON = 0.0001;

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Errore nel caricamento di ${url}`);
    return response.json();
  }

  async function fetchText(url, fallback = '') {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Errore nel caricamento di ${url}`);
      return response.text();
    } catch (error) {
      if (fallback !== undefined) return fallback;
      throw error;
    }
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

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        pushCell();
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && next === '\n') index += 1;
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

    if (!rows.length) return [];
    const headers = rows[0].map(header => header.toLowerCase());
    return rows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
  }

  function normalizeResults(rows) {
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

  function normalizePayments(rows, teams = []) {
    const source = new Map(rows.map(row => [String(row.squadra || '').trim(), row]));
    return teams.map(team => {
      const row = source.get(team.id) || {};
      return {
        squadra: team.id,
        rata1: Math.max(0, toOptionalNumber(row.rata1) ?? 0),
        rata2: Math.max(0, toOptionalNumber(row.rata2) ?? 0),
        champions: toBoolean(row.champions),
        coppaItalia: toBoolean(row.coppa_italia),
        premiPagati: Math.max(0, toOptionalNumber(row.premi_pagati) ?? 0),
        note: String(row.note || '').trim()
      };
    });
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

  function toBoolean(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    return ['1', 'true', 'si', 'sì', 'yes', 'x'].includes(normalized);
  }

  function teamMap(teams) {
    return new Map(teams.map(team => [team.id, team]));
  }

  function getTeam(map, id) {
    return map.get(id) || {
      id,
      name: id || 'Squadra non indicata',
      shortName: '?',
      emoji: '⚽',
      logo: ''
    };
  }

  function leagueDayFromSerieA(serieADay, config) {
    const start = Number(config.leagueStartSerieAMatchday ?? 3);
    return Number(serieADay) - start + 1;
  }

  function serieADayFromLeague(leagueDay, config) {
    const start = Number(config.leagueStartSerieAMatchday ?? 3);
    return start + Number(leagueDay) - 1;
  }

  function matchdayLabel(serieADay, config, compact = false) {
    const leagueDay = leagueDayFromSerieA(serieADay, config);
    if (leagueDay < 1) return `${serieADay}ª giornata Serie A`;
    return compact
      ? `${leagueDay}ª Lega · ${serieADay}ª Serie A`
      : `${leagueDay}ª giornata di Lega (${serieADay}ª giornata Serie A)`;
  }

  function rowsForDay(rows, day) {
    return rows.filter(row => row.giornata === day);
  }

  function isCompleteDay(rows, teams, day, requireGoals = false) {
    const validRows = rowsForDay(rows, day).filter(row => {
      if (row.fantapunti === null) return false;
      if (requireGoals && (row.golFatti === null || row.golSubiti === null)) return false;
      return true;
    });
    return new Set(validRows.map(row => row.squadra)).size === teams.length;
  }

  function latestCompleteDay(rows, teams, config, requireGoals = false) {
    const start = Number(config.leagueStartSerieAMatchday ?? 3);
    const end = Number(config.leagueEndSerieAMatchday ?? config.endMatchday ?? 38);
    let latest = null;
    for (let day = start; day <= end; day += 1) {
      if (isCompleteDay(rows, teams, day, requireGoals)) latest = day;
    }
    return latest;
  }

  function hashString(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function calculateLeagueStandings(rows, teams, config) {
    const start = Number(config.leagueStartSerieAMatchday ?? 3);
    const end = Number(config.leagueEndSerieAMatchday ?? config.endMatchday ?? 38);
    const seed = String(config.leagueTieBreakSeed || config.season || 'i-reietti');
    const aggregates = new Map(teams.map(team => [team.id, {
      teamId: team.id,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      fantasyPoints: 0,
      points: 0,
      lottery: hashString(`${seed}:${team.id}`)
    }]));

    rows.forEach(row => {
      if (row.giornata < start || row.giornata > end || !aggregates.has(row.squadra)) return;
      if (row.golFatti === null || row.golSubiti === null) return;
      const item = aggregates.get(row.squadra);
      item.played += 1;
      item.goalsFor += row.golFatti;
      item.goalsAgainst += row.golSubiti;
      if (row.fantapunti !== null) item.fantasyPoints += row.fantapunti;
      if (row.golFatti > row.golSubiti) {
        item.wins += 1;
        item.points += 3;
      } else if (row.golFatti === row.golSubiti) {
        item.draws += 1;
        item.points += 1;
      } else {
        item.losses += 1;
      }
      item.goalDifference = item.goalsFor - item.goalsAgainst;
    });

    return [...aggregates.values()].sort((a, b) =>
      b.points - a.points ||
      b.fantasyPoints - a.fantasyPoints ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.goalsAgainst - b.goalsAgainst ||
      a.lottery - b.lottery
    );
  }

  function buildPeriods(start, end, size) {
    const periods = [];
    let cursor = Number(start);
    let index = 1;
    while (cursor <= Number(end)) {
      periods.push({ index, start: cursor, end: Math.min(cursor + Number(size) - 1, Number(end)) });
      cursor += Number(size);
      index += 1;
    }
    return periods;
  }

  function calculateFantasyRanking(rows, teams) {
    const aggregates = new Map(teams.map(team => [team.id, {
      teamId: team.id,
      total: 0,
      appearances: 0,
      best: null
    }]));

    rows.forEach(row => {
      if (row.fantapunti === null || !aggregates.has(row.squadra)) return;
      const item = aggregates.get(row.squadra);
      item.total += row.fantapunti;
      item.appearances += 1;
      item.best = item.best === null ? row.fantapunti : Math.max(item.best, row.fantapunti);
    });

    return [...aggregates.values()]
      .map(item => ({ ...item, average: item.appearances ? item.total / item.appearances : 0 }))
      .sort((a, b) => b.total - a.total || b.average - a.average || a.teamId.localeCompare(b.teamId));
  }

  function calculateMonthlyRankings(rows, teams, config) {
    const periods = buildPeriods(config.startMatchday, config.endMatchday, config.monthlyBlockSize);
    return periods.map(period => {
      const periodRows = rows.filter(row => row.giornata >= period.start && row.giornata <= period.end && row.fantapunti !== null);
      const ranking = calculateFantasyRanking(periodRows, teams);
      const completedDays = [];
      for (let day = period.start; day <= period.end; day += 1) {
        if (isCompleteDay(rows, teams, day, false)) completedDays.push(day);
      }
      return {
        ...period,
        ranking,
        completedDays,
        complete: completedDays.length === (period.end - period.start + 1)
      };
    });
  }

  // Calcola la Cintura e, a stagione completa, il vincitore secondo i criteri ufficiali.
  function calculateBelt(rows, teams, config) {
    const map = teamMap(teams);
    const team = id => getTeam(map, id);
    const start = Number(config.beltStartMatchday ?? config.startMatchday);
    const end = Number(config.endMatchday);
    const initialRows = rowsForDay(rows, start).filter(row => row.fantapunti !== null);

    if (new Set(initialRows.map(row => row.squadra)).size < teams.length) {
      return { holder: null, events: [], holders: [], currentDefenses: 0, acquiredDay: null, lastProcessedDay: null, tie: false, finalWinner: null, standings: [] };
    }

    const maxPoints = Math.max(...initialRows.map(row => row.fantapunti));
    let initialLeaders = initialRows.filter(row => Math.abs(row.fantapunti - maxPoints) < EPSILON);
    let initialWinner = null;

    if (initialLeaders.length > 1) {
      const maxGoals = Math.max(...initialLeaders.map(row => Number(row.golFatti ?? -Infinity)));
      initialLeaders = initialLeaders.filter(row => Number(row.golFatti) === maxGoals);
    }
    if (initialLeaders.length > 1) {
      const maxGoalDiff = Math.max(...initialLeaders.map(row => Number(row.golFatti ?? 0) - Number(row.golSubiti ?? 0)));
      initialLeaders = initialLeaders.filter(row => (Number(row.golFatti ?? 0) - Number(row.golSubiti ?? 0)) === maxGoalDiff);
    }
    if (initialLeaders.length !== 1) {
      return {
        holder: null, events: [], holders: [], currentDefenses: 0, acquiredDay: start,
        lastProcessedDay: start, tie: true,
        tiedTeams: initialLeaders.map(row => row.squadra), tiedPoints: maxPoints,
        finalWinner: null, standings: []
      };
    }
    initialWinner = initialLeaders[0].squadra;

    let holder = initialWinner;
    let acquiredDay = start;
    let currentDefenses = 0;
    let lastProcessedDay = start;
    const holders = [holder];
    const stats = new Map(teams.map(t => [t.id, { teamId: t.id, defenses: 0, fantasyPoints: 0, goalsFor: 0, goalsAgainst: 0 }]));
    const events = [{
      day: start, type: 'assignment', holderAfter: holder, points: maxPoints,
      text: `${team(holder).name} conquista la prima Cintura con ${formatPoints(maxPoints)} fantapunti.`
    }];

    for (let day = start + 1; day <= end; day += 1) {
      const holderRow = rowsForDay(rows, day).find(row => row.squadra === holder);
      if (!holderRow || holderRow.golFatti === null || holderRow.golSubiti === null || !holderRow.avversario) break;

      const previousHolder = holder;
      if (holderRow.golFatti < holderRow.golSubiti) {
        holder = holderRow.avversario;
        acquiredDay = day;
        currentDefenses = 0;
        if (!holders.includes(holder)) holders.push(holder);
        events.push({
          day, type: 'transfer', holderBefore: previousHolder, holderAfter: holder,
          score: `${holderRow.golFatti}-${holderRow.golSubiti}`,
          text: `${team(holder).name} batte ${team(previousHolder).name} ${holderRow.golSubiti}-${holderRow.golFatti} e conquista la Cintura.`
        });
      } else {
        currentDefenses += 1;
        const s = stats.get(holder);
        s.defenses += 1;
        s.fantasyPoints += Number(holderRow.fantapunti ?? 0);
        s.goalsFor += Number(holderRow.golFatti ?? 0);
        s.goalsAgainst += Number(holderRow.golSubiti ?? 0);
        const resultWord = holderRow.golFatti === holderRow.golSubiti ? 'pareggia' : 'batte';
        events.push({
          day, type: 'defense', holderAfter: holder, opponent: holderRow.avversario,
          score: `${holderRow.golFatti}-${holderRow.golSubiti}`,
          fantasyPoints: holderRow.fantapunti,
          text: `${team(holder).name} ${resultWord} con ${team(holderRow.avversario).name} (${holderRow.golFatti}-${holderRow.golSubiti}) e conserva la Cintura.`
        });
      }
      lastProcessedDay = day;
    }

    const standings = [...stats.values()].map(s => ({
      ...s,
      goalDifference: s.goalsFor - s.goalsAgainst
    })).sort((a, b) =>
      b.defenses - a.defenses ||
      b.fantasyPoints - a.fantasyPoints ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor
    );

    const complete = lastProcessedDay === end;
    const finalWinner = complete && standings.length ? standings[0].teamId : null;
    const nextDay = lastProcessedDay ? lastProcessedDay + 1 : start;
    const nextFixture = rows.find(row => row.giornata === nextDay && row.squadra === holder && row.avversario);
    return { holder, events, holders, currentDefenses, acquiredDay, lastProcessedDay, nextFixture, tie: false, finalWinner, standings };
  }

  function monthlyPrizeWinners(period) {
    if (!period.complete || !period.ranking.length || period.ranking[0].appearances === 0) return [];
    const topTotal = period.ranking[0].total;
    const topByTotal = period.ranking.filter(item => Math.abs(item.total - topTotal) < EPSILON);
    const bestSingle = Math.max(...topByTotal.map(item => item.best ?? -Infinity));
    return topByTotal.filter(item => Math.abs((item.best ?? -Infinity) - bestSingle) < EPSILON);
  }

  function calculatePrizeLedger(results, payments, teams, config) {
    const ledger = new Map(teams.map(team => [team.id, { teamId: team.id, earned: 0, details: [] }]));
    const addPrize = (teamId, amount, label) => {
      if (!ledger.has(teamId) || !Number.isFinite(amount) || amount <= 0) return;
      const entry = ledger.get(teamId);
      entry.earned += amount;
      entry.details.push({ label, amount });
    };

    // Reietto del Mese: premio automatico quando il blocco e' completo.
    calculateMonthlyRankings(results, teams, config).forEach(period => {
      const winners = monthlyPrizeWinners(period);
      if (!winners.length) return;
      const share = Number(config.monthlyPrize || 0) / winners.length;
      winners.forEach(winner => addPrize(winner.teamId, share, `Reietto del Mese · blocco ${period.index}`));
    });

    // Campionato: i premi diventano maturati solo dopo l'ultima giornata completa.
    const finalDay = Number(config.leagueEndSerieAMatchday ?? config.endMatchday ?? 38);
    if (isCompleteDay(results, teams, finalDay, true)) {
      const standings = calculateLeagueStandings(results, teams, config);
      const prizes = config.prizes?.championship || [];
      prizes.forEach((amount, index) => {
        const item = standings[index];
        if (item) addPrize(item.teamId, Number(amount), `Campionato · ${index + 1}° posto`);
      });
    }

    // Cintura: premio assegnato solo quando la Cintura arriva regolarmente alla giornata finale.
    const belt = calculateBelt(results, teams, config);
    if (!belt.tie && belt.finalWinner && belt.lastProcessedDay === Number(config.endMatchday)) {
      addPrize(belt.finalWinner, Number(config.prizes?.belt || 0), 'Cintura dei Reietti');
    }

    // Champions e Coppa Italia: il vincitore viene scelto manualmente dall'Admin pagamenti.
    payments.forEach(payment => {
      if (payment.champions) addPrize(payment.squadra, Number(config.prizes?.championsLeague || 0), 'Champions League');
      if (payment.coppaItalia) addPrize(payment.squadra, Number(config.prizes?.coppaItalia || 0), 'Coppa Italia');
    });

    return ledger;
  }

  // =========================================================
  // FORMA RECENTE + BACHECA TROFEI
  // MODIFICA FACILE:
  // - i trofei STORICI si impostano in data/teams.json nel campo "trophies";
  // - i trofei della stagione corrente vengono aggiunti automaticamente
  //   quando i risultati presenti nel CSV rendono la competizione conclusa.
  // - Coppa Italia e Champions League sono volutamente escluse dalla bacheca.
  // =========================================================
  function calculateRecentForm(rows, teamId, config, limit = 5) {
    const start = Number(config?.leagueStartSerieAMatchday ?? 3);
    const end = Number(config?.leagueEndSerieAMatchday ?? config?.endMatchday ?? 38);
    return rows
      .filter(row =>
        row.squadra === teamId &&
        row.giornata >= start &&
        row.giornata <= end &&
        row.golFatti !== null &&
        row.golSubiti !== null
      )
      .sort((a, b) => a.giornata - b.giornata)
      .slice(-Math.max(1, Number(limit) || 5))
      .map(row => ({
        day: row.giornata,
        opponent: row.avversario || '',
        goalsFor: row.golFatti,
        goalsAgainst: row.golSubiti,
        result: row.golFatti > row.golSubiti ? 'V' : (row.golFatti === row.golSubiti ? 'P' : 'S')
      }));
  }

  function calculateCurrentTrophies(results, teams, config) {
    const counts = new Map(teams.map(team => [team.id, { campionato: 0, cintura: 0, reietto: 0 }]));

    // Reietto del Mese: ogni periodo completo vinto vale un trofeo.
    calculateMonthlyRankings(results, teams, config).forEach(period => {
      monthlyPrizeWinners(period).forEach(winner => {
        const item = counts.get(winner.teamId);
        if (item) item.reietto += 1;
      });
    });

    // Campionato: soltanto il 1° classificato a stagione conclusa.
    const finalDay = Number(config.leagueEndSerieAMatchday ?? config.endMatchday ?? 38);
    if (isCompleteDay(results, teams, finalDay, true)) {
      const winner = calculateLeagueStandings(results, teams, config)[0];
      if (winner && counts.has(winner.teamId)) counts.get(winner.teamId).campionato += 1;
    }

    // Cintura: conta il detentore finale, quando la competizione arriva all'ultima giornata.
    const belt = calculateBelt(results, teams, config);
    if (!belt.tie && belt.finalWinner && belt.lastProcessedDay === Number(config.endMatchday) && counts.has(belt.finalWinner)) {
      counts.get(belt.finalWinner).cintura += 1;
    }

    return counts;
  }

  function calculateTrophyCabinet(results, teams, config) {
    const current = calculateCurrentTrophies(results, teams, config);
    return new Map(teams.map(team => {
      const historical = team.trophies || {};
      const season = current.get(team.id) || { campionato: 0, cintura: 0, reietto: 0 };
      return [team.id, {
        campionato: Math.max(0, Number(historical.campionato || 0)) + season.campionato,
        cintura: Math.max(0, Number(historical.cintura || 0)) + season.cintura,
        reietto: Math.max(0, Number(historical.reietto || 0)) + season.reietto,
        current: season
      }];
    }));
  }

  function trophyCabinetHtml(record = {}, extraClass = '') {
    const trophies = [
      { key: 'campionato', icon: '🏆', label: 'Campionato' },
      { key: 'cintura', icon: '👑', label: 'Cintura' },
      { key: 'reietto', icon: '🏅', label: 'Reietto del Mese' }
    ];
    return `
      <div class="trophy-cabinet ${escapeHtml(extraClass)}" aria-label="Bacheca trofei">
        ${trophies.map(trophy => {
          const count = Math.max(0, Number(record[trophy.key] || 0));
          const current = Math.max(0, Number(record.current?.[trophy.key] || 0));
          const title = count
            ? `${trophy.label}: ${count}${current ? ` · ${current} in questa stagione` : ''}`
            : `${trophy.label}: non ancora conquistato`;
          return `
            <div class="trophy-slot ${count ? 'is-won' : 'is-empty'}" title="${escapeHtml(title)}">
              <span class="trophy-icon" aria-hidden="true">${trophy.icon}</span>
              ${count > 1 ? `<span class="trophy-multiplier">×${count}</span>` : ''}
              <span class="trophy-label">${escapeHtml(trophy.label)}</span>
            </div>`;
        }).join('')}
      </div>`;
  }

  // =========================================================
  // LOGHI DELLE SQUADRE
  // MODIFICA QUI solo se un giorno vuoi cambiare la regola dei nomi file.
  // Regola attuale: nome squadra + spazi trasformati in underscore.
  // Esempio: "Tiger Team" -> "assets/teams/Tiger_Team.png".
  // =========================================================
  function automaticTeamLogoPath(team) {
    const teamName = String(team?.name || '').trim();
    if (!teamName) return '';
    const filename = `${teamName.replace(/\s+/g, '_')}.png`;
    return `assets/teams/${filename}`;
  }

  function teamLogoHtml(team, extraClass = '') {
    const fallback = escapeHtml(team.emoji || team.shortName || '⚽');
    const src = escapeHtml(team.logo || automaticTeamLogoPath(team));
    return `
      <span class="team-logo ${extraClass}">
        ${src ? `<img src="${src}" alt="" data-team-logo>` : ''}
        <span class="team-logo-fallback" aria-hidden="true">${fallback}</span>
      </span>`;
  }

  function activateLogoFallbacks(root = document) {
    root.querySelectorAll('img[data-team-logo]').forEach(image => {
      const fail = () => image.classList.add('is-missing');
      image.addEventListener('error', fail, { once: true });
      if (image.complete && image.naturalWidth === 0) fail();
    });
  }

  function formatPoints(value) {
    return Number(value || 0).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  }

  function formatCurrency(value, currency = '€', decimals = 0) {
    return `${currency}${Number(value || 0).toLocaleString('it-IT', { minimumFractionDigits: decimals, maximumFractionDigits: 2 })}`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]);
  }

  window.ReiettiCore = {
    EPSILON,
    fetchJson,
    fetchText,
    parseCsv,
    normalizeResults,
    normalizePayments,
    toOptionalNumber,
    teamMap,
    getTeam,
    leagueDayFromSerieA,
    serieADayFromLeague,
    matchdayLabel,
    rowsForDay,
    isCompleteDay,
    latestCompleteDay,
    calculateLeagueStandings,
    buildPeriods,
    calculateFantasyRanking,
    calculateMonthlyRankings,
    calculateBelt,
    monthlyPrizeWinners,
    calculatePrizeLedger,
    calculateRecentForm,
    calculateCurrentTrophies,
    calculateTrophyCabinet,
    trophyCabinetHtml,
    teamLogoHtml,
    activateLogoFallbacks,
    formatPoints,
    formatCurrency,
    escapeHtml
  };
})();
