/* Screenshot calendario a sfondo chiaro. Nessuna immagine lascia il dispositivo. */
(function (root) {
  'use strict';
  const normalize = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  function teamId(text, teams) {
    const value = normalize(text);
    const found = teams.filter(team => [team.name, ...(team.name === 'Foreign Fighters' ? ['Foreign F'] : [])].some(name => normalize(name) === value));
    return found.length === 1 ? found[0].id : '';
  }
  function detectCards(pixels, width, height) {
    const blue = (x, y) => {
      const i = (y * width + x) * 4, r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      return r > 170 && b > r * 1.05 && b > g * 1.02;
    };
    const groups = [];
    for (let y = 0; y < height; y++) {
      let count = 0;
      for (let x = Math.floor(width * .3); x < width * .65; x++) if (blue(x, y)) count++;
      if (count <= width * .07) continue;
      const last = groups[groups.length - 1];
      if (last && y === last.end) last.end++;
      else groups.push({ start: y, end: y + 1 });
    }
    return groups.filter(g => g.end - g.start > width * .02 && g.end - g.start < width * .12).map(g => {
      const xs = [], y = Math.floor((g.start + g.end) / 2);
      for (let x = Math.floor(width * .3); x < width * .65; x++) if (blue(x, y)) xs.push(x);
      return { x: Math.min(...xs), right: Math.max(...xs) + 1, y: g.start, bottom: g.end, h: g.end - g.start };
    });
  }
  function fields(card, width) {
    const {x, right, y, bottom, h} = card, mid = (x + right) / 2;
    return {
      goals: [x, y, right, bottom],
      fpA: [x, bottom, mid, bottom + h * .72],
      fpB: [mid, bottom, right, bottom + h * .72],
      teamA: [0, bottom + h * .60, width * .40, bottom + h * 1.45],
      teamB: [width * .58, bottom + h * .60, width * .95, bottom + h * 1.45]
    };
  }
  function number(text, confidence) {
    const raw = text.trim().replace(',', '.');
    // Never guess missing decimal separators or replace unrecognized digits.
    return confidence >= 40 && /^\d{1,3}(?:\.\d{1,2})?$/.test(raw) && Number(raw) <= 200 ? raw : '';
  }
  async function recognize(worker, pixels, width, height, teams, crop, progress) {
    const cards = detectCards(pixels, width, height);
    if (cards.length !== 7) throw new Error('Non riconosco tutte le 7 partite. Usa uno screenshot completo del calendario a sfondo chiaro, come l’esempio, oppure compila i campi manualmente.');
    const read = async (box, threshold, numeric = false) => {
      await worker.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: numeric ? '0123456789.,- ' : '' });
      const { data } = await worker.recognize(await crop(box, threshold));
      return data;
    };
    const matches = [];
    for (let index = 0; index < cards.length; index++) {
      progress(`Lettura partita ${index + 1} di 7…`);
      const regions = fields(cards[index], width);
      const goals = await read(regions.goals, 180, true);
      const pair = goals.confidence >= 40 && goals.text.trim().match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})$/);
      let a = await read(regions.fpA, 225), b = await read(regions.fpB, 225);
      if (!number(a.text, a.confidence)) a = await read(regions.fpA, 225, true);
      if (!number(b.text, b.confidence)) b = await read(regions.fpB, 225, true);
      if (!number(a.text, a.confidence)) a = await read(regions.fpA, 215, true);
      if (!number(b.text, b.confidence)) b = await read(regions.fpB, 215, true);
      let nameA = await read(regions.teamA, 215), nameB = await read(regions.teamB, 215);
      if (!teamId(nameA.text, teams)) nameA = await read(regions.teamA, 225);
      if (!teamId(nameB.text, teams)) nameB = await read(regions.teamB, 225);
      matches.push({ teamA: teamId(nameA.text, teams), teamB: teamId(nameB.text, teams), fpA: number(a.text, a.confidence), fpB: number(b.text, b.confidence), goalsA: pair ? pair[1] : '', goalsB: pair ? pair[2] : '' });
    }
    // Read only the header above the first match. No inference from the league day.
    let start = 0, end = 0, active = false;
    for (let y = 0; y < cards[0].y; y++) {
      let count = 0;
      for (let x = 0; x < width * .95; x++) {
        const i = (y * width + x) * 4;
        if (pixels[i] < 100 && pixels[i + 2] > 150 && pixels[i + 2] > pixels[i] * 1.5) count++;
      }
      const isBlue = count > width * .65;
      if (isBlue && !active) start = y;
      if (isBlue) end = y + 1;
      active = isBlue;
    }
    await worker.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '' });
    const { data } = await worker.recognize(await crop(end > start ? [0, start, width * .95, end] : [0, 0, width * .95, cards[0].y], end > start ? -1 : null));
    const day = data.text.match(/(\d{1,2})\s*[ª°aº?]?\s*Serie\s*A/i);
    return { matches, day: day ? Number(day[1]) : null };
  }
  function cropCanvas(source, box, threshold) {
    const x = Math.max(0, Math.floor(box[0])), y = Math.max(0, Math.floor(box[1]));
    const width = Math.max(1, Math.min(source.width, Math.floor(box[2])) - x);
    const height = Math.max(1, Math.min(source.height, Math.floor(box[3])) - y);
    const small = document.createElement('canvas'); small.width = width; small.height = height;
    const ctx = small.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, x, y, width, height, 0, 0, width, height);
    if (threshold !== null) {
      const image = ctx.getImageData(0, 0, width, height);
      for (let i = 0; i < image.data.length; i += 4) {
        const gray = .299 * image.data[i] + .587 * image.data[i + 1] + .114 * image.data[i + 2];
        image.data[i] = image.data[i + 1] = image.data[i + 2] = threshold === -1 ? (gray > 180 ? 0 : 255) : (gray < threshold ? 0 : 255);
      }
      ctx.putImageData(image, 0, 0);
    }
    const out = document.createElement('canvas'); out.width = width * 4 + 40; out.height = height * 4 + 40;
    const c = out.getContext('2d'); c.fillStyle = 'white'; c.fillRect(0, 0, out.width, out.height);
    c.drawImage(small, 20, 20, width * 4, height * 4);
    return out;
  }
  const api = { recognize, detectCards, fields, teamId, number, cropCanvas };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ReiettiOCR = api;
})(typeof window !== 'undefined' ? window : globalThis);
