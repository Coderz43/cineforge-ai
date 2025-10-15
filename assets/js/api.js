// /assets/js/api.js
// Client-side API helpers.
// Local dev (Vite/localhost): hit TMDB directly.
// Production (Vercel): use /api/* serverless proxies.

import {
  imageSuggest as localImageSuggest,
  identifyFromImages as localIdentifyFromImages,
} from './image-ident.js';

const TMDB = 'https://api.themoviedb.org/3';

// ✅ Force dev on localhost/Vite
const IS_DEV = true;

// ✅ Local hardcoded key as fallback (ONLY for local dev)
const LOCAL_TMDB = 'a17342e383db7fa9b222dcb41f49afe2'; // your TMDB v3 key

// Try env first, else fallback
const DEV_TMDB = (import.meta?.env?.VITE_TMDB_READONLY_KEY || LOCAL_TMDB).trim();

console.log('[CineForge] api init', {
  IS_DEV,
  DEV_TMDB: DEV_TMDB ? '***set***' : null,
});

// ---------- cache ----------
const _providersCache = new Map(); // key = `${media}:${id}:${region}`

/* ---------- utils ---------- */
function parseTypeAndPage(type, page) {
  if (typeof type === 'string' && type.includes('&page=')) {
    const m = type.match(/^([^&]+)&page=(\d+)/);
    if (m) return { type: m[1], page: Number(m[2]) || page || 1 };
  }
  return { type, page: page || 1 };
}

async function safeFetch(url, { method = 'GET', headers = {}, body, timeout = 8000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { method, headers, body, signal: ctrl.signal });
    if (!res.ok) {
      let msg = '';
      try {
        const err = await res.json();
        msg = err.status_message || JSON.stringify(err);
      } catch {}
      throw new Error(`HTTP ${res.status} ${msg}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// multipart (prod imageSuggest)
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

/* ---------- image normalization helpers ---------- */

// Normalize **any** input to a single File (prefer PNG)
async function normalizeToSingleFile(input) {
  if (!input) return null;
  if (Array.isArray(input) && input.length) {
    return normalizeToSingleFile(input[0]);
  }
  if (typeof input === 'string') {
    return await fetchImageAsPngFile(input, guessNameFromUrl(input));
  }
  if (input instanceof File || input instanceof Blob) {
    const f = input instanceof File ? input : new File([input], 'image', { type: input.type || 'application/octet-stream' });
    return await toPngFile(f); // ensure PNG
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

/* ---------- AI suggest (skip in dev) ---------- */
export async function aiSuggest(text, mode = 'describe') {
  if (IS_DEV) {
    return { mediaType: 'both', query: text, genres: [] };
  }
  return await safeFetch('/api/suggest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, mode }),
    timeout: 7000,
  });
}

/* ---------- Image → query helper ---------- */
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

// expose bulk helper
export const identifyFromImages = localIdentifyFromImages;

/* ---------- TMDB search ---------- */
export async function searchTMDB(query, type = 'multi', page = 1, strict = false) {
  const q = (query || '').trim();
  if (!q) return { page: 1, results: [], total_pages: 0, total_results: 0 };

  const parsed = parseTypeAndPage(type, page);
  const t = (parsed.type || 'multi').toLowerCase();
  const p = parsed.page || 1;

  if (IS_DEV) {
    const base = t === 'movie' || t === 'tv' ? `${TMDB}/search/${t}` : `${TMDB}/search/multi`;
    const url = `${base}?query=${encodeURIComponent(q)}&include_adult=false&language=en-US&page=${p}&api_key=${DEV_TMDB}`;
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

  // Prod path
  const url = `/api/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(t)}&page=${p}`;
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

/* ---- Thin alias useful for typeahead ---- */
export function quickSearch(query, page = 1) {
  return searchTMDB(query, 'multi', page);
}

/* ---------- TMDB genres ---------- */
export async function getGenres() {
  const [movie, tv] = await Promise.all([
    safeFetch(`${TMDB}/genre/movie/list?language=en-US&api_key=${DEV_TMDB}`, { timeout: 8000 }),
    safeFetch(`${TMDB}/genre/tv/list?language=en-US&api_key=${DEV_TMDB}`, { timeout: 8000 }),
  ]);
  return { movie: movie.genres, tv: tv.genres };
}

/* ---------- TMDB videos ---------- */
export async function getVideos(id, media = 'movie') {
  const m = media === 'tv' ? 'tv' : 'movie';
  const url = `${TMDB}/${m}/${id}/videos?language=en-US&api_key=${DEV_TMDB}`;
  return await safeFetch(url, { timeout: 8000 });
}

/* ---------- TMDB watch providers ---------- */
export async function getWatchProviders(id, media = 'movie', region = 'US') {
  const m = media === 'tv' ? 'tv' : 'movie';
  const key = `${m}:${id}:${region}`;
  if (_providersCache.has(key)) {
    return _providersCache.get(key);
  }

  const url = `${TMDB}/${m}/${id}/watch/providers?api_key=${DEV_TMDB}`;
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

/* ---------- Back-compat alias ---------- */
export { getWatchProviders as getProviders };

/* ---------- TMDB person ---------- */
export async function getPerson(id) {
  const url = `${TMDB}/person/${id}?append_to_response=images&language=en-US&api_key=${DEV_TMDB}`;
  return await safeFetch(url, { timeout: 8000 });
}

/* ---------- TMDB person credits ---------- */
export async function getPersonCredits(id) {
  const url = `${TMDB}/person/${id}/combined_credits?language=en-US&api_key=${DEV_TMDB}`;
  return await safeFetch(url, { timeout: 8000 });
}
