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
      const map = C.teamMap(teams);
      renderBranding(config, rows, teams, demoMode);
      renderBelt(C.calculateBelt(rows, teams, config), config, map);
      C.activateLogoFallbacks();
    } catch (error) {
      console.error(error);
      $('#belt-timeline').innerHTML = '<div class="timeline-empty">Impossibile caricare i dati della Cintura.</div>';
    }
  }

  function renderBranding(config, rows, teams, demoMode) {
    $('#league-name').textContent = config.leagueName;
    $('#season-label').textContent = `Stagione ${config.season}`;
    $('#footer-season').textContent = config.season;
    document.title = `${config.leagueName} — Cintura dei Reietti`;
    const latest = C.latestCompleteDay(rows, teams, config, false);
    $('#last-updated').textContent = demoMode ? 'Modalità demo' : latest ? C.matchdayLabel(latest, config, true) : 'Cintura in attesa';
  }

  function renderBelt(belt, config, map) {
    const beltStart = Number(config.beltStartMatchday ?? config.startMatchday);
    $('#belt-start-label').textContent = C.matchdayLabel(beltStart, config, false);

    if (belt.tie) {
      const names = belt.tiedTeams.map(id => C.getTeam(map, id).name).join(' e ');
      $('#belt-holder').textContent = 'Parità da risolvere';
      $('#belt-detail').textContent = `${names} hanno chiuso la ${beltStart}ª giornata Serie A a ${C.formatPoints(belt.tiedPoints)} FP.`;
      $('#belt-holder-large').textContent = 'Assegnazione sospesa';
      $('#belt-streak').textContent = 'Serve applicare il criterio di spareggio previsto dal regolamento.';
      $('#belt-avatar').innerHTML = '<span class="team-logo team-logo-hero"><span class="team-logo-fallback">⚖️</span></span>';
      return;
    }

    if (!belt.holder) {
      $('#belt-holder').textContent = `In attesa della ${beltStart}ª giornata Serie A`;
      $('#belt-detail').textContent = 'La Cintura sarà assegnata quando saranno presenti i fantapunti di tutte le 14 squadre.';
      $('#belt-holder-large').textContent = 'Da assegnare';
      $('#belt-streak').textContent = 'Nessuna difesa registrata';
      $('#belt-avatar').innerHTML = '<span class="team-logo team-logo-hero"><span class="team-logo-fallback">🏆</span></span>';
      $('#belt-won-day').textContent = '—';
      $('#belt-defenses').textContent = '0';
      $('#belt-holders-count').textContent = '0';
      $('#belt-history-count').textContent = '0 eventi';
      renderTimeline([], config);
      return;
    }

    const holderTeam = C.getTeam(map, belt.holder);
    const defenseLabel = belt.currentDefenses === 1 ? '1 difesa consecutiva' : `${belt.currentDefenses} difese consecutive`;
    $('#belt-holder').textContent = holderTeam.name;
    $('#belt-detail').textContent = `Cintura conquistata: ${C.matchdayLabel(belt.acquiredDay, config, false)} · ${defenseLabel}.`;
    $('#belt-holder-large').textContent = holderTeam.name;
    $('#belt-streak').textContent = defenseLabel;
    $('#belt-avatar').innerHTML = C.teamLogoHtml(holderTeam, 'large');
    $('#belt-won-day').textContent = `${belt.acquiredDay}ª Serie A`;
    $('#belt-defenses').textContent = String(belt.currentDefenses);
    $('#belt-holders-count').textContent = String(belt.holders.length);
    $('#belt-history-count').textContent = `${belt.events.length} ${belt.events.length === 1 ? 'evento' : 'eventi'}`;
    renderTimeline(belt.events, config);
  }

  function renderTimeline(events, config) {
    const container = $('#belt-timeline');
    if (!events.length) {
      container.innerHTML = `<div class="timeline-empty">La cronologia comparirà dopo la ${config.beltStartMatchday}ª giornata di Serie A.</div>`;
      return;
    }
    container.innerHTML = [...events].reverse().map(event => {
      const icon = event.type === 'assignment' ? '🏆' : event.type === 'transfer' ? '🔄' : '🛡️';
      return `
        <div class="timeline-item">
          <div class="timeline-node" aria-hidden="true">${icon}</div>
          <div class="timeline-content">
            <strong class="${event.type === 'transfer' ? 'transfer' : ''}">${C.escapeHtml(C.matchdayLabel(event.day, config, true))}</strong>
            <p>${C.escapeHtml(event.text)}</p>
          </div>
        </div>`;
    }).join('');
  }
})();
