(() => {
  'use strict';

  const C = window.ReiettiCore;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  const state = {
    config: null,
    teams: [],
    teamMap: new Map(),
    rows: [],
    onlineLoaded: false,
    confirmedSnapshot: null,
    busy: false,
    image: null,
    worker: null,
    job: 0,
    minMatchday: 3,
    maxMatchday: 38
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    if (!window.ReiettiAdmin?.isAuthorized()) return;
    try {
      const [config, teams] = await Promise.all([
        C.fetchJson('data/config.json'),
        C.fetchJson('data/teams.json')
      ]);
      state.config = config;
      state.teams = teams;
      state.teamMap = C.teamMap(teams);
      state.minMatchday = Number(config.leagueStartSerieAMatchday ?? 3);
      state.maxMatchday = Number(config.leagueEndSerieAMatchday ?? 38);

      $('#matchday').min = String(state.minMatchday);
      $('#matchday').max = String(state.maxMatchday);
      $('#matchday').value = String(state.minMatchday);

      renderMatchEditor();
      bindScreenshot();
      bindEvents();
      updateMatchdayLabels();
      await loadOnlineData();
      renderReview();
    } catch (error) {
      console.error(error);
      setStatus($('#base-status'), 'Non riesco a caricare i file di configurazione.', 'error');
      setConnection(false);
    }
  }

  function bindEvents() {
    $('#confirm-results').addEventListener('change', () => {
      state.confirmedSnapshot = $('#confirm-results').checked ? editorSnapshot() : null;
      validateAndRefresh();
    });
    $('#load-online').addEventListener('click', loadOnlineData);
    $('#matchday-minus').addEventListener('click', () => shiftMatchday(-1));
    $('#matchday-plus').addEventListener('click', () => shiftMatchday(1));
    $('#matchday').addEventListener('change', () => {
      clampMatchday();
      updateMatchdayLabels();
      fillEditorFromCurrentDay();
      validateAndRefresh();
    });
    $('#clear-matches').addEventListener('click', () => {
      clearEditor();
      validateAndRefresh();
    });
    $('#match-editor').addEventListener('input', validateAndRefresh);
    $('#match-editor').addEventListener('change', validateAndRefresh);
    $('#generate-csv').addEventListener('click', generateCsv);
  }

  async function loadOnlineData() {
    state.confirmedSnapshot = null;
    state.onlineLoaded = false;
    validateAndRefresh();
    setStatus($('#base-status'), 'Caricamento del file online…');
    setConnection(false, true);
    $('#load-online').disabled = true;

    try {
      const response = await fetch('data/results.csv', { cache: 'no-store' });
      if (!response.ok) throw new Error('Archivio non disponibile');
      const csvText = await response.text();
      if (!csvText.startsWith('giornata,squadra,avversario,fantapunti,gol_fatti,gol_subiti')) throw new Error('Formato archivio non valido');
      state.rows = C.normalizeResults(C.parseCsv(csvText));
      state.onlineLoaded = true;
      setStatus(
        $('#base-status'),
        state.rows.length
          ? `File online caricato: ${state.rows.length} righe disponibili.`
          : 'Il file online è vuoto: puoi inserire la 1ª giornata di Lega.',
        'success'
      );
      setConnection(true);
      fillEditorFromCurrentDay();
      validateAndRefresh();
      window.ReiettiAdmin.showToast('Archivio risultati caricato.');
    } catch (error) {
      console.error(error);
      state.onlineLoaded = false;
      setStatus($('#base-status'), 'Non è stato possibile caricare data/results.csv.', 'error');
      setConnection(false);
      validateAndRefresh();
    } finally {
      $('#load-online').disabled = false;
    }
  }


  function setBusy(busy) {
    state.busy = busy;
    document.querySelectorAll('#match-editor input, #match-editor select, #matchday, #matchday-minus, #matchday-plus, #clear-matches, #load-online, #screenshot-file').forEach(el => { el.disabled = busy; });
    $('#analyze-screenshot').disabled = busy || !state.image;
    $('#cancel-screenshot').hidden = !busy;
    validateAndRefresh();
  }

  function bindScreenshot() {
    $('#screenshot-file').addEventListener('change', async event => {
      const job = ++state.job;
      const file = event.target.files[0];
      state.confirmedSnapshot = null;
      state.image = null;
      $('#screenshot-preview-wrap').hidden = true;
      $('#screenshot-preview').removeAttribute('src');
      $('#analyze-screenshot').disabled = true;
      validateAndRefresh();
      if (!file) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) {
        setStatus($('#screenshot-status'), 'Scegli un PNG, JPG o WebP di massimo 12 MB.', 'error'); return;
      }
      const url = URL.createObjectURL(file), image = new Image();
      try {
        image.src = url;
        await image.decode();
        if (job !== state.job) return;
        if (image.naturalWidth * image.naturalHeight > 24000000) throw new Error('Immagine troppo grande: usa uno screenshot di massimo 24 megapixel.');
        state.image = image;
        $('#screenshot-preview').src = image.src;
        await $('#screenshot-preview').decode();
        $('#screenshot-preview-wrap').hidden = false;
        $('#analyze-screenshot').disabled = false;
        setStatus($('#screenshot-status'), 'Immagine pronta. L’analisi sostituirà i campi delle sette partite; nessun CSV verrà scaricato automaticamente.');
      } catch (error) {
        setStatus($('#screenshot-status'), error.message || 'Immagine non leggibile.', 'error');
      } finally { URL.revokeObjectURL(url); }
    });
    $('#match-editor').addEventListener('input', event => event.target.classList.remove('ocr-missing'));
    $('#match-editor').addEventListener('change', event => event.target.classList.remove('ocr-missing'));
    $('#analyze-screenshot').addEventListener('click', analyzeScreenshot);
    $('#cancel-screenshot').addEventListener('click', () => {
      state.job++;
      if (state.worker) { state.worker.terminate(); state.worker = null; }
      setBusy(false);
      setStatus($('#screenshot-status'), 'Analisi annullata. I dati precedenti sono rimasti nei campi.');
    });
  }

  let ocrScript;
  function loadOCR() {
    if (window.Tesseract) return Promise.resolve();
    if (!ocrScript) ocrScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => { script.remove(); ocrScript = null; reject(new Error('Caricamento del lettore scaduto. Riprova.')); }, 30000);
      script.src = 'assets/vendor/tesseract.min.js';
      script.onload = () => { clearTimeout(timeout); resolve(); };
      script.onerror = () => { clearTimeout(timeout); script.remove(); ocrScript = null; reject(new Error('Lettore non disponibile. Verifica di avere caricato anche la cartella assets/vendor.')); };
      document.head.appendChild(script);
    });
    return ocrScript;
  }

  async function analyzeScreenshot() {
    if (!state.image || state.busy) return;
    const job = ++state.job;
    let worker, timeout;
    setBusy(true);
    setStatus($('#screenshot-status'), 'Preparazione del lettore sul dispositivo…');
    try {
      await loadOCR();
      if (job !== state.job) return;
      const base = new URL('assets/vendor/', window.location.href).href;
      // The Worker, WebAssembly engine and language model are hosted with the site.
      const work = async () => {
        worker = await window.Tesseract.createWorker('eng', 1, {
          workerPath: base + 'worker.min.js', corePath: base + 'tesseract-core-lstm.wasm.js', langPath: base,
          errorHandler: error => console.error('OCR:', error)
        });
        if (job !== state.job) { await worker.terminate(); return null; }
        state.worker = worker;
        const source = document.createElement('canvas');
        const scale = Math.min(1, 900 / state.image.naturalWidth);
        source.width = Math.round(state.image.naturalWidth * scale);
        source.height = Math.round(state.image.naturalHeight * scale);
        const ctx = source.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(state.image, 0, 0, source.width, source.height);
        return window.ReiettiOCR.recognize(worker, ctx.getImageData(0, 0, source.width, source.height).data,
          source.width, source.height, state.teams, (box, threshold) => window.ReiettiOCR.cropCanvas(source, box, threshold),
          message => { if (job === state.job) setStatus($('#screenshot-status'), message); });
      };
      const result = await Promise.race([work(), new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('L’analisi ha impiegato troppo tempo. Riprova oppure inserisci i dati manualmente.')), 180000);
      })]);
      if (job !== state.job || !result) return;
      clearEditor();
      const detectedDay = Number.isInteger(result.day) && result.day >= state.minMatchday && result.day <= state.maxMatchday;
      $('#matchday').value = detectedDay ? String(result.day) : '';
      $('#matchday').classList.toggle('ocr-missing', !detectedDay);
      let missing = 0;
      const selectors = {teamA:'.team-a',teamB:'.team-b',fpA:'.fp-a',fpB:'.fp-b',goalsA:'.goals-a',goalsB:'.goals-b'};
      result.matches.forEach((match, index) => {
        const row = $$('.match-row')[index];
        Object.entries(selectors).forEach(([key, selector]) => {
          const field = row.querySelector(selector); field.value = match[key];
          field.classList.toggle('ocr-missing', match[key] === '');
          if (match[key] === '') missing++;
        });
      });
      state.confirmedSnapshot = null;
      setStatus($('#screenshot-status'), `Lettura completata. ${detectedDay ? 'Rilevata la ' + result.day + 'ª giornata di Serie A.' : 'Giornata non riconosciuta: selezionala manualmente in alto.'} ${missing ? missing + ' campi da completare sono evidenziati.' : 'Tutti i campi sono compilati.'} Controlla TUTTI i dati confrontandoli con lo screenshot, poi spunta la conferma nel passaggio 4.`, missing || !detectedDay ? 'error' : 'success');
      $('#screenshot-preview-wrap').scrollIntoView({behavior:'smooth',block:'start'});
    } catch (error) {
      if (job === state.job) setStatus($('#screenshot-status'), error.message || 'Lettura non riuscita. Puoi compilare i risultati manualmente.', 'error');
    } finally {
      clearTimeout(timeout);
      if (worker) { try { await worker.terminate(); } catch {} }
      if (job === state.job) { state.worker = null; state.job++; setBusy(false); }
    }
  }

  function setConnection(connected, loading = false) {
    const dot = $('#connection-dot');
    dot.classList.toggle('connected', connected);
    dot.classList.toggle('loading', loading);
  }

  function renderMatchEditor() {
    const options = [
      '<option value="">Seleziona…</option>',
      ...state.teams.map(team => `<option value="${C.escapeHtml(team.id)}">${C.escapeHtml(team.emoji || '⚽')} ${C.escapeHtml(team.name)}</option>`)
    ].join('');

    $('#match-editor').innerHTML = Array.from({ length: 7 }, (_, index) => `
      <div class="match-row" data-match="${index}">
        <select class="team-a" aria-label="Squadra A, partita ${index + 1}">${options}</select>
        <input class="fp-a score-input" type="text" inputmode="decimal" placeholder="72,5" aria-label="Fantapunti squadra A, partita ${index + 1}">
        <input class="goals-a score-input" type="number" min="0" step="1" inputmode="numeric" placeholder="2" aria-label="Gol squadra A, partita ${index + 1}">
        <span class="match-divider">VS</span>
        <input class="goals-b score-input" type="number" min="0" step="1" inputmode="numeric" placeholder="1" aria-label="Gol squadra B, partita ${index + 1}">
        <input class="fp-b score-input" type="text" inputmode="decimal" placeholder="68" aria-label="Fantapunti squadra B, partita ${index + 1}">
        <select class="team-b" aria-label="Squadra B, partita ${index + 1}">${options}</select>
      </div>`).join('');
  }

  function shiftMatchday(delta) {
    const input = $('#matchday');
    input.value = String(Math.max(state.minMatchday, Math.min(state.maxMatchday, Number(input.value || state.minMatchday) + delta)));
    updateMatchdayLabels();
    fillEditorFromCurrentDay();
    validateAndRefresh();
  }

  function clampMatchday() {
    const input = $('#matchday');
    input.value = String(Math.max(state.minMatchday, Math.min(state.maxMatchday, Math.round(Number(input.value || state.minMatchday)))));
  }

  function updateMatchdayLabels() {
    const day = currentDay();
    const label = C.matchdayLabel(day, state.config, false);
    $('#matchday-league-label').textContent = label;
    $('#review-day-label').textContent = C.matchdayLabel(day, state.config, true);
  }

  function clearEditor() {
    $$('.match-row').forEach(row => {
      row.querySelectorAll('.ocr-missing').forEach(el => el.classList.remove('ocr-missing'));
      row.querySelectorAll('select').forEach(select => { select.value = ''; });
      row.querySelectorAll('input').forEach(input => { input.value = ''; });
    });
  }

  function fillEditorFromCurrentDay() {
    clearEditor();
    const day = currentDay();
    const dayRows = state.rows.filter(row => row.giornata === day);
    if (!dayRows.length) return;

    const visited = new Set();
    const matches = [];
    dayRows.forEach(row => {
      const key = [row.squadra, row.avversario].sort().join('|');
      if (!row.avversario || visited.has(key)) return;
      const reverse = dayRows.find(candidate => candidate.squadra === row.avversario && candidate.avversario === row.squadra);
      visited.add(key);
      matches.push({
        a: row,
        b: reverse || {
          squadra: row.avversario,
          avversario: row.squadra,
          fantapunti: null,
          golFatti: row.golSubiti,
          golSubiti: row.golFatti
        }
      });
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
  }

  function editorSnapshot() { return JSON.stringify([currentDay(), readEditor()]); }

  function validateAndRefresh() {
    const validation = validateEditor();
    renderReview(validation.matches);
    renderDataSummary(validation.matches, validation.valid);
    if (state.confirmedSnapshot !== editorSnapshot() || !validation.valid || state.busy) state.confirmedSnapshot = null;
    $('#confirm-results').checked = state.confirmedSnapshot !== null;
    $('#confirm-results').disabled = !validation.valid || !state.onlineLoaded || state.busy;
    $('#generate-csv').disabled = !validation.valid || !state.onlineLoaded || state.busy || !state.confirmedSnapshot;
    $('#generate-help').textContent = !state.onlineLoaded
      ? 'Prima deve essere caricato il file results.csv già online.'
      : validation.valid
        ? (state.confirmedSnapshot ? 'Confermato: puoi scaricare l’archivio completo.' : 'Controlla il riepilogo e spunta la conferma prima di scaricare.')
        : 'Il tasto si attiva quando tutte le 14 squadre e i punteggi sono corretti.';
  }

  function validateEditor() {
    const matches = readEditor();
    const errors = [];
    const dayValue = Number($('#matchday').value);
    if (!Number.isInteger(dayValue) || dayValue < state.minMatchday || dayValue > state.maxMatchday) errors.push('Seleziona la giornata di Serie A da confermare.');
    const selectedTeams = matches.flatMap(match => [match.teamA, match.teamB]).filter(Boolean);
    const duplicates = selectedTeams.filter((id, index) => selectedTeams.indexOf(id) !== index);

    if (selectedTeams.length !== state.teams.length) errors.push(`Sono state selezionate ${selectedTeams.length} squadre su ${state.teams.length}.`);
    if (duplicates.length) errors.push(`Squadre duplicate: ${[...new Set(duplicates)].map(id => teamName(id)).join(', ')}.`);
    if (matches.some(match => match.teamA && match.teamA === match.teamB)) errors.push('Una squadra non può affrontare sé stessa.');

    matches.forEach((match, index) => {
      const partiallyFilled = [match.teamA, match.teamB, match.rawFpA, match.rawGoalsA, match.rawGoalsB, match.rawFpB].some(value => String(value ?? '').trim() !== '');
      if (!partiallyFilled) return;
      if (!match.teamA || !match.teamB) errors.push(`Seleziona entrambe le squadre nella partita ${index + 1}.`);
      if ([match.fpA, match.goalsA, match.goalsB, match.fpB].some(value => value === null)) errors.push(`Completa correttamente i punteggi della partita ${index + 1}.`);
      if ([match.goalsA, match.goalsB].some(value => value !== null && (!Number.isInteger(value) || value < 0))) errors.push(`I gol della partita ${index + 1} devono essere numeri interi non negativi.`);
      if ([match.fpA, match.fpB].some(value => value !== null && value < 0)) errors.push(`I fantapunti della partita ${index + 1} non possono essere negativi.`);
    });

    const uniqueErrors = [...new Set(errors)];
    if (uniqueErrors.length) {
      setStatus($('#editor-validation'), uniqueErrors[0], 'error');
      return { valid: false, matches, errors: uniqueErrors };
    }
    setStatus($('#editor-validation'), `Tutto corretto: le ${state.teams.length} squadre sono presenti una sola volta.`, 'success');
    return { valid: true, matches, errors: [] };
  }

  function readEditor() {
    return $$('.match-row').map(row => {
      const rawFpA = row.querySelector('.fp-a').value;
      const rawGoalsA = row.querySelector('.goals-a').value;
      const rawGoalsB = row.querySelector('.goals-b').value;
      const rawFpB = row.querySelector('.fp-b').value;
      return {
        teamA: row.querySelector('.team-a').value,
        rawFpA,
        rawGoalsA,
        rawGoalsB,
        rawFpB,
        fpA: C.toOptionalNumber(rawFpA),
        goalsA: C.toOptionalNumber(rawGoalsA),
        goalsB: C.toOptionalNumber(rawGoalsB),
        fpB: C.toOptionalNumber(rawFpB),
        teamB: row.querySelector('.team-b').value
      };
    });
  }

  function renderReview(matches = readEditor()) {
    updateMatchdayLabels();
    const hasAnyValue = matches.some(match => match.teamA || match.teamB || match.rawFpA || match.rawFpB || match.rawGoalsA || match.rawGoalsB);
    if (!hasAnyValue) {
      $('#review-body').innerHTML = '<tr class="empty-row"><td colspan="6">Compila le partite per visualizzare il riepilogo.</td></tr>';
      return;
    }
    $('#review-body').innerHTML = matches.map((match, index) => `
      <tr>
        <td><span class="match-number">${index + 1}</span></td>
        <td>${C.escapeHtml(teamName(match.teamA))}</td>
        <td class="numeric">${match.fpA === null ? '—' : C.formatPoints(match.fpA)}</td>
        <td class="numeric"><strong>${match.goalsA === null ? '—' : match.goalsA} – ${match.goalsB === null ? '—' : match.goalsB}</strong></td>
        <td class="numeric">${match.fpB === null ? '—' : C.formatPoints(match.fpB)}</td>
        <td>${C.escapeHtml(teamName(match.teamB))}</td>
      </tr>`).join('');
  }

  function renderDataSummary(matches = readEditor(), valid = false) {
    const days = [...new Set(state.rows.map(row => row.giornata))];
    const day = currentDay();
    const rowsWithoutDay = state.rows.filter(row => row.giornata !== day).length;
    const selectedCount = matches.flatMap(match => [match.teamA, match.teamB]).filter(Boolean).length;
    const predictedRows = rowsWithoutDay + (valid ? state.teams.length : selectedCount);
    $('#loaded-rows').textContent = `${state.rows.length} righe online`;
    $('#data-summary').innerHTML = `
      <div><strong>${days.length}</strong><span>Giornate già online</span></div>
      <div><strong>${C.leagueDayFromSerieA(day, state.config)}ª</strong><span>Giornata di Lega</span></div>
      <div><strong>${predictedRows}</strong><span>Righe nel CSV finale</span></div>`;
  }

  function generateCsv() {
    const validation = validateEditor();
    if (!validation.valid || !state.onlineLoaded || state.busy || !state.confirmedSnapshot || state.confirmedSnapshot !== editorSnapshot()) {
      validateAndRefresh();
      return;
    }
    const day = currentDay();
    const newRows = rowsFromMatches(day, validation.matches);
    const mergedRows = state.rows
      .filter(row => row.giornata !== day)
      .concat(newRows)
      .sort((a, b) => a.giornata - b.giornata || teamName(a.squadra).localeCompare(teamName(b.squadra), 'it'));
    state.rows = mergedRows;
    state.confirmedSnapshot = null;
    validateAndRefresh();
    downloadText('results.csv', serializeCsv(mergedRows), 'text/csv;charset=utf-8');
    setStatus($('#base-status'), `${C.matchdayLabel(day, state.config, false)} inserita e results.csv scaricato.`, 'success');
    renderDataSummary(validation.matches, true);
    window.ReiettiAdmin.showToast('results.csv generato e scaricato.');
  }

  function rowsFromMatches(day, matches) {
    const rows = [];
    matches.forEach(match => {
      rows.push({ giornata: day, squadra: match.teamA, avversario: match.teamB, fantapunti: match.fpA, golFatti: match.goalsA, golSubiti: match.goalsB });
      rows.push({ giornata: day, squadra: match.teamB, avversario: match.teamA, fantapunti: match.fpB, golFatti: match.goalsB, golSubiti: match.goalsA });
    });
    return rows;
  }

  function currentDay() {
    return Number($('#matchday').value || state.minMatchday);
  }

  function serializeCsv(rows) {
    const header = ['giornata', 'squadra', 'avversario', 'fantapunti', 'gol_fatti', 'gol_subiti'];
    const lines = rows.map(row => [
      row.giornata, row.squadra, row.avversario, row.fantapunti ?? '', row.golFatti ?? '', row.golSubiti ?? ''
    ].map(csvCell).join(','));
    return [header.join(','), ...lines].join('\n') + '\n';
  }

  function csvCell(value) {
    const string = String(value ?? '');
    return /[",\n\r]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
  }

  function teamName(id) {
    if (!id) return 'Da selezionare';
    return C.getTeam(state.teamMap, id).name;
  }

  function displayNumber(value) {
    return value === null || value === undefined ? '' : String(value).replace('.', ',');
  }

  function setStatus(element, text, type = '') {
    if (!element) return;
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
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
})();
