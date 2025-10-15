// assets/js/store.js
import { $, $$ } from './utils.js';

const THEME_KEY      = 'cineforge-theme';
const BOOKMARKS_KEY  = 'cineforge-bookmarks';
const MODE_KEY       = 'cineforge-mode';

// Optional: shared key for last-search persistence (sessionStorage)
const LAST_SEARCH_KEY = 'cf:lastSearch:v1';

/* =========================
   THEME (dark / light)
   ========================= */
export function initTheme() {
  // Resolve initial theme
  const saved = safeLocalGet(THEME_KEY);
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  const start = (saved === 'light' || saved === 'dark')
    ? saved
    : (prefersDark ? 'dark' : 'light');

  document.documentElement.setAttribute('data-theme', start);

  // Header year (shared)
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // Theme toggle button (uses stacked sun/moon icons via CSS; no text swap needed)
  const btn = $('#theme-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      safeLocalSet(THEME_KEY, next);
      // icons swap automatically via CSS:
      // :root[data-theme="light"] .icon-sun { opacity:1 } etc.
    });
  }
}

export function getTheme() {
  return safeLocalGet(THEME_KEY) || 'dark';
}
export function setTheme(theme = 'dark') {
  document.documentElement.setAttribute('data-theme', theme);
  safeLocalSet(THEME_KEY, theme);
}

/* =========================
   MODE (describe/title)
   ========================= */
export function getMode() {
  return safeLocalGet(MODE_KEY) || 'describe';
}
export function setMode(m) {
  safeLocalSet(MODE_KEY, m);
}

/* =========================
   BOOKMARKS
   ========================= */
export function getBookmarks() {
  try {
    return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveBookmarks(items) {
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(items));
    // fire a manual event so other tabs/pages can react
    window.dispatchEvent(new StorageEvent('storage', { key: BOOKMARKS_KEY }));
  } catch {}
}

export function toggleBookmark(item) {
  const items = getBookmarks();
  const id = `${item.media_type}-${item.id}`;
  const idx = items.findIndex(x => `${x.media_type}-${x.id}` === id);
  if (idx >= 0) items.splice(idx, 1);
  else items.unshift(item);
  saveBookmarks(items);
  return items;
}

/* =========================
   WATCHERS (cross-tab sync)
   ========================= */
export function onBookmarksChange(cb) {
  // callback whenever bookmarks update (same tab or another tab)
  window.addEventListener('storage', (e) => {
    if (!e || !e.key || e.key === BOOKMARKS_KEY) {
      cb(getBookmarks());
    }
  });
}

/* =========================
   LAST SEARCH (optional)
   - sessionStorage-backed helpers
   - Not required by every page, but handy
   ========================= */
export function setLastSearchState(state) {
  try {
    sessionStorage.setItem(LAST_SEARCH_KEY, JSON.stringify(state));
  } catch {}
}

export function getLastSearchState() {
  try {
    const raw = sessionStorage.getItem(LAST_SEARCH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearLastSearchState() {
  try { sessionStorage.removeItem(LAST_SEARCH_KEY); } catch {}
}

/* =========================
   Safe storage helpers
   ========================= */
function safeLocalGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeLocalSet(key, val) {
  try { localStorage.setItem(key, val); } catch {}
}
