(() => {
  'use strict';

  const cfg = window.SOS_REIETTI_CONFIG || {};
  const state = { selectedSearchItem: null, requestId: 0, timer: null };

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    const input = document.querySelector('#sos-player-search');
    const results = document.querySelector('#sos-search-results');
    const notice = document.querySelector('#sos-api-notice');
    const close = document.querySelector('#sos-player-close');
    const modal = document.querySelector('#sos-player-modal');

    if (!input || !results || !modal) return;

    if (!String(cfg.proxyUrl || '').trim()) {
      notice?.removeAttribute('hidden');
      input.disabled = true;
      input.placeholder = 'Collega prima l’API gratuita…';
    }

    input.addEventListener('input', () => {
      window.clearTimeout(state.timer);
      const query = input.value.trim();
      if (query.length < 3) {
        results.hidden = true;
        results.innerHTML = '';
        setHelp('Digita almeno 3 caratteri.');
        setLoading(false);
        return;
      }
      state.timer = window.setTimeout(() => searchPlayers(query), 430);
    });

    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        results.hidden = true;
        input.blur();
      }
    });

    close?.addEventListener('click', closeModal);
    modal.addEventListener('click', event => {
      if (event.target === modal) closeModal();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !modal.hidden) closeModal();
    });
  }

  async function searchPlayers(query) {
    const requestId = ++state.requestId;
    const results = document.querySelector('#sos-search-results');
    if (!results) return;

    setLoading(true);
    setHelp(`Cerco “${query}”…`);

    try {
      const data = await apiFetch(`/search?q=${encodeURIComponent(query)}`);
      if (requestId !== state.requestId) return;
      const players = Array.isArray(data.players) ? data.players : [];
      renderSearchResults(players);
      setHelp(players.length ? `${players.length} risultato${players.length === 1 ? '' : 'i'} trovato${players.length === 1 ? '' : 'i'}.` : 'Nessun giocatore trovato in Serie A.');
    } catch (error) {
      if (requestId !== state.requestId) return;
      results.hidden = false;
      results.innerHTML = `<div class="sos-search-error"><strong>Ricerca non disponibile.</strong><span>${escapeHtml(friendlyError(error))}</span></div>`;
      setHelp('Controlla il collegamento dati e riprova.');
    } finally {
      if (requestId === state.requestId) setLoading(false);
    }
  }

  function renderSearchResults(players) {
    const container = document.querySelector('#sos-search-results');
    if (!container) return;

    if (!players.length) {
      container.hidden = false;
      container.innerHTML = '<div class="sos-no-results">Nessun risultato.</div>';
      return;
    }

    container.innerHTML = players.map((item, index) => {
      const player = item.player || {};
      const stat = pickCurrentStat(item.statistics || []);
      const role = roleLabel(normalizeRole(stat?.games?.position));
      const team = stat?.team?.name || 'Serie A';
      return `
        <button class="sos-search-result" type="button" data-player-index="${index}">
          <img src="${escapeAttr(player.photo || '')}" alt="" loading="lazy">
          <span class="sos-result-copy"><strong>${escapeHtml(player.name || `${player.firstname || ''} ${player.lastname || ''}`.trim())}</strong><small>${escapeHtml(team)} · ${escapeHtml(role)}</small></span>
          <span class="sos-result-arrow" aria-hidden="true">→</span>
        </button>`;
    }).join('');
    container.hidden = false;

    container.querySelectorAll('[data-player-index]').forEach(button => {
      button.addEventListener('click', () => {
        const item = players[Number(button.dataset.playerIndex)];
        if (!item) return;
        state.selectedSearchItem = item;
        container.hidden = true;
        openPlayer(item);
      });
    });
  }

  async function openPlayer(searchItem) {
    const modal = document.querySelector('#sos-player-modal');
    const content = document.querySelector('#sos-player-modal-content');
    if (!modal || !content) return;

    modal.hidden = false;
    document.body.classList.add('sos-modal-open');
    requestAnimationFrame(() => modal.classList.add('visible'));
    content.innerHTML = '<div class="sos-modal-loading"><span class="pdf-spinner" aria-hidden="true"></span><strong>Elaborazione SOS…</strong><small>Analizzo rendimento, affidabilità e scarsità del ruolo.</small></div>';

    try {
      const id = Number(searchItem?.player?.id);
      if (!id) throw new Error('Giocatore non valido.');
      const detail = await apiFetch(`/player?id=${id}`);
      renderPlayerDetail(searchItem, detail);
    } catch (error) {
      content.innerHTML = `<div class="sos-detail-error"><span>⚠️</span><h2>Non riesco a completare la scheda</h2><p>${escapeHtml(friendlyError(error))}</p></div>`;
    }
  }

  function closeModal() {
    const modal = document.querySelector('#sos-player-modal');
    if (!modal || modal.hidden) return;
    modal.classList.remove('visible');
    document.body.classList.remove('sos-modal-open');
    window.setTimeout(() => { modal.hidden = true; }, 170);
  }

  function renderPlayerDetail(searchItem, detail) {
    const content = document.querySelector('#sos-player-modal-content');
    if (!content) return;

    const currentItem = detail.current || searchItem || {};
    const previousItem = detail.previous || null;
    const player = currentItem.player || searchItem.player || {};
    const currentAgg = aggregateStatistics(currentItem.statistics || []);
    const previousAgg = aggregateStatistics(previousItem?.statistics || []);

    const rawRole = currentAgg.position || pickCurrentStat(searchItem.statistics || [])?.games?.position || previousAgg.position;
    const role = normalizeRole(rawRole);
    const evaluation = evaluatePlayer({ player, role, currentAgg, previousAgg });
    const currentTeam = currentAgg.teamName || pickCurrentStat(searchItem.statistics || [])?.team?.name || previousAgg.teamName || '—';
    const dataSeason = detail.previousSeasonUsed || detail.previousSeason || 'stagione precedente';

    content.innerHTML = `
      <div class="sos-player-head">
        <div class="sos-player-photo-wrap">
          <img class="sos-player-photo" src="${escapeAttr(player.photo || '')}" alt="${escapeAttr(player.name || 'Giocatore')}">
          <span class="sos-role-pill">${escapeHtml(roleLabel(role))}</span>
        </div>
        <div class="sos-player-identity">
          <span class="eyebrow">SOS Reietti · Indice asta</span>
          <h2 id="sos-player-name">${escapeHtml(player.name || `${player.firstname || ''} ${player.lastname || ''}`.trim())}</h2>
          <p>${escapeHtml(currentTeam)}${player.age ? ` · ${player.age} anni` : ''}${player.nationality ? ` · ${escapeHtml(player.nationality)}` : ''}</p>
          ${player.injured ? '<div class="sos-injury-warning">⚠️ Segnalato come indisponibile/infortunato nei dati correnti.</div>' : ''}
        </div>
      </div>

      <div class="sos-price-panel">
        <div class="sos-index-block">
          <span>REIETTI INDEX</span>
          <strong>${evaluation.index}<small>/100</small></strong>
          <em>${escapeHtml(evaluation.verdict)}</em>
        </div>
        <div class="sos-price-block">
          <span>PREZZO SOS</span>
          <strong>${evaluation.price}<small> crediti</small></strong>
          <em>Fascia prudente ${evaluation.low}–${evaluation.high}</em>
        </div>
      </div>

      <div class="sos-score-grid">
        ${scoreCard('Qualità', evaluation.components.quality)}
        ${scoreCard('Affidabilità', evaluation.components.reliability)}
        ${scoreCard(evaluation.componentsLabel, evaluation.components.bonus)}
        ${scoreCard('Disciplina', evaluation.components.discipline)}
      </div>

      <section class="sos-detail-section">
        <div class="sos-detail-title"><div><span class="eyebrow">Dati utilizzati</span><h3>Ultima stagione disponibile</h3></div><span class="sos-confidence ${evaluation.confidenceClass}">${escapeHtml(evaluation.confidence)}</span></div>
        <div class="sos-stat-grid">
          ${statItem('Presenze', previousAgg.appearances)}
          ${statItem('Minuti', previousAgg.minutes)}
          ${statItem('Rating', formatRating(previousAgg.rating))}
          ${statItem(role === 'P' ? 'Parate' : 'Gol', role === 'P' ? previousAgg.saves : previousAgg.goals)}
          ${statItem(role === 'P' ? 'Gol subiti' : 'Assist', role === 'P' ? previousAgg.conceded : previousAgg.assists)}
          ${statItem('Titolarità', previousAgg.appearances ? `${Math.round((previousAgg.lineups / previousAgg.appearances) * 100)}%` : '—')}
        </div>
        <p class="sos-data-caption">Base statistica principale: ${escapeHtml(String(dataSeason))}. I dati della stagione corrente entrano progressivamente nel calcolo quando aumentano i minuti giocati.</p>
      </section>

      <section class="sos-detail-section">
        <div class="sos-detail-title"><div><span class="eyebrow">Budget della Lega</span><h3>Come nasce il prezzo</h3></div></div>
        <div class="sos-budget-strip">
          <div><span>Budget totale</span><strong>${cfg.budget || 800}</strong></div>
          <div><span>Budget ${roleLabel(role).toLowerCase()}</span><strong>≈ ${evaluation.roleBudget}</strong></div>
          <div><span>Posti reparto</span><strong>${evaluation.roleSlots}</strong></div>
          <div><span>Squadre</span><strong>${cfg.leagueTeams || 14}</strong></div>
        </div>
        <p class="sos-explanation">${escapeHtml(evaluation.explanation)}</p>
      </section>

      <div class="sos-model-note">Il prezzo è un riferimento per un'asta iniziale da 800 crediti. Se durante l'asta hai già speso molto in un reparto, il tuo limite personale deve essere più basso.</div>`;
  }

  /* =========================================================
     ALGORITMO SOS REIETTI
     Qui puoi modificare pesi, fasce e ripartizione del prezzo.
     Il modello NON copia formule di servizi esterni: usa pesi nostri,
     leggibili e modificabili, costruiti sulle statistiche disponibili.
     ========================================================= */
  function evaluatePlayer({ player, role, currentAgg, previousAgg }) {
    const prev = scoreSeason(previousAgg, role);
    const curr = scoreSeason(currentAgg, role);
    const currentWeight = currentAgg.minutes > 0 ? Math.min(0.55, (currentAgg.minutes / 900) * 0.55) : 0;

    let index = prev.index * (1 - currentWeight) + curr.index * currentWeight;

    // Con pochi dati storici restringiamo il punteggio verso la media per evitare prezzi estremi.
    const evidence = Math.min(1, previousAgg.minutes / 1800);
    index = 55 + (index - 55) * (0.48 + evidence * 0.52);

    if (player.injured) index -= 7;
    index = Math.round(clamp(index, 32, 99));

    const priceInfo = estimateAuctionPrice(index, role);
    const confidence = previousAgg.minutes >= 1800 ? ['Dati solidi', 'high'] : previousAgg.minutes >= 700 ? ['Dati medi', 'medium'] : ['Dati limitati', 'low'];
    const verdict = index >= 90 ? 'Top assoluto' : index >= 82 ? 'Prima fascia' : index >= 72 ? 'Titolarissimo' : index >= 62 ? 'Buon acquisto' : index >= 52 ? 'Da rotazione' : 'Scommessa';

    return {
      index,
      price: priceInfo.price,
      low: priceInfo.low,
      high: priceInfo.high,
      roleBudget: priceInfo.roleBudget,
      roleSlots: priceInfo.roleSlots,
      verdict,
      confidence: confidence[0],
      confidenceClass: confidence[1],
      components: blendComponents(prev.components, curr.components, currentWeight),
      componentsLabel: role === 'P' ? 'Porta' : 'Bonus',
      explanation: priceExplanation(index, role, priceInfo)
    };
  }

  function scoreSeason(stats, role) {
    if (!stats || !stats.minutes) {
      return { index: 50, components: { quality: 50, reliability: 35, bonus: 35, discipline: 85 } };
    }

    const rating = stats.rating || 6.0;
    const quality = scale(rating, 5.7, 7.45);
    const lineupRatio = stats.appearances ? stats.lineups / stats.appearances : 0;
    const reliability = clamp((Math.min(stats.minutes / 2500, 1) * 62) + (Math.min(stats.appearances / 30, 1) * 20) + (lineupRatio * 18), 0, 100);
    const discipline = clamp(100 - stats.yellow * 2.2 - stats.yellowRed * 8 - stats.red * 15, 15, 100);
    const per90 = value => stats.minutes ? (Number(value || 0) * 90 / stats.minutes) : 0;

    let bonus = 50;
    let performance = 50;

    if (role === 'P') {
      const saves90 = per90(stats.saves);
      const conceded90 = per90(stats.conceded);
      bonus = clamp(scale(saves90, 1.7, 4.8) * 0.62 + (100 - scale(conceded90, 0.55, 2.05)) * 0.28 + clamp(stats.penaltySaved * 18, 0, 100) * 0.10, 0, 100);
      performance = quality * 0.36 + reliability * 0.27 + bonus * 0.30 + discipline * 0.07;
    } else if (role === 'D') {
      const gi90 = per90(stats.goals + stats.assists * 0.75);
      const def90 = per90(stats.tackles + stats.interceptions + stats.blocks);
      const duelPct = stats.duels ? stats.duelsWon / stats.duels : 0.5;
      bonus = clamp(scale(gi90, 0, 0.34) * 0.65 + scale(def90, 1.0, 5.5) * 0.23 + scale(duelPct, 0.42, 0.68) * 0.12, 0, 100);
      performance = quality * 0.31 + reliability * 0.27 + bonus * 0.34 + discipline * 0.08;
    } else if (role === 'C') {
      const gi90 = per90(stats.goals + stats.assists * 0.82);
      const key90 = per90(stats.keyPasses);
      const on90 = per90(stats.shotsOn);
      bonus = clamp(scale(gi90, 0.05, 0.72) * 0.62 + scale(key90, 0.15, 2.2) * 0.23 + scale(on90, 0.1, 1.15) * 0.15, 0, 100);
      performance = quality * 0.30 + reliability * 0.22 + bonus * 0.41 + discipline * 0.07;
    } else {
      const goals90 = per90(stats.goals);
      const gi90 = per90(stats.goals + stats.assists * 0.72);
      const on90 = per90(stats.shotsOn);
      bonus = clamp(scale(gi90, 0.08, 1.05) * 0.55 + scale(goals90, 0.04, 0.78) * 0.27 + scale(on90, 0.3, 1.9) * 0.13 + clamp(stats.penaltyScored * 12, 0, 100) * 0.05, 0, 100);
      performance = quality * 0.28 + reliability * 0.18 + bonus * 0.48 + discipline * 0.06;
    }

    return {
      index: clamp(performance, 0, 100),
      components: { quality: Math.round(quality), reliability: Math.round(reliability), bonus: Math.round(bonus), discipline: Math.round(discipline) }
    };
  }

  function estimateAuctionPrice(index, role) {
    const teams = Number(cfg.leagueTeams || 14);
    const budget = Number(cfg.budget || 800);
    const roster = cfg.roster || { P: 3, D: 8, C: 8, A: 6 };
    const budgetPct = cfg.roleBudgetPercent || { P: 7, D: 16, C: 27, A: 50 };

    // Tetti base pensati per una lega da 10; la scarsità aumenta del 3% per ogni squadra oltre la decima.
    const baseCeilings = { P: 45, D: 80, C: 155, A: 250 };
    const scarcity = 1 + Math.max(0, teams - 10) * 0.03;
    const roleBudget = Math.round(budget * Number(budgetPct[role] || 25) / 100);
    const roleSlots = Number(roster[role] || 1);
    const reserveMin = Math.max(0, roleSlots - 1); // almeno 1 credito per ciascun altro posto del reparto
    const theoreticalMax = Math.max(1, roleBudget - reserveMin);
    const ceiling = Math.min(theoreticalMax, Math.round(baseCeilings[role] * scarcity));

    const curve = Math.pow(index / 100, 3.1);
    const price = Math.max(1, Math.round(1 + (ceiling - 1) * curve));
    const low = Math.max(1, Math.round(price * 0.90));
    const high = Math.min(theoreticalMax, Math.max(price, Math.round(price * 1.10)));
    return { price, low, high, roleBudget, roleSlots, theoreticalMax, ceiling };
  }

  function priceExplanation(index, role, info) {
    const roleName = roleLabel(role).toLowerCase();
    if (index >= 85) return `È un profilo di fascia alta: in una lega a 14 la scarsità dei ${roleName} forti alza il prezzo. Il modello mantiene comunque una riserva per completare tutti i ${info.roleSlots} posti del reparto.`;
    if (index >= 70) return `È un profilo da investimento importante ma non da all-in. Il prezzo tiene conto della concorrenza di 14 squadre e del budget di reparto stimato in circa ${info.roleBudget} crediti.`;
    if (index >= 55) return `Prezzo da rotazione o buon titolare: il modello evita di bruciare troppo budget qui per proteggere gli slot più costosi del reparto.`;
    return `Profilo da scommessa: con 25 giocatori da acquistare conviene mantenere il costo contenuto e conservare crediti per i giocatori con indice più alto.`;
  }

  function aggregateStatistics(statsList) {
    const list = Array.isArray(statsList) ? statsList : [];
    const agg = {
      appearances: 0, lineups: 0, minutes: 0, goals: 0, assists: 0, saves: 0, conceded: 0,
      shots: 0, shotsOn: 0, keyPasses: 0, tackles: 0, blocks: 0, interceptions: 0,
      duels: 0, duelsWon: 0, yellow: 0, yellowRed: 0, red: 0, penaltyScored: 0, penaltyMissed: 0, penaltySaved: 0,
      ratingWeighted: 0, ratingWeight: 0, rating: null, position: null, teamName: null
    };

    list.forEach(stat => {
      const games = stat?.games || {};
      const minutes = num(games.minutes);
      const appearances = num(games.appearences);
      const rating = parseFloat(games.rating);
      agg.appearances += appearances;
      agg.lineups += num(games.lineups);
      agg.minutes += minutes;
      agg.goals += num(stat?.goals?.total);
      agg.assists += num(stat?.goals?.assists);
      agg.saves += num(stat?.goals?.saves);
      agg.conceded += num(stat?.goals?.conceded);
      agg.shots += num(stat?.shots?.total);
      agg.shotsOn += num(stat?.shots?.on);
      agg.keyPasses += num(stat?.passes?.key);
      agg.tackles += num(stat?.tackles?.total);
      agg.blocks += num(stat?.tackles?.blocks);
      agg.interceptions += num(stat?.tackles?.interceptions);
      agg.duels += num(stat?.duels?.total);
      agg.duelsWon += num(stat?.duels?.won);
      agg.yellow += num(stat?.cards?.yellow);
      agg.yellowRed += num(stat?.cards?.yellowred);
      agg.red += num(stat?.cards?.red);
      agg.penaltyScored += num(stat?.penalty?.scored);
      agg.penaltyMissed += num(stat?.penalty?.missed);
      agg.penaltySaved += num(stat?.penalty?.saved);
      if (Number.isFinite(rating)) {
        const weight = Math.max(minutes, appearances * 60, 1);
        agg.ratingWeighted += rating * weight;
        agg.ratingWeight += weight;
      }
      if (!agg.position && games.position) agg.position = games.position;
      if (!agg.teamName && stat?.team?.name) agg.teamName = stat.team.name;
    });
    agg.rating = agg.ratingWeight ? agg.ratingWeighted / agg.ratingWeight : null;
    return agg;
  }

  function pickCurrentStat(stats) {
    const list = Array.isArray(stats) ? stats : [];
    return list.find(item => Number(item?.league?.id) === 135) || list[0] || null;
  }

  function normalizeRole(position) {
    const p = String(position || '').toLowerCase();
    if (p.includes('goal')) return 'P';
    if (p.includes('def')) return 'D';
    if (p.includes('mid')) return 'C';
    if (p.includes('att') || p.includes('forward')) return 'A';
    return 'C';
  }

  function roleLabel(role) {
    return ({ P: 'Portiere', D: 'Difensore', C: 'Centrocampista', A: 'Attaccante' })[role] || 'Centrocampista';
  }

  function blendComponents(prev, curr, weight) {
    const keys = ['quality', 'reliability', 'bonus', 'discipline'];
    const out = {};
    keys.forEach(key => { out[key] = Math.round(prev[key] * (1 - weight) + curr[key] * weight); });
    return out;
  }

  function scoreCard(label, score) {
    const safe = Math.round(clamp(score, 0, 100));
    return `<div class="sos-score-card"><div><span>${escapeHtml(label)}</span><strong>${safe}</strong></div><div class="sos-score-track"><i style="width:${safe}%"></i></div></div>`;
  }

  function statItem(label, value) {
    const display = value === null || value === undefined || value === '' ? '—' : value;
    return `<div class="sos-stat-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(display))}</strong></div>`;
  }

  function formatRating(value) {
    return Number.isFinite(value) ? value.toFixed(2) : '—';
  }

  async function apiFetch(path) {
    const root = String(cfg.proxyUrl || '').replace(/\/$/, '');
    if (!root) throw new Error('Proxy API non configurato.');
    const response = await fetch(root + path, { headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || `Errore API (${response.status})`);
    return data;
  }

  function setLoading(active) {
    document.querySelector('#sos-search-spinner')?.classList.toggle('active', active);
  }

  function setHelp(text) {
    const el = document.querySelector('#sos-search-help');
    if (el) el.textContent = text;
  }

  function friendlyError(error) {
    const msg = String(error?.message || error || 'Errore sconosciuto');
    if (/quota|limit|429/i.test(msg)) return 'La quota gratuita dell’API è temporaneamente esaurita. Riprova più tardi.';
    if (/configurato|proxy/i.test(msg)) return 'Il collegamento all’API non è ancora configurato.';
    return msg;
  }

  function scale(value, min, max) {
    if (!Number.isFinite(Number(value))) return 50;
    return clamp(((Number(value) - min) / (max - min)) * 100, 0, 100);
  }

  function num(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]); }
  function escapeAttr(value) { return escapeHtml(value); }
})();
