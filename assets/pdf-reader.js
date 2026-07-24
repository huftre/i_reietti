(() => {
  'use strict';

  // Percorso del PDF all'interno del repository GitHub.
  // Per sostituire il regolamento basta caricare il file con questo nome:
  // regolamento/regolamento.pdf
  const PDF_PATH = 'regolamento/regolamento.pdf';
  const PDF_VIEW = `${PDF_PATH}#view=FitH&toolbar=1&navpanes=0`;

  const openButton = document.querySelector('#open-rules');
  const backdrop = document.querySelector('#rules-modal');
  const closeButton = document.querySelector('#close-rules');
  const frame = document.querySelector('#rules-frame');
  const loading = document.querySelector('#rules-loading');
  const unavailable = document.querySelector('#rules-unavailable');

  if (!openButton || !backdrop || !closeButton || !frame || !loading || !unavailable) {
    return;
  }

  let previouslyFocused = null;
  let loadTimer = null;
  let isOpen = false;

  function setState(state) {
    loading.hidden = state !== 'loading';
    unavailable.hidden = state !== 'unavailable';
    frame.hidden = state !== 'ready';
  }

  function showModal() {
    isOpen = true;
    previouslyFocused = document.activeElement;
    backdrop.hidden = false;
    document.body.classList.add('pdf-open');

    requestAnimationFrame(() => {
      backdrop.classList.add('visible');
      closeButton.focus();
    });
  }

  function hideModal() {
    isOpen = false;
    clearTimeout(loadTimer);
    backdrop.classList.remove('visible');
    document.body.classList.remove('pdf-open');

    window.setTimeout(() => {
      backdrop.hidden = true;
      frame.removeAttribute('src');
      setState('loading');
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    }, 180);
  }

  function showPdf() {
    setState('loading');
    if (!isOpen) return;
    frame.src = PDF_VIEW;

    // La maggior parte dei browser non espone lo stato interno del lettore PDF.
    // Dopo un breve caricamento mostriamo quindi l'iframe. Se il file non esiste,
    // il controllo fetch effettuato prima impedisce di arrivare qui.
    clearTimeout(loadTimer);
    loadTimer = window.setTimeout(() => setState('ready'), 500);
  }

  async function openPdf() {
    showModal();
    setState('loading');

    // Aprendo il progetto direttamente dal computer (protocollo file:) il fetch
    // può essere bloccato dal browser. In quel caso proviamo comunque ad aprire
    // il PDF locale. Su GitHub Pages verifichiamo prima che il file esista.
    if (window.location.protocol === 'file:') {
      showPdf();
      return;
    }

    try {
      const response = await fetch(PDF_PATH, {
        method: 'HEAD',
        cache: 'no-store'
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (isOpen) showPdf();
    } catch (error) {
      console.warn('Regolamento PDF non disponibile:', error);
      if (isOpen) setState('unavailable');
    }
  }

  openButton.addEventListener('click', openPdf);
  closeButton.addEventListener('click', hideModal);

  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) hideModal();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !backdrop.hidden) hideModal();
  });
})();
