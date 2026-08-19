/* ============================================================
   SOS REIETTI - CLOUDFLARE WORKER v3
   Fonti:
   - TheSportsDB        -> ricerca, foto, ruolo, squadra attuale
   - football-data.org  -> Serie A 2026/27, classifica, calendario
   - API-Football       -> statistiche storiche 2024 (fallback 2023)

   SECRET CLOUDFLARE DA LASCIARE:
   FOOTBALL_DATA_KEY
   API_FOOTBALL_KEY

   FACOLTATIVO:
   THESPORTSDB_KEY

   DOVE MODIFICARE:
   in fondo trovi la sezione "CONFIGURAZIONE FACILE".
   ============================================================ */

const TSD_BASE = 'https://www.thesportsdb.com/api/v1/json';
const FD_BASE = 'https://api.football-data.org/v4';
const AF_BASE = 'https://v3.football.api-sports.io';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'GET') {
      return json({ error: 'Metodo non consentito.' }, 405, cors);
    }

    if (!originAllowed(request, env)) {
      return json({ error: 'Origine non autorizzata.' }, 403, cors);
    }

    try {
      if (url.pathname === '/' || url.pathname === '/health') {
        return json({
          ok: true,
          service: 'SOS Reietti API',
          version: 3,
          liveSeason: liveSeason(env),
          historicalSeason: historicalSeason(env),
          footballDataConfigured: !!env.FOOTBALL_DATA_KEY,
          apiFootballConfigured: !!env.API_FOOTBALL_KEY,
          sources: ['TheSportsDB', 'football-data.org', 'API-Football']
        }, 200, cors);
      }

      if (url.pathname === '/search') {
        return await searchPlayer(url, env, ctx, cors);
      }

      if (url.pathname === '/player') {
        return await playerDetail(url, env, ctx, cors);
      }

      return json({ error: 'Endpoint non trovato.' }, 404, cors);

    } catch (error) {
      console.error('SOS REIETTI:', error);

      return json({
        ok: false,
        error: error?.message || 'Errore interno.',
        endpoint: url.pathname
      }, 500, cors);
    }
  }
};


/* ============================================================
   RICERCA
   ============================================================ */

async function searchPlayer(url, env, ctx, cors) {
  const q = String(url.searchParams.get('q') || '').trim();

  if (q.length < 3) {
    return json({ players: [] }, 200, cors);
  }

  const cacheKey = cacheRequest(url.origin, `search-v3-${norm(q)}`);
  const cached = await cacheMatch(cacheKey);

  if (cached) return addCors(cached, cors);

  const data = await tsdGet(
    `/searchplayers.php?p=${encodeURIComponent(q.replace(/\s+/g, '_'))}`,
    env
  );

  const rows = Array.isArray(data?.player) ? data.player : [];

  const players = rows
    .filter(p => norm(p?.strSport) === 'soccer')
    .slice(0, 15)
    .map(p => ({
      player: identity(p),
      statistics: [{
        team: {
          id: numberOrNull(p?.idTeam),
          name: p?.strTeam || '—',
          logo: null
        },
        league: {
          id: serieAId(env),
          name: 'Serie A',
          country: 'Italy',
          season: liveSeason(env)
        },
        games: {
          appearences: 0,
          lineups: 0,
          minutes: 0,
          number: p?.strNumber || null,
          position: position(p?.strPosition),
          rating: null,
          captain: false
        }
      }]
    }));

  const response = json({
    players,
    liveSeason: liveSeason(env),
    source: 'TheSportsDB'
  }, 200, {
    ...cors,
    'Cache-Control': 'public, max-age=3600'
  });

  cachePut(cacheKey, response.clone(), ctx);
  return response;
}


/* ============================================================
   DETTAGLIO
   ============================================================ */

async function playerDetail(url, env, ctx, cors) {
  const id = String(url.searchParams.get('id') || '').trim();

  if (!/^\d+$/.test(id)) {
    return json({ error: 'ID giocatore non valido.' }, 400, cors);
  }

  const cacheKey = cacheRequest(
    url.origin,
    `player-v3-${id}-${historicalSeason(env)}`
  );

  const cached = await cacheMatch(cacheKey);

  if (cached) return addCors(cached, cors);

  const raw = await tsdGet(
    `/lookupplayer.php?id=${encodeURIComponent(id)}`,
    env
  );

  const player =
    raw?.players?.[0] ||
    raw?.player?.[0] ||
    null;

  if (!player) {
    return json({ error: 'Giocatore non trovato.' }, 404, cors);
  }

  const currentIdentity = identity(player);

  const [history, serieA] = await Promise.all([
    apiFootballHistory(player, env),
    serieAContext(player.strTeam, env, url.origin, ctx)
  ]);

  /*
     Per compatibilità con il frontend esistente, "current"
     contiene le migliori statistiche individuali disponibili.

     Se API-Football trova il giocatore:
     current = statistiche Serie A 2024/25 (o 2023/24 fallback)

     Il contesto realmente attuale 2026/27 è in "serieA".
  */
  const current = history.ok
    ? mergeIdentity(history.item, currentIdentity, player)
    : emptyCurrent(player, currentIdentity, env);

  const response = json({
    playerId: Number(id),

    liveSeason: liveSeason(env),
    currentSeason: history.season || liveSeason(env),
    statisticsSeasonUsed: history.season || null,

    current,
    previous: null,
    previousSeason: null,
    previousSeasonUsed: null,

    dataMode: history.ok
      ? 'historical-baseline'
      : 'identity-only',

    historical: {
      available: history.ok,
      source: 'API-Football',
      seasonUsed: history.season || null,
      matchedPlayer: history.matchedPlayer || null,
      matchedTeam: history.matchedTeam || null,
      searchTerm: history.searchTerm || null,
      reason: history.reason || null
    },

    serieA,

    sources: {
      identity: 'TheSportsDB',
      statistics: history.ok ? 'API-Football' : 'none',
      serieA: 'football-data.org'
    }
  }, 200, {
    ...cors,
    'Cache-Control': 'public, max-age=21600'
  });

  cachePut(cacheKey, response.clone(), ctx);
  return response;
}


/* ============================================================
   API-FOOTBALL - STORICO
   ============================================================ */

async function apiFootballHistory(player, env) {
  if (!env.API_FOOTBALL_KEY) {
    return {
      ok: false,
      reason: 'API_FOOTBALL_KEY non configurata.'
    };
  }

  const main = historicalSeason(env);

  // Proviamo 2024, poi 2023.
  const seasons = [...new Set([main, main - 1])]
    .filter(s => s >= 2022 && s <= 2024);

  let reason = 'Statistiche storiche non trovate.';

  for (const season of seasons) {
    const result = await findHistoricalPlayer(player, season, env);

    if (result.ok) return result;

    reason = result.reason || reason;
  }

  return { ok: false, reason };
}


async function findHistoricalPlayer(player, season, env) {
  const terms = searchTerms(player?.strPlayer);

  if (!terms.length) {
    return { ok: false, reason: 'Nome non valido.' };
  }

  let reason = 'Giocatore non trovato.';

  // Max 2 chiamate per non sprecare il limite gratuito.
  for (const term of terms.slice(0, 2)) {
    try {
      const data = await afGet('/players', {
        league: serieAId(env),
        season,
        search: term
      }, env);

      const candidates = Array.isArray(data?.response)
        ? data.response
        : [];

      if (!candidates.length) {
        reason = `Nessun risultato per "${term}" - stagione ${season}.`;
        continue;
      }

      const best = candidates
        .map(item => ({
          item,
          score: candidateScore(item, player)
        }))
        .sort((a, b) => b.score - a.score)[0];

      if (!best || best.score < 4) {
        reason = `Corrispondenza non abbastanza sicura per "${term}".`;
        continue;
      }

      return {
        ok: true,
        season,
        item: best.item,
        searchTerm: term,
        matchedPlayer: best.item?.player?.name || null,
        matchedTeam: best.item?.statistics?.[0]?.team?.name || null
      };

    } catch (error) {
      reason = error?.message || 'Errore API-Football.';
    }
  }

  return { ok: false, reason };
}


async function afGet(path, params, env) {
  const url = new URL(AF_BASE + path);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  const response = await fetch(url, {
    headers: {
      'x-apisports-key': env.API_FOOTBALL_KEY,
      'Accept': 'application/json'
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`API-Football HTTP ${response.status}`);
  }

  if (
    data?.errors &&
    typeof data.errors === 'object' &&
    Object.keys(data.errors).length
  ) {
    const message = Object.entries(data.errors)
      .map(([k, v]) =>
        `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`
      )
      .join(' · ');

    throw new Error(`API-Football: ${message}`);
  }

  return data;
}


function searchTerms(name) {
  const clean = removeAccents(String(name || '').trim());

  const words = clean
    .split(/\s+/)
    .map(w => w.replace(/[^a-zA-Z'-]/g, ''))
    .filter(w => w.length >= 4);

  if (!words.length) {
    return clean.length >= 4 ? [clean] : [];
  }

  const surname = words[words.length - 1];
  const full = words.join(' ');
  const first = words[0];

  return [...new Set([surname, full, first])];
}


function candidateScore(item, player) {
  const a = norm(player?.strPlayer);
  const b = norm(item?.player?.name);

  let score = 0;

  if (a === b) {
    score += 8;
  } else if (a.includes(b) || b.includes(a)) {
    score += 6;
  } else {
    score += tokenSimilarity(a, b) * 5;
  }

  score += teamSimilarity(
    player?.strTeam,
    item?.statistics?.[0]?.team?.name
  ) * 4;

  if (
    norm(player?.strNationality) &&
    norm(player?.strNationality) === norm(item?.player?.nationality)
  ) {
    score += 1;
  }

  return score;
}


function mergeIdentity(apiItem, currentIdentity, tsdPlayer) {
  const stats = Array.isArray(apiItem?.statistics)
    ? apiItem.statistics.map(stat => ({
        ...stat,
        games: {
          ...(stat?.games || {}),

          // Manteniamo il ruolo ATTUALE trovato da TheSportsDB.
          position: position(tsdPlayer?.strPosition)
        }
      }))
    : [];

  return {
    ...apiItem,

    player: {
      ...(apiItem?.player || {}),
      ...currentIdentity,

      photo:
        currentIdentity.photo ||
        apiItem?.player?.photo ||
        ''
    },

    statistics: stats
  };
}


/* ============================================================
   FOOTBALL-DATA.ORG - CONTESTO SERIE A ATTUALE
   ============================================================ */

async function serieAContext(playerTeam, env, origin, ctx) {
  if (!env.FOOTBALL_DATA_KEY) {
    return {
      competition: competitionCode(env),
      configured: false,
      error: 'FOOTBALL_DATA_KEY non configurata.',
      team: null,
      standing: null,
      nextMatch: null
    };
  }

  const cacheKey = cacheRequest(
    origin,
    `serie-a-${liveSeason(env)}`
  );

  let common = null;

  const cached = await cacheMatch(cacheKey);

  if (cached) {
    common = await cached.json().catch(() => null);
  }

  if (!common) {
    try {
      const competition = encodeURIComponent(
        competitionCode(env)
      );

      const [standingsData, matchesData] = await Promise.all([
        fdGet(
          `/competitions/${competition}/standings`,
          env
        ),
        fdGet(
          `/competitions/${competition}/matches?status=SCHEDULED`,
          env
        )
      ]);

      const block =
        standingsData?.standings?.find(
          s => String(s?.type).toUpperCase() === 'TOTAL'
        ) ||
        standingsData?.standings?.[0];

      common = {
        standings: Array.isArray(block?.table)
          ? block.table
          : [],

        matches: Array.isArray(matchesData?.matches)
          ? matchesData.matches
          : []
      };

      const commonResponse = new Response(
        JSON.stringify(common),
        {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=900'
          }
        }
      );

      cachePut(
        cacheKey,
        commonResponse,
        ctx
      );

    } catch (error) {
      return {
        competition: competitionCode(env),
        configured: true,
        error:
          error?.message ||
          'football-data non disponibile.',
        team: null,
        standing: null,
        nextMatch: null
      };
    }
  }

  const standing = bestStanding(
    playerTeam,
    common.standings
  );

  if (!standing) {
    return {
      competition: competitionCode(env),
      configured: true,
      error: null,
      team: null,
      standing: null,
      nextMatch: null
    };
  }

  const team = standing.team || {};

  const next = common.matches
    .filter(m =>
      m?.homeTeam?.id === team.id ||
      m?.awayTeam?.id === team.id
    )
    .sort(
      (a, b) =>
        new Date(a.utcDate || 0) -
        new Date(b.utcDate || 0)
    )[0] || null;

  const home =
    next?.homeTeam?.id === team.id;

  return {
    competition: competitionCode(env),
    configured: true,
    error: null,

    team: {
      id: team.id || null,
      name: team.name || null,
      shortName: team.shortName || null,
      crest: team.crest || null
    },

    standing: {
      position: standing.position || null,
      playedGames: standing.playedGames || 0,
      won: standing.won || 0,
      draw: standing.draw || 0,
      lost: standing.lost || 0,
      points: standing.points || 0,
      goalsFor: standing.goalsFor || 0,
      goalsAgainst: standing.goalsAgainst || 0,
      goalDifference: standing.goalDifference || 0
    },

    nextMatch: next
      ? {
          date: next.utcDate || null,
          home: next?.homeTeam?.name || null,
          away: next?.awayTeam?.name || null,

          opponent: home
            ? next?.awayTeam?.name || null
            : next?.homeTeam?.name || null,

          venue: home
            ? 'casa'
            : 'trasferta',

          matchday:
            next?.matchday || null
        }
      : null
  };
}


async function fdGet(path, env) {
  const response = await fetch(
    FD_BASE + path,
    {
      headers: {
        'X-Auth-Token':
          env.FOOTBALL_DATA_KEY,

        'Accept':
          'application/json'
      }
    }
  );

  const data =
    await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `football-data.org: ${
        data?.message ||
        `HTTP ${response.status}`
      }`
    );
  }

  return data;
}


/* ============================================================
   THESPORTSDB
   ============================================================ */

async function tsdGet(path, env) {
  const key = String(
    env.THESPORTSDB_KEY ||
    '123'
  ).trim();

  const url =
    `${TSD_BASE}/${encodeURIComponent(key)}${path}`;

  const response = await fetch(
    url,
    {
      headers: {
        'Accept':
          'application/json'
      }
    }
  );

  const data =
    await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `TheSportsDB HTTP ${response.status}`
    );
  }

  return data;
}


function identity(p) {
  const name =
    p?.strPlayer ||
    'Giocatore';

  const words =
    String(name)
      .trim()
      .split(/\s+/);

  return {
    id:
      numberOrNull(p?.idPlayer),

    name,

    firstname:
      words[0] || '',

    lastname:
      words.slice(1).join(' '),

    age:
      ageFromDate(p?.dateBorn),

    birth: {
      date:
        p?.dateBorn || null,

      place:
        p?.strBirthLocation || null,

      country:
        p?.strNationality || null
    },

    nationality:
      p?.strNationality || null,

    height:
      p?.strHeight || null,

    weight:
      p?.strWeight || null,

    injured:
      false,

    photo:
      p?.strCutout ||
      p?.strThumb ||
      p?.strRender ||
      ''
  };
}


function emptyCurrent(
  player,
  currentIdentity,
  env
) {
  return {
    player:
      currentIdentity,

    statistics: [{
      team: {
        id:
          numberOrNull(player?.idTeam),

        name:
          player?.strTeam || '—',

        logo:
          null
      },

      league: {
        id:
          serieAId(env),

        name:
          'Serie A',

        country:
          'Italy',

        season:
          liveSeason(env)
      },

      games: {
        appearences: 0,
        lineups: 0,
        minutes: 0,

        number:
          player?.strNumber || null,

        position:
          position(player?.strPosition),

        rating:
          null,

        captain:
          false
      },

      substitutes: {
        in: 0,
        out: 0,
        bench: 0
      },

      shots: {
        total: 0,
        on: 0
      },

      goals: {
        total: 0,
        conceded: 0,
        assists: 0,
        saves: 0
      },

      passes: {
        total: 0,
        key: 0,
        accuracy: 0
      },

      tackles: {
        total: 0,
        blocks: 0,
        interceptions: 0
      },

      duels: {
        total: 0,
        won: 0
      },

      dribbles: {
        attempts: 0,
        success: 0,
        past: 0
      },

      fouls: {
        drawn: 0,
        committed: 0
      },

      cards: {
        yellow: 0,
        yellowred: 0,
        red: 0
      },

      penalty: {
        won: 0,
        commited: 0,
        scored: 0,
        missed: 0,
        saved: 0
      }
    }]
  };
}


/* ============================================================
   ABBINAMENTO SQUADRE / RUOLI
   ============================================================ */

function bestStanding(playerTeam, rows = []) {
  let best = null;
  let bestScore = 0;

  for (const row of rows) {
    const team =
      row?.team || {};

    for (
      const candidate of [
        team.name,
        team.shortName,
        team.tla
      ].filter(Boolean)
    ) {
      const score =
        teamSimilarity(
          playerTeam,
          candidate
        );

      if (score > bestScore) {
        bestScore = score;
        best = row;
      }
    }
  }

  return bestScore >= 0.45
    ? best
    : null;
}


function teamSimilarity(a, b) {
  const x = teamName(a);
  const y = teamName(b);

  if (!x || !y) return 0;

  if (x === y) {
    return 1;
  }

  if (
    x.includes(y) ||
    y.includes(x)
  ) {
    return 0.9;
  }

  const A =
    new Set(teamTokens(x));

  const B =
    new Set(teamTokens(y));

  if (!A.size || !B.size) {
    return 0;
  }

  let common = 0;

  for (const token of A) {
    if (B.has(token)) {
      common++;
    }
  }

  return (
    common /
    Math.max(
      A.size,
      B.size
    )
  );
}


function teamName(value) {
  let t = norm(value);

  const aliases = [
    [
      /^fc internazionale milano$|^internazionale$|^inter milan$|^inter$/,
      'inter'
    ],

    [
      /^ac milan$|^milan$/,
      'milan'
    ],

    [
      /^ssc napoli$|^napoli$/,
      'napoli'
    ],

    [
      /^juventus fc$|^juventus$/,
      'juventus'
    ],

    [
      /^as roma$|^roma$/,
      'roma'
    ],

    [
      /^ss lazio$|^lazio$/,
      'lazio'
    ],

    [
      /^acf fiorentina$|^fiorentina$/,
      'fiorentina'
    ],

    [
      /^atalanta bc$|^atalanta$/,
      'atalanta'
    ]
  ];

  for (
    const [pattern, replacement]
    of aliases
  ) {
    if (pattern.test(t)) {
      return replacement;
    }
  }

  return t;
}


function teamTokens(value) {
  const ignored =
    new Set([
      'fc',
      'ac',
      'as',
      'ss',
      'ssc',
      'calcio',
      'football',
      'club'
    ]);

  return norm(value)
    .split(/\s+/)
    .filter(
      t =>
        t &&
        !ignored.has(t)
    );
}


function position(value) {
  const p = norm(value);

  if (
    p.includes('goalkeeper') ||
    p.includes('keeper') ||
    p === 'gk'
  ) {
    return 'Goalkeeper';
  }

  if (
    p.includes('back') ||
    p.includes('defender') ||
    p.includes('defence') ||
    p.includes('defense')
  ) {
    return 'Defender';
  }

  if (
    p.includes('forward') ||
    p.includes('striker') ||
    p.includes('winger')
  ) {
    return 'Attacker';
  }

  return 'Midfielder';
}


/* ============================================================
   CONFIGURAZIONE FACILE
   ============================================================ */

function liveSeason(env) {
  /*
     MODIFICA QUI quando cambia la stagione corrente.
  */
  return Number(
    env.CURRENT_SEASON ||
    2026
  );
}


function historicalSeason(env) {
  /*
     MODIFICA QUI solo quando API-Football Free
     renderà disponibile una stagione più recente.
  */
  return Number(
    env.API_FOOTBALL_PRIMARY_SEASON ||
    2024
  );
}


function serieAId(env) {
  /*
     Serie A su API-Football.
  */
  return Number(
    env.API_FOOTBALL_LEAGUE_ID ||
    135
  );
}


function competitionCode(env) {
  /*
     Serie A su football-data.org.
  */
  return String(
    env.FOOTBALL_DATA_COMPETITION ||
    'SA'
  ).trim();
}


function allowedOrigin(env) {
  /*
     Per:
     https://huftre.github.io/i_reietti/

     lascia:
     https://huftre.github.io
  */
  return String(
    env.ALLOWED_ORIGIN ||
    'https://huftre.github.io'
  ).replace(/\/$/, '');
}


/* ============================================================
   UTILITÀ
   ============================================================ */

function tokenSimilarity(a, b) {
  const A =
    new Set(
      norm(a)
        .split(/\s+/)
        .filter(Boolean)
    );

  const B =
    new Set(
      norm(b)
        .split(/\s+/)
        .filter(Boolean)
    );

  if (!A.size || !B.size) {
    return 0;
  }

  let common = 0;

  for (const token of A) {
    if (B.has(token)) {
      common++;
    }
  }

  return (
    common /
    Math.max(
      A.size,
      B.size
    )
  );
}


function norm(value) {
  return removeAccents(
    String(value || '')
  )
    .toLowerCase()
    .replace(/[._'’\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


function removeAccents(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    );
}


function numberOrNull(value) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : null;
}


function ageFromDate(date) {
  if (!date) {
    return null;
  }

  const birth =
    new Date(
      `${date}T00:00:00Z`
    );

  if (
    Number.isNaN(
      birth.getTime()
    )
  ) {
    return null;
  }

  const now =
    new Date();

  let age =
    now.getUTCFullYear() -
    birth.getUTCFullYear();

  const m =
    now.getUTCMonth() -
    birth.getUTCMonth();

  if (
    m < 0 ||
    (
      m === 0 &&
      now.getUTCDate() <
      birth.getUTCDate()
    )
  ) {
    age--;
  }

  return age;
}


/* ============================================================
   CORS + CACHE + JSON
   ============================================================ */

function originAllowed(request, env) {
  const origin =
    request.headers.get('Origin');

  if (!origin) {
    return true;
  }

  if (
    origin === allowedOrigin(env)
  ) {
    return true;
  }

  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}


function corsHeaders(request, env) {
  const origin =
    request.headers.get('Origin');

  return {
    'Access-Control-Allow-Origin':
      origin &&
      originAllowed(request, env)
        ? origin
        : allowedOrigin(env),

    'Access-Control-Allow-Methods':
      'GET, OPTIONS',

    'Access-Control-Allow-Headers':
      'Content-Type, Accept',

    'Vary':
      'Origin'
  };
}


function cacheRequest(origin, key) {
  return new Request(
    `${origin}/__sos_reietti_cache/${encodeURIComponent(key)}`
  );
}


async function cacheMatch(key) {
  try {
    return await caches.default.match(
      key
    );
  } catch {
    return undefined;
  }
}


function cachePut(key, response, ctx) {
  try {
    const promise =
      caches.default
        .put(
          key,
          response
        )
        .catch(() => {});

    if (ctx?.waitUntil) {
      ctx.waitUntil(promise);
    }

  } catch {}
}


function json(
  data,
  status = 200,
  headers = {}
) {
  return new Response(
    JSON.stringify(
      data,
      null,
      2
    ),
    {
      status,

      headers: {
        'Content-Type':
          'application/json; charset=utf-8',

        ...headers
      }
    }
  );
}


function addCors(response, cors) {
  const headers =
    new Headers(
      response.headers
    );

  for (
    const [key, value]
    of Object.entries(cors)
  ) {
    headers.set(
      key,
      value
    );
  }

  return new Response(
    response.body,
    {
      status:
        response.status,

      headers
    }
  );
}