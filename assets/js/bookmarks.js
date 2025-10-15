// assets/js/bookmarks.js
import { initTheme } from './store.js';
import { guessRegion } from './utils.js';
import { renderCard, openDetails, closeTrailer } from './ui.js';
import { getVideos, getWatchProviders, getGenres } from './api.js';

// ---------- Theme + Year ----------
initTheme();
const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

// ---------- Back button ----------
const backBtn = document.getElementById('back-btn');
if (backBtn) {
  backBtn.onclick = () =>
    history.length > 1 ? history.back() : location.assign('/');
}

// ---------- Elements ----------
const grid = document.getElementById('bookmarks-grid');
const empty = document.getElementById('bookmarks-empty');
const typeSel = document.getElementById('bm-type');
const sortSel = document.getElementById('bm-sort');
const searchIn = document.getElementById('bm-search');
const btnClear = document.getElementById('bm-clear');

// ---------- State ----------
let items = JSON.parse(localStorage.getItem('cineforge-bookmarks') || '[]');
let view = items.slice();
let genres = { movie: [], tv: [] };
let region = guessRegion();
const price = 'all';

// ---------- Ensure genres ----------
(async () => {
  try {
    genres = await getGenres();
  } catch {
    // optional, don’t block bookmarks page
  }
})();

// ---------- Render / Apply ----------
function apply() {
  const t = typeSel.value;
  const q = searchIn.value.trim().toLowerCase();

  view = items
    .filter(it => (t === 'all' ? true : it.media_type === t))
    .filter(it => (q ? (it.title || it.name || '').toLowerCase().includes(q) : true));

  switch (sortSel.value) {
    case 'rating':
      view.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
      break;
    case 'yearDesc':
      view.sort((a, b) =>
        (b.release_date || b.first_air_date || '')
          .localeCompare(a.release_date || a.first_air_date || '')
      );
      break;
    case 'yearAsc':
      view.sort((a, b) =>
        (a.release_date || a.first_air_date || '')
          .localeCompare(b.release_date || b.first_air_date || '')
      );
      break;
    default:
      // "recent" = keep insertion order
      break;
  }

  grid.innerHTML = '';
  if (!view.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  view.forEach(it => {
    const card = renderCard(it, {
      showRemove: true,
      onOpen: async (item) => {
        // Trailer
        const vids = await getVideos(item.id, item.media_type);
        const yt =
          (vids.results || []).find(
            v =>
              v.site === 'YouTube' &&
              (v.type === 'Trailer' || v.type === 'Teaser')
          ) || (vids.results || [])[0];

        // Genres
        let names = [];
        try {
          const dict = new Map(
            [...genres.movie, ...genres.tv].map(g => [g.id, g])
          );
          names = (item.genre_ids || [])
            .map(id => dict.get(id))
            .filter(Boolean);
        } catch {}

        // Providers
        let providers = null;
        try {
          const prov = await getWatchProviders(item.id, item.media_type, region);
          providers = prov || null;
        } catch {}

        openDetails({
          item,
          trailerKey: yt?.key || null,
          genres: names,
          providers,
          region,
          price
        });
      }
    });
    grid.appendChild(card);
  });
}

// ---------- Events ----------
grid.addEventListener('click', e => {
  if (e.target.closest('.bookmark')) {
    items = JSON.parse(localStorage.getItem('cineforge-bookmarks') || '[]');
    apply();
  }
});

typeSel.onchange = apply;
sortSel.onchange = apply;
searchIn.oninput = apply;

btnClear.onclick = () => {
  if (!confirm('Clear all bookmarks?')) return;
  localStorage.setItem('cineforge-bookmarks', '[]');
  items = [];
  apply();
};

// ---------- Modal close ----------
document.getElementById('modal').addEventListener('click', e => {
  if (!e.target.hasAttribute('data-close')) return;
  const frame = document.getElementById('yt-frame');
  if (frame) {
    closeTrailer();
    return;
  }
});

// ---------- Init ----------
apply();
