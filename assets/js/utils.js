// assets/js/utils.js

/* ---------- DOM helpers ---------- */
export const $  = (sel, ctx = document) => ctx.querySelector(sel);
export const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

/* ---------- templating / formatting ---------- */
export const html = (strings, ...vals) =>
  strings.reduce((out, s, i) => out + s + (vals[i] ?? ''), '');

export const fmtYear = (s = '') => (s ? String(s).slice(0, 4) : '');

export const img = (p) =>
  p ? `https://image.tmdb.org/t/p/w500${p}` : `https://placehold.co/500x750?text=No+Image`;

/* ---------- misc utils ---------- */
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export const escapeHTML = (str = '') =>
  String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

/* Debounce: group rapid calls (used for typeahead, etc.) */
export function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/* Simple unique-by helper */
export const uniqBy = (arr = [], key = (x) => x) => {
  const seen = new Set();
  const out = [];
  for (const it of arr) {
    const k = key(it);
    if (!seen.has(k)) { seen.add(k); out.push(it); }
  }
  return out;
};

/* Query param reader */
export function getParam(name, url = window.location.href) {
  try {
    const u = new URL(url, window.location.origin);
    return u.searchParams.get(name);
  } catch { return null; }
}

/**
 * Best-effort region code (ISO 3166-1 alpha-2) for TMDB watch providers.
 * - Try navigator.language or Intl locale (e.g., "en-US" → "US")
 * - Fallback to "US" if we can’t detect a country.
 */
export function guessRegion() {
  const lang = (navigator.language || navigator.userLanguage || '').trim();
  if (lang && lang.includes('-')) {
    const cc = lang.split('-').pop();
    if (cc && cc.length === 2) return cc.toUpperCase();
  }
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale || '';
    if (loc.includes('-')) {
      const cc = loc.split('-').pop();
      if (cc && cc.length === 2) return cc.toUpperCase();
    }
  } catch {}
  return 'US';
}

/**
 * Simple toast used across the app.
 * type: "added" | "removed" | "info"
 */
export function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = "toast show";

  let text = message;
  if (type === "added")   text = `Bookmark Added: ${message}`;
  if (type === "removed") text = `Bookmark Removed: ${message}`;

  toast.textContent = text;
  document.body.appendChild(toast);

  // auto dismiss
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 400);
  }, 2000);
}
