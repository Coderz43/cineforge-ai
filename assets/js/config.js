// assets/js/config.js
function pickEnv(...names) {
  for (const n of names) {
    const v = (import.meta.env && import.meta.env[n]) || '';
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

const TMDB_KEY =
  pickEnv('VITE_TMDB_KEY', 'VITE_TMDB_READONLY_KEY', 'TMDB_API_KEY') ||
  (localStorage.getItem('cf.tmdbKey') || '');

const YT_KEY =
  pickEnv('VITE_YT_KEY', 'YT_API_KEY') ||
  (localStorage.getItem('cf.ytKey') || '');

if (!TMDB_KEY) console.warn('[CineForge] TMDB key missing. Add VITE_TMDB_KEY in .env or set localStorage cf.tmdbKey');
if (!YT_KEY) console.warn('[CineForge] YouTube key missing. Add VITE_YT_KEY in .env or set localStorage cf.ytKey');

export const TMDB = {
  BASE_URL: 'https://api.themoviedb.org/3',
  IMAGE_BASE: 'https://image.tmdb.org/t/p/',
  IMAGE_SIZES: { poster: 'w342', backdrop: 'w780' },
  API_KEY: TMDB_KEY,
  LANG: import.meta.env.VITE_TMDB_LANG || 'en-US',
  REGION: import.meta.env.VITE_TMDB_REGION || 'US',
};

export const YT = { KEY: YT_KEY };
