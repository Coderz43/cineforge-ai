// /assets/js/app.js
import { $, $$, guessRegion } from './utils.js';
import { initTheme, getMode, setMode } from './store.js';
import { renderCard, renderGenres, openTrailer, closeTrailer, openDetails } from './ui.js';
import * as api from './api.js';
import { promptSearch } from './services/prompt-search.js';

const { aiSuggest, searchTMDB, getGenres, getVideos, getWatchProviders, getPerson } = api;

/* =========================
   Theme + Footer Year
   ========================= */
initTheme();
document.getElementById('year').textContent = new Date().getFullYear();

/* =========================
   Typewriter (cosmetic)
   ========================= */
(function typewriter () {
  const el = document.getElementById('hero-title');
  if (!el) return;
  const words = ['Find', 'Your', 'Next', 'Favorite', 'Movie'];
  let i = 0, erasing = false;
  function tick () {
    if (!erasing) {
      el.textContent = words.slice(0, i + 1).join(' ');
      if (i < words.length - 1) { i++; setTimeout(tick, 220); }
      else { setTimeout(() => { erasing = true; tick(); }, 1200); }
    } else {
      el.textContent = words.slice(0, Math.max(0, i)).join(' ');
      i--; if (i >= 0) setTimeout(tick, 120); else { erasing = false; i = 0; setTimeout(tick, 600); }
    }
  }
  tick();
})();

/* =========================
   Elements & basic state
   ========================= */
const form = $('#search-form');
const input = $('#search-input');
const modeDescribe = $('#mode-describe');
const modeTitle = $('#mode-title');
const suggestBtn = $('#suggest-btn');

const results = $('#results');
const empty = $('#empty');
const filtersBox = $('#filters');
const typeSel = $('#type-select');
const sortSel = $('#sort-select');
const searchInResults = $('#search-in-results');
const loadMoreBtn = $('#load-more');
const toolbar = document.querySelector('.toolbar');
const regionPriceTools = document.querySelector('.region-price-tools');

const regionSel = document.getElementById('region-select');
const priceSel  = document.getElementById('price-select');

const ta = $('#typeahead');
const taList = $('#ta-list');

const imageTrigger = document.getElementById('image-trigger');
const imageInputEl = document.getElementById('image-input');
imageInputEl?.setAttribute('accept', 'image/png');
const ATTACH_MAX = 5;

const STORE_KEY = 'cf:lastSearch:v2';

/* Clear last state on full reload (keep only on back/forward) */
(function clearOnReload(){
  try {
    const nav = performance.getEntriesByType?.('navigation')?.[0];
    const t = nav?.type || (performance.navigation?.type === 1 ? 'reload' : 'navigate');
    if (t !== 'back_forward') sessionStorage.removeItem(STORE_KEY);
  } catch {}
})();

/* =========================
   Default mode: Movie / TV
   ========================= */
let mode = getMode() || 'title';
setMode(mode);

function hasImages(){ return (_filesFromBin().length>0 || _filesFromInput().length>0); }
function setPlaceholders () {
  if (!input) return;
  if (hasImages()) { input.placeholder = 'Ask me anything…'; return; }
  input.placeholder = (mode === 'title')
    ? 'Type a movie or show…'
    : 'Type a name to explore';
}

// init chips
if (mode === 'title') { modeTitle?.classList.add('chip--active'); modeDescribe?.classList.remove('chip--active'); }
else { mode = 'describe'; setMode(mode); modeDescribe?.classList.add('chip--active'); modeTitle?.classList.remove('chip--active'); }
setPlaceholders();

modeDescribe?.addEventListener('click', () => {
  mode = 'describe'; setMode(mode);
  modeDescribe.classList.add('chip--active'); modeTitle?.classList.remove('chip--active');
  hideTypeahead(); setPlaceholders();
  // Clear result grid when switching to Describe (no default cards)
  results.innerHTML = '';
  showEmpty(true);
});
modeTitle?.addEventListener('click', () => {
  mode = 'title'; setMode(mode);
  modeTitle.classList.add('chip--active'); modeDescribe?.classList.remove('chip--active');
  setPlaceholders(); taDebounced();
});

/* =========================
   Notices + attach plumbing
   ========================= */
function showNotice(msg, ms = 2500) {
  let n = document.getElementById('cf-notice');
  if (!n) {
    n = document.createElement('div');
    n.id = 'cf-notice';
    n.style.cssText = 'margin-top:8px;font-size:.9rem;color:#f99;';
    form?.appendChild(n);
  }
  n.textContent = msg;
  if (ms > 0) setTimeout(() => { if (n) n.textContent = ''; }, ms);
}

function stashFilesFromInputCapture() {
  const raw = imageInputEl?.files ? Array.from(imageInputEl.files).slice(0, ATTACH_MAX) : [];
  if (!raw.length) return;

  const pngs = raw.filter(f => (f.type || '').toLowerCase() === 'image/png' || /\.png$/i.test(f.name || ''));
  if (pngs.length !== raw.length) showNotice('Only PNG files are supported.');
  if (!pngs.length) { try { imageInputEl.value = ''; } catch {} return; }

  window.CF_ATTACH = (window.CF_ATTACH || []).concat(pngs).slice(0, ATTACH_MAX);
  window.dispatchEvent(new Event('cf-attachments-changed'));
}
imageInputEl?.addEventListener('change', stashFilesFromInputCapture, { capture: true });

function _filesFromBin(){ return Array.isArray(window.CF_ATTACH) ? window.CF_ATTACH.slice(0, ATTACH_MAX) : []; }
function _filesFromInput(){ return imageInputEl?.files ? Array.from(imageInputEl.files).slice(0, ATTACH_MAX) : []; }
function getAttachedImages(){ const bin=_filesFromBin(); return bin.length ? bin : _filesFromInput(); }
function updatePlaceholderByImages(){ setPlaceholders(); }
window.addEventListener('cf-attachments-changed', updatePlaceholderByImages);

// hidden UI init
if (toolbar) toolbar.hidden = true;
if (regionPriceTools) regionPriceTools.hidden = true;
if (filtersBox) filtersBox.hidden = true;
if (empty) empty.hidden = true;

let activeGenres = new Set();
let genreMap = { movie: [], tv: [] };
let rawItems = [];
let current = { query: '', type: 'multi', page: 1, source: 'tmdb' }; // 'tmdb' | 'prompt'
let lastPeople = [];

/* =========================
   Regions
   ========================= */
const REGIONS = [
  { code: 'US', name: 'United States' }, { code: 'GB', name: 'United Kingdom' },
  { code: 'IN', name: 'India' }, { code: 'CA', name: 'Canada' }, { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' }, { code: 'DE', name: 'Germany' }, { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' }, { code: 'IT', name: 'Italy' }, { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' }, { code: 'AR', name: 'Argentina' }, { code: 'CL', name: 'Chile' },
  { code: 'CO', name: 'Colombia' }, { code: 'NL', name: 'Netherlands' }, { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' }, { code: 'DK', name: 'Denmark' }, { code: 'FI', name: 'Finland' },
  { code: 'PL', name: 'Poland' }, { code: 'TR', name: 'Türkiye' }, { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SA', name: 'Saudi Arabia' }, { code: 'ZA', name: 'South Africa' },
];
function flagEmoji(cc) {
  if (!cc) return '';
  return cc.toUpperCase().replace(/./g, c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0)));
}
let userRegion = guessRegion();
let userPrice  = 'all';

function populateRegions() {
  if (!regionSel) return;
  regionSel.innerHTML = '';
  REGIONS.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.code;
    opt.textContent = `${flagEmoji(r.code)} ${r.name}`;
    regionSel.appendChild(opt);
  });
  const exists = REGIONS.some(r => r.code === userRegion);
  userRegion = exists ? userRegion : 'US';
  regionSel.value = userRegion;
}

/* =========================
   Helpers
   ========================= */
function showEmpty (state) { if (empty) empty.hidden = !state; }

async function ensureGenres () {
  if (genreMap.movie.length || genreMap.tv.length) return;
  genreMap = await getGenres();
}

function applyFilters (items) {
  let list = items;
  const t = typeSel?.value || 'all';
  if (t !== 'all') list = list.filter(x => x.media_type === t);
  const q = (searchInResults?.value || '').trim().toLowerCase();
  if (q) list = list.filter(x => (x.title || x.name || '').toLowerCase().includes(q));
  switch (sortSel?.value) {
    case 'rating':
      list = list.slice().sort((a,b)=>(b.vote_average||0)-(a.vote_average||0) || (b.popularity||0)-(a.popularity||0));
      break;
    case 'yearDesc':
      list = list.slice().sort((a,b)=>(b.release_date||b.first_air_date||'').localeCompare(a.release_date||a.first_air_date||'')); break;
    case 'yearAsc':
      list = list.slice().sort((a,b)=>(a.release_date||a.first_air_date||'').localeCompare(b.release_date||b.first_air_date||'')); break;
    default:
      list = list.slice().sort((a,b)=>(b.vote_average||0)-(a.vote_average||0) || (b.popularity||0)-(a.popularity||0));
  }
  if (activeGenres.size) list = list.filter(it => (it.genre_ids||[]).some(id => activeGenres.has(id)));
  return list;
}

/* ====== Professional “no results” message ====== */
function hasHindiHint(s) {
  const str = String(s || '');
  return /hindi|bollywood|south\s*indian|punjabi|tamil|telugu|malayalam|kannada|marathi|bengali|gujarati|देसी|हिंदी|[\u0900-\u097F]/i.test(str);
}
function renderNoResultsMessage(q='') {
  const isHindiish = hasHindiHint(q);
  const tips = isHindiish
    ? [
        'Type clearer Hindi keywords (e.g. "Hindi thriller", "South Indian action").',
        'Try the exact movie/show title (Roman or देवनागरी).',
        'Switch to Movie/TV mode for exact titles.',
      ]
    : [
        'Check the spelling or try the exact title.',
        'Add a language hint (e.g. "Hindi", "Punjabi", "English").',
        'Try broader words like "thriller", "family drama", "rom-com".',
      ];
  return `
    <div class="empty">
      <div style="font-weight:600;margin-bottom:.25rem;">No results found for “${(q||'').replace(/</g,'&lt;')}”.</div>
      <div style="opacity:.9">Try these:</div>
      <ul style="margin:.5rem 0 0 1rem;line-height:1.4">
        ${tips.map(t=>`<li>${t}</li>`).join('')}
      </ul>
    </div>`;
}

/* =========================
   Typeahead (Title mode)
   ========================= */
function yearOf(item){ const d=item.release_date||item.first_air_date||''; return d?d.slice(0,4):''; }
function mediaBadge(item){ return item.media_type==='tv'?'TV':'Movie'; }
function posterUrl(item){
  const p = item.poster_path || item.backdrop_path || item.profile_path || null;
  return p ? `https://image.tmdb.org/t/p/w92${p}` : 'assets/icons/poster-fallback.svg';
}
function renderTypeahead(items) {
  if (!ta || !taList) return;
  if (!items.length) return hideTypeahead();
  taList.innerHTML = items.map(it => `
    <div class="ta-item" role="option" data-id="${it.id}" data-type="${it.media_type}">
      <div class="ta-poster" style="background-image:url('${posterUrl(it)}')"></div>
      <div class="ta-meta">
        <div class="ta-title">${(it.title || it.name || 'Untitled')}</div>
        <div class="ta-sub">${yearOf(it) ? `<span>${yearOf(it)}</span>` : ''}<span class="ta-badge">${mediaBadge(it)}</span></div>
      </div>
    </div>
  `).join('');
  ta.hidden = false;
  ta.classList.add('show');
}
function hideTypeahead(){ if(!ta)return; ta.classList.remove('show'); ta.hidden = true; if(taList) taList.innerHTML=''; }
function debounce(fn, ms=200){ let t=null; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }

const taDebounced = debounce(async () => {
  if (mode !== 'title') return hideTypeahead();
  const q = (input?.value || '').trim();
  if (!q || q.length < 2) return hideTypeahead();
  try {
    const data = await searchTMDB(q, 'multi', 1);
    const list = (data.results || []).filter(r => r.media_type==='movie' || r.media_type==='tv').slice(0, 8);
    if (!list.length) return hideTypeahead();
    renderTypeahead(list);
  } catch { hideTypeahead(); }
}, 220);

input?.addEventListener('input', () => { if (mode!=='title') return hideTypeahead(); taDebounced(); });
input?.addEventListener('focus', () => { if (mode==='title') taDebounced(); });
document.addEventListener('click', (e)=>{ const within=form?.contains?.(e.target) || ta?.contains(e.target); if(!within) hideTypeahead(); });
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') hideTypeahead(); });

/* Enter key submits (no Shift) */
input?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); triggerSuggest(); }
});

// SELECT suggestion -> remember item and trigger Suggest
let selectedFromTA = null;
taList?.addEventListener('click', (e) => {
  const el = e.target.closest('.ta-item'); if(!el) return;
  const id = Number(el.dataset.id);
  const type = el.dataset.type || 'movie';
  const title = el.querySelector('.ta-title')?.textContent?.trim() || '';
  selectedFromTA = { id, media_type: type, __titleFromTA: title };
  if (input) input.value = title;
  hideTypeahead();
  triggerSuggest();
});

/* =========================
   People strip
   ========================= */
const IMG = { base:"https://image.tmdb.org/t/p/", profile(size, path){ return path ? `${this.base}${size}${path}` : "assets/icons/poster-fallback.svg"; } };
async function renderPeopleStrip(people = []) {
  lastPeople = people.slice();
  const targets = people.filter(p => p.media_type === 'person' && !p.profile_path);
  const limit = Math.min(4, targets.length);
  let i = 0;
  async function worker(){ while(i<targets.length){ const p=targets[i++]; try{ const full=await getPerson(p.id); p.profile_path = full.profile_path || (full.images?.profiles?.[0]?.file_path ?? null);}catch{}}}
  await Promise.all(Array.from({length:limit||0}).map(worker));
  const old = document.getElementById('people-strip'); if (old?.parentNode) old.parentNode.removeChild(old);
  if (!people.length) return;
  const strip = document.createElement('section'); strip.id='people-strip'; strip.className='people-strip';
  const h = document.createElement('div'); h.className='people-strip__head'; h.innerHTML = `<h3 class="people-strip__title">People you might mean</h3>`; strip.appendChild(h);
  const row = document.createElement('div'); row.className='people-strip__row';
  people.slice(0, 18).forEach(p => {
    const img = IMG.profile("w185", p.profile_path);
    const a = document.createElement('a'); a.className='person-card'; a.href=`people.html?id=${p.id}`; a.title=p.name||'';
    a.innerHTML = `<div class="person-face" style="background-image:url('${img}')"></div><div class="person-name">${p.name||''}</div>${p.known_for_department?`<div class="person-dept">${p.known_for_department}</div>`:''}`;
    a.addEventListener('click', saveLastSearchState);
    row.appendChild(a);
  });
  strip.appendChild(row);
  results.parentNode.insertBefore(strip, results);
}

/* =========================
   Draw grid
   ========================= */
function applyAndDraw(items) {
  const list = applyFilters(items);
  results.innerHTML = '';
  if (!list.length) {
    const q = (input?.value || current.query || '').trim();
    results.innerHTML = renderNoResultsMessage(q);
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    saveLastSearchState();
    return;
  }
  list.forEach(it => {
    const card = renderCard(it, {
      onTrailer: async (item) => {
        const vids = await getVideos(item.id, item.media_type);
        const yt = (vids.results || []).find(v => v.site==='YouTube' && (v.type==='Trailer' || v.type==='Teaser')) || (vids.results||[])[0];
        if (yt) openTrailer(yt.key);
      },
      onOpen: async (item) => {
        const vids = await getVideos(item.id, item.media_type);
        const yt = (vids.results || []).find(v => v.site==='YouTube' && (v.type==='Trailer' || v.type==='Teaser')) || (vids.results||[])[0];
        let names = [];
        if (Array.isArray(item.genre_ids) && (genreMap.movie.length || genreMap.tv.length)) {
          const dict = new Map([...genreMap.movie, ...genreMap.tv].map(g => [g.id, g]));
          names = item.genre_ids.map(id => dict.get(id)).filter(Boolean);
        }
        let providers = null;
        try {
          const prov = await getWatchProviders(item.id, item.media_type, userRegion);
          providers = (userPrice!=='all') ? { [userPrice]: prov[userPrice]||[], link: prov.link } : prov;
        } catch (e) { console.warn('Provider fetch failed', e); }
        openDetails({ item, trailerKey: yt?.key || null, genres: names, providers, region: userRegion, price: userPrice });
      }
    });
    results.appendChild(card);
  });
  if (loadMoreBtn) {
    loadMoreBtn.style.display = (current.source === 'tmdb') ? 'block' : 'none';
  }
  saveLastSearchState();
}

/* =========================
   Prompt / title helpers
   ========================= */
const PROMPT_RE = new RegExp([
  'like','similar','recommend','suggest','vibe','vibes?','mood',
  'thriller','action','romance','horror','comedy','drama','mystery','noir','heist','investigation','detective',
  'slow\\s*burn','psychological','crime','family','emotional','real(istic)?','true\\s*story',
  'jaisa','jaise','jaisi','type','ke\\s*jaise','ki\\s*tarah','हिंदी','जैसा','जैसे','थ्रिलर',
  '\\+'
].join('|'), 'i');
function looksLikePrompt(q=''){ return PROMPT_RE.test(String(q||'')); }

// Map loose prompt/AI items to TMDB-like cards
function normalizePromptItems(promptItems) {
  const arr = Array.isArray(promptItems) ? promptItems : (promptItems?.results || []);
  return arr.map(it => {
    if (it.media_type && (it.poster_path || it.backdrop_path || it.profile_path)) return it;
    const obj = { ...it };
    obj.media_type = obj.media_type || 'movie';
    if (!obj.release_date && obj.year) obj.release_date = String(obj.year) + '-01-01';
    if (!obj.poster_path && obj.poster) obj.poster_path = obj.poster.replace(/^https?:\/\/image\.tmdb\.org\/t\/p\/w\d+/i, '');
    return obj;
  });
}

/* =========================
   SEARCH CORE
   ========================= */
let searchAbortCtrl = null;

async function runSearch() {
  const text = (input?.value || '').trim();
  const files = getAttachedImages();
  if (!text && files.length === 0) return;

  hideTypeahead();
  if (searchAbortCtrl) searchAbortCtrl.abort();
  searchAbortCtrl = new AbortController();

  const welcome = document.getElementById('welcome');
  if (welcome) welcome.hidden = true;

  renderPeopleStrip([]);
  results.innerHTML = '<div class="empty">Finding great picks…</div>';
  showEmpty(false);
  if (filtersBox) filtersBox.hidden = true;
  if (toolbar) toolbar.hidden = true;
  if (regionPriceTools) regionPriceTools.hidden = true;
  activeGenres.clear();
  current.page = 1;

  const DESCRIBE_TITLE_MSG = `
    <div class="empty">
      <b>Describe</b> is for <em>vibes</em> or <em>people</em> (biographies).<br/>
      To search a specific title, switch to <b>Movie / TV</b> above.<br/>
      Try: <em>“witty heist with friends”</em> or type a person’s name like <em>John&nbsp;Cena</em>.
    </div>`;

  try {
    let query = text;
    let type = 'multi';
    current.source = 'tmdb';

    // 1) Images → identify
    if (files.length) {
      try {
        const iden = await (async () => {
          if (!files?.length) return null;
          try {
            if (typeof api.imageSuggest === 'function') {
              const r = await api.imageSuggest(files.length === 1 ? files[0] : files);
              if (!r) return null;
              const guesses = [];
              if (r.query) guesses.push(r.query);
              if (Array.isArray(r.guesses)) guesses.push(...r.guesses);
              if (Array.isArray(r.titles))  guesses.push(...r.titles);
              return { guesses: [...new Set(guesses.filter(Boolean))], mediaType: r.mediaType || 'multi' };
            }
          } catch {}
          return null;
        })();

        if (iden?.guesses?.length) {
          type = iden.mediaType || 'multi';
          const settled = await Promise.allSettled(iden.guesses.slice(0,8).map(g => searchTMDB(g, 'multi', 1, true)));
          const exact = [];
          settled.forEach(p => {
            if (p.status !== 'fulfilled') return;
            (p.value?.results||[])
              .filter(r => r.media_type==='movie' || r.media_type==='tv')
              .forEach(it => exact.push(it));
          });
          rawItems = exact.slice(0,1);
          renderPeopleStrip([]);
        } else rawItems = [];
      } catch { rawItems = []; }
    }
    if (files.length && rawItems.length === 0 && !text) {
      results.innerHTML = '<div class="empty">Couldn’t confidently match your poster.<br/>Try typing a few letters and press <b>Suggest</b>.</div>';
      saveLastSearchState();
      return;
    }

    // 2) Describe mode — DO NOT use prompt/AI; never show default cards
    if (!files.length && text && mode === 'describe') {
      // Only use TMDB to detect people; if titles found, show helper message instead of cards
      const data = await searchTMDB(text, 'multi', 1);
      const people = (data.results || []).filter(r => r.media_type === 'person');
      const hasTitles = (data.results || []).some(r => r.media_type === 'movie' || r.media_type === 'tv');

      if (people.length) {
        renderPeopleStrip(people);
        results.innerHTML = '';
      } else if (hasTitles) {
        results.innerHTML = DESCRIBE_TITLE_MSG;
      } else {
        results.innerHTML = renderNoResultsMessage(text);
      }

      rawItems = []; // suppress cards in Describe
      if (toolbar) toolbar.hidden = true;
      if (regionPriceTools) regionPriceTools.hidden = true;
      if (filtersBox) filtersBox.hidden = true;
      if (loadMoreBtn) loadMoreBtn.style.display = 'none';
      saveLastSearchState();
      return;
    }

    // 3) Title mode: prompt-like queries → Gemini normalize → promptSearch (AI-fused)
    if (!files.length && text && mode === 'title' && rawItems.length === 0 && looksLikePrompt(text)) {
      try {
        const ai = await aiSuggest(text, 'title');
        const promptItems = await promptSearch(text, {
          type: (ai?.mediaType === 'tv' ? 'tv' : ai?.mediaType === 'movie' ? 'movie' : 'multi'),
          ai,
          region: userRegion
        });
        rawItems = normalizePromptItems(promptItems);
        current.source = 'prompt';
        renderPeopleStrip([]);
      } catch { rawItems = []; }
    }

    // 4) Fallback — TMDB only (Describe mode will NOT use aiSuggest anymore)
    if (!files.length && rawItems.length === 0) {
      current = { query, type, page: 1, source: 'tmdb' };
      const data = await searchTMDB(current.query, current.type, current.page);
      if (mode === 'title' && selectedFromTA?.id) {
        const exact = (data.results || []).find(r => (r.media_type==='movie' || r.media_type==='tv') && r.id === selectedFromTA.id);
        rawItems = exact ? [exact] : [{
          id: selectedFromTA.id, media_type: selectedFromTA.media_type || 'movie',
          title: selectedFromTA.__titleFromTA || text, name: selectedFromTA.__titleFromTA || text
        }];
        renderPeopleStrip([]);
        selectedFromTA = null;
      } else {
        const people = (data.results || []).filter(r => r.media_type === 'person');
        rawItems = (data.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv');
        if (people.length) await renderPeopleStrip(people); else renderPeopleStrip([]);
      }
    }

    // Sort & draw
    if (rawItems.length) {
      rawItems = rawItems.slice().sort((a,b)=> (b.vote_average||0)-(a.vote_average||0) || (b.popularity||0)-(a.popularity||0));
    }

    const hasResults = rawItems.length > 0;
    const showTools = hasResults && current.source === 'tmdb';
    if (toolbar) toolbar.hidden = !showTools;
    if (regionPriceTools) regionPriceTools.hidden = !showTools;

    if (hasResults) {
      await ensureGenres();
      const list = (type === 'movie' ? genreMap.movie : type === 'tv' ? genreMap.tv : [...genreMap.movie, ...genreMap.tv]);
      if (filtersBox) {
        filtersBox.hidden = !showTools;
        if (showTools) {
          renderGenres(
            filtersBox,
            list,
            (id)=>{ activeGenres.has(id)?activeGenres.delete(id):activeGenres.add(id); applyAndDraw(rawItems); },
            activeGenres
          );
        }
      }
      applyAndDraw(rawItems);
    } else {
      const q = (input?.value || '').trim();
      if (q) {
        results.innerHTML = renderNoResultsMessage(q);
      } else {
        results.innerHTML = '';
        const welcome2 = document.getElementById('welcome');
        if (welcome2) welcome2.hidden = false;
      }
      showEmpty(true);
      saveLastSearchState();
    }
  } catch (err) {
    console.error('Search failed:', err);
    results.innerHTML = `
      <div class="empty">
        Something went wrong while fetching results.
        <div style="margin-top:.25rem;opacity:.9">
          Please try again, or narrow your search (add a language like “Hindi” / “English”).
        </div>
      </div>`;
    showEmpty(true);
    const welcome3 = document.getElementById('welcome');
    if (welcome3) welcome3.hidden = false;
    saveLastSearchState();
  }
}

// triggers
function triggerSuggest(){ runSearch().catch(console.error); }
suggestBtn?.addEventListener('click', triggerSuggest);
form?.addEventListener('submit', (e)=>{ e.preventDefault(); triggerSuggest(); });

/* Load more (TMDB-paged only) */
loadMoreBtn?.addEventListener('click', async () => {
  try {
    if (current.source !== 'tmdb') return;
    current.page += 1;
    const next = await searchTMDB(current.query, current.type, current.page);
    const items = (next.results || []).filter(r => r.media_type==='movie' || r.media_type==='tv');

    const newPeople = (next.results || []).filter(r => r.media_type==='person');
    if (newPeople.length && !document.getElementById('people-strip')) await renderPeopleStrip(newPeople);

    rawItems = rawItems.concat(items).sort((a,b)=> (b.vote_average||0)-(a.vote_average||0) || (b.popularity||0)-(a.popularity||0));
    applyAndDraw(rawItems);
  } catch (err) { console.error('Load more failed:', err); }
});

/* Toolbar handlers */
[typeSel, sortSel].forEach(el => el?.addEventListener('change', () => { applyAndDraw(rawItems); }));
searchInResults?.addEventListener('input', () => { applyAndDraw(rawItems); });

/* Region/Price picker */
if (regionSel) {
  populateRegions();
  regionSel.addEventListener('change', () => { userRegion = regionSel.value || guessRegion(); saveLastSearchState(); });
}
if (priceSel) {
  priceSel.value = userPrice;
  priceSel.addEventListener('change', () => { userPrice = priceSel.value || 'all'; saveLastSearchState(); });
}

/* Modal close (bugfix) */
document.getElementById('modal')?.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target?.hasAttribute?.('data-close'))) return;
  const frame = document.getElementById('yt-frame');
  if (frame) { closeTrailer(); return; }
  const m = document.getElementById('modal');
  m.style.display = 'none'; m.innerHTML = ''; document.body.classList.remove('modal-open');
});

/* =========================
   Persist + Restore
   ========================= */
function saveLastSearchState() {
  try {
    const state = {
      q: input?.value || '', mode, current, rawItems, lastPeople,
      activeGenres: Array.from(activeGenres),
      typeSel: typeSel?.value || 'all', sortSel: sortSel?.value || 'relevance',
      searchInResults: searchInResults?.value || '', userRegion, userPrice,
      scrollY: window.scrollY || 0, ts: Date.now()
    };
    sessionStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {}
}
async function restoreLastSearchState() {
  try {
    const raw = sessionStorage.getItem(STORE_KEY); if (!raw) return false;
    const s = JSON.parse(raw);
    if (input) input.value = s.q || '';

    mode = s.mode || mode || 'title';
    if (mode === 'title') { modeTitle?.classList.add('chip--active'); modeDescribe?.classList.remove('chip--active'); }
    else { modeDescribe?.classList.add('chip--active'); modeTitle?.classList.remove('chip--active'); }
    setPlaceholders();

    if (typeSel) typeSel.value = s.typeSel || 'all';
    if (sortSel) sortSel.value = s.sortSel || sortSel.value;
    if (searchInResults) searchInResults.value = s.searchInResults || '';
    userRegion = s.userRegion || userRegion;
    userPrice  = s.userPrice  || userPrice;
    current  = s.current  || current;
    rawItems = Array.isArray(s.rawItems) ? s.rawItems : [];
    activeGenres = new Set(Array.isArray(s.activeGenres) ? s.activeGenres : []);
    lastPeople = Array.isArray(s.lastPeople) ? s.lastPeople : [];

    const hasResults = rawItems.length > 0;
    const welcomeEl = document.getElementById('welcome');
    if (welcomeEl) welcomeEl.hidden = !!hasResults;

    const showTools = hasResults && (s.current?.source === 'tmdb');
    if (toolbar) toolbar.hidden = !showTools;
    if (regionPriceTools) regionPriceTools.hidden = !showTools;

    if (!hasResults && lastPeople.length) await renderPeopleStrip(lastPeople);

    if (hasResults) {
      await ensureGenres();
      const list = (current.type === 'movie' ? genreMap.movie : current.type === 'tv' ? genreMap.tv : [...genreMap.movie, ...genreMap.tv]);
      if (filtersBox) {
        filtersBox.hidden = !showTools;
        if (showTools) {
          renderGenres(filtersBox, list, (id)=>{ activeGenres.has(id)?activeGenres.delete(id):activeGenres.add(id); applyAndDraw(rawItems); }, activeGenres);
        }
      }
      applyAndDraw(rawItems);
    } else { results.innerHTML=''; showEmpty(true); }
    setTimeout(()=>window.scrollTo(0, s.scrollY || 0), 0);
    return true;
  } catch { return false; }
}
restoreLastSearchState();

/* =========================
   Console helpers (dev)
   ========================= */
(function attachConsoleHelpers(){
  const isLocal = /localhost|127\.0\.0\.1/.test(location.hostname);
  if (!isLocal) return;
  async function loadAsFile(url, name='poster.png'){
    const res = await fetch(url); const b = await res.blob();
    return new File([b], name.replace(/\.[a-z0-9]+$/i,'')+'.png', { type: 'image/png' });
  }
  window.CF = window.CF || {};
  window.CF.debug = {
    async ocr(url){ const f = await loadAsFile(url); return api.imageSuggest(f); },
    async attach(url){
      const f = await loadAsFile(url);
      window.CF_ATTACH = [f];
      window.dispatchEvent(new Event('cf-attachments-changed'));
      document.querySelector('#suggest-btn')?.click();
    }
  };
  console.log('[CineForge] console helpers → CF.debug.ocr(url), CF.debug.attach(url)');
})();

window.CF = { ...(window.CF||{}), api };
