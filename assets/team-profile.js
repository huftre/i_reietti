(() => {
  'use strict';

  const C = window.ReiettiCore;
  let context = null;
  let modal = null;

  // =========================================================
  // SCHEDA SQUADRA POPUP
  // MODIFICA FACILE: per aggiungere/togliere una statistica dal popup,
  // intervieni nella funzione renderProfile() qui sotto.
  // =========================================================
  function init(options) {
    context = options || null;
    if (!context?.teams?.length) return;
    ensureModal();
    document.addEventListener('click', handleTriggerClick);
  }

  function ensureModal() {
    if (modal) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'team-profile-backdrop';
    wrapper.id = 'team-profile-modal';
    wrapper.hidden = true;
    wrapper.innerHTML = `
      <section class="team-profile-modal" role="dialog" aria-modal="true" aria-labelledby="team-profile-title">
        <button class="team-profile-close" type="button" aria-label="Chiudi scheda squadra">×</button>
        <div class="team-profile-content" id="team-profile-content"></div>
      </section>`;
    document.body.appendChild(wrapper);
    modal = wrapper;

    wrapper.querySelector('.team-profile-close').addEventListener('click', close);
    wrapper.addEventListener('click', event => {
      if (event.target === wrapper) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !wrapper.hidden) close();
    });
  }

  function handleTriggerClick(event) {
    const trigger = event.target.closest('[data-team-profile]');
    if (!trigger || !context) return;
    event.preventDefault();
    const teamId = trigger.getAttribute('data-team-profile');
    if (teamId) open(teamId);
  }

  function open(teamId) {
    const team = context.teams.find(item => item.id === teamId);
    if (!team || !modal) return;
    renderProfile(team);
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('visible'));
    document.body.classList.add('team-profile-open');
    modal.querySelector('.team-profile-close').focus({ preventScroll: true });
  }

  function close() {
    if (!modal || modal.hidden) return;
    modal.classList.remove('visible');
    document.body.classList.remove('team-profile-open');
    window.setTimeout(() => { modal.hidden = true; }, 170);
  }

  function renderProfile(team) {
    const standings = context.standings || [];
    const started = standings.some(item => item.played > 0);
    const index = standings.findIndex(item => item.teamId === team.id);
    const item = index >= 0 ? standings[index] : {
      points: 0, played: 0, wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0, goalDifference: 0, fantasyPoints: 0
    };
    const position = started && index >= 0 ? `${index + 1}°` : '—';
    const form = C.calculateRecentForm(context.rows || [], team.id, context.config, 5);
    const trophies = context.trophies?.get(team.id) || {};
    const prize = context.prizeLedger?.get(team.id) || { earned: 0, details: [] };
    const averageFp = item.played ? item.fantasyPoints / item.played : 0;
    const content = modal.querySelector('#team-profile-content');

    content.innerHTML = `
      <div class="team-profile-head">
        <div class="team-profile-logo-wrap">${C.teamLogoHtml(team, 'team-logo-profile')}</div>
        <div class="team-profile-identity">
          <span class="eyebrow">Scheda squadra</span>
          <h2 id="team-profile-title">${C.escapeHtml(team.name)}</h2>
          <p>${C.escapeHtml(team.motto || '')}</p>
        </div>
      </div>

      <div class="team-profile-metrics">
        ${metric('Posizione', position)}
        ${metric('Punti', item.points)}
        ${metric('Fantapunti', C.formatPoints(item.fantasyPoints))}
        ${metric('Media FP', C.formatPoints(averageFp))}
        ${metric('Partite', item.played)}
        ${metric('V · P · S', `${item.wins} · ${item.draws} · ${item.losses}`)}
        ${metric('Gol fatti', item.goalsFor)}
        ${metric('Gol subiti', item.goalsAgainst)}
        ${metric('Diff. reti', `${item.goalDifference > 0 ? '+' : ''}${item.goalDifference}`)}
        ${metric('Premi maturati', C.formatCurrency(prize.earned || 0, context.config.currency || '€'))}
      </div>

      <div class="team-profile-section">
        <div class="team-profile-section-title"><strong>Forma recente</strong><span>ultime 5</span></div>
        ${formHtml(form)}
      </div>

      <div class="team-profile-section">
        <div class="team-profile-section-title"><strong>Bacheca</strong><span>Campionato · Cintura · Reietto</span></div>
        ${C.trophyCabinetHtml(trophies, 'trophy-cabinet-modal')}
      </div>

      <div class="team-profile-section prize-details ${prize.details?.length ? '' : 'is-empty'}">
        <div class="team-profile-section-title"><strong>Premi stagione</strong><span>${C.escapeHtml(context.config.season || '')}</span></div>
        ${prize.details?.length
          ? `<ul>${prize.details.map(detail => `<li><span>${C.escapeHtml(detail.label)}</span><strong>${C.formatCurrency(detail.amount, context.config.currency || '€')}</strong></li>`).join('')}</ul>`
          : '<p>Nessun premio ancora maturato.</p>'}
      </div>`;
    C.activateLogoFallbacks(content);
  }

  function metric(label, value) {
    return `<div class="team-profile-metric"><span>${C.escapeHtml(label)}</span><strong>${C.escapeHtml(value)}</strong></div>`;
  }

  function formHtml(form) {
    if (!form.length) return '<p class="team-profile-empty">Nessun risultato disponibile.</p>';
    const teamMap = C.teamMap(context.teams || []);
    return `
      <div class="form-strip form-strip-profile">${form.map(match => {
        const opponent = match.opponent ? C.getTeam(teamMap, match.opponent).name : 'Avversario';
        const label = `${match.day}ª Serie A · ${match.goalsFor}-${match.goalsAgainst} · ${opponent}`;
        return `<span class="form-result form-${match.result.toLowerCase()}" title="${C.escapeHtml(label)}">${match.result}</span>`;
      }).join('')}</div>
      <div class="recent-results-mini">${[...form].reverse().map(match => {
        const opponent = match.opponent ? C.getTeam(teamMap, match.opponent).name : 'Avversario';
        return `<div class="recent-result-row">
          <span>${match.day}ª Serie A · ${C.escapeHtml(opponent)}</span>
          <strong>${match.goalsFor}-${match.goalsAgainst}</strong>
        </div>`;
      }).join('')}</div>`;
  }

  window.ReiettiTeamProfile = { init, open, close };
})();
