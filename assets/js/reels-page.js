// assets/js/reels-page.js
import { fetchReels, getGenres } from "./tmdb.js";
import { YT as YT_CFG } from "./config.js";

/* -------------------------------------------------------------------------- */
/* State & mounts                                                             */
/* -------------------------------------------------------------------------- */
const state = {
  mediaType: "movie",
  activeGenres: new Set(),
  sort: "trending",
  page: 1,
  total: 1,
  loading: false,
  reels: [],          // [{ id, mediaType, tmdbId, title, movieTitle, poster, ytKey, tags }]
  players: new Map(), // id -> YT.Player
  ytReady: null
};

const els = {};
const qs = (id) => document.getElementById(id);

/* -------------------------------------------------------------------------- */
/* Boot                                                                       */
/* -------------------------------------------------------------------------- */
export async function initReels() {
  // Mounts expected in reels.html
  els.chips = qs("reelsChips");
  els.sort  = qs("reelsSort");
  els.feed  = qs("reelsFeed");

  loadState();

  // Build genre chips from TMDB (movie first; you can add a switch later)
  const g = await getGenres(state.mediaType); // { byId, byName }
  buildChips(g.byId);                          // Map<id, name>

  // Sort control
  els.sort.value = state.sort;
  els.sort.addEventListener("change", () => {
    state.sort = els.sort.value;
    resetAndLoad();
  });

  // First page
  await resetAndLoad();

  // Infinite scroll sentinel
  setupInfiniteScroll();

  // Load YT IFrame API once (used when first card is hydrated)
  ensureYouTubeAPI();

  // Deep link (#movie-123)
  tryPlayFromHash();
}

// Auto-init if imported directly from the page without manual call
if (document.readyState !== "loading") initReels();
else document.addEventListener("DOMContentLoaded", initReels);

/* -------------------------------------------------------------------------- */
/* Persist minimal UI state                                                   */
/* -------------------------------------------------------------------------- */
const SS_KEY = "cf.reels.state";
function saveState() {
  sessionStorage.setItem(
    SS_KEY,
    JSON.stringify({
      mediaType: state.mediaType,
      sort: state.sort,
      genres: [...state.activeGenres]
    })
  );
}
function loadState() {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.mediaType) state.mediaType = s.mediaType;
    if (s.sort) state.sort = s.sort;
    if (Array.isArray(s.genres)) state.activeGenres = new Set(s.genres.map(Number));
  } catch {}
}

/* -------------------------------------------------------------------------- */
/* Genres chips                                                               */
/* -------------------------------------------------------------------------- */
function buildChips(byIdMap) {
  els.chips.innerHTML = "";
  [...byIdMap.entries()].forEach(([id, name]) => {
    const b = document.createElement("button");
    b.className = "reels-chip";
    b.textContent = name;
    b.dataset.gid = String(id);
    if (state.activeGenres.has(Number(id))) b.classList.add("is-on");
    b.addEventListener("click", () => {
      const gid = Number(b.dataset.gid);
      if (state.activeGenres.has(gid)) state.activeGenres.delete(gid);
      else state.activeGenres.add(gid);
      b.classList.toggle("is-on");
      resetAndLoad();
    });
    els.chips.appendChild(b);
  });
}

/* -------------------------------------------------------------------------- */
/* Fetch + render                                                             */
/* -------------------------------------------------------------------------- */
async function resetAndLoad() {
  state.page = 1;
  state.total = 1;
  state.reels = [];
  els.feed.innerHTML = "";
  saveState();
  await loadNextPage();
}

async function loadNextPage() {
  if (state.loading) return;
  if (state.page > state.total) return;

  state.loading = true;
  addLoadingRow();

  const genreIds = [...state.activeGenres];
  try {
    const { page, total_pages, reels } = await fetchReels({
      mediaType: state.mediaType,
      genreIds,
      sort: state.sort,
      page: state.page,
      maxVideos: 8
    });
    state.page = page + 1;
    state.total = total_pages;
    appendReels(reels);
  } catch (e) {
    console.error("reels load failed:", e);
    toast("Failed to load reels.");
  } finally {
    state.loading = false;
    removeLoadingRow();
  }
}

function appendReels(items) {
  const frag = document.createDocumentFragment();
  items.forEach((r) => {
    state.reels.push(r);
    frag.appendChild(renderCard(r));
  });
  els.feed.appendChild(frag);
  // hydrate players after DOM insert
  items.forEach(hydrateCard);
}

/* -------------------------------------------------------------------------- */
/* Card template & hydration                                                  */
/* -------------------------------------------------------------------------- */
function renderCard(item) {
  const tagHTML = (item.tags || []).map((t) => `<span class="reels-tag">#${t}</span>`).join("");
  const el = document.createElement("article");
  el.className = "reels-card";
  el.dataset.id = item.id;
  el.innerHTML = `
    <header class="reels-head">
      <div class="reels-poster">${item.poster ? `<img src="${item.poster}" alt="">` : ""}</div>
      <div>
        <div class="reels-title">${escapeHTML(item.title)}</div>
        <div class="reels-meta">${escapeHTML(item.movieTitle)}</div>
      </div>
    </header>

    <div class="reels-video-wrap">
      <div class="reels-video" id="yt-${item.id}"></div>
      <div class="video-fallback is-hidden">No video found</div>

      <div class="reels-overlay">
        <div class="reels-actions-col">
          <button class="reels-cta" data-act="playpause">► Play</button>
          <button class="reels-cta" data-act="mute">🔇 Mute</button>
        </div>
        <div class="reels-actions-col">
          <div class="reels-tags">${tagHTML}</div>
        </div>
      </div>
    </div>

    <div class="reels-ops">
      <button class="reels-op" data-act="view">View movie page</button>
      <button class="reels-op" data-act="share">Share</button>
      <button class="reels-op" data-act="submit">Submit your clip</button>
      <button class="reels-op" data-act="report">Report</button>
    </div>
  `;
  return el;
}

function hydrateCard(item) {
  const host = document.getElementById(`yt-${item.id}`);
  const fallbackEl = host?.parentElement?.querySelector(".video-fallback");
  if (!host) return;

  // If we don't have a YouTube key, show fallback and bail.
  if (!item.ytKey) {
    fallbackEl?.classList.remove("is-hidden");
    wireButtonsWithoutPlayer(item);
    return;
  }

  // Ensure API then create player
  ensureYouTubeAPI().then(() => {
    const pv = Object.assign(
      { playsinline: 1, rel: 0, modestbranding: 1, controls: 1 },
      (YT_CFG && YT_CFG.playerVars) || {}
    );
    const player = new YT.Player(host.id, {
      width: "100%",
      height: "100%",
      videoId: item.ytKey,
      playerVars: pv,
      events: {
        onReady: (ev) => {
          state.players.set(item.id, ev.target);
          // default muted for scroll-autoplay UX
          try { ev.target.mute(); } catch {}
          wireButtonsWithPlayer(item, ev.target);
          setupIntersectionAutoPlay(host, ev.target);
          // Autopause others when this plays
          ev.target.addEventListener("onStateChange", (e) => {
            if (e.data === YT.PlayerState.PLAYING) pauseOthers(item.id);
          });
        },
        onError: () => {
          fallbackEl?.classList.remove("is-hidden");
          wireButtonsWithoutPlayer(item);
        }
      }
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Controls                                                                   */
/* -------------------------------------------------------------------------- */
function wireButtonsWithPlayer(item, player) {
  const card = document.querySelector(`.reels-card[data-id="${item.id}"]`);
  if (!card) return;

  card.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const act = btn.getAttribute("data-act");

      if (act === "playpause") {
        const s = player.getPlayerState();
        if (s === YT.PlayerState.PLAYING) {
          player.pauseVideo();
          btn.textContent = "► Play";
        } else {
          pauseOthers(item.id);
          player.playVideo();
          btn.textContent = "❚❚ Pause";
        }
      }

      if (act === "mute") {
        try {
          if (player.isMuted()) { player.unMute(); btn.textContent = "🔊 Unmute"; }
          else { player.mute(); btn.textContent = "🔇 Mute"; }
        } catch {}
      }

      if (act === "share") {
        const url = location.origin + location.pathname + "#" + item.id;
        try { await navigator.clipboard.writeText(url); btn.textContent = "Copied!"; setTimeout(() => btn.textContent = "Share", 1200); }
        catch { alert("Link copied: " + url); }
      }

      if (act === "view") {
        const base = "https://www.themoviedb.org";
        const path = item.mediaType === "tv" ? `/tv/${item.tmdbId}` : `/movie/${item.tmdbId}`;
        window.open(base + path, "_blank", "noopener");
      }

      if (act === "report") {
        const r = prompt("Report this clip (reason):");
        if (r) alert("Thanks, we will review it.");
      }

      if (act === "submit") {
        const link = prompt("Paste your clip link (mp4 / hosted short):");
        if (link) alert("Thanks! We will review your submission.");
      }
    });
  });
}

function wireButtonsWithoutPlayer(item) {
  const card = document.querySelector(`.reels-card[data-id="${item.id}"]`);
  if (!card) return;
  // Disable play/mute but keep others
  card.querySelectorAll('[data-act="playpause"],[data-act="mute"]').forEach((b) => {
    b.disabled = true;
    b.style.opacity = ".6";
  });
  // Keep share/view/report/submit active
  card.querySelectorAll("[data-act]").forEach((btn) => {
    if (btn.disabled) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const act = btn.getAttribute("data-act");
      if (act === "share") {
        const url = location.origin + location.pathname + "#" + item.id;
        navigator.clipboard.writeText(url).then(() => {
          btn.textContent = "Copied!";
          setTimeout(() => (btn.textContent = "Share"), 1200);
        }).catch(() => alert("Link copied: " + url));
      }
      if (act === "view") {
        const base = "https://www.themoviedb.org";
        const path = item.mediaType === "tv" ? `/tv/${item.tmdbId}` : `/movie/${item.tmdbId}`;
        window.open(base + path, "_blank", "noopener");
      }
      if (act === "report") {
        const r = prompt("Report this clip (reason):");
        if (r) alert("Thanks, we will review it.");
      }
      if (act === "submit") {
        const link = prompt("Paste your clip link (mp4 / hosted short):");
        if (link) alert("Thanks! We will review your submission.");
      }
    });
  });
}

function pauseOthers(exceptId) {
  state.players.forEach((p, id) => {
    if (id !== exceptId) {
      try {
        if (p.getPlayerState() === YT.PlayerState.PLAYING) p.pauseVideo();
      } catch {}
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Visibility autoplay                                                        */
/* -------------------------------------------------------------------------- */
function setupIntersectionAutoPlay(hostEl, player) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        // Autoplay only when muted (good UX)
        try { if (player.isMuted()) player.playVideo(); } catch {}
      } else {
        try { player.pauseVideo(); } catch {}
      }
    });
  }, { threshold: 0.6 });
  io.observe(hostEl);
}

/* -------------------------------------------------------------------------- */
/* Infinite scroll                                                            */
/* -------------------------------------------------------------------------- */
function setupInfiniteScroll() {
  let sentinel = document.getElementById("reelsMore");
  if (!sentinel) {
    sentinel = document.createElement("div");
    sentinel.id = "reelsMore";
    sentinel.style.height = "1px";
    els.feed.after(sentinel);
  }
  const io = new IntersectionObserver(async (entries) => {
    const en = entries[0];
    if (en.isIntersecting) await loadNextPage();
  }, { rootMargin: "800px 0px 800px 0px" });
  io.observe(sentinel);
}

/* -------------------------------------------------------------------------- */
/* YouTube API loader                                                         */
/* -------------------------------------------------------------------------- */
function ensureYouTubeAPI() {
  if (state.ytReady) return state.ytReady;
  state.ytReady = new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve();
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
    window.onYouTubeIframeAPIReady = () => resolve();
  });
  return state.ytReady;
}

/* -------------------------------------------------------------------------- */
/* Deep-link playback (#id)                                                   */
/* -------------------------------------------------------------------------- */
function tryPlayFromHash() {
  const id = location.hash && location.hash.slice(1);
  if (!id) return;
  const scrollAndPlay = () => {
    const host = document.getElementById(`yt-${id}`);
    if (!host) return false;
    host.scrollIntoView({ behavior: "smooth", block: "center" });
    const attempt = () => {
      const p = state.players.get(id);
      if (p) { try { p.playVideo(); } catch {} return true; }
      return false;
    };
    const t = setInterval(() => { if (attempt()) clearInterval(t); }, 200);
    setTimeout(() => clearInterval(t), 4000);
    return true;
  };
  // Try now, and again when more content loads (if deep-linked item is on later page)
  if (!scrollAndPlay()) {
    const obs = new MutationObserver(() => { if (scrollAndPlay()) obs.disconnect(); });
    obs.observe(els.feed, { childList: true, subtree: true });
  }
}

/* -------------------------------------------------------------------------- */
/* Misc utils                                                                 */
/* -------------------------------------------------------------------------- */
function escapeHTML(s = "") {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]
  ));
}
function toast(msg) {
  console.warn(msg);
}
function addLoadingRow() {
  if (qs("reelsLoading")) return;
  const d = document.createElement("div");
  d.id = "reelsLoading";
  d.style.cssText = "opacity:.7;text-align:center;padding:14px;font-size:14px;";
  d.textContent = "Loading…";
  els.feed.appendChild(d);
}
function removeLoadingRow() {
  const d = qs("reelsLoading");
  if (d) d.remove();
}
