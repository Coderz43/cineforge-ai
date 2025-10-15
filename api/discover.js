// Thin pass-through to TMDB /discover for future use
const TMDB = 'https://api.themoviedb.org/3';
const TMDB_KEY = process.env.TMDB_API_KEY;

function withCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function getQuery(req) {
  const u = new URL(req.url, `http://${req.headers.host}`);
  return u;
}

module.exports = async (req, res) => {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (!TMDB_KEY) throw new Error('Missing TMDB_API_KEY');

    const u = getQuery(req);
    const media = u.searchParams.get('media') === 'tv' ? 'tv' : 'movie';
    u.searchParams.delete('media');
    u.searchParams.set('language', 'en-US');
    u.searchParams.set('include_adult', 'false');
    u.searchParams.set('api_key', TMDB_KEY);

    const url = `${TMDB}/discover/${media}?${u.searchParams.toString()}`;
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    const data = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(data));

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'discover_failed', details: String(err.message || err) });
  }
};
