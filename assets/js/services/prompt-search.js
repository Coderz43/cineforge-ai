// assets/js/services/prompt-search.js

// =============================
// TMDB genre map (v3 ids)
// =============================
const GENRE_MAP = {
  action: 28, adventure: 12, animation: 16, comedy: 35, crime: 80,
  documentary: 99, drama: 18, family: 10751, fantasy: 14, history: 36,
  horror: 27, music: 10402, mystery: 9648, romance: 10749, scifi: 878,
  thriller: 53, war: 10752, western: 37
};

// ---------- Synonyms / aliases ----------
const GENRE_SYNONYMS = {
  'sci-fi': 'scifi',
  'science fiction': 'scifi',
  'rom-com': ['romance','comedy'],
  'romcom': ['romance','comedy'],
  'suspense': 'thriller',
  'biopic': ['drama','history'],
  'heist': ['crime','action'],
  'noir': ['crime','mystery'],
  'serial killer': ['crime','thriller'],
  'courtroom': ['drama','crime'],
  'psychological': ['thriller','drama'],
  'mystery': 'mystery',
  'family': 'family',
  'teen': ['drama','comedy']
};

// Vibes → soft-genre hints
const VIBE_TO_GENRES = {
  suspense: ['thriller','mystery','crime'],
  'edge-of-seat': ['thriller','mystery'],
  twist: ['thriller','mystery'],
  clever: ['mystery','crime','thriller'],
  emotional: ['drama','family','romance'],
  realistic: ['drama','crime'],
  dark: ['thriller','crime'],
  heist: ['crime','action'],
  witty: ['comedy'],
  cozy: ['comedy','romance','family'],
  feelgood: ['comedy','romance','family'],
  'true-story': ['drama','history']
};

// ---- API key (provided by api.js exposing window.CF_TMDB_KEY) ----
function pickKey () {
  return window.CF_TMDB_KEY || localStorage.getItem('cf-tmdb-key') || window.TMDB_API_KEY;
}

// ---- HTTP helper (adds language=) ----
async function j (url, lang = 'en-US') {
  const key = pickKey();
  const u = url + (url.includes('?') ? '&' : '?') + 'api_key=' + key + `&language=${encodeURIComponent(lang)}`;
  const r = await fetch(u);
  if (!r.ok) throw new Error('TMDB error ' + r.status);
  return r.json();
}

// ---- Utilities ----
function dedupe (arr) {
  const seen = new Set();
  return arr.filter(x => {
    const media = String(x.media_type || (x.first_air_date ? 'tv' : 'movie'));
    const id = x.id != null ? String(x.id) : '';
    const title = (x.title || x.name || '').trim().toLowerCase();
    const year = (x.release_date || x.first_air_date || '').slice(0, 4);
    const k = id ? `${media}:${id}` : `${media}:${title}:${year}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
function safeStr (v) { return (v == null ? '' : String(v)); }
function yearFrom (s) { const m = String(s || '').match(/\b(19|20)\d{2}\b/); return m ? Number(m[0]) : null; }
function clamp (n, a, b) { return Math.min(Math.max(n, a), b); }
function arrify(x){ return Array.isArray(x) ? x : (x ? [x] : []); }

const LANG_HINTS = {
  hindi: 'hi', bollywood: 'hi', urdu: 'ur', malayalam: 'ml', tamil: 'ta', telugu: 'te', kannada: 'kn',
  marathi: 'mr', bengali: 'bn', punjabi: 'pa', gujarati: 'gu', english: 'en', hollywood: 'en',
  korean: 'ko', japanese: 'ja', chinese: 'zh', spanish: 'es', french: 'fr', german: 'de'
};
const SOUTH_BUNDLE = ['ta','te','ml','kn']; // south indian
const REGION_HINTS = { india: 'IN', pakistan: 'PK', usa: 'US', us: 'US', uk: 'GB' };

function pickLocaleForQuery(q) {
  const s = String(q || '');
  if (/[\u0900-\u097F]/.test(s)) return 'hi-IN';  // Devanagari → Hindi
  if (/[\u0600-\u06FF]/.test(s)) return 'ur-PK';  // Arabic script → Urdu
  return 'en-US';
}

// Normalize any token(s) to canonical genres
function normalizeGenres(tokens = []) {
  const out = new Set();
  tokens.forEach(raw => {
    const t = String(raw || '').toLowerCase().trim();
    if (!t) return;
    if (GENRE_MAP[t]) { out.add(t); return; }
    if (GENRE_SYNONYMS[t]) {
      const val = GENRE_SYNONYMS[t];
      arrify(val).forEach(v => GENRE_MAP[v] && out.add(v));
      return;
    }
    if (/^sci[^a-z]?fi$|science\s*fiction/.test(t)) out.add('scifi');
  });
  return Array.from(out);
}

// Token helpers for common “moods / scenarios”
const MOOD = {
  FEEL_GOOD: /feel\s*-?\s*good|relax(ing)?|chill( weekend| mood)?|rainy( day| evening)?|sunday\s*(mood|feel)|mood\s*booster/i,
  FAMILY_NIGHT: /family( movie)?\s*night|watch with family|family\s*suspense/i,
  TIME_PASS: /time\s*pass|fun entertainer|laughter dose|full comedy/i,
  SAD_ENDING: /sad( (movie|film))?(\s*to\s*cry)?|heartbreak( story| healing)?|tear\s*jerker|tragic|shocking\s*ending/i,
  ROMANTIC: /romance|romantic( comedy| drama| mood)?|love( story| triangle)?|couples( night| movie)?|cute/i,
  INVESTIGATIVE: /investigation|detective|police|cop|courtroom|serial\s*killer|murder\s*mystery|crime\s*drama|true\s*crime/i,
  REAL_BASED: /real(istic)?( acting| story)?|based on true|true\s*story|biopic|biography|real life|inspirational/i,
  SUPERHERO: /avengers?|marvel|dc( (comics|extended))?|super\s*man|batman|spider-?man|iron\s*man|wolverine|deadpool/i,
  DARK: /dark( theme| emotional)?|noir/i,
  PSYCH: /psychological|mind\s*game/i,
  TWISTY: /twist(y)?|unpredictable|shocking\s*ending|mind\s*blow(ing)?/i,
  HORROR: /horror|ghost|haunted|supernatural/i,
  NOT_TOO_SCARY: /not\s*too\s*scary/i,
  ACTION_THRILL: /action(\s*\+\s*emotion|\s*thriller)?|thriller(\s*\+\s*romance)?|edge[-\s]?of[-\s]?seat|intense/i,
};
function MOOOD_SAFE(re, s){ try{ return re.test(s); }catch{ return false; } }

// ---- Parse prompt → intent
function parsePrompt (raw, opts = {}) {
  const p = safeStr(raw).trim();
  const low = p.toLowerCase();

  // 1) “like <title>” (EN + Hinglish)
  const likeRe = /(movies?|films?|shows?|series)?\s*(?:like|similar\s+to|jaise|jaisa|jaisi|type\s+ka|type\s+ki|ki\s*tarah)\s+([a-z0-9 :'"._-]+)/i;
  const mLike = p.match(likeRe);
  let like = mLike ? mLike[2] : '';

  if (!like) {
    const alt = /(.*?)(?:\s+(?:jaise|jaisa|jaisi|type\s*ka|type\s*ki|ki\s*tarah))\b/i.exec(p);
    if (alt && safeStr(alt[1]).trim().length >= 3) like = alt[1].trim();
  }
  if (!like) {
    const mTitle = p.match(/^([A-Za-z0-9][A-Za-z0-9 :'._-]{2,})$/);
    if (mTitle) like = mTitle[1];
  }

  // title candidates (+ known variants)
  const titleCandidates = [];
  if (like) {
    const y = yearFrom(p) || (opts.yearHint || null);
    titleCandidates.push({ title: like, year: y });
    const t = like.trim().toLowerCase();
    // popular anchors
    const alias = {
      'drishyam': [{title:'Drishyam',year:2013},{title:'Drishyam',year:2015},{title:'Drishyam 2',year:2021},{title:'Drishyam 2',year:2022}],
      'kahaani': [{title:'Kahaani',year:2012}],
      'andhadhun': [{title:'Andhadhun',year:2018}],
      'badla': [{title:'Badla',year:2019}],
      'se7en': [{title:'Se7en',year:1995},{title:'Seven',year:1995}],
      'seven': [{title:'Se7en',year:1995},{title:'Seven',year:1995}],
      'gone girl': [{title:'Gone Girl',year:2014}]
    };
    Object.keys(alias).forEach(k => {
      if (t.includes(k)) alias[k].forEach(x => titleCandidates.push(x));
    });
  }

  // 2) Language intent
  let includeLanguages = [];
  Object.keys(LANG_HINTS).forEach(w => { if (low.includes(w)) includeLanguages.push(LANG_HINTS[w]); });
  if (/south\s*indian/.test(low)) includeLanguages.push(...SOUTH_BUNDLE);
  if (/punjabi/.test(low)) includeLanguages.push('pa');
  if (/bollywood|hindi/.test(low)) includeLanguages.push('hi');
  if (/hollywood|english/.test(low)) includeLanguages.push('en');
  // script hints
  if (/[\u0900-\u097F]/.test(p)) includeLanguages.push('hi');
  if (/[\u0600-\u06FF]/.test(p)) includeLanguages.push('ur');
  includeLanguages = Array.from(new Set(includeLanguages));
  const explicitLangLock = includeLanguages.length > 0;
  if (!includeLanguages.includes('en')) includeLanguages.push('en'); // blend by default

  // 3) Media type
  const mediaType = /tv|series|season|episodes?/.test(low) ? 'tv' : (opts.type === 'tv' ? 'tv' : 'movie');

  // 4) Genres from words + synonyms
  const rawGenreTokens = Object.keys(GENRE_MAP).concat(Object.keys(GENRE_SYNONYMS))
    .filter(k => new RegExp(`\\b${k.replace(/\s+/g,'\\s*')}\\b`, 'i').test(low));
  let genres = normalizeGenres(rawGenreTokens);

  // 5) Keywords / vibes
  const kw = new Set();
  const add = (x)=>{ if (x) kw.add(x.toLowerCase()); };
  if (/slow\s*burn/i.test(p)) add('slow burn');
  if (/heist/i.test(p)) add('heist');
  if (/mystery/i.test(p)) add('mystery');
  if (/revenge/i.test(p)) add('revenge');
  if (/investigation|detective|investigative/i.test(p)) add('investigation');
  if (/family/i.test(p)) add('family');
  if (/noir/i.test(p)) add('noir');
  if (/psychological/i.test(p)) add('psychological');
  if (/real(istic)?|true\s*story/i.test(p)) add('realistic');
  if (/emotional/i.test(p)) add('emotional');
  if (/twist|plot\s*twist|twist\s*ending/i.test(p)) add('twist');
  if (/\bsmart|brainy|clever|mind\s*game/i.test(p)) add('clever');
  if (/\bedge[-\s]?of[-\s]?seat|edge of the seat/i.test(p)) add('edge-of-seat');
  if (/suspense|suspenseful/i.test(p)) add('suspense');
  if (/serial\s*killer/i.test(p)) add('serial killer');
  if (/courtroom/i.test(p)) add('courtroom');

  // “x + y” tokens
  p.split(/[,+]/).map(s=>s.trim().toLowerCase()).forEach(tok=>{
    if (!tok) return;
    if (/\b(thrill|thriller)\b/.test(tok)) add('thriller');
    if (/\b(action|shootout|chase)\b/.test(tok)) add('action');
    if (/\b(drama|family|emotional)\b/.test(tok)) add('drama');
    if (/\b(mystery|investigation|detective)\b/.test(tok)) add('mystery');
    if (/\b(crime|police|cop|mafia|gangster|courtroom|justice)\b/.test(tok)) add('crime');
    if (/\b(noir|dark)\b/.test(tok)) add('noir');
    if (/\b(comedy)\b/.test(tok)) add('comedy');
    if (/\b(romance|romantic|love)\b/.test(tok)) add('romance');
    if (/\b(real|realistic|true\s*story|based\s*on\s*true)\b/.test(tok)) add('realistic');
  });

  // moods/scenarios (map to helper flags)
  const flags = {
    feelGood: MOOD.FEEL_GOOD.test(p) || /feel\s*good|rainy|peaceful|relax/i.test(p),
    familyNight: MOOD.FAMILY_NIGHT.test(p),
    timePass: MOOD.TIME_PASS.test(p),
    sadEnding: MOOD.SAD_ENDING.test(p),
    romantic: MOOD.ROMANTIC.test(p),
    investigative: MOOD.INVESTIGATIVE.test(p),
    realBased: MOOD.REAL_BASED.test(p),
    superhero: MOOD.SUPERHERO.test(p),
    dark: MOOD.DARK.test(p),
    psych: MOOD.PSYCH.test(p),
    twisty: MOOOD_SAFE(MOOD.TWISTY, p),
    horror: MOOD.HORROR.test(p),
    notTooScary: MOOD.NOT_TOO_SCARY.test(p),
    actionThrill: MOOD.ACTION_THRILL.test(p)
  };

  // vibe genres
  const vibeGenres = [];
  if (flags.feelGood) vibeGenres.push(...VIBE_TO_GENRES.feelgood);
  if (flags.twisty) vibeGenres.push(...VIBE_TO_GENRES.twist);
  if (flags.investigative) vibeGenres.push(...VIBE_TO_GENRES.suspense);
  if (flags.psych) vibeGenres.push(...VIBE_TO_GENRES.clever);
  if (flags.dark) vibeGenres.push(...VIBE_TO_GENRES.dark);
  genres = normalizeGenres([...genres, ...vibeGenres]);

  // 6) Year / era
  const yFromPrompt = yearFrom(p) || opts.yearHint || null;
  let yearRange = { from: null, to: null };
  if (/\b90s|1990s|nineties\b/i.test(p)) yearRange = { from: 1990, to: 1999 };
  else if (/old\s*school|classic/i.test(p)) yearRange = { from: 1960, to: 2005 };
  else if (/2025|latest|blockbuster|trending/i.test(p)) yearRange = { from: 2023, to: 2025 };
  else if (yFromPrompt) yearRange = { from: clamp(yFromPrompt - 2, 1950, 2025), to: clamp(yFromPrompt + 2, 1950, 2025) };

  // 7) Runtime hints
  const runtime = { lte: null, gte: null };
  if (/short\s*(movie|film)?/i.test(p)) runtime.lte = 105;
  if (/long\s*(movie|film|story)?/i.test(p)) runtime.gte = 150;

  // 8) Sorting / quality
  let sort = 'popularity.desc';
  let minVotes = 200;
  if (/top\s*rated|oscar|masterpiece|cinematic/i.test(p)) { sort = 'vote_average.desc'; minVotes = 1000; }

  // 9) Strategy
  const strategy = like ? 'similar' : (genres.length || kw.size || flags.feelGood || flags.romantic || flags.investigative || flags.realBased ? 'discover' : 'search');

  return {
    strategy,
    mediaType,
    titleCandidates,
    genres,
    keywords: Array.from(kw),
    includeLanguages: Array.from(new Set(includeLanguages)).slice(0, 4),
    explicitLangLock,
    yearRange,
    runtime,
    regionHints: Object.keys(REGION_HINTS).filter(w => low.includes(w)).map(w => REGION_HINTS[w]),
    quality: { minVotes, sort },
    flags
  };
}

// ----- Fuse Gemini AI intent -----
function fuseAI(want, ai = null) {
  if (!ai || typeof ai !== 'object') return want;
  const out = { ...want };

  if (ai.mediaType && /^(movie|tv|both|multi)$/i.test(ai.mediaType)) {
    out.mediaType = ai.mediaType === 'both' ? 'movie' : ai.mediaType;
  }
  out.liked_titles = Array.isArray(ai.liked_titles) ? ai.liked_titles.slice(0, 5) : [];

  const aiGenres = normalizeGenres(Array.isArray(ai.genres) ? ai.genres : []);
  const vibeGenres = [];
  arrify(ai.vibes).forEach(v => { const g = VIBE_TO_GENRES[String(v||'').toLowerCase()]; if (g) vibeGenres.push(...arrify(g)); });
  const mixGenres = [];
  (Array.isArray(ai.mixes) ? ai.mixes : []).forEach(m => {
    const arr = (m && Array.isArray(m.and)) ? m.and : [];
    arr.forEach(tok => {
      const g = GENRE_SYNONYMS[String(tok||'').toLowerCase()] || (GENRE_MAP[tok] ? tok : null);
      if (g) arrify(g).forEach(x => mixGenres.push(x));
    });
  });
  out.genres = normalizeGenres([...(out.genres||[]), ...aiGenres, ...vibeGenres, ...mixGenres]).slice(0, 6);

  const langs = new Set(out.includeLanguages || []);
  (ai.language_prefs || []).forEach(l => l && langs.add(l));
  // Ensure Bollywood + Hollywood blend by default
  langs.add('hi'); langs.add('en');
  out.includeLanguages = Array.from(langs).slice(0, 5);

  if (Number.isFinite(ai.year)) {
    const y = clamp(Number(ai.year), 1950, 2025);
    out.yearRange = { from: y-1, to: y+1 };
  }
  if (Number.isFinite(ai.min_vote_average) && ai.min_vote_average >= 0 && ai.min_vote_average <= 10) {
    const v = Math.floor(ai.min_vote_average * 50);
    out.quality = { ...(out.quality||{}), minVotes: Math.max(100, Math.min(1200, v)) };
  }
  out.queryHint = (ai.query || '').trim();
  return out;
}

// ---- TMDB helpers ----
async function searchTitle (title, year, media = 'movie', lang = 'en-US') {
  const ep = media === 'tv' ? 'search/tv' : 'search/movie';
  const qp = [
    `query=${encodeURIComponent(title)}`,
    'include_adult=false',
    year ? `year=${year}` : ''
  ].filter(Boolean).join('&');
  const url = `https://api.themoviedb.org/3/${ep}?${qp}`;
  const data = await j(url, lang);
  const results = (data.results || []).sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  return results[0] || null;
}

async function similarPlusRec (id, media = 'movie', lang = 'en-US') {
  const sim = await j(`https://api.themoviedb.org/3/${media}/${id}/similar?page=1`, lang).catch(() => ({ results: [] }));
  const rec = await j(`https://api.themoviedb.org/3/${media}/${id}/recommendations?page=1`, lang).catch(() => ({ results: [] }));
  const both = [...(sim.results || []), ...(rec.results || [])];
  both.forEach(x => (x.media_type = media, x.__src = 'similar'));
  return both;
}

async function searchMultiRaw (q, page = 1, lang = 'en-US') {
  const url = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(q)}&include_adult=false&page=${page}`;
  const data = await j(url, lang);
  const results = (data.results || []).filter(x => x.media_type === 'movie' || x.media_type === 'tv');
  results.forEach(x => (x.__src = 'search'));
  return results;
}

async function discoverPass (
  { media = 'movie', genres = [], lang = null, yFrom = null, yTo = null, minVotes = 200, sort = 'popularity.desc', runtime = {} },
  locale = 'en-US'
) {
  const base = `https://api.themoviedb.org/3/discover/${media}`;
  const qp = [
    `sort_by=${encodeURIComponent(sort)}`,
    `vote_count.gte=${minVotes}`,
    genres.length ? `with_genres=${genres.map(k => GENRE_MAP[k]).filter(Boolean).join(',')}` : '',
    lang ? `with_original_language=${lang}` : '',
    yFrom ? `primary_release_date.gte=${yFrom}-01-01` : '',
    yTo ? `primary_release_date.lte=${yTo}-12-31` : '',
    runtime?.lte ? `with_runtime.lte=${runtime.lte}` : '',
    runtime?.gte ? `with_runtime.gte=${runtime.gte}` : '',
    'page=1',
    'include_adult=false'
  ].filter(Boolean).join('&');
  const data = await j(`${base}?${qp}`, locale);
  const out = (data.results || []);
  out.forEach(x => (x.media_type = media, x.__src = 'discover'));
  return out;
}

// ---- Ranking / Scoring ----
function scoreItem (it, want) {
  // Base score emphasises quality: vote_average + vote_count + popularity
  let s = (it.vote_average || 0) * 24 + (it.popularity || 0) + (it.vote_count || 0) * 0.02;

  const genresOf = (it.genre_ids || []).map(id => {
    for (const [k, v] of Object.entries(GENRE_MAP)) if (v === id) return k;
    return null;
  }).filter(Boolean);

  // Genre overlap boost
  if (want.genres?.length && genresOf.length) {
    const overlap = genresOf.filter(g => want.genres.includes(g)).length;
    s += overlap * 75;
  }

  // Keyword / vibe signals
  const text = `${(it.title||it.name||'')}\n${(it.overview||'')}`.toLowerCase();
  const kw = new Set(want.keywords || []);
  if (want.flags?.twisty) kw.add('twist');
  if (want.flags?.investigative) { kw.add('investigation'); kw.add('detective'); kw.add('mystery'); }
  if (want.flags?.realBased) { kw.add('true story'); kw.add('biopic'); }
  kw.forEach(k => { if (k && text.includes(k)) s += 18; });

  // Thematic biases
  if (genresOf.includes('thriller') || /suspense/.test(text)) s += 20;
  if (genresOf.includes('mystery')) s += 16;
  if (genresOf.includes('family') || /family/.test(text)) s += 12;
  if (want.flags?.feelGood) {
    if (genresOf.includes('comedy') || genresOf.includes('romance') || /feel[-\s]?good|heartwarming|wholesome|uplifting/i.test(text)) s += 22;
    if (genresOf.includes('horror') || /gore|violent|disturbing/i.test(text)) s -= 25;
  }
  if (want.flags?.timePass && (genresOf.includes('comedy') || /fun|entertaining|light-?hearted/i.test(text))) s += 16;
  if (want.flags?.sadEnding && (/tragic|tear|heartbreak|sad/i.test(text) || genresOf.includes('drama'))) s += 16;
  if (want.flags?.psych && (/psychological|mind\s*game/i.test(text))) s += 18;

  // Superhero drift penalty for serious/crime/thriller intents
  const superheroish = /avengers?|marvel|dc|super\s*man|batman|spider-?man|iron\s*man|wolverine|deadpool/i.test(text);
  const wantsSerious = want.flags?.actionThrill || want.flags?.investigative || want.flags?.realBased || want.genres.includes('thriller') || want.genres.includes('crime') || want.genres.includes('mystery') || want.flags?.dark || want.flags?.psych || want.flags?.twisty;
  if (wantsSerious && superheroish) s -= 65;

  // Recency push around 2025
  const yStr = (it.release_date || it.first_air_date || '').slice(0,4);
  if (yStr) {
    const y = Number(yStr);
    const dist = Math.abs(2025 - y);
    s += Math.max(0, 40 - dist * 4);
  }

  // Language fit boost / mismatch penalty when user explicitly asked
  if (Array.isArray(want.includeLanguages) && want.includeLanguages.length) {
    const lang = (it.original_language || '').toLowerCase();
    const match = want.includeLanguages.some(l => l.toLowerCase() === lang);
    if (match) s += want.explicitLangLock ? 42 : 10;
    else if (want.explicitLangLock) s -= 45;
  }

  // Source preference: similar > discover > search
  if (it.__src === 'similar') s += 28;
  else if (it.__src === 'discover') s += 10;

  return s;
}

/* --------- Language top-up helper (ensures enough Hindi/Punjabi/etc at top) --------- */
async function topUpByLanguage(pool, want, tmdbLocale) {
  if (!want.explicitLangLock || !Array.isArray(want.includeLanguages) || !want.includeLanguages.length) return pool;

  const targetLangs = want.includeLanguages.slice(0, 4);
  const have = pool.filter(it => targetLangs.includes((it.original_language||'').toLowerCase()));
  if (have.length >= 12) return pool; // already enough

  // Add one strong discover page per target language to fill gaps
  const mediaSet = want.mediaType === 'tv' ? ['tv'] : ['movie'];
  for (const media of mediaSet) {
    for (const lang of targetLangs) {
      try {
        const arr = await discoverPass({
          media,
          genres: want.genres || [],
          lang,
          yFrom: want.yearRange?.from || null,
          yTo: want.yearRange?.to || null,
          minVotes: Math.max(300, want.quality?.minVotes || 200),
          sort: 'vote_average.desc',
          runtime: want.runtime || {}
        }, tmdbLocale);
        pool = pool.concat(arr);
      } catch {}
    }
  }
  return dedupe(pool);
}

// =============================
// Main entry (Movie/TV prompts)
// =============================
export async function promptSearch (prompt, { type = 'movie', langHint, yearHint, ai } = {}) {
  // 1) Parse + fuse AI
  let want = parsePrompt(prompt, { type, langHint, yearHint });
  want = fuseAI(want, ai);

  // For “Hindi…” / “Punjabi…” etc., prefer those languages strictly at top
  const langSet = new Set((want.includeLanguages || []).map(l => l.toLowerCase()));

  // 2) Build pool
  const tmdbLocale = (langHint ? `${langHint}-US` : pickLocaleForQuery(prompt));
  let pool = [];
  const mediaCandidates = want.mediaType === 'tv' ? ['tv', 'movie'] : ['movie', 'tv'];

  // a) SIMILAR (typed title)
  if (want.strategy === 'similar' && want.titleCandidates.length) {
    for (const cand of want.titleCandidates.slice(0, 4)) {
      for (const media of mediaCandidates) {
        const hit = await searchTitle(cand.title, cand.year || null, media, tmdbLocale).catch(()=>null);
        if (hit && hit.id) {
          const arr = await similarPlusRec(hit.id, media, tmdbLocale);
          pool = pool.concat(arr);
        }
      }
    }
  }

  // b) SIMILAR from AI liked_titles
  if (ai && Array.isArray(ai.liked_titles) && ai.liked_titles.length) {
    for (const t of ai.liked_titles.slice(0, 4)) {
      for (const media of mediaCandidates) {
        const hit = await searchTitle(t, null, media, tmdbLocale).catch(()=>null);
        if (hit && hit.id) {
          pool = pool.concat(await similarPlusRec(hit.id, media, tmdbLocale));
        }
      }
    }
  }

  // c) DISCOVER (genres/language/year/runtime)
  const langs = (want.includeLanguages && want.includeLanguages.length) ? want.includeLanguages.slice(0, 4) : ['en','hi'];
  const discoverMediaSet = new Set();
  if (want.mediaType === 'tv') discoverMediaSet.add('tv'); else if (want.mediaType === 'movie') discoverMediaSet.add('movie'); else { discoverMediaSet.add('movie'); discoverMediaSet.add('tv'); }

  for (const media of Array.from(discoverMediaSet)) {
    const discoverGenres = (want.genres && want.genres.length) ? want.genres
      : normalizeGenres([...(ai?.genres||[])]).slice(0, 4);

    for (const lang of langs) {
      const arr = await discoverPass({
        media,
        genres: discoverGenres,
        lang,
        yFrom: want.yearRange?.from || null,
        yTo: want.yearRange?.to || null,
        minVotes: want.quality?.minVotes || 200,
        sort: want.quality?.sort || 'popularity.desc',
        runtime: want.runtime || {}
      }, tmdbLocale).catch(()=>[]);
      pool = pool.concat(arr);
    }
  }

  // d) SEARCH fallback (plain title/phrase)
  if (!pool.length) {
    const q = (want.queryHint || want.titleCandidates?.[0]?.title || String(prompt||'')).trim();
    if (q) pool = pool.concat(await searchMultiRaw(q, 1, tmdbLocale).catch(()=>[]));
  }

  // e) Language top-up to guarantee Hindi/Punjabi/South focus if asked
  pool = await topUpByLanguage(pool, want, tmdbLocale);

  // 3) Rank + enforce language preference when explicitly asked
  pool = dedupe(pool);
  pool.forEach(it => (it.__score = scoreItem(it, want)));
  pool.sort((a, b) => (b.__score || 0) - (a.__score || 0));

  if (want.explicitLangLock && langSet.size) {
    const match = pool.filter(it => langSet.has((it.original_language || '').toLowerCase()));
    const non   = pool.filter(it => !langSet.has((it.original_language || '').toLowerCase()));
    // If we have enough matches, keep them first; otherwise blend but still start with matches
    pool = match.concat(non);
    // If still too few matches, trim later but keep as many matches as possible
  }

  // 4) Final trim — high quality slice
  return pool.slice(0, 24);
}
