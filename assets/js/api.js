// /assets/js/api.js
// Client-side API helpers for CineForge.
// ─ Dev (Vite/localhost): call TMDB directly.
// ─ Prod (Vercel or any hosted env): use /api/* serverless proxies for TMDB & Gemini.
// NOTE: This file does NOT alter Describe-mode logic anywhere; it only provides helpers
// for the Movie/TV feature and shared utilities.

import {
  imageSuggest as localImageSuggest,
  identifyFromImages as localIdentifyFromImages,
} from './image-ident.js';

const TMDB = 'https://api.themoviedb.org/3';

// Detect dev vs prod intelligently
const IS_VITE_DEV = typeof import.meta !== 'undefined' && !!import.meta?.env?.DEV;
const IS_LOCALHOST = (typeof window !== 'undefined') && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
export const IS_DEV = IS_VITE_DEV || IS_LOCALHOST;

// Keys: prefer Vite env, fallback to local constant (dev-only)
const LOCAL_TMDB = 'a17342e383db7fa9b222dcb41f49afe2';
export const TMDB_KEY = (import.meta?.env?.VITE_TMDB_READONLY_KEY || LOCAL_TMDB).trim();

if (typeof window !== 'undefined') {
  // Expose for quick console testing
  window.CF_TMDB_KEY = TMDB_KEY;
  window.TMDB_API_KEY = TMDB_KEY;
}

const _providersCache = new Map();

/* ---------------- Utils ---------------- */
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function parseTypeAndPage(type, page) {
  if (typeof type === 'string' && type.includes('&page=')) {
    const m = type.match(/^([^&]+)&page=(\d+)/);
    if (m) return { type: m[1], page: Number(m[2]) || page || 1 };
  }
  return { type, page: page || 1 };
}

export async function safeFetch(url, { method = 'GET', headers = {}, body, timeout = 8000, retries = 2 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { method, headers, body, signal: ctrl.signal });
    if (!res.ok) {
      if (retries > 0 && (res.status === 429 || (res.status >= 500 && res.status <= 599))) {
        await sleep(400 * (3 - retries));
        return safeFetch(url, { method, headers, body, timeout, retries: retries - 1 });
      }
      let msg = '';
      try { const err = await res.json(); msg = err.status_message || JSON.stringify(err); }
      catch { try { msg = await res.text(); } catch {} }
      throw new Error(`HTTP ${res.status} ${msg}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function postForm(url, formData, timeout = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { method: 'POST', body: formData, signal: ctrl.signal });
    if (!res.ok) {
      let msg = '';
      try { msg = await res.text(); } catch {}
      throw new Error(`HTTP ${res.status} ${msg || 'upload failed'}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/* ---------- Image normalization (PNG) ---------- */
async function normalizeToSingleFile(input) {
  if (!input) return null;
  if (Array.isArray(input) && input.length) return normalizeToSingleFile(input[0]);
  if (typeof input === 'string') return await fetchImageAsPngFile(input, guessNameFromUrl(input));
  if (input instanceof File || input instanceof Blob) {
    const f = input instanceof File ? input : new File([input], 'image', { type: input.type || 'application/octet-stream' });
    return await toPngFile(f);
  }
  return null;
}

function guessNameFromUrl(url) {
  try {
    const u = new URL(url, location.href);
    const base = (u.pathname.split('/').pop() || 'image').split('?')[0];
    return base.replace(/\.[^.]+$/, '') + '.png';
  } catch {
    return 'image.png';
  }
}

async function toPngFile(file) {
  const alreadyPng = (file.type || '').toLowerCase() === 'image/png' && /\.png$/i.test(file.name || '');
  if (alreadyPng) return file;

  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = dataUrl;
  });

  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width || 1;
  c.height = img.naturalHeight || img.height || 1;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, c.width, c.height);

  const pngBlob = await new Promise((resolve) => c.toBlob(resolve, 'image/png'));
  const base = (file.name || 'upload').replace(/\.[a-z0-9]+$/i, '');
  return new File([pngBlob], `${base}.png`, { type: 'image/png' });
}

function _loadImageFromObjectURL(objectURL) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.crossOrigin = 'anonymous';
    img.src = objectURL;
  });
}

export async function fetchImageAsPngFile(url, name = 'image.png') {
  const res = await fetch(url, { mode: 'cors' }).catch(() => null);
  if (!res || !res.ok) throw new Error('fetchImageAsPngFile: fetch failed');
  const blob = await res.blob();

  if (/^image\/png$/i.test(blob.type)) {
    const pngName = (name || 'image.png').split('?')[0].replace(/\.[^.]+$/, '') + '.png';
    return new File([blob], pngName, { type: 'image/png' });
  }

  const objectURL = URL.createObjectURL(blob);
  try {
    const img = await _loadImageFromObjectURL(objectURL);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width || 1;
    c.height = img.naturalHeight || img.height || 1;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const pngBlob = await new Promise((resolve) => c.toBlob(resolve, 'image/png'));
    const fileName = (name || 'image.png').split('?')[0].replace(/\.[^.]+$/, '') + '.png';
    return new File([pngBlob], fileName, { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(objectURL);
  }
}

export async function fetchImageAsFile(url, name = 'poster.png') {
  return fetchImageAsPngFile(url, name);
}

/* --------- AI suggest (Gemini via serverless in prod; mock in dev) --------- */
function ensureLangPrefsFromText(q, obj) {
  const out = { ...(obj || {}) };
  const prefs = new Set(Array.isArray(out.language_prefs) ? out.language_prefs : []);
  const low = String(q || '').toLowerCase();

  // Hindi / Bollywood bias
  const hasDevanagari = /[\u0900-\u097F]/.test(q);
  if (low.includes('hindi') || low.includes('bollywood') || hasDevanagari) prefs.add('hi');

  // Urdu script → ur
  if (/[\u0600-\u06FF]/.test(q) || low.includes('urdu')) prefs.add('ur');

  // English explicit
  if (low.includes('english') || low.includes('hollywood')) prefs.add('en');

  // Default blend (helps mixing prompts)
  if (!prefs.size) { prefs.add('en'); }

  out.language_prefs = Array.from(prefs);
  return out;
}

export async function aiSuggest(text, mode = 'describe') {
  const q = (text || '').trim();
  if (!q) {
    return {
      mediaType: 'both',
      query: '',
      liked_titles: [],
      genres: [],
      vibes: [],
      mixes: [],
      language_prefs: [],
      region_prefs: [],
      include_people: { cast: [], crew: [] },
      year: null,
      exclude: [],
      min_vote_average: null
    };
  }

  if (IS_DEV) {
    // Dev-friendly minimal structure; real shaping happens on server in prod.
    return ensureLangPrefsFromText(q, {
      mediaType: 'both',
      query: q,
      liked_titles: [],
      genres: [],
      vibes: [],
      mixes: [],
      language_prefs: [],
      region_prefs: [],
      include_people: { cast: [], crew: [] },
      year: null,
      exclude: [],
      min_vote_average: null
    });
  }

  const res = await safeFetch('/api/suggest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: q, mode }),
    timeout: 9000,
  });

  // Force-add Hindi/English prefs if hinted in text
  return ensureLangPrefsFromText(q, res || {});
}

/* --------- Image → query helper --------- */
export async function imageSuggest(fileOrFiles) {
  const png = await normalizeToSingleFile(fileOrFiles);
  if (!png) return { query: '', mediaType: 'both', guesses: [] };

  if (IS_DEV) {
    try {
      const out = await localImageSuggest(png);
      const q = (out?.query || '').trim();
      return { query: q, mediaType: out?.mediaType || 'both', guesses: out?.guesses || [] };
    } catch (e) {
      console.warn('[CineForge] localImageSuggest failed (dev)', e);
      return { query: '', mediaType: 'both', guesses: [] };
    }
  }

  const fd = new FormData();
  fd.append('image', png, png.name || 'upload.png');
  try {
    const out = await postForm('/api/image-suggest', fd, 15000);
    const q = (out?.query || '').trim();
    return { query: q, mediaType: out?.mediaType || 'both', guesses: out?.guesses || [] };
  } catch (err) {
    console.warn('[CineForge] imageSuggest (prod) failed:', err);
    return { query: '', mediaType: 'both', guesses: [] };
  }
}

// Multi-image OCR (dev)
export const identifyFromImages = localIdentifyFromImages;

/* --------- Language / intent helpers (shared) --------- */
const LANG_WORDS = {
  hindi: 'hi', urdu: 'ur', malayalam: 'ml', tamil: 'ta', telugu: 'te', kannada: 'kn',
  punjabi: 'pa', marathi: 'mr', bengali: 'bn', gujarati: 'gu', english: 'en',
  korean: 'ko', japanese: 'ja', chinese: 'zh'
};

function pickLocaleForQuery(q) {
  if (/[\u0900-\u097F]/.test(q)) return 'hi-IN';   // Devanagari → Hindi
  if (/[\u0600-\u06FF]/.test(q)) return 'ur-PK';   // Arabic script → Urdu
  return 'en-US';
}

// Extra intent helpers (cover “bollywood”, “south indian” phrases)
function wantsBollywood(low) {
  return /\bbollywood\b/.test(low) || /\bhindi\b/.test(low) || /[\u0900-\u097F]/.test(low);
}
function wantsSouthIndian(low) {
  return /\bsouth\s*indian\b/.test(low) || /\bsouth\s*hits?\b/.test(low);
}
function mediaHint(low) {
  const tv = /\b(tv|series|season|episodes?)\b/.test(low);
  const mv = /\b(movie|movies|film|films|cinema)\b/.test(low);
  return tv ? 'tv' : (mv ? 'movie' : 'movie');
}

// “hindi movies”, “urdu tv shows”, etc → single-language discover
function detectLanguageDiscover(q) {
  const low = (q || '').toLowerCase().trim();
  const langWord = Object.keys(LANG_WORDS).find(w => low.includes(w));
  if (!langWord) return null;

  const media = mediaHint(low);
  return { lang: LANG_WORDS[langWord], media };
}

// multi-language discover pass (e.g., “south indian action”)
function detectMultiLangBundle(q) {
  const low = (q || '').toLowerCase();
  if (wantsSouthIndian(low)) {
    // Tamil/Telugu/Malayalam/Kannada
    return { langs: ['ta','te','ml','kn'], media: mediaHint(low) };
  }
  if (/\bpunjabi\b/.test(low)) return { langs: ['pa'], media: mediaHint(low) };
  if (/\bbollywood\b/.test(low)) return { langs: ['hi'], media: mediaHint(low) };
  return null;
}

async function discoverByLanguage({ lang, media = 'movie', page = 1, locale = 'en-US' }) {
  const base = `${TMDB}/discover/${media}`;
  const qp = [
    `with_original_language=${encodeURIComponent(lang)}`,
    `include_adult=false`,
    `language=${encodeURIComponent(locale)}`,
    `sort_by=vote_average.desc`,
    `vote_count.gte=200`,
    `page=${page}`
  ].join('&');

  if (IS_DEV) {
    const url = `${base}?${qp}&api_key=${TMDB_KEY}`;
    return safeFetch(url, { timeout: 9000 });
  }
  const url = `/api/discover?media=${encodeURIComponent(media)}&${qp}`;
  return safeFetch(url, { timeout: 9000 });
}

function dedupeResults(items) {
  const seen = new Set();
  return (items || []).filter(x => {
    const media = String(x.media_type || (x.first_air_date ? 'tv' : 'movie'));
    const id = x?.id != null ? String(x.id) : '';
    if (!id) return false;
    const key = `${media}:${id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ---------------- TMDB search core ---------------- */
export async function searchTMDB(query, type = 'multi', page = 1, strict = false) {
  const q = (query || '').trim();
  if (!q) return { page: 1, results: [], total_pages: 0, total_results: 0 };

  const parsed = parseTypeAndPage(type, page);
  const tRaw = (parsed.type || 'multi').toLowerCase();
  const t = (tRaw === 'both') ? 'multi' : tRaw;
  const p = parsed.page || 1;
  const locale = pickLocaleForQuery(q);
  const low = q.toLowerCase();

  // PRIORITY 1: explicit multi-language bundles (e.g., “south indian action”)
  const multi = detectMultiLangBundle(q);
  if (multi) {
    const media = multi.media;
    const settled = await Promise.allSettled(
      multi.langs.map(lang => discoverByLanguage({ lang, media, page: p, locale }))
    );
    const merged = [];
    settled.forEach(s => {
      if (s.status === 'fulfilled' && s.value?.results) {
        merged.push(...s.value.results.map(x => ({ ...x, media_type: media })));
      }
    });
    const results = dedupeResults(merged);
    return {
      page: p,
      results,
      total_pages: 1,
      total_results: results.length
    };
  }

  // PRIORITY 2: “hindi / tamil / telugu / …” words → single-language discover
  const langIntent = detectLanguageDiscover(q);
  if (langIntent) {
    const data = await discoverByLanguage({ lang: langIntent.lang, media: langIntent.media, page: p, locale });
    const results = (data.results || []).map(x => ({ ...x, media_type: langIntent.media }));
    return { page: p, results, total_pages: data.total_pages || 1, total_results: data.total_results || results.length };
  }

  // PRIORITY 3: “bollywood” keyword → Hindi discover (even if “hindi” absent)
  if (wantsBollywood(low)) {
    const media = mediaHint(low);
    const data = await discoverByLanguage({ lang: 'hi', media, page: p, locale });
    const results = (data.results || []).map(x => ({ ...x, media_type: media }));
    return { page: p, results, total_pages: data.total_pages || 1, total_results: data.total_results || results.length };
  }

  // NORMAL SEARCH
  if (IS_DEV) {
    const base = (t === 'movie' || t === 'tv') ? `${TMDB}/search/${t}` : `${TMDB}/search/multi`;
    const url = `${base}?query=${encodeURIComponent(q)}&include_adult=false&language=${encodeURIComponent(locale)}&page=${p}&api_key=${TMDB_KEY}`;
    const data = await safeFetch(url, { timeout: 9000 });

    if (strict && data?.results?.length) {
      const normQ = q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      data.results = data.results.filter(r =>
        (r.title || r.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === normQ
      );
      data.total_results = data.results.length;
      data.total_pages = 1;
    }
    return data;
  }

  const url = `/api/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(t)}&page=${p}&lang=${encodeURIComponent(locale)}`;
  const data = await safeFetch(url, { timeout: 9000 });
  if (strict && data?.results?.length) {
    const normQ = q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    data.results = data.results.filter(r =>
      (r.title || r.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === normQ
    );
    data.total_results = data.results.length;
    data.total_pages = 1;
  }
  return data;
}

export const quickSearch = (query, page = 1) => searchTMDB(query, 'multi', page);

/* ---------------- Genres ---------------- */
export async function getGenres() {
  if (IS_DEV) {
    const [movie, tv] = await Promise.all([
      safeFetch(`${TMDB}/genre/movie/list?language=en-US&api_key=${TMDB_KEY}`, { timeout: 8000 }),
      safeFetch(`${TMDB}/genre/tv/list?language=en-US&api_key=${TMDB_KEY}`, { timeout: 8000 }),
    ]);
    return { movie: movie.genres, tv: tv.genres };
  }
  const data = await safeFetch('/api/genres', { timeout: 8000 });
  return { movie: data?.movie || [], tv: data?.tv || [] };
}

/* ---------------- Videos ---------------- */
export async function getVideos(id, media = 'movie') {
  const m = media === 'tv' ? 'tv' : 'movie';
  if (IS_DEV) {
    const url = `${TMDB}/${m}/${id}/videos?language=en-US&api_key=${TMDB_KEY}`;
    return await safeFetch(url, { timeout: 8000 });
  }
  const url = `/api/videos?media=${encodeURIComponent(m)}&id=${encodeURIComponent(id)}&lang=en-US`;
  return await safeFetch(url, { timeout: 8000 });
}

/* ------------- Watch providers ------------- */
export async function getWatchProviders(id, media = 'movie', region = 'US') {
  const m = media === 'tv' ? 'tv' : 'movie';
  const key = `${m}:${id}:${region}`;
  if (_providersCache.has(key)) return _providersCache.get(key);

  if (IS_DEV) {
    const url = `${TMDB}/${m}/${id}/watch/providers?api_key=${TMDB_KEY}`;
    const data = await safeFetch(url, { timeout: 8000 });
    const r = data?.results?.[region] || null;
    const out = !r
      ? { free: [], flatrate: [], rent: [], buy: [], link: null }
      : {
          free: r.free || [],
          flatrate: r.flatrate || [],
          rent: r.rent || [],
          buy: r.buy || [],
          link: r.link || null,
        };
    _providersCache.set(key, out);
    return out;
  }

  const data = await safeFetch(`/api/providers?media=${encodeURIComponent(m)}&id=${encodeURIComponent(id)}`, { timeout: 8000 });
  const r = data?.results?.[region] || null;
  const out = !r
    ? { free: [], flatrate: [], rent: [], buy: [], link: null }
    : {
        free: r.free || [],
        flatrate: r.flatrate || [],
        rent: r.rent || [],
        buy: r.buy || [],
        link: r.link || null,
      };
  _providersCache.set(key, out);
  return out;
}
export { getWatchProviders as getProviders };

/* ---------------- Details / Person ---------------- */
export async function getPerson(id) {
  if (IS_DEV) {
    const url = `${TMDB}/person/${id}?append_to_response=images&language=en-US&api_key=${TMDB_KEY}`;
    return await safeFetch(url, { timeout: 8000 });
  }
  return await safeFetch(`/api/person?id=${encodeURIComponent(id)}&append=images&lang=en-US`, { timeout: 8000 });
}

export async function getPersonCredits(id) {
  if (IS_DEV) {
    const url = `${TMDB}/person/${id}/combined_credits?language=en-US&api_key=${TMDB_KEY}`;
    return await safeFetch(url, { timeout: 8000 });
  }
  return await safeFetch(`/api/person-credits?id=${encodeURIComponent(id)}&lang=en-US`, { timeout: 8000 });
}

export async function tmdbDetails(mediaType, id, lang = 'en-US') {
  const m = mediaType === 'tv' ? 'tv' : 'movie';
  if (IS_DEV) {
    const url = `${TMDB}/${m}/${id}?language=${encodeURIComponent(lang)}&api_key=${TMDB_KEY}`;
    return safeFetch(url, { timeout: 8000 });
  }
  return safeFetch(`/api/details?media=${encodeURIComponent(m)}&id=${encodeURIComponent(id)}&lang=${encodeURIComponent(lang)}`, { timeout: 8000 });
}

/* -------- “Movies like <title>” helpers (Movie/TV button flow) -------- */
export async function getSimilar(id, media = 'movie', page = 1, locale = 'en-US') {
  const m = media === 'tv' ? 'tv' : 'movie';
  if (IS_DEV) {
    const url = `${TMDB}/${m}/${id}/similar?language=${encodeURIComponent(locale)}&page=${page}&api_key=${TMDB_KEY}`;
    return await safeFetch(url, { timeout: 9000 });
  }
  const url = `/api/similar?media=${encodeURIComponent(m)}&id=${encodeURIComponent(id)}&page=${page}&lang=${encodeURIComponent(locale)}`;
  return await safeFetch(url, { timeout: 9000 });
}

/** Search a title → pick best match → fetch similar (normalizes media_type). */
export async function similarByTitle(title, mediaHint = 'movie', page = 1) {
  const q = (title || '').trim();
  if (!q) return { title: '', picked: null, similar: { page: 1, results: [] } };

  const locale = pickLocaleForQuery(q);
  const tryTypes = mediaHint === 'tv' ? ['tv', 'movie', 'multi'] : ['movie', 'tv', 'multi'];

  let picked = null;
  let pickedMedia = 'movie';

  for (const t of tryTypes) {
    const data = await searchTMDB(q, t, 1, false);
    const results = data?.results || [];

    const normQ = q.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF\u0900-\u097F]+/g, ' ').trim();
    picked = results.find(r => (r.title || r.name || '').toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF\u0900-\u097F]+/g, ' ').trim() === normQ)
      || results[0];

    if (picked) {
      pickedMedia = (picked.media_type || t) === 'tv' ? 'tv' : 'movie';
      break;
    }
  }

  if (!picked) {
    return { title: q, picked: null, similar: { page: 1, results: [], total_pages: 0, total_results: 0 } };
  }

  const sim = await getSimilar(picked.id, pickedMedia, page, locale);
  const results = (sim?.results || []).map(x => ({ ...x, media_type: pickedMedia }));
  results.sort((a,b) => (b.vote_average||0) - (a.vote_average||0) || (b.popularity||0) - (a.popularity||0));
  return {
    title: q,
    picked: { id: picked.id, title: picked.title || picked.name, media_type: pickedMedia },
    similar: { ...sim, results }
  };
}

/* -------- Console helpers (for quick testing) -------- */
export function cfPrint(v, label='[CF]'){ try{ console.log(label, v); }catch{} return v; }
export function cfTable(v, path='results'){
  try{
    const arr = path && v && typeof v === 'object' ? v[path] : v;
    if (Array.isArray(arr)) {
      console.table(arr.map(r => ({
        id: r.id,
        title: r.title || r.name,
        media: r.media_type || (r.first_air_date ? 'tv' : 'movie'),
        date: r.release_date || r.first_air_date || '',
        vote: r.vote_average,
        pop: r.popularity
      })));
    } else {
      console.log('[CF][table] not an array at path:', path, v);
    }
  } catch {}
  return v;
}

/** Minimal prompt tester for Movie/TV flow (does NOT touch Describe feature). */
export async function promptSearch(input, opts = {}) {
  const q = (input || '').trim();
  const page = Number(opts.page || 1) || 1;

  // “movies like <title> / shows like <title>” or “similar to <title>”
  const likeMatch = q.match(/^\s*(movies?|films?|shows?|series)\s+like\s+(.+)$/i)
                  || q.match(/^\s*similar\s+to\s+(.+)$/i);
  if (likeMatch) {
    const kind = likeMatch[1] || '';
    const title = (likeMatch[2] || likeMatch[1] || '').trim();
    const mediaHint = /show|series/i.test(kind) ? 'tv' : 'movie';
    return similarByTitle(title, mediaHint, page);
  }

  // language discover fallback (e.g., “hindi movies”)
  const langIntent = detectLanguageDiscover(q);
  if (langIntent) {
    const locale = pickLocaleForQuery(q);
    const data = await discoverByLanguage({ lang: langIntent.lang, media: langIntent.media, page, locale });
    const results = (data.results || []).map(x => ({ ...x, media_type: langIntent.media }));
    results.sort((a,b) => (b.vote_average||0) - (a.vote_average||0) || (b.popularity||0) - (a.popularity||0));
    return { page, results, total_pages: data.total_pages || 1, total_results: data.total_results || results.length };
  }

  // default to title search (multi)
  const data = await searchTMDB(q, opts.type || 'multi', page, !!opts.strict);
  data.results = (data.results || []).slice().sort((a,b)=> (b.vote_average||0)-(a.vote_average||0) || (b.popularity||0)-(a.popularity||0));
  return data;
}

// expose helpers in dev
if (typeof window !== 'undefined' && (IS_DEV || window?.location?.hostname)) {
  window.cfPrint = window.cfPrint || cfPrint;
  window.cfTable = window.cfTable || cfTable;
  window.promptSearch = window.promptSearch || promptSearch;
  window.cfTestSimilar = async (title, media='movie', page=1) =>
    similarByTitle(title, media, page).then(cfPrint);
}

export default {
  IS_DEV,
  TMDB_KEY,
  safeFetch,
  aiSuggest,
  imageSuggest,
  identifyFromImages,
  searchTMDB,
  quickSearch,
  getGenres,
  getVideos,
  getWatchProviders,
  getProviders: getWatchProviders,
  getPerson,
  getPersonCredits,
  tmdbDetails,
  getSimilar,
  similarByTitle,
  promptSearch,
};
