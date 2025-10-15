// File: /assets/js/tools/movie-finder.js
// Works with your Gemini helper at /assets/js/tools/gemini.js
// Supports either export style: generateText(prompt) OR aiComplete({ system, user, json })
import * as AI from '/assets/js/tools/gemini.js';

/* ---------- elements ---------- */
const q     = document.getElementById('mv-query');
const genre = document.getElementById('mv-genre');
const year  = document.getElementById('mv-year');
const type  = document.getElementById('mv-type');
const form  = document.getElementById('mv-search-form');

const statusBox = document.getElementById('mv-status');
const statusTxt = document.getElementById('mv-status-text') || statusBox?.querySelector('span:last-child');
const reco      = document.getElementById('mv-reco');        // <textarea>
const providers = document.getElementById('mv-providers');   // provider buttons container
const copyBtn   = document.getElementById('mv-copy');
const clearBtn  = document.getElementById('mv-clear');

/* ---------- tiny helpers ---------- */
function setStatus(msg, ok = false) {
  if (!statusBox) return;
  statusBox.classList.toggle('ok', ok);
  statusBox.dataset.state = ok ? 'ok' : 'idle';
  if (statusTxt) statusTxt.textContent = msg;
}
function showActions(show) {
  copyBtn?.classList.toggle('is-hidden', !show);
  clearBtn?.classList.toggle('is-hidden', !show);
}
// ensure CSS helper exists even if not in global CSS
(function injectHiddenClass() {
  if (!document.getElementById('mv-hidden-style')) {
    const s = document.createElement('style');
    s.id = 'mv-hidden-style';
    s.textContent = '.is-hidden{display:none !important}';
    document.head.appendChild(s);
  }
})();

/* ---------- provider links (search-only like competitor) ---------- */
function makeProviderLink(name, title) {
  const term = encodeURIComponent(title);
  const map = {
    Netflix:        `https://www.netflix.com/search?q=${term}`,
    'Prime Video':  `https://www.amazon.com/s?k=${term}`,
    'Disney+':      `https://www.disneyplus.com/search?q=${term}`,
    Hulu:           `https://www.hulu.com/search?q=${term}`,
    Max:            `https://play.max.com/search?q=${term}`,
    'Paramount+':   `https://www.paramountplus.com/search/?query=${term}`,
    Peacock:        `https://www.peacocktv.com/search?q=${term}`,
    'Apple TV+':    `https://tv.apple.com/search?term=${term}`,
    Vudu:           `https://www.vudu.com/content/movies/search/${term}`,
    YouTube:        `https://www.youtube.com/results?search_query=${term}`,
    Google:         `https://www.google.com/search?q=${term}+watch`
  };
  return map[name] || map.Google;
}

/* ---------- parse titles from AI output ---------- */
/** Extract up to 12 unique titles from free-form list text */
function extractTitles(txt) {
  if (!txt) return [];
  const lines = txt.split('\n').map(s => s.trim()).filter(Boolean);
  const titles = [];
  const rxHead = /^"?([^"•\-–—*]+?)"?\s*(?:—|-|–|:|•|\(|\[|$)/;

  for (let line of lines) {
    line = line.replace(/^\s*(\d+\.|[-–—*•])\s*/, ''); // trim list markers
    let t = (line.match(rxHead)?.[1] || '').trim();

    // fallback to quoted title anywhere in the line
    if (!t) {
      const q = line.match(/"([^"]{2,100})"/);
      if (q) t = q[1].trim();
    }

    // sanity checks
    if (!t || t.length < 2 || t.length > 100) continue;
    if (/^\d+$/.test(t)) continue;

    const exists = titles.some(x => x.toLowerCase() === t.toLowerCase());
    if (!exists) titles.push(t);
    if (titles.length >= 12) break;
  }
  return titles.slice(0, 12);
}

/* ---------- prompt ---------- */
function buildPrompt() {
  const wants = q?.value.trim() || 'Feel-good popular movies and comfort TV shows';
  const g = (genre?.value || 'Any genre');
  const y = (year?.value || 'Any year/era');
  const t = (type?.value || 'Any type');

  return `You are a helpful cine/TV recommendation assistant.

Task: Recommend 8–12 titles that match the user's search and filters.
For each title, output ONE line in this exact shape:
"<Title>" — 1–2 sentence pitch covering tone, genre, notable cast/director, and watch context.

User search: "${wants}"
Genre filter: ${g}
Year/Era filter: ${y}
Type filter: ${t}  (movie | show | mini-series | any)

Rules:
- Blend well-known hits with a few underrated picks.
- Keep each pitch crisp (<= 50 words).
- Start each line with a quoted title like "Arrival" — ... or "Breaking Bad" — ...
- No numbering, no markdown, no extra sections. Just the lines described above.`;
}

/* ---------- Gemini call wrapper ---------- */
async function callGemini(prompt) {
  if (typeof AI.generateText === 'function') {
    return AI.generateText(prompt);
  }
  if (typeof AI.aiComplete === 'function') {
    return AI.aiComplete({ system: 'You are a concise film & TV recommender.', user: prompt, json: false });
  }
  throw new Error('No Gemini client available. Export generateText or aiComplete in /assets/js/tools/gemini.js');
}

/* ---------- chips: fill + auto-run (match competitor UX) ---------- */
document.querySelectorAll('.chip[data-fill]').forEach(chip => {
  chip.addEventListener('click', () => {
    if (!q || !form) return;
    q.value = chip.getAttribute('data-fill') || '';
    q.focus();
    form.requestSubmit();
  });
});

/* ---------- provider cards (competitor-style 2x3 + Amazon strip) ---------- */
function renderProviderCards(titles) {
  if (!providers) return;
  providers.innerHTML = '';

  // Heading like competitor
  const h = document.createElement('h4');
  h.textContent = 'Where to Watch:';
  h.style.margin = '12px 0 6px';
  providers.appendChild(h);

  // order matters – we take first 6 for the grid
  const svcOrder = ['Netflix','Prime Video','Disney+','Hulu','Max','Paramount+','Peacock','Apple TV+','Vudu','YouTube'];

  titles.forEach(title => {
    const card = document.createElement('div');
    card.className = 'provider-card';
    card.innerHTML = `
      <div class="provider-card__title">"${title}"</div>
      <div class="provider-card__grid">
        ${svcOrder.slice(0, 6).map(name => `
          <a class="provider-btn" target="_blank" rel="noopener" href="${makeProviderLink(name, title)}">
            ${name} <span aria-hidden="true">↗</span>
          </a>`).join('')}
        <a class="provider-btn provider-btn--amazon" target="_blank" rel="noopener" href="${makeProviderLink('Prime Video', title)}">
          $&nbsp;&nbsp;Buy on Amazon <span aria-hidden="true">↗</span>
        </a>
      </div>
    `;
    providers.appendChild(card);
  });
}

/* ---------- submit ---------- */
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus('Finding movies & shows…');
  providers.innerHTML = '';
  if (reco) reco.value = 'Thinking…';
  showActions(false);

  try {
    const text = await callGemini(buildPrompt());
    const out = (text || '').trim() || 'No response. Try refining your query.';
    setStatus('Recommendations ready!', true);
    if (reco) reco.value = out;
    showActions(true);

    // Build provider cards per title (limit to 8 for compact view)
    const titles = extractTitles(out).slice(0, 8);
    if (titles.length) {
      renderProviderCards(titles);
    } else {
      providers.innerHTML = '<div style="opacity:.8;margin-top:6px">No clean titles parsed — try a different query.</div>';
    }
  } catch (err) {
    console.error('[Movie Finder] Gemini error:', err);
    setStatus('Error fetching recommendations');
    if (reco) reco.value = 'Sorry — something went wrong. Please try again.';
    showActions(false);
  }
});

/* ---------- actions ---------- */
copyBtn?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText((reco?.value || '').trim());
    setStatus('Copied to clipboard!', true);
  } catch {
    setStatus('Copy failed');
  }
});

clearBtn?.addEventListener('click', () => {
  if (q) q.value = '';
  providers.innerHTML = '';
  showActions(false);
  setStatus('Ready to calculate');
  if (reco) {
    reco.value = 'Enter your preferences and click “Find Movies & Shows” to get personalized recommendations.';
  }
});

/* ---------- optional console smoke-test ----------
(async () => {
  try {
    const sample = await callGemini('Reply with OK.');
    console.log('[gemini smoke-test] →', sample);
  } catch (e) {
    console.warn('[gemini smoke-test] failed:', e?.message || e);
  }
})();
--------------------------------------------------- */
