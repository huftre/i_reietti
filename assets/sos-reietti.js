(() => {
  'use strict';

  const cfg = window.SOS_REIETTI_CONFIG || {};
  const state = {
    selectedSearchItem: null,
    requestId: 0,
    timer: null,
    lastCompletedQuery: '',
    lastExtendedQuery: ''
  };

  // MODIFICA QUI: quanti risultati mostrare prima del pulsante "Mostra altri".
  const SEARCH_RESULTS_PREVIEW = 6;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    const input = document.querySelector('#sos-player-search');
    const results = document.querySelector('#sos-search-results');
    const notice = document.querySelector('#sos-api-notice');
    const close = document.querySelector('#sos-player-close');
    const extendedButton = document.querySelector('#sos-extended-search');
    const modal = document.querySelector('#sos-player-modal');

    if (!input || !results || !modal) return;

    if (!String(cfg.proxyUrl || '').trim()) {
      notice?.removeAttribute('hidden');
      input.disabled = true;
      input.placeholder = 'Collega prima il Worker…';
    }

    input.addEventListener('input', () => {
      window.clearTimeout(state.timer);
      const query = input.value.trim();

      if (extendedButton) {
        extendedButton.disabled = query.length < 3;
      }

      if (query.length < 3) {
        results.hidden = true;
        results.innerHTML = '';
        setHelp('Digita almeno 3 caratteri.');
        setLoading(false);
        return;
      }

      /*
       MODIFICA v4.1:
       aspettiamo 1,1 secondi prima della ricerca.
       Così non consumiamo una chiamata API-Football per ogni lettera.
      */
      state.timer = window.setTimeout(() => searchPlayers(query), 1100);
    });

    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        results.hidden = true;
        input.blur();
        return;
      }

      /*
         INVIO = nuovo tentativo immediato della ricerca normale.
      */
      if (event.key === 'Enter') {
        const query = input.value.trim();

        if (query.length >= 3) {
          event.preventDefault();
          window.clearTimeout(state.timer);
          searchPlayers(query, true, false);
        }
      }
    });

    /*
       MODIFICA v4.5:
       Ricerca estesa manuale. Interroga API-Football anche quando
       TheSportsDB ha già trovato qualche omonimo.
    */
    extendedButton?.addEventListener('click', () => {
      const query = input.value.trim();

      if (query.length < 3) return;

      window.clearTimeout(state.timer);
      searchPlayers(query, true, true);
    });

    close?.addEventListener('click', closeModal);
    modal.addEventListener('click', event => {
      if (event.target === modal) closeModal();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !modal.hidden) closeModal();
    });
  }

  async function searchPlayers(query, force = false, extended = false) {
    const requestId = ++state.requestId;
    const results = document.querySelector('#sos-search-results');
    if (!results) return;

    // Evita richieste duplicate identiche generate dall'interfaccia.
    const normalizedQuery = query.toLowerCase();

    if (
      !force &&
      (
        (!extended && state.lastCompletedQuery === normalizedQuery) ||
        (extended && state.lastExtendedQuery === normalizedQuery)
      )
    ) {
      return;
    }

    setLoading(true);
    setHelp(`Cerco “${query}”…`);

    try {
      const params = new URLSearchParams({
        q: query
      });

      if (force) {
        params.set('fresh', '1');
      }

      if (extended) {
        params.set('extended', '1');
      }

      const data = await apiFetch(
        `/search?${params.toString()}`
      );

      if (requestId !== state.requestId) return;

      const players = Array.isArray(data.players)
        ? data.players
        : [];

      renderSearchResults(
        players,
        query,
        Boolean(data.extendedSearch)
      );

      if (!data.fallbackError) {
        if (data.extendedSearch) {
          state.lastExtendedQuery = normalizedQuery;
        } else {
          state.lastCompletedQuery = normalizedQuery;
        }
      }

      const suffix = data.extendedSearch
        ? ' · archivio esteso'
        : '';

      if (data.rateLimited) {
        setHelp(
          `API-Football ha raggiunto il limite momentaneo. ` +
          `Attendi circa ${data.retryAfterSeconds || 65} secondi e riprova la ricerca estesa.`
        );
      } else if (players.length) {
        setHelp(
          data.extendedSearch
            ? `${players.length} risultato${players.length === 1 ? '' : 'i'}${suffix}, ordinati per pertinenza.`
            : `${players.length} risultato${players.length === 1 ? '' : 'i'}. Se non trovi quello giusto, usa “Ricerca estesa”.`
        );
      } else {
        setHelp(
          data.fallbackError
            ? `Nessun giocatore trovato. ${data.fallbackError}`
            : 'Nessun giocatore trovato. Prova la ricerca estesa.'
        );
      }
    } catch (error) {
      if (requestId !== state.requestId) return;

      results.hidden = false;
      results.innerHTML = `<div class="sos-search-error"><strong>Ricerca non disponibile.</strong><span>${escapeHtml(friendlyError(error))}</span></div>`;
      setHelp('Controlla il collegamento dati e riprova.');
    } finally {
      if (requestId === state.requestId) setLoading(false);
    }
  }

  function renderSearchResults(players, query = '', extended = false, showAll = false) {
    const container = document.querySelector('#sos-search-results');
    if (!container) return;

    if (!players.length) {
      container.hidden = false;
      container.innerHTML =
        '<div class="sos-no-results">Nessun risultato. Se il nome è corretto, prova “Ricerca estesa”.</div>';
      return;
    }

    /*
       MODIFICA v4.5:
       riordino anche lato sito, così il risultato più pertinente
       resta in alto anche se un provider cambia l'ordine della risposta.
    */
    const ranked = rankSearchResultsFrontend(
      players,
      query
    );

    const visible = showAll
      ? ranked
      : ranked.slice(0, SEARCH_RESULTS_PREVIEW);

    const hiddenCount =
      Math.max(0, ranked.length - visible.length);

    const rowsHtml = visible.map((item, index) => {
      const player = item.player || {};
      const stat = pickCurrentStat(item.statistics || []);
      const rawPosition = stat?.games?.position;

      const role = rawPosition
        ? roleLabel(normalizeRole(rawPosition))
        : 'Ruolo da verificare';

      const hintedTeam =
        item?.currentTeamHint?.name ||
        '';

      const team = String(
        hintedTeam ||
        stat?.team?.name ||
        ''
      ).trim();

      const verified =
        Boolean(item?.currentTeamHint?.verified);

      const meta = [
        team && team !== '—'
          ? team
          : (
              item.provider === 'api-football'
                ? 'Archivio esteso'
                : ''
            ),
        role
      ].filter(Boolean).join(' · ');

      const tags = [
        verified
          ? '<span class="sos-result-tag verified">Serie A verificata</span>'
          : '',
        item.provider === 'api-football'
          ? '<span class="sos-result-tag extended">Archivio esteso</span>'
          : ''
      ].filter(Boolean).join('');

      return `
        <button class="sos-search-result${verified ? ' verified' : ''}" type="button" data-player-index="${index}">
          <img src="${escapeAttr(player.photo || '')}" alt="" loading="lazy">
          <span class="sos-result-copy">
            <strong>${escapeHtml(player.name || `${player.firstname || ''} ${player.lastname || ''}`.trim())}</strong>
            <small>${escapeHtml(meta || 'Dati disponibili nella scheda')}</small>
            ${tags ? `<span class="sos-result-tags">${tags}</span>` : ''}
          </span>
          <span class="sos-result-arrow" aria-hidden="true">→</span>
        </button>`;
    }).join('');

    const footerHtml = hiddenCount
      ? `
        <button class="sos-show-more" type="button" data-sos-show-more>
          Mostra altri ${hiddenCount} omonim${hiddenCount === 1 ? 'o' : 'i'}
        </button>`
      : (
          extended
            ? '<div class="sos-search-mode-note">Risultati dell’archivio esteso, ordinati per pertinenza.</div>'
            : ''
        );

    container.innerHTML =
      rowsHtml +
      footerHtml;

    container.hidden = false;

    container.querySelectorAll('[data-player-index]').forEach(button => {
      button.addEventListener('click', () => {
        const item = visible[Number(button.dataset.playerIndex)];
        if (!item) return;

        state.selectedSearchItem = item;
        container.hidden = true;
        openPlayer(item);
      });
    });

    container.querySelector('[data-sos-show-more]')?.addEventListener('click', () => {
      renderSearchResults(
        ranked,
        query,
        extended,
        true
      );
    });
  }


  function rankSearchResultsFrontend(players, query) {
    return [...players]
      .map((item, index) => ({
        item,
        index,
        score: frontendSearchScore(item, query)
      }))
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return a.index - b.index;
      })
      .map(row => row.item);
  }


  function frontendSearchScore(item, query) {
    const player = item?.player || {};
    const q = normalizeSearchText(query);
    const full = normalizeSearchText(player?.name);
    const first = normalizeSearchText(player?.firstname);
    const last = normalizeSearchText(player?.lastname);

    let score = 0;

    // MODIFICA QUI se vuoi cambiare la priorità dell'autocomplete.
    if (full === q) score += 120;
    if (last === q) score += 90;
    if (first === q) score += 55;

    if (full.startsWith(q)) score += 42;
    if (last.startsWith(q)) score += 38;
    if (first.startsWith(q)) score += 24;

    if (full.includes(q)) score += 25;
    if (last.includes(q)) score += 22;

    if (item?.currentTeamHint?.verified) {
      score += 80;
    }

    if (
      normalizeSearchText(player?.nationality) === 'italy'
    ) {
      score += 4;
    }

    return score;
  }


  function normalizeSearchText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[._'’\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }


  async function openPlayer(searchItem) {
    const modal = document.querySelector('#sos-player-modal');
    const content = document.querySelector('#sos-player-modal-content');
    if (!modal || !content) return;

    modal.hidden = false;
    document.body.classList.add('sos-modal-open');
    requestAnimationFrame(() => modal.classList.add('visible'));

    content.innerHTML = `
      <div class="sos-modal-loading">
        <span class="pdf-spinner" aria-hidden="true"></span>
        <strong>Elaborazione SOS…</strong>
        <small>Analizzo rendimento, titolarità, ruolo e contesto attuale.</small>
      </div>`;

    try {
      const id = Number(searchItem?.player?.id);
      if (!id) throw new Error('Giocatore non valido.');

      /*
         MODIFICA v4:
         diciamo al Worker da quale archivio arriva l'ID.
         - thesportsdb     = ricerca normale
         - api-football    = ricerca estesa/fallback
      */
      const provider = String(
        searchItem?.provider ||
        searchItem?.player?.provider ||
        'thesportsdb'
      );

      const detail = await apiFetch(
        `/player?id=${id}&source=${encodeURIComponent(provider)}`
      );

      renderPlayerDetail(searchItem, detail);
    } catch (error) {
      content.innerHTML = `
        <div class="sos-detail-error">
          <span>⚠️</span>
          <h2>Non riesco a completare la scheda</h2>
          <p>${escapeHtml(friendlyError(error))}</p>
        </div>`;
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

    const primaryItem = detail.current || searchItem || {};
    const secondaryItem = detail.previous || null;
    const player = primaryItem.player || searchItem.player || {};

    /* =======================================================
       IMPORTANTE:
       con il Worker v3 "current" contiene la migliore base
       statistica disponibile (oggi API-Football 2024/25).
       Non usiamo più "previous" come base principale.
       ======================================================= */
    const primaryAgg = aggregateStatistics(primaryItem.statistics || []);
    const secondaryAgg = aggregateStatistics(secondaryItem?.statistics || []);

    const rawRole =
      primaryAgg.position ||
      pickCurrentStat(searchItem.statistics || [])?.games?.position ||
      secondaryAgg.position;

    const role = normalizeRole(rawRole);
    const context = detail.serieA || {};

    const dataSeason =
      numericSeason(detail.statisticsSeasonUsed) ??
      numericSeason(detail.currentSeason) ??
      null;

    const live =
      numericSeason(detail.liveSeason) ??
      numericSeason(cfg.liveSeason) ??
      2026;

    const evaluation = evaluatePlayer({
      player,
      role,
      primaryAgg,
      secondaryAgg,
      dataSeason,
      liveSeason: live,
      context,
      dataMode: detail.dataMode
    });

    const currentTeam =
      context?.team?.shortName ||
      context?.team?.name ||
      detail?.currentTeam?.name ||
      primaryAgg.teamName ||
      pickCurrentStat(searchItem.statistics || [])?.team?.name ||
      '—';

    const sourceLabel = detail.sources?.statistics || detail.historical?.source || 'dati disponibili';
    const seasonLabel = dataSeason ? seasonText(dataSeason) : 'stagione disponibile';

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
          ${player.injured ? '<div class="sos-injury-warning">⚠️ Segnalato come indisponibile/infortunato nei dati disponibili.</div>' : ''}
          <div class="sos-profile-tags">${evaluation.tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
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
        <div class="sos-detail-title">
          <div>
            <span class="eyebrow">Dati utilizzati</span>
            <h3>${escapeHtml(seasonLabel)}</h3>
          </div>
          <span class="sos-confidence ${evaluation.confidenceClass}">${escapeHtml(evaluation.confidence)}</span>
        </div>

        <div class="sos-stat-grid">
          ${statItem('Presenze', primaryAgg.appearances || '—')}
          ${statItem('Minuti', primaryAgg.minutes || '—')}
          ${statItem('Rating', formatRating(primaryAgg.rating))}
          ${statItem(role === 'P' ? 'Parate' : 'Gol', role === 'P' ? displayZeroAware(primaryAgg.saves, primaryAgg.minutes) : displayZeroAware(primaryAgg.goals, primaryAgg.minutes))}
          ${statItem(role === 'P' ? 'Gol subiti' : 'Assist', role === 'P' ? displayZeroAware(primaryAgg.conceded, primaryAgg.minutes) : displayZeroAware(primaryAgg.assists, primaryAgg.minutes))}
          ${statItem('Titolarità', primaryAgg.appearances ? `${Math.round((primaryAgg.lineups / primaryAgg.appearances) * 100)}%` : '—')}
        </div>

        <p class="sos-data-caption">
          Base statistica: ${escapeHtml(sourceLabel)} · ${escapeHtml(seasonLabel)}.
          ${evaluation.freshnessNote}
        </p>
      </section>

      <section class="sos-detail-section">
        <div class="sos-detail-title">
          <div>
            <span class="eyebrow">Lettura SOS</span>
            <h3>Identikit del giocatore</h3>
          </div>
        </div>
        <p class="sos-explanation sos-profile-summary">${escapeHtml(evaluation.summary)}</p>
      </section>

      <section class="sos-detail-section">
        <div class="sos-detail-title">
          <div>
            <span class="eyebrow">Contesto attuale</span>
            <h3>Serie A ${escapeHtml(seasonText(live))}</h3>
          </div>
        </div>
        ${renderCurrentContext(context, currentTeam)}
      </section>

      <section class="sos-detail-section">
        <div class="sos-detail-title">
          <div>
            <span class="eyebrow">Budget della Lega</span>
            <h3>Come nasce il prezzo</h3>
          </div>
        </div>

        <div class="sos-budget-strip">
          <div><span>Budget totale</span><strong>${cfg.budget || 800}</strong></div>
          <div><span>Budget ${roleLabel(role).toLowerCase()}</span><strong>≈ ${evaluation.roleBudget}</strong></div>
          <div><span>Posti reparto</span><strong>${evaluation.roleSlots}</strong></div>
          <div><span>Squadre</span><strong>${cfg.leagueTeams || 14}</strong></div>
        </div>

        <p class="sos-explanation">${escapeHtml(evaluation.explanation)}</p>
      </section>

      <div class="sos-model-note">
        Il prezzo SOS è un riferimento per l'asta iniziale: non è una quotazione ufficiale e non garantisce rendimento futuro.
        I pesi del modello sono commentati in <code>assets/sos-reietti.js</code> e possono essere modificati.
      </div>`;
  }

  function renderCurrentContext(context, currentTeam) {
    const next = context?.nextMatch;
    const standing = context?.standing;
    const played = Number(standing?.playedGames || 0);

    const standingValue = played > 0 && standing?.position
      ? `${standing.position}°`
      : 'Non iniziato';

    const nextText = next
      ? `${next.venue === 'casa' ? '🏠' : '✈️'} ${next.home || '—'} – ${next.away || '—'}`
      : 'Calendario non disponibile';

    const dateText = next?.date ? formatItalianDate(next.date) : '—';

    return `
      <div class="sos-current-grid">
        <div class="sos-current-card"><span>Squadra attuale</span><strong>${escapeHtml(currentTeam || '—')}</strong></div>
        <div class="sos-current-card"><span>Classifica</span><strong>${escapeHtml(standingValue)}</strong><small>${played ? `${played} partite giocate` : 'stagione al via'}</small></div>
        <div class="sos-current-card wide"><span>Prossima partita</span><strong>${escapeHtml(nextText)}</strong><small>${escapeHtml(dateText)}${next?.matchday ? ` · ${next.matchday}ª giornata` : ''}</small></div>
      </div>`;
  }

  /* =========================================================
     ALGORITMO SOS REIETTI
     =========================================================
     Questo è un modello indipendente e trasparente.

     MODIFICA FACILE:
     - scoreSeason() = pesi tecnici per ruolo.
     - estimateAuctionPrice() = trasformazione indice -> crediti.
     - contextAdjustment() = piccolo correttivo sul contesto attuale.

     Il prezzo è calibrato per:
     14 squadre · 800 crediti · 3P / 8D / 8C / 6A.
     ========================================================= */

  function evaluatePlayer({ player, role, primaryAgg, secondaryAgg, dataSeason, liveSeason, context, dataMode }) {
    const primary = scoreSeason(primaryAgg, role);
    const secondary = scoreSeason(secondaryAgg, role);

    let index;

    if (primaryAgg.minutes > 0) {
      // La base principale è sempre il dato più recente/utile restituito dal Worker.
      index = primary.index;

      // Se in futuro avremo anche una seconda stagione valida, la usiamo solo come stabilizzatore.
      if (secondaryAgg.minutes > 500) {
        index = primary.index * 0.78 + secondary.index * 0.22;
      }
    } else {
      index = 50;
    }

    const contextDelta = contextAdjustment(context);
    const ageDelta = ageAdjustment(player?.age, role);
    const freshnessDelta = freshnessAdjustment(dataSeason, liveSeason);

    index += contextDelta + ageDelta + freshnessDelta;

    if (player?.injured) index -= 8;

    index = Math.round(clamp(index, 30, 99));

    const confidenceInfo = confidenceFor(primaryAgg, dataSeason, liveSeason, dataMode);
    const priceInfo = estimateAuctionPrice(index, role, confidenceInfo.className);
    const components = primary.components;

    const verdict =
      index >= 91 ? 'Top assoluto' :
      index >= 84 ? 'Prima fascia' :
      index >= 76 ? 'Titolare premium' :
      index >= 68 ? 'Titolarissimo' :
      index >= 59 ? 'Buon acquisto' :
      index >= 50 ? 'Da rotazione' :
      'Scommessa';

    return {
      index,
      price: priceInfo.price,
      low: priceInfo.low,
      high: priceInfo.high,
      roleBudget: priceInfo.roleBudget,
      roleSlots: priceInfo.roleSlots,
      verdict,
      confidence: confidenceInfo.label,
      confidenceClass: confidenceInfo.className,
      components,
      componentsLabel: role === 'P' ? 'Porta' : 'Bonus',
      explanation: priceExplanation(index, role, priceInfo),
      freshnessNote: freshnessNote(dataSeason, liveSeason),
      tags: buildTags(primaryAgg, role, index),
      summary: buildSummary(primaryAgg, role, index, context)
    };
  }

  function scoreSeason(stats, role) {
    if (!stats || !stats.minutes) {
      return {
        index: 50,
        components: {
          quality: 50,
          reliability: 35,
          bonus: 35,
          discipline: 85
        }
      };
    }

    const rating = stats.rating || 6.0;

    // MODIFICA QUI: intervallo rating che corrisponde a 0-100.
    const quality = scale(rating, 5.90, 7.45);

    const lineupRatio = stats.appearances
      ? stats.lineups / stats.appearances
      : 0;

    const reliability = clamp(
      Math.min(stats.minutes / 2850, 1) * 60 +
      Math.min(stats.appearances / 34, 1) * 20 +
      lineupRatio * 20,
      0,
      100
    );

    const discipline = clamp(
      100 -
      stats.yellow * 2.3 -
      stats.yellowRed * 8 -
      stats.red * 16,
      10,
      100
    );

    const per90 = value => stats.minutes
      ? Number(value || 0) * 90 / stats.minutes
      : 0;

    let bonus = 50;
    let performance = 50;

    if (role === 'P') {
      const saves90 = per90(stats.saves);
      const conceded90 = per90(stats.conceded);

      bonus = clamp(
        scale(saves90, 1.7, 4.8) * 0.58 +
        (100 - scale(conceded90, 0.55, 2.05)) * 0.32 +
        clamp(stats.penaltySaved * 18, 0, 100) * 0.10,
        0,
        100
      );

      performance =
        quality * 0.34 +
        reliability * 0.30 +
        bonus * 0.29 +
        discipline * 0.07;

    } else if (role === 'D') {
      const bonus90 = per90(stats.goals + stats.assists * 0.78);
      const def90 = per90(stats.tackles + stats.interceptions + stats.blocks);
      const duelPct = stats.duels ? stats.duelsWon / stats.duels : 0.50;

      bonus = clamp(
        scale(bonus90, 0.00, 0.34) * 0.58 +
        scale(def90, 1.0, 5.5) * 0.27 +
        scale(duelPct, 0.42, 0.68) * 0.15,
        0,
        100
      );

      performance =
        quality * 0.32 +
        reliability * 0.27 +
        bonus * 0.33 +
        discipline * 0.08;

    } else if (role === 'C') {
      const bonus90 = per90(stats.goals + stats.assists * 0.82);
      const key90 = per90(stats.keyPasses);
      const on90 = per90(stats.shotsOn);

      bonus = clamp(
        scale(bonus90, 0.05, 0.72) * 0.58 +
        scale(key90, 0.15, 2.20) * 0.25 +
        scale(on90, 0.10, 1.15) * 0.17,
        0,
        100
      );

      performance =
        quality * 0.31 +
        reliability * 0.23 +
        bonus * 0.39 +
        discipline * 0.07;

    } else {
      const goals90 = per90(stats.goals);
      const bonus90 = per90(stats.goals + stats.assists * 0.75);
      const on90 = per90(stats.shotsOn);
      const key90 = per90(stats.keyPasses);

      bonus = clamp(
        scale(bonus90, 0.12, 0.90) * 0.45 +
        scale(goals90, 0.07, 0.70) * 0.25 +
        scale(on90, 0.35, 1.65) * 0.15 +
        scale(key90, 0.20, 1.65) * 0.10 +
        clamp(stats.penaltyScored * 12, 0, 100) * 0.05,
        0,
        100
      );

      performance =
        quality * 0.31 +
        reliability * 0.20 +
        bonus * 0.43 +
        discipline * 0.06;
    }

    return {
      index: clamp(performance, 0, 100),
      components: {
        quality: Math.round(quality),
        reliability: Math.round(reliability),
        bonus: Math.round(bonus),
        discipline: Math.round(discipline)
      }
    };
  }

  function estimateAuctionPrice(index, role, confidenceClass) {
    const teams = Number(cfg.leagueTeams || 14);
    const budget = Number(cfg.budget || 800);
    const roster = cfg.roster || { P: 3, D: 8, C: 8, A: 6 };
    const budgetPct = cfg.roleBudgetPercent || { P: 7, D: 16, C: 27, A: 50 };

    const roleBudget = Math.round(
      budget * Number(budgetPct[role] || 25) / 100
    );

    const roleSlots = Number(roster[role] || 1);
    const reserveMin = Math.max(0, roleSlots - 1);
    const theoreticalMax = Math.max(1, roleBudget - reserveMin);

    /* =======================================================
       MODIFICA QUI: tetto massimo per un singolo giocatore.
       Sono quote del budget totale prima del correttivo scarsità.
       ======================================================= */
    const ceilingShare = {
      P: 0.075,
      D: 0.150,
      C: 0.260,
      A: 0.430
    };

    // 14 squadre = mercato più aggressivo rispetto a una lega da 10.
    const scarcity = 1 + Math.max(0, teams - 10) * 0.025;

    const ceiling = Math.min(
      theoreticalMax,
      Math.round(budget * ceilingShare[role] * scarcity)
    );

    /* =======================================================
       Curva prezzo:
       sotto indice 30 si resta vicino al minimo;
       da 80 in su il costo cresce rapidamente.
       Gli attaccanti hanno curva leggermente più aggressiva.
       ======================================================= */
    const floorIndex = 30;
    const exponent = { P: 2.15, D: 2.10, C: 2.00, A: 1.85 }[role] || 2;
    const normalized = clamp((index - floorIndex) / (100 - floorIndex), 0, 1);
    const curve = Math.pow(normalized, exponent);

    const price = Math.max(1, Math.round(1 + (ceiling - 1) * curve));

    const spread =
      confidenceClass === 'high' ? 0.09 :
      confidenceClass === 'medium' ? 0.13 :
      0.18;

    const low = Math.max(1, Math.round(price * (1 - spread)));
    const high = Math.min(
      theoreticalMax,
      Math.max(price, Math.round(price * (1 + spread)))
    );

    return {
      price,
      low,
      high,
      roleBudget,
      roleSlots,
      theoreticalMax,
      ceiling
    };
  }

  function contextAdjustment(context) {
    let delta = 0;

    const next = context?.nextMatch;
    const standing = context?.standing;
    const played = Number(standing?.playedGames || 0);
    const position = Number(standing?.position || 0);

    // Prossima gara in casa: piccolo vantaggio, senza gonfiare il prezzo.
    if (next?.venue === 'casa') delta += 0.8;

    // Classifica usata solo dopo alcune giornate: a 0 partite la posizione è priva di significato.
    if (played >= 5 && position) {
      if (position <= 4) delta += 2.0;
      else if (position <= 8) delta += 1.0;
      else if (position >= 18) delta -= 2.0;
      else if (position >= 15) delta -= 1.0;
    }

    return delta;
  }

  function ageAdjustment(age, role) {
    const value = Number(age);
    if (!Number.isFinite(value)) return 0;

    if (role === 'P') {
      if (value >= 27 && value <= 34) return 0.8;
      if (value >= 39) return -1.5;
      return 0;
    }

    if (role === 'D') {
      if (value >= 24 && value <= 30) return 0.8;
      if (value >= 34) return -1.5;
      return 0;
    }

    if (value >= 23 && value <= 29) return 1.0;
    if (value >= 33) return -2.0;
    if (value <= 21) return 0.4;
    return 0;
  }

  function freshnessAdjustment(dataSeason, liveSeason) {
    if (!Number.isFinite(dataSeason) || !Number.isFinite(liveSeason)) return 0;

    const gap = Math.max(0, liveSeason - dataSeason);
    if (gap <= 1) return 0;

    // I dati vecchi restano utili, ma non devono spingere troppo l'indice.
    return -Math.min(3, (gap - 1) * 1.3);
  }

  function confidenceFor(stats, dataSeason, liveSeason, dataMode) {
    const minutes = Number(stats?.minutes || 0);
    const gap = Number.isFinite(dataSeason) && Number.isFinite(liveSeason)
      ? Math.max(0, liveSeason - dataSeason)
      : 0;

    if (minutes >= 1800 && gap <= 1) {
      return { label: 'Dati solidi', className: 'high' };
    }

    if (minutes >= 1800) {
      return {
        label: dataMode === 'historical-baseline' ? 'Storico solido' : 'Dati medi',
        className: 'medium'
      };
    }

    if (minutes >= 700) {
      return { label: 'Dati medi', className: 'medium' };
    }

    return { label: 'Dati limitati', className: 'low' };
  }

  function freshnessNote(dataSeason, liveSeason) {
    if (!Number.isFinite(dataSeason) || !Number.isFinite(liveSeason)) {
      return 'La stima usa esclusivamente i dati disponibili.';
    }

    const gap = Math.max(0, liveSeason - dataSeason);

    if (gap === 0) {
      return 'La base statistica appartiene alla stagione corrente.';
    }

    if (gap === 1) {
      return 'La base statistica è recente e viene combinata con il contesto attuale.';
    }

    return `La base individuale è storica (${gap} stagioni di distanza): il modello applica un piccolo correttivo prudenziale e usa squadra/calendario attuali per il contesto.`;
  }

  function buildTags(stats, role, index) {
    const tags = [];
    const lineup = stats.appearances ? stats.lineups / stats.appearances : 0;
    const per90 = value => stats.minutes ? Number(value || 0) * 90 / stats.minutes : 0;

    if (lineup >= 0.85 && stats.appearances >= 20) tags.push('Titolare fisso');
    else if (lineup >= 0.65) tags.push('Buona titolarità');
    else tags.push('Rotazione');

    if (role === 'A') {
      const g90 = per90(stats.goals);
      if (g90 >= 0.55) tags.push('Gol alto');
      else if (g90 >= 0.30) tags.push('Gol buono');
      else tags.push('Bonus da valutare');
    } else if (role === 'C' || role === 'D') {
      const b90 = per90(stats.goals + stats.assists);
      if (b90 >= 0.35) tags.push('Bonus alto');
      else if (b90 >= 0.16) tags.push('Bonus discreto');
      else tags.push('Bonus limitato');
    } else {
      tags.push(stats.saves ? 'Volume parate' : 'Porta da valutare');
    }

    if (index >= 84) tags.push('Da prima fascia');
    else if (index >= 68) tags.push('Profilo affidabile');
    else tags.push('Prezzo da controllare');

    return tags.slice(0, 3);
  }

  function buildSummary(stats, role, index, context) {
    const appearances = stats.appearances || 0;
    const minutes = stats.minutes || 0;
    const lineupPct = appearances ? Math.round(stats.lineups / appearances * 100) : 0;
    const per90 = value => minutes ? Number(value || 0) * 90 / minutes : 0;

    let profile;

    if (role === 'A') {
      profile = `${stats.goals} gol e ${stats.assists} assist nella base statistica, ${per90(stats.goals).toFixed(2)} gol ogni 90'.`;
    } else if (role === 'C') {
      profile = `${stats.goals} gol e ${stats.assists} assist, con ${per90(stats.keyPasses).toFixed(2)} passaggi chiave ogni 90'.`;
    } else if (role === 'D') {
      profile = `${stats.goals} gol e ${stats.assists} assist, più ${per90(stats.tackles + stats.interceptions + stats.blocks).toFixed(2)} interventi difensivi ogni 90'.`;
    } else {
      profile = `${stats.saves} parate e ${stats.conceded} gol subiti nella base statistica.`;
    }

    const use = lineupPct >= 85
      ? `Titolarità molto alta (${lineupPct}%).`
      : lineupPct >= 65
        ? `Titolarità buona (${lineupPct}%).`
        : `Titolarità da monitorare (${lineupPct || 0}%).`;

    const next = context?.nextMatch;
    const contextText = next
      ? ` Prossimo impegno: ${next.opponent || 'avversario da definire'} ${next.venue === 'casa' ? 'in casa' : 'in trasferta'}.`
      : '';

    const priceTone = index >= 84
      ? 'È un profilo su cui il modello accetta un investimento importante.'
      : index >= 68
        ? 'È un profilo da titolare, ma il modello evita l’all-in.'
        : 'Va comprato solo se il prezzo resta disciplinato.';

    return `${profile} ${use} ${priceTone}${contextText}`;
  }

  function priceExplanation(index, role, info) {
    const roleName = roleLabel(role).toLowerCase();

    if (index >= 85) {
      return `Profilo di fascia alta: in una lega a 14 la scarsità dei ${roleName} forti fa salire rapidamente il prezzo. Il modello conserva comunque una riserva per completare tutti i ${info.roleSlots} posti del reparto.`;
    }

    if (index >= 70) {
      return `Investimento importante ma non da all-in. Il prezzo tiene conto della concorrenza di 14 squadre e di un budget indicativo di circa ${info.roleBudget} crediti per il reparto.`;
    }

    if (index >= 55) {
      return `Prezzo da buon titolare o rotazione: il modello protegge il budget per gli slot più costosi del reparto e limita le rincorse d'asta.`;
    }

    return `Profilo da scommessa: con 25 giocatori da acquistare conviene tenere il costo contenuto e conservare crediti per gli indici più alti.`;
  }

  function aggregateStatistics(statsList) {
    const list = Array.isArray(statsList) ? statsList : [];

    const agg = {
      appearances: 0,
      lineups: 0,
      minutes: 0,
      goals: 0,
      assists: 0,
      saves: 0,
      conceded: 0,
      shots: 0,
      shotsOn: 0,
      keyPasses: 0,
      tackles: 0,
      blocks: 0,
      interceptions: 0,
      duels: 0,
      duelsWon: 0,
      yellow: 0,
      yellowRed: 0,
      red: 0,
      penaltyScored: 0,
      penaltyMissed: 0,
      penaltySaved: 0,
      ratingWeighted: 0,
      ratingWeight: 0,
      rating: null,
      position: null,
      teamName: null
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

    agg.rating = agg.ratingWeight
      ? agg.ratingWeighted / agg.ratingWeight
      : null;

    return agg;
  }

  function pickCurrentStat(stats) {
    const list = Array.isArray(stats) ? stats : [];
    return list.find(item => Number(item?.league?.id) === 135) || list[0] || null;
  }

  function normalizeRole(positionValue) {
    const p = String(positionValue || '').toLowerCase();

    if (p.includes('goal')) return 'P';
    if (p.includes('def')) return 'D';
    if (p.includes('mid')) return 'C';
    if (p.includes('att') || p.includes('forward')) return 'A';

    return 'C';
  }

  function roleLabel(role) {
    return ({
      P: 'Portiere',
      D: 'Difensore',
      C: 'Centrocampista',
      A: 'Attaccante'
    })[role] || 'Centrocampista';
  }

  function scoreCard(label, score) {
    const safe = Math.round(clamp(score, 0, 100));

    return `
      <div class="sos-score-card">
        <div><span>${escapeHtml(label)}</span><strong>${safe}</strong></div>
        <div class="sos-score-track"><i style="width:${safe}%"></i></div>
      </div>`;
  }

  function statItem(label, value) {
    const display = value === null || value === undefined || value === '' ? '—' : value;

    return `
      <div class="sos-stat-item">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(String(display))}</strong>
      </div>`;
  }

  function formatRating(value) {
    return Number.isFinite(value) ? value.toFixed(2) : '—';
  }

  function displayZeroAware(value, minutes) {
    if (!minutes) return '—';
    return Number(value || 0);
  }

  function seasonText(startYear) {
    const year = Number(startYear);
    if (!Number.isFinite(year)) return String(startYear || '—');
    return `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
  }

  function numericSeason(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function formatItalianDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';

    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Rome'
    }).format(date);
  }

  async function apiFetch(path) {
    const root = String(cfg.proxyUrl || '').replace(/\/$/, '');
    if (!root) throw new Error('Proxy API non configurato.');

    const response = await fetch(root + path, {
      headers: { Accept: 'application/json' }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.error) {
      throw new Error(data.error || `Errore API (${response.status})`);
    }

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

    if (/quota|limit|429/i.test(msg)) {
      return 'API-Football ha raggiunto il limite momentaneo. Attendi circa un minuto e riprova.';
    }

    if (/configurato|proxy/i.test(msg)) {
      return 'Il collegamento all’API non è ancora configurato.';
    }

    return msg;
  }

  function scale(value, min, max) {
    if (!Number.isFinite(Number(value))) return 50;
    return clamp(((Number(value) - min) / (max - min)) * 100, 0, 100);
  }

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    })[char]);
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();
