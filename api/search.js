// Search TMDB (movie/tv/multi)
const TMDB = 'https://api.themoviedb.org/3';
const TMDB_KEY = process.env.TMDB_API_KEY;

function withCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getQuery(req) {
  const u = new URL(req.url, `http://${req.headers.host}`);
  return Object.fromEntries(u.searchParams.entries());
}

module.exports = async (req, res) => {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (!TMDB_KEY) throw new Error('Missing TMDB_API_KEY');

    const { q = '', type = 'multi', page = '1' } = getQuery(req);
    if (!q) return res.status(400).json({ error: 'Missing q' });

    const path =
      type === 'movie' || type === 'tv'
        ? `/search/${type}`
        : '/search/multi';

    const url = `${TMDB}${path}?query=${encodeURIComponent(
      q
    )}&include_adult=false&language=en-US&page=${page}&api_key=${TMDB_KEY}`;

    const r = await fetch(url, { headers: { accept: 'application/json' } });
    const data = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(data));
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'search_failed', details: String(err.message || err) });
  }
};
