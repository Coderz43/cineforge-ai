// /api/person-credits.js
export const config = { runtime: 'edge' };
import tmdb from './_tmdb';

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });

  const res = await tmdb(`/person/${id}/combined_credits`);
  if (!res.ok) return new Response(await res.text(), { status: res.status });

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json', 'cache-control': 's-maxage=60, stale-while-revalidate=300' }
  });
}
