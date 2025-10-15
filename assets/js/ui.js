// /assets/js/ui.js
import { $, html, fmtYear, img } from './utils.js';
import { toggleBookmark, getBookmarks } from './store.js';

/* =========================
   Genre chips (toggleable)
   ========================= */
export function renderGenres(container, genres, onToggle, active = new Set()) {
  container.innerHTML = '';
  genres.forEach(g => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `filter ${active.has(g.id) ? 'filter--on' : ''}`;
    el.textContent = g.name;
    el.setAttribute('aria-pressed', String(active.has(g.id)));
    el.addEventListener('click', () => {
      const on = !active.has(g.id);
      el.classList.toggle('filter--on', on);
      el.setAttribute('aria-pressed', String(on));
      onToggle(g.id);
    });
    container.appendChild(el);
  });
}

/* =========================
   Bookmark icon (SVG)
   ========================= */
function svgBookmark(saved) {
  return saved
    ? `
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"></path>
      </svg>`
    : `
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="none" stroke="currentColor" stroke-width="2" d="M7 4h10a1 1 0 0 1 1 1v14.5l-6-3.5-6 3.5V5a1 1 0 0 1 1-1z"></path>
      </svg>`;
}

/* ISO -> emoji flag (used in details watch section) */
function flagEmoji(cc) {
  if (!cc) return '';
  return cc.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))
  );
}

/* =========================
   Content Card (grid item)
   ========================= */
export function renderCard(item, opts = {}) {
  const title  = item.title || item.name || 'Untitled';
  const year   = fmtYear(item.release_date || item.first_air_date);
  const rating = item.vote_average ? Number(item.vote_average).toFixed(1) : '—';
  const poster = img(item.poster_path);
  const badge  = (item.media_type === 'tv') ? 'TV' : 'Movie';

  const saved = (getBookmarks() || []).some(b => `${b.media_type}-${b.id}` === `${item.media_type}-${item.id}`);

  const card = document.createElement('article');
  card.className = 'card';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `${title}${year ? ` (${year})` : ''}`);

  card.innerHTML = html`
    <div class="poster-wrap">
      ${poster ? `<img class="poster" src="${poster}" alt="${title} poster" loading="lazy" />`
               : `<div class="poster noimg" aria-label="No poster">No Image</div>`}
      <button class="bookmark ${saved ? 'is-saved' : ''}" aria-pressed="${saved}" title="${saved ? 'Remove bookmark' : 'Add to bookmarks'}">
        ${svgBookmark(saved)}
      </button>
      <span class="badge" aria-label="${badge}">${badge}</span>
    </div>
    <div class="meta">
      <div class="kicker">${year ? year : '&nbsp;'}</div>
      <h3 class="title">${title}</h3>
      <div class="row">
        <span title="Average rating">⭐ ${rating}</span>
        <span>${(item.original_language || '').toUpperCase()}</span>
      </div>
      <div class="card-actions" hidden></div>
    </div>
  `;

  // Bookmark toggle
  const bm = card.querySelector('.bookmark');
  bm.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleBookmark(item);
    const nowSaved = !bm.classList.contains('is-saved');
    bm.classList.toggle('is-saved', nowSaved);
    bm.setAttribute('aria-pressed', String(nowSaved));
    bm.title = nowSaved ? 'Remove bookmark' : 'Add to bookmarks';
    bm.innerHTML = svgBookmark(nowSaved);

    if (opts.showRemove && !nowSaved) card.remove();
  });

  // Open details (click/keyboard)
  const open = () => opts.onOpen?.(item);
  card.addEventListener('click', (e) => {
    if (e.target.closest('.bookmark')) return;
    open();
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });

  return card;
}

/* =========================
   Trailer-only modal
   ========================= */
export function openTrailer(videoKey) {
  const modal = $('#modal');
  const frame = document.getElementById('yt-frame');
  if (!modal || !frame) return;
  frame.src = `https://www.youtube.com/embed/${videoKey}?autoplay=1&rel=0`;
  modal.classList.add('show');
  modal.querySelectorAll('[data-close]').forEach(el => el.onclick = closeTrailer);
}
export function closeTrailer() {
  const modal = document.getElementById('modal');
  const frame = document.getElementById('yt-frame');
  if (frame) frame.src = '';
  modal?.classList.remove('show');
}

/* =========================
   Providers block (watch)
   ========================= */
function renderProvidersBlock(p) {
  if (!p || (!p.free?.length && !p.flatrate?.length && !p.rent?.length && !p.buy?.length)) {
    return "";
  }
  const logo = (path) => path ? `https://image.tmdb.org/t/p/w45${path}` : "";
  const safeLink = (p.link && typeof p.link === 'string') ? p.link : '#';

  const row = (label, arr = []) => !arr?.length ? "" : `
    <div class="prov-row">
      <span class="prov-label">${label}</span>
      <div class="prov-list">
        ${arr.map(x => `
          <a class="prov" target="_blank" rel="noopener"
             title="${x.provider_name}" href="${safeLink}">
            ${logo(x.logo_path) ? `<img src="${logo(x.logo_path)}" alt="${x.provider_name}">` : ""}
            <span>${x.provider_name}</span>
          </a>`).join("")}
      </div>
    </div>`;

  return `
    <div class="providers">
      ${row("Free",    p.free)}
      ${row("Stream",  p.flatrate)}
      ${row("Rent",    p.rent)}
      ${row("Buy",     p.buy)}
    </div>`;
}

/* =========================
   Rich Details Modal
   ========================= */
export function openDetails({
  item,
  trailerKey = null,
  genres = [],
  providers = null,
  region = 'US',
  price = 'all'
}) {
  const m = document.getElementById('modal');
  if (!m) return;

  const media = item.media_type === 'tv' ? 'tv' : 'movie';
  const title = item.title || item.name || 'Untitled';
  const year  = fmtYear(item.release_date || item.first_air_date) || '';
  const rating = item.vote_average ? Number(item.vote_average).toFixed(1) : '—';
  const overview = item.overview || 'No description available.';
  const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '';
  const genresHtml = (genres || []).map(g => `<span class="chip">${g.name || g}</span>`).join('');

  // Trailer
  const yt = trailerKey
    ? `<div class="video"><iframe width="100%" height="360" src="https://www.youtube.com/embed/${trailerKey}" title="Trailer" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`
    : `<div class="empty">No trailer available.</div>`;

  // Providers
  const none = !providers?.free?.length && !providers?.flatrate?.length && !providers?.rent?.length && !providers?.buy?.length;
  const provHtml = none
    ? `<div class="empty">No streaming options in this region. Try another region or switch price type.</div>`
    : renderProvidersBlock(providers);

  // Region/price pill
  const priceLabel = { flatrate: 'stream', rent: 'rent', buy: 'buy', free: 'free' }[price] || 'all';
  const regionPill = `<span class="pill">${flagEmoji(region)} ${region} • ${priceLabel}</span>`;

  m.innerHTML = `
    <div class="modal__backdrop" data-close></div>
    <div class="modal__dialog" role="dialog" aria-modal="true" aria-label="${title}">
      <button class="modal__close" data-close aria-label="Close">&times;</button>
      <div class="details">
        <div class="details__left">
          ${poster ? `<img src="${poster}" alt="${title}" class="details__poster" />` : `<div class="details__poster--empty">No Image</div>`}
        </div>
        <div class="details__right">
          <h3 class="details__title">${title}</h3>
          <div class="details__sub">
            <span class="badge">${media === 'tv' ? 'TV' : 'Movie'}</span>
            ${year ? `<span class="dot"></span><span>${year}</span>` : ''}
            <span class="dot"></span><span>★ ${rating}</span>
          </div>
          ${genresHtml ? `<div class="details__genres">${genresHtml}</div>` : ''}
          <p class="details__overview">${overview}</p>

          <h4 class="details__section">Trailer</h4>
          ${yt}

          <h4 class="details__section">
            Where to Watch ${regionPill}
          </h4>
          ${provHtml}
        </div>
      </div>
    </div>
  `;

  m.style.display = 'block';
  document.body.classList.add('modal-open');
  m.querySelectorAll('[data-close]').forEach(el =>
    el.addEventListener('click', () => {
      m.style.display = 'none';
      m.innerHTML = '';
      document.body.classList.remove('modal-open');
    })
  );
}
