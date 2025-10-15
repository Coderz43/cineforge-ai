// Turn a free-text description/title into a structured search plan via Gemini
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEM_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

function withCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function extractJSON(text) {
  // handle ```json ... ``` or plain JSON
  const m = text.match(/```json([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/);
  const raw = (m ? m[1] : text).trim();
  try { return JSON.parse(raw); } catch { return null; }
}

module.exports = async (req, res) => {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!GEMINI_KEY) throw new Error('Missing GEMINI_API_KEY');

    const { text = '', mode = 'describe' } = await (async () => {
      try { return await new Promise(r => {
        let body = '';
        req.on('data', c => (body += c));
        req.on('end', () => r(JSON.parse(body || '{}')));
      }); } catch { return {}; }
    })();

    if (!text) return res.status(400).json({ error: 'Missing text' });

    const prompt = `
You are helping build a movie/TV recommender. The user query: "${text}".
Mode is "${mode}" where "describe" means a vibe/mood and "title" means a specific title.
Return STRICT JSON only, no prose. Shape:

{
  "mediaType": "movie" | "tv" | "both",
  "query": "short search string for TMDB",
  "genres": ["optional list of genre names or be empty"]
}
`;

    const r = await fetch(`${GEM_URL}?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    });
    const data = await r.json();

    const txt =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      data?.candidates?.[0]?.content?.parts?.[0]?.inline_data?.data ||
      '';

    let plan = extractJSON(txt);
    if (!plan) {
      // ultra-safe fallback
      plan = { mediaType: 'both', query: text, genres: [] };
    }

    // normalize
    if (!['movie', 'tv', 'both'].includes(plan.mediaType)) plan.mediaType = 'both';
    if (!plan.query || typeof plan.query !== 'string') plan.query = text;

    res.status(200).json(plan);
  } catch (err) {
    // last-resort fallback so the app keeps working
    res.status(200).json({ mediaType: 'both', query: 'popular', genres: [] });
  }
};
