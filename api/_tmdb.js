// /api/_tmdb.js
export const config = { runtime: 'edge' };

const TMDB_BASE = 'https://api.themoviedb.org/3';

export default async function tmdb(pathname, { searchParams = {} } = {}) {
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({ error: 'Missing TMDB_API_KEY' }), { status: 500 });
  }
  const url = new URL(TMDB_BASE + pathname);
  url.searchParams.set('api_key', key);
  url.searchParams.set('language', searchParams.language || 'en-US');
  Object.entries(searchParams).forEach(([k, v]) => {
    if (k !== 'language') url.searchParams.set(k, v);
  });

  const res = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json' },
    // cache mildly, adjust to taste
    next: { revalidate: 60 }
  });

  return res;
}
