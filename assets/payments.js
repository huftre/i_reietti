(() => {
  'use strict';

  const C = window.ReiettiCore;
  const $ = selector => document.querySelector(selector);

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    try {
      const [config, teams, resultsText, paymentsText] = await Promise.all([
        C.fetchJson('data/config.json'),
        C.fetchJson('data/teams.json'),
        C.fetchText('data/results.csv', ''),
        C.fetchText('data/payments.csv', 'squadra,rata1,rata2,champions,coppa_italia,premi_pagati,note\n')
      ]);

      const results = C.normalizeResults(C.parseCsv(resultsText));
      const payments = C.normalizePayments(C.parseCsv(paymentsText), teams);
      const map = C.teamMap(teams);
      const ledger = C.calculatePrizeLedger(results, payments, teams, config);

      renderBranding(config, results, teams);
      renderSummary(config, payments, ledger);
      renderTable(config, payments, ledger, map);
      C.activateLogoFallbacks();
    } catch (error) {
      console.error(error);
      $('#payments-table-body').innerHTML = '<tr class="empty-row"><td colspan="8">Impossibile caricare i dati dei pagamenti.</td></tr>';
    }
  }

  function renderBranding(config, results, teams) {
    $('#league-name').textContent = config.leagueName;
    $('#season-label').textContent = `Stagione ${config.season}`;
    $('#footer-season').textContent = config.season;
    document.title = `${config.leagueName} — Pagamenti`;
    const latest = C.latestCompleteDay(results, teams, config, false);
    $('#last-updated').textContent = latest ? C.matchdayLabel(latest, config, true) : 'Contabilità stagione';
  }

  function renderSummary(config, payments, ledger) {
    const totalFees = payments.reduce((sum, row) => sum + row.rata1 + row.rata2, 0);
    const expectedFees = Number(config.teamFee || 0) * payments.length;
    const totalEarned = [...ledger.values()].reduce((sum, row) => sum + row.earned, 0);
    const totalPaidPrizes = payments.reduce((sum, row) => sum + row.premiPagati, 0);

    $('#fees-collected').textContent = C.formatCurrency(totalFees, config.currency);
    $('#fees-collected-detail').textContent = `Su ${C.formatCurrency(expectedFees, config.currency)} previsti`;
    $('#fees-outstanding').textContent = C.formatCurrency(Math.max(0, expectedFees - totalFees), config.currency);
    $('#prizes-earned').textContent = C.formatCurrency(totalEarned, config.currency);
    $('#prizes-paid').textContent = C.formatCurrency(totalPaidPrizes, config.currency);
  }

  function renderTable(config, payments, ledger, map) {
    const tbody = $('#payments-table-body');
    tbody.innerHTML = payments.map(payment => {
      const team = C.getTeam(map, payment.squadra);
      const paidFees = payment.rata1 + payment.rata2;
      const outstandingFees = Math.max(0, Number(config.teamFee || 0) - paidFees);
      const prize = ledger.get(payment.squadra) || { earned: 0, details: [] };
      const prizeOutstanding = Math.max(0, prize.earned - payment.premiPagati);
      const details = prize.details.length
        ? prize.details.map(item => `${C.escapeHtml(item.label)} ${C.formatCurrency(item.amount, config.currency)}`).join(' · ')
        : 'Nessun premio maturato';
      return `
        <tr>
          <td>
            <div class="team-cell team-cell-with-logo">
              ${C.teamLogoHtml(team)}
              <div><strong>${C.escapeHtml(team.name)}</strong><small>${C.escapeHtml(team.shortName || '')}</small></div>
            </div>
          </td>
          <td class="numeric payment-installment ${payment.rata1 >= Number(config.installmentAmount || 55) ? 'is-paid' : ''}">${C.formatCurrency(payment.rata1, config.currency)}</td>
          <td class="numeric payment-installment ${payment.rata2 >= Number(config.installmentAmount || 55) ? 'is-paid' : ''}">${C.formatCurrency(payment.rata2, config.currency)}</td>
          <td class="numeric"><strong>${C.formatCurrency(paidFees, config.currency)}</strong></td>
          <td class="numeric ${outstandingFees > 0 ? 'amount-due' : 'amount-ok'}">${C.formatCurrency(outstandingFees, config.currency)}</td>
          <td class="numeric prize-cell"><strong>${C.formatCurrency(prize.earned, config.currency)}</strong><small>${details}</small></td>
          <td class="numeric">${C.formatCurrency(payment.premiPagati, config.currency)}</td>
          <td class="numeric ${prizeOutstanding > 0 ? 'amount-due' : 'amount-ok'}"><strong>${C.formatCurrency(prizeOutstanding, config.currency)}</strong></td>
        </tr>`;
    }).join('');
  }
})();
