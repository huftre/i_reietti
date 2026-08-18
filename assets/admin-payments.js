(() => {
  'use strict';

  const C = window.ReiettiCore;
  const $ = selector => document.querySelector(selector);

  const state = {
    config: null,
    teams: [],
    teamMap: new Map(),
    payments: [],
    onlineLoaded: false
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
      populateWinnerSelects();
      bindEvents();
      await loadPayments();
    } catch (error) {
      console.error(error);
      setStatus($('#payments-base-status'), 'Non riesco a caricare la configurazione dei pagamenti.', 'error');
    }
  }

  function bindEvents() {
    $('#load-payments-online').addEventListener('click', loadPayments);
    $('#payments-editor').addEventListener('input', validateAndRefresh);
    $('#payments-editor').addEventListener('change', validateAndRefresh);
    $('#champions-winner').addEventListener('change', validateAndRefresh);
    $('#coppa-winner').addEventListener('change', validateAndRefresh);
    $('#generate-payments-csv').addEventListener('click', generatePaymentsCsv);
  }

  function populateWinnerSelects() {
    const options = ['<option value="">Non assegnata</option>']
      .concat(state.teams.map(team => `<option value="${C.escapeHtml(team.id)}">${C.escapeHtml(team.name)}</option>`))
      .join('');
    $('#champions-winner').innerHTML = options;
    $('#coppa-winner').innerHTML = options;
  }

  async function loadPayments() {
    $('#load-payments-online').disabled = true;
    setStatus($('#payments-base-status'), 'Caricamento di payments.csv…');
    try {
      const text = await C.fetchText('data/payments.csv', 'squadra,rata1,rata2,champions,coppa_italia,premi_pagati,note\n');
      state.payments = C.normalizePayments(C.parseCsv(text), state.teams);
      state.onlineLoaded = true;
      renderEditor();
      restoreWinners();
      validateAndRefresh();
      setStatus($('#payments-base-status'), `File online caricato: ${state.payments.length} squadre.`, 'success');
      window.ReiettiAdmin.showToast('Archivio pagamenti caricato.');
    } catch (error) {
      console.error(error);
      state.onlineLoaded = false;
      setStatus($('#payments-base-status'), 'Non è stato possibile caricare data/payments.csv.', 'error');
      $('#generate-payments-csv').disabled = true;
    } finally {
      $('#load-payments-online').disabled = false;
    }
  }

  function renderEditor() {
    const fee = Number(state.config.teamFee || 110);
    const installment = Number(state.config.installmentAmount || 55);
    $('#payments-editor').innerHTML = state.payments.map(row => {
      const team = C.getTeam(state.teamMap, row.squadra);
      return `
        <tr data-team="${C.escapeHtml(row.squadra)}">
          <td><strong>${C.escapeHtml(team.name)}</strong><small class="admin-team-code">${C.escapeHtml(team.shortName || '')}</small></td>
          <td><input class="payment-input rata1" type="number" min="0" max="${installment}" step="0.01" value="${row.rata1}" aria-label="Prima rata ${C.escapeHtml(team.name)}"></td>
          <td><input class="payment-input rata2" type="number" min="0" max="${installment}" step="0.01" value="${row.rata2}" aria-label="Seconda rata ${C.escapeHtml(team.name)}"></td>
          <td class="numeric payment-total">${C.formatCurrency(row.rata1 + row.rata2, state.config.currency)} / ${C.formatCurrency(fee, state.config.currency)}</td>
          <td><input class="payment-input premi-pagati" type="number" min="0" step="0.01" value="${row.premiPagati}" aria-label="Premi pagati ${C.escapeHtml(team.name)}"></td>
          <td><input class="payment-note" type="text" maxlength="120" value="${C.escapeHtml(row.note)}" placeholder="Nota facoltativa" aria-label="Note ${C.escapeHtml(team.name)}"></td>
        </tr>`;
    }).join('');
  }

  function restoreWinners() {
    $('#champions-winner').value = state.payments.find(row => row.champions)?.squadra || '';
    $('#coppa-winner').value = state.payments.find(row => row.coppaItalia)?.squadra || '';
  }

  function readEditor() {
    const champions = $('#champions-winner').value;
    const coppa = $('#coppa-winner').value;
    return [...document.querySelectorAll('#payments-editor tr[data-team]')].map(row => {
      const squadra = row.dataset.team;
      return {
        squadra,
        rata1: C.toOptionalNumber(row.querySelector('.rata1').value) ?? 0,
        rata2: C.toOptionalNumber(row.querySelector('.rata2').value) ?? 0,
        champions: squadra === champions,
        coppaItalia: squadra === coppa,
        premiPagati: C.toOptionalNumber(row.querySelector('.premi-pagati').value) ?? 0,
        note: row.querySelector('.payment-note').value.trim()
      };
    });
  }

  function validateAndRefresh() {
    const rows = readEditor();
    const installment = Number(state.config.installmentAmount || 55);
    const errors = [];
    rows.forEach(row => {
      const team = C.getTeam(state.teamMap, row.squadra);
      if (row.rata1 < 0 || row.rata1 > installment) errors.push(`Controlla la 1ª rata di ${team.name}.`);
      if (row.rata2 < 0 || row.rata2 > installment) errors.push(`Controlla la 2ª rata di ${team.name}.`);
      if (row.premiPagati < 0) errors.push(`I premi pagati a ${team.name} non possono essere negativi.`);
    });

    updateTotals(rows);
    if (errors.length) {
      setStatus($('#payments-validation'), errors[0], 'error');
      $('#generate-payments-csv').disabled = true;
      return false;
    }
    setStatus($('#payments-validation'), 'Contabilità corretta. Puoi generare payments.csv.', 'success');
    $('#generate-payments-csv').disabled = !state.onlineLoaded;
    return true;
  }

  function updateTotals(rows) {
    const fee = Number(state.config.teamFee || 110);
    const totalPaid = rows.reduce((sum, row) => sum + row.rata1 + row.rata2, 0);
    const expected = fee * state.teams.length;
    $('#admin-fees-collected').textContent = C.formatCurrency(totalPaid, state.config.currency);
    $('#admin-fees-due').textContent = C.formatCurrency(Math.max(0, expected - totalPaid), state.config.currency);

    rows.forEach(row => {
      const tr = document.querySelector(`#payments-editor tr[data-team="${CSS.escape(row.squadra)}"]`);
      if (tr) tr.querySelector('.payment-total').textContent = `${C.formatCurrency(row.rata1 + row.rata2, state.config.currency)} / ${C.formatCurrency(fee, state.config.currency)}`;
    });
  }

  function generatePaymentsCsv() {
    if (!validateAndRefresh()) return;
    const rows = readEditor();
    state.payments = rows;
    downloadText('payments.csv', serializePayments(rows), 'text/csv;charset=utf-8');
    setStatus($('#payments-base-status'), 'payments.csv aggiornato e scaricato.', 'success');
    window.ReiettiAdmin.showToast('payments.csv generato e scaricato.');
  }

  function serializePayments(rows) {
    const header = ['squadra', 'rata1', 'rata2', 'champions', 'coppa_italia', 'premi_pagati', 'note'];
    const lines = rows.map(row => [
      row.squadra,
      cleanNumber(row.rata1),
      cleanNumber(row.rata2),
      row.champions ? 1 : 0,
      row.coppaItalia ? 1 : 0,
      cleanNumber(row.premiPagati),
      row.note
    ].map(csvCell).join(','));
    return [header.join(','), ...lines].join('\n') + '\n';
  }

  function cleanNumber(value) {
    return Number(value || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  }

  function csvCell(value) {
    const string = String(value ?? '');
    return /[",\n\r]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
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
