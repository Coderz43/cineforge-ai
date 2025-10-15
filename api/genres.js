// Fetch TMDB genres (movie + tv)
const TMDB = 'https://api.themoviedb.org/3';
const TMDB_KEY = process.env.TMDB_API_KEY;

function withCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (!TMDB_KEY) throw new Error('Missing TMDB_API_KEY');

    const [movie, tv] = await Promise.all([
      fetch(`${TMDB}/genre/movie/list?language=en-US&api_key=${TMDB_KEY}`).then(r => r.json()),
      fetch(`${TMDB}/genre/tv/list?language=en-US&api_key=${TMDB_KEY}`).then(r => r.json()),
    ]);

    res.status(200).json({ movie: movie.genres || [], tv: tv.genres || [] });
  } catch (err) {
    res.status(500).json({ error: 'genres_failed', details: String(err.message || err) });
  }
};
