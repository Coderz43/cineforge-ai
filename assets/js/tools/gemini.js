// File: /assets/js/tools/gemini.js
// Minimal Gemini v1 wrapper (browser), free-tier friendly, with model fallback.

// ---------- env / key ----------
const viteEnv = (() => { try { return import.meta?.env || {}; } catch { return {}; } })();

let KEY =
  (typeof window !== 'undefined' && window.CINEFORGE_GEMINI_KEY && String(window.CINEFORGE_GEMINI_KEY).trim()) ||
  (typeof window !== 'undefined' && new URLSearchParams(location.search).get('geminiKey')) ||
  (typeof localStorage !== 'undefined' && localStorage.getItem('cf.geminiKey')) ||
  viteEnv.VITE_GEMINI_API_KEY ||
  viteEnv.GEMINI_API_KEY ||
  '';

KEY = (KEY || '').trim();
if (KEY && typeof window !== 'undefined') window.GEMINI_API_KEY = KEY;

// ---------- models / endpoint ----------
function normalize(model) {
  return (model || '').replace(/-latest$/i, '').trim();
}

const rawPref =
  (typeof window !== 'undefined' && window.CINEFORGE_GEMINI_MODEL) ||
  viteEnv.VITE_GEMINI_MODEL ||
  '';

const CANDIDATES = [
  normalize(rawPref) || null,
  'gemini-2.0-flash',  // tools default
  'gemini-1.5-pro'
].filter(Boolean);

const V1_URL = (m) => `https://generativelanguage.googleapis.com/v1/models/${m}:generateContent`;

// ---------- utils ----------
function withTimeout(p, ms = 20000) {
  let id;
  const t = new Promise((_, rej) => { id = setTimeout(() => rej(new Error('Gemini request timed out')), ms); });
  return Promise.race([p.finally(() => clearTimeout(id)), t]);
}

async function fetchJSON(url, opts, { retries = 1 } = {}) {
  try {
    const res = await withTimeout(fetch(url, opts));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error?.message || res.statusText || `HTTP ${res.status}`);
      err.__status = res.status;
      err.__body = data;
      throw err;
    }
    return data;
  } catch (e) {
    if (retries > 0) return fetchJSON(url, opts, { retries: retries - 1 });
    throw e;
  }
}

function extractText(resp) {
  const parts = resp?.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p?.text || '').join('\n').trim();
}

// Single-message body so every model accepts it (no systemInstruction field, v1-safe).
function buildBody({ system = '', user = '', json = false }) {
  const joined = `${system ? `SYSTEM:\n${system}\n\n` : ''}${user ? `USER:\n${user}` : ''}`.trim() || 'OK';
  return {
    contents: [{ role: 'user', parts: [{ text: joined }] }],
    generationConfig: json
      ? { temperature: 0.2, topP: 0.95, topK: 40, maxOutputTokens: 2048 } // no responseMimeType on v1
      : { temperature: 0.7, topP: 0.95, topK: 40, maxOutputTokens: 2048 }
  };
}

// Try each model until one succeeds; fallback on 404/403/unsupported.
async function callDirectWithFallback(body) {
  if (!KEY) throw new Error('Missing API key');

  let lastErr;
  for (const model of CANDIDATES) {
    try {
      const data = await fetchJSON(
        `${V1_URL(model)}?key=${encodeURIComponent(KEY)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      console.info('[gemini] using model →', model);
      return extractText(data);
    } catch (e) {
      const msg = String(e?.message || '');
      const status = e?.__status || 0;
      const unsupported =
        /not found|unsupported|permission|denied|unavailable/i.test(msg) || status === 404 || status === 403;
      console.warn(`[gemini] model failed: ${model} →`, msg);
      lastErr = e;
      if (!unsupported) break; // other errors: stop retrying
    }
  }
  throw lastErr || new Error('All Gemini model attempts failed');
}

// Optional proxy (only if you wire /api/gemini)
async function callProxy(body, modelHint = CANDIDATES[0]) {
  const url = '/api/gemini';
  try {
    const r = await fetchJSON(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, model: modelHint })
    });
    return (r?.text || r?.result || extractText(r) || '').trim();
  } catch {
    const prompt = body?.contents?.[0]?.parts?.[0]?.text || '';
    const r2 = await fetchJSON(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model: modelHint })
    });
    return (r2?.text || r2?.result || extractText(r2) || '').trim();
  }
}

// ---------- public API ----------
export async function generateText(prompt) {
  const body = buildBody({ user: String(prompt || '') });
  try {
    if (window.GEMINI_API_KEY) return await callDirectWithFallback(body);
    throw new Error('no-browser-key');
  } catch (e) {
    console.warn('[gemini] direct failed → proxy', e?.message || e);
    return await callProxy(body);
  }
}

export async function aiComplete({ system = '', user = '', json = false } = {}) {
  const body = buildBody({ system, user, json });
  try {
    if (window.GEMINI_API_KEY) return await callDirectWithFallback(body);
    throw new Error('no-browser-key');
  } catch (e) {
    console.warn('[gemini] direct failed → proxy', e?.message || e);
    return await callProxy(body);
  }
}

// Debug helpers
export async function listModels() {
  const r = await fetchJSON(
    `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(KEY)}`,
    { method: 'GET' }
  );
  const names = (r?.models || []).map(m => m?.name?.split('/').pop()).filter(Boolean);
  console.table(names);
  return names;
}

export async function testAiConnectivity() {
  const txt = await aiComplete({ user: 'Reply with OK.' });
  console.log('[gemini:test] →', txt);
  return txt;
}

console.info('[CineForge] gemini.js ready → candidates:', CANDIDATES.join(', '), ' key present:', !!KEY);
