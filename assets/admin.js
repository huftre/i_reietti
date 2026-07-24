(() => {
  'use strict';

  const state = {
    teams: [],
    teamMap: new Map(),
    rows: []
  };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  let toastTimer;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    try {
      state.teams = await fetchJson('data/teams.json');
      state.teamMap = new Map(state.teams.map(team => [team.id, team]));
      renderMatchEditor();
      bindEvents();
      await loadOnlineData();
    } catch (error) {
      console.error(error);
      setStatus($('#base-status'), 'Non riesco a caricare i file di configurazione.', 'error');
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

  function bindEvents() {
    $('#csv-file-input').addEventListener('change', importCsvFile);
    $('#load-online').addEventListener('click', loadOnlineData);
    $('#load-demo').addEventListener('click', loadDemoData);
    $('#matchday-minus').addEventListener('click', () => shiftMatchday(-1));
    $('#matchday-plus').addEventListener('click', () => shiftMatchday(1));
    $('#matchday').addEventListener('change', () => {
      clampMatchday();
      fillEditorFromCurrentDay();
    });
    $('#clear-matches').addEventListener('click', clearEditor);
    $('#apply-matchday').addEventListener('click', applyMatchday);
    $('#download-csv').addEventListener('click', downloadCsv);
    $('#copy-csv').addEventListener('click', copyCsv);
    $('#download-backup').addEventListener('click', downloadBackup);
    $('#match-editor').addEventListener('input', validateEditor);
    $('#match-editor').addEventListener('change', validateEditor);
  }

  async function loadOnlineData() {
    setStatus($('#base-status'), 'Caricamento del file online…');
    try {
      const csvText = await fetchText('data/results.csv');
      state.rows = normalizeRows(parseCsv(csvText));
      refreshDataViews();
      setStatus($('#base-status'), state.rows.length ? 'File online caricato correttamente.' : 'File online vuoto: puoi inserire la prima giornata.', 'success');
      showToast('Base dati online caricata.');
    } catch (error) {
      console.error(error);
      setStatus($('#base-status'), 'Non è stato possibile caricare results.csv.', 'error');
    }
  }

  async function loadDemoData() {
    try {
      const csvText = await fetchText('data/results.demo.csv');
      state.rows = normalizeRows(parseCsv(csvText));
      refreshDataViews();
      setStatus($('#base-status'), 'Dati demo caricati. Non pubblicarli per errore.', 'success');
      showToast('Dati demo caricati.');
    } catch (error) {
      setStatus($('#base-status'), 'Impossibile caricare i dati demo.', 'error');
    }
  }

  async function importCsvFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = normalizeRows(parseCsv(text));
      if (!parsed.length && text.trim().split(/\r?\n/).length > 1) throw new Error('Nessuna riga valida');
      state.rows = parsed;
      refreshDataViews();
      setStatus($('#base-status'), `Importato “${file.name}”.`, 'success');
      showToast('CSV importato correttamente.');
    } catch (error) {
      console.error(error);
      setStatus($('#base-status'), 'CSV non valido. Controlla intestazioni e formato.', 'error');
    } finally {
      event.target.value = '';
    }
  }

  function renderMatchEditor() {
    const options = ['<option value="">Seleziona…</option>', ...state.teams.map(team => `<option value="${escapeHtml(team.id)}">${escapeHtml(team.emoji || '⚽')} ${escapeHtml(team.name)}</option>`)].join('');
    $('#match-editor').innerHTML = Array.from({ length: 7 }, (_, index) => `
      <div class="match-row" data-match="${index}">
        <select class="team-a" aria-label="Squadra A, partita ${index + 1}">${options}</select>
        <input class="fp-a score-input" type="number" min="0" step="0.5" inputmode="decimal" placeholder="FP" aria-label="Fantapunti squadra A, partita ${index + 1}">
        <input class="goals-a score-input" type="number" min="0" step="1" inputmode="numeric" placeholder="Gol" aria-label="Gol squadra A, partita ${index + 1}">
        <span class="match-divider">VS</span>
        <input class="goals-b score-input" type="number" min="0" step="1" inputmode="numeric" placeholder="Gol" aria-label="Gol squadra B, partita ${index + 1}">
        <input class="fp-b score-input" type="number" min="0" step="0.5" inputmode="decimal" placeholder="FP" aria-label="Fantapunti squadra B, partita ${index + 1}">
        <select class="team-b" aria-label="Squadra B, partita ${index + 1}">${options}</select>
      </div>`).join('');
  }

  function shiftMatchday(delta) {
    const input = $('#matchday');
    input.value = String(Math.max(4, Math.min(38, Number(input.value || 4) + delta)));
    fillEditorFromCurrentDay();
  }

  function clampMatchday() {
    const input = $('#matchday');
    input.value = String(Math.max(4, Math.min(38, Math.round(Number(input.value || 4)))));
  }

  function clearEditor() {
    $$('.match-row').forEach(row => {
      row.querySelectorAll('select').forEach(select => { select.value = ''; });
      row.querySelectorAll('input').forEach(input => { input.value = ''; });
    });
    validateEditor();
  }

  function fillEditorFromCurrentDay() {
    clearEditor();
    const day = Number($('#matchday').value);
    const dayRows = state.rows.filter(row => row.giornata === day);
    if (!dayRows.length) return;

    const visited = new Set();
    const matches = [];
    dayRows.forEach(row => {
      const key = [row.squadra, row.avversario].sort().join('|');
      if (!row.avversario || visited.has(key)) return;
      const reverse = dayRows.find(candidate => candidate.squadra === row.avversario && candidate.avversario === row.squadra);
      visited.add(key);
      matches.push({ a: row, b: reverse || {
        squadra: row.avversario,
        avversario: row.squadra,
        fantapunti: null,
        golFatti: row.golSubiti,
        golSubiti: row.golFatti
      }});
    });

    matches.slice(0, 7).forEach((match, index) => {
      const editor = $$('.match-row')[index];
      editor.querySelector('.team-a').value = match.a.squadra;
      editor.querySelector('.fp-a').value = displayNumber(match.a.fantapunti);
      editor.querySelector('.goals-a').value = displayNumber(match.a.golFatti);
      editor.querySelector('.goals-b').value = displayNumber(match.b.golFatti);
      editor.querySelector('.fp-b').value = displayNumber(match.b.fantapunti);
      editor.querySelector('.team-b').value = match.b.squadra;
    });
    validateEditor();
  }

  function validateEditor() {
    const matches = readEditor();
    const errors = [];
    const selectedTeams = matches.flatMap(match => [match.teamA, match.teamB]).filter(Boolean);
    const duplicates = selectedTeams.filter((id, index) => selectedTeams.indexOf(id) !== index);

    if (selectedTeams.length !== 14) errors.push('Devono essere selezionate tutte le 14 squadre.');
    if (duplicates.length) errors.push(`Squadre duplicate: ${[...new Set(duplicates)].map(id => teamName(id)).join(', ')}.`);
    if (matches.some(match => match.teamA && match.teamA === match.teamB)) errors.push('Una squadra non può affrontare sé stessa.');

    matches.forEach((match, index) => {
      const numbers = [match.fpA, match.goalsA, match.goalsB, match.fpB];
      if (numbers.some(value => value === null)) errors.push(`Completa i punteggi della partita ${index + 1}.`);
      if ([match.goalsA, match.goalsB].some(value => value !== null && (!Number.isInteger(value) || value < 0))) errors.push(`I gol della partita ${index + 1} devono essere numeri interi non negativi.`);
      if ([match.fpA, match.fpB].some(value => value !== null && value < 0)) errors.push(`I fantapunti della partita ${index + 1} non possono essere negativi.`);
    });

    const uniqueErrors = [...new Set(errors)];
    const box = $('#editor-validation');
    if (uniqueErrors.length) {
      setStatus(box, uniqueErrors[0], 'error');
      $('#apply-matchday').disabled = true;
      return false;
    }

    setStatus(box, 'Tutto pronto: le 14 squadre sono presenti una sola volta.', 'success');
    $('#apply-matchday').disabled = false;
    return true;
  }

  function readEditor() {
    return $$('.match-row').map(row => ({
      teamA: row.querySelector('.team-a').value,
      fpA: optionalNumber(row.querySelector('.fp-a').value),
      goalsA: optionalNumber(row.querySelector('.goals-a').value),
      goalsB: optionalNumber(row.querySelector('.goals-b').value),
      fpB: optionalNumber(row.querySelector('.fp-b').value),
      teamB: row.querySelector('.team-b').value
    }));
  }

  function applyMatchday() {
    if (!validateEditor()) return;
    const day = Number($('#matchday').value);
    const matches = readEditor();
    const newRows = [];

    matches.forEach(match => {
      newRows.push({ giornata: day, squadra: match.teamA, avversario: match.teamB, fantapunti: match.fpA, golFatti: match.goalsA, golSubiti: match.goalsB });
      newRows.push({ giornata: day, squadra: match.teamB, avversario: match.teamA, fantapunti: match.fpB, golFatti: match.goalsB, golSubiti: match.goalsA });
    });

    state.rows = state.rows
      .filter(row => row.giornata !== day)
      .concat(newRows)
      .sort((a, b) => a.giornata - b.giornata || teamName(a.squadra).localeCompare(teamName(b.squadra), 'it'));

    refreshDataViews();
    setStatus($('#base-status'), `Giornata ${day} inserita nel file in memoria. Ora scarica o copia il CSV.`, 'success');
    showToast(`Giornata ${day} aggiunta.`);
  }

  function refreshDataViews() {
    $('#loaded-rows').textContent = `${state.rows.length} ${state.rows.length === 1 ? 'riga' : 'righe'}`;
    const days = [...new Set(state.rows.map(row => row.giornata))].sort((a, b) => a - b);
    $('#days-count').textContent = `${days.length} ${days.length === 1 ? 'giornata' : 'giornate'}`;

    const latest = days.length ? Math.max(...days) : null;
    const totalPoints = state.rows.reduce((sum, row) => sum + (row.fantapunti ?? 0), 0);
    $('#data-summary').innerHTML = `
      <div><strong>${state.rows.length}</strong><span>Righe totali</span></div>
      <div><strong>${latest ?? '—'}</strong><span>Ultima giornata</span></div>
      <div><strong>${formatNumber(totalPoints)}</strong><span>Fantapunti registrati</span></div>`;

    renderPreview();
    fillEditorFromCurrentDay();
  }

  function renderPreview() {
    const rows = [...state.rows].sort((a, b) => b.giornata - a.giornata || teamName(a.squadra).localeCompare(teamName(b.squadra), 'it')).slice(0, 56);
    const tbody = $('#preview-body');
    if (!rows.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Il file non contiene ancora risultati.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(row => `
      <tr>
        <td>${row.giornata}</td>
        <td>${escapeHtml(teamName(row.squadra))}</td>
        <td>${escapeHtml(teamName(row.avversario))}</td>
        <td class="numeric">${row.fantapunti === null ? '—' : formatNumber(row.fantapunti)}</td>
        <td class="numeric">${row.golFatti === null ? '—' : `${row.golFatti}-${row.golSubiti}`}</td>
      </tr>`).join('');
  }

  function downloadCsv() {
    downloadText('results.csv', serializeCsv(state.rows), 'text/csv;charset=utf-8');
    showToast('results.csv scaricato.');
  }

  async function copyCsv() {
    const text = serializeCsv(state.rows);
    try {
      await navigator.clipboard.writeText(text);
      showToast('CSV copiato negli appunti.');
    } catch (error) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      showToast('CSV copiato negli appunti.');
    }
  }

  function downloadBackup() {
    const payload = {
      generatedAt: new Date().toISOString(),
      rows: state.rows
    };
    downloadText(`i-reietti-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    showToast('Backup JSON scaricato.');
  }

  function serializeCsv(rows) {
    const header = ['giornata', 'squadra', 'avversario', 'fantapunti', 'gol_fatti', 'gol_subiti'];
    const lines = rows.map(row => [
      row.giornata,
      row.squadra,
      row.avversario,
      row.fantapunti ?? '',
      row.golFatti ?? '',
      row.golSubiti ?? ''
    ].map(csvCell).join(','));
    return [header.join(','), ...lines].join('\n') + '\n';
  }

  function csvCell(value) {
    const string = String(value ?? '');
    return /[",\n\r]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
  }

  function parseCsv(text) {
    const records = [];
    let record = [];
    let cell = '';
    let quoted = false;

    const pushCell = () => { record.push(cell.trim()); cell = ''; };
    const pushRecord = () => { if (record.some(value => value !== '')) records.push(record); record = []; };

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) pushCell();
      else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && next === '\n') index += 1;
        pushCell();
        pushRecord();
      } else cell += char;
    }
    if (cell.length || record.length) { pushCell(); pushRecord(); }
    if (!records.length) return [];

    const headers = records[0].map(value => value.toLowerCase());
    const required = ['giornata', 'squadra', 'avversario', 'fantapunti', 'gol_fatti', 'gol_subiti'];
    if (required.some(header => !headers.includes(header))) throw new Error('Intestazioni mancanti');
    return records.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
  }

  function normalizeRows(rows) {
    return rows.map(row => ({
      giornata: Number(row.giornata),
      squadra: String(row.squadra || '').trim(),
      avversario: String(row.avversario || '').trim(),
      fantapunti: optionalNumber(row.fantapunti),
      golFatti: optionalNumber(row.gol_fatti),
      golSubiti: optionalNumber(row.gol_subiti)
    })).filter(row => Number.isInteger(row.giornata) && row.squadra)
      .sort((a, b) => a.giornata - b.giornata || teamName(a.squadra).localeCompare(teamName(b.squadra), 'it'));
  }

  function optionalNumber(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const number = Number(raw.replace(',', '.'));
    return Number.isFinite(number) ? number : null;
  }

  function teamName(id) {
    return state.teamMap.get(id)?.name || id || '—';
  }

  function displayNumber(value) {
    return value === null || value === undefined ? '' : String(value);
  }

  function formatNumber(value) {
    return Number(value).toLocaleString('it-IT', { minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 1, maximumFractionDigits: 2 });
  }

  function setStatus(element, text, type = '') {
    element.textContent = text;
    element.classList.remove('success', 'error');
    if (type) element.classList.add(type);
  }

  function downloadText(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }
})();
