// assets/js/tmdb.js
import { TMDB as RAW_TMDB } from "./config.js";

/* -------------------- normalize config (supports both shapes) -------------------- */
const TMDB = {
  key:     RAW_TMDB.API_KEY   || RAW_TMDB.key    || "",
  base:    RAW_TMDB.BASE_URL  || RAW_TMDB.base   || "https://api.themoviedb.org/3",
  imgBase: RAW_TMDB.IMAGE_BASE|| RAW_TMDB.img    || "https://image.tmdb.org/t/p/",
  lang:    RAW_TMDB.LANG      || RAW_TMDB.language || "en-US",
  region:  RAW_TMDB.REGION    || RAW_TMDB.region   || "US",
  sizes:   RAW_TMDB.IMAGE_SIZES || { poster: "w342", backdrop: "w780" }
};

/* ----------------------------- helpers & low-level ------------------------------- */
export function toQuery(params = {}) {
  const p = new URLSearchParams({
    api_key: TMDB.key,
    language: TMDB.lang,
    region: TMDB.region,
  });
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== "") p.set(k, v);
  });
  return p.toString();
}

export async function api(path, params) {
  const url = `${TMDB.base}${path}?${toQuery(params)}`;
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${path}`);
  return res.json();
}

export const posterUrl = (path, size = TMDB.sizes.poster) =>
  path ? `${TMDB.imgBase}${size}${path}` : "";

/* ---------------------------------- caching ------------------------------------- */
const _genresCache = { movie: null, tv: null };

/**
 * Returns { byName: Map<string, number>, byId: Map<number, string> }
 */
export async function getGenres(mediaType = "movie") {
  if (_genresCache[mediaType]) return _genresCache[mediaType];
  const json = await api(`/genre/${mediaType}/list`);
  const byName = new Map();
  const byId = new Map();
  (json.genres || []).forEach(g => {
    byName.set(g.name, g.id);
    byId.set(g.id, g.name);
  });
  _genresCache[mediaType] = { byName, byId };
  return _genresCache[mediaType];
}

/* ----------------------------- mid-level queries -------------------------------- */
export async function discoverTitles({
  mediaType = "movie",
  genreIds = [],
  sort = "trending",
  page = 1
} = {}) {
  if (sort === "trending") {
    return api(`/trending/${mediaType}/week`, { page });
  }

  const isMovie = mediaType === "movie";
  const sortBy =
    sort === "newest" ? (isMovie ? "primary_release_date.desc" : "first_air_date.desc")
  : sort === "top"    ? "vote_average.desc"
  :                     "popularity.desc";

  return api(`/discover/${mediaType}`, {
    page,
    sort_by: sortBy,
    include_adult: false,
    with_genres: genreIds.join(","),
    // avoid no-vote junk when sorting by score
    ...(sortBy === "vote_average.desc" ? { "vote_count.gte": 200 } : {})
  });
}

/**
 * Pick the best YouTube video for a title.
 * Preference: official, then type order (Trailer > Teaser > Clip), then most recent.
 */
export async function bestVideo(mediaType, id) {
  const json = await api(`/${mediaType}/${id}/videos`);
  const list = (json.results || []).filter(v => v.site === "YouTube");

  const typeRank = (t) => {
    const order = ["Trailer", "Teaser", "Clip"];
    const i = order.indexOf(t || "");
    return i === -1 ? 99 : i;
  };

  const weight = (v) => {
    // lower is better
    const official = v.official ? 0 : 1;
    const tRank = typeRank(v.type);
    const recent = v.published_at ? -Date.parse(v.published_at) : 0;
    return [official, tRank, recent];
  };

  list.sort((a, b) => {
    const wa = weight(a);
    const wb = weight(b);
    for (let i = 0; i < wa.length; i++) {
      if (wa[i] !== wb[i]) return wa[i] - wb[i];
    }
    return 0;
  });

  return list[0] || null;
}

/* ------------------------------ high-level: reels -------------------------------- */
/**
 * Fetch a reels list derived from TMDB titles.
 * Returns { page, total_pages, reels: Array<{id, mediaType, tmdbId, title, movieTitle, poster, ytKey, tags: string[]}> }
 */
export async function fetchReels({
  mediaType = "movie",
  genreIds = [],
  sort = "trending",
  page = 1,
  maxVideos = 8
} = {}) {
  const titles = await discoverTitles({ mediaType, genreIds, sort, page });
  const results = titles.results || [];
  const picked = results.slice(0, maxVideos);

  // Preload genre map to tag clips
  const genreMap = (await getGenres(mediaType)).byId;

  // simple 3-way concurrency
  const out = [];
  let i = 0;
  async function worker() {
    while (i < picked.length) {
      const item = picked[i++];
      try {
        const v = await bestVideo(mediaType, item.id);
        out.push({
          id: `${mediaType}-${item.id}`,
          mediaType,
          tmdbId: item.id,
          title: (v?.name || "Trailer"),
          movieTitle: (item.title || item.name || "Unknown"),
          poster: posterUrl(item.poster_path),
          ytKey: v?.key || null,
          tags: Array.isArray(item.genre_ids) ? item.genre_ids.map(id => genreMap.get(id)).filter(Boolean) : []
        });
      } catch (e) {
        // skip item on failure; keep the feed resilient
        // console.warn("reel build failed", item?.id, e);
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);

  return {
    page: titles.page,
    total_pages: titles.total_pages,
    reels: out
  };
}

/* ------------------------------ named exports (compat) --------------------------- */
export { TMDB };
