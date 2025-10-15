// File: /assets/js/tools/game-finder.js
// Controls Game Finder UI and formats results like the competitor.

import { aiComplete } from '/assets/js/tools/gemini.js';

(function () {
  // ------- DOM -------
  const $  = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  const form     = $('#game-form');
  const query    = $('#query');
  const budget   = $('#budget');
  const genre    = $('#genre');
  const platform = $('#platform');

  // Required IDs per your tools context:
  const statusBox = $('#status');      // status pill container
  const statusTxt = $('#status-text'); // text inside pill
  const reco      = $('#reco');        // textarea for numbered results
  const stores    = $('#stores');      // container with store link cards
  const btnCopy   = $('#copy');
  const btnClear  = $('#clear');

  // ------- Helpers -------
  const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const clean = (s) => String(s || '').replace(/\*\*(.*?)\*\*/g, '$1'); // strip **bold**

  function setStatus(state, text) {
    // state: idle | loading | success | error
    if (statusBox) statusBox.dataset.state = state;
    if (statusTxt) statusTxt.textContent = text || '';
  }

  function setActionsEnabled(ok) {
    if (btnCopy) {
      btnCopy.disabled = !ok;
      btnCopy.classList.toggle('is-hidden', !ok);
    }
    if (btnClear) {
      btnClear.disabled = !ok;
      btnClear.classList.toggle('is-hidden', !ok);
    }
  }

  function autoResizeTextarea() {
    if (!reco) return;
    reco.style.height = 'auto';
    // cap similar to competitor; tweak if you want
    reco.style.height = Math.min(reco.scrollHeight, 360) + 'px';
  }

  function ensureChipsHeading() {
    // Add "Example searches:" above .chips if not present
    const wrap = $('.chips');
    if (wrap && !(wrap.previousElementSibling && wrap.previousElementSibling.classList.contains('chips__label'))) {
      const h = document.createElement('div');
      h.className = 'chips__label';
      h.textContent = 'Example searches:';
      wrap.parentNode.insertBefore(h, wrap);
    }
  }

  function wireChips() {
    ensureChipsHeading();
    $$('.chips .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const v = chip.getAttribute('data-fill') || chip.textContent || '';
        if (query) {
          query.value = v.trim();
          query.focus();
        }
      });
    });
  }

  function buildPrompt() {
    const parts = [];
    if (query?.value?.trim()) parts.push(`User wants: ${query.value.trim()}`);
    if (budget?.value)   parts.push(`Budget: ${budget.value}`);
    if (genre?.value)    parts.push(`Genre: ${genre.value}`);
    if (platform?.value) parts.push(`Platform: ${platform.value}`);
    return parts.join('\n');
  }

  // ---- Store Cards (competitor style: 2x3 grid + full-width Amazon) ----
  function storeLinks(title) {
    const q = encodeURIComponent(title);
    return [
      { label: 'Steam',       href: `https://store.steampowered.com/search/?term=${q}` },
      { label: 'GOG',         href: `https://www.gog.com/en/games?query=${q}` },
      { label: 'Epic Games',  href: `https://store.epicgames.com/en-US/browse?q=${q}` },
      { label: 'PlayStation', href: `https://store.playstation.com/en-us/search/${q}` },
      { label: 'Xbox',        href: `https://www.xbox.com/en-US/search?q=${q}` },
      { label: 'Nintendo',    href: `https://www.nintendo.com/us/search/?q=${q}` },
      { label: 'Buy on Amazon', href: `https://www.amazon.com/s?k=${q}+video+game`, amazon: true }
    ];
  }

  function renderStores(titles) {
    if (!stores) return;
    stores.innerHTML = '';

    titles.forEach(title => {
      const links = storeLinks(title);
      const card = document.createElement('div');
      card.className = 'store-card';
      card.innerHTML = `
        <div class="store-card__title">"${title}"</div>
        <div class="store-card__grid">
          ${links.slice(0, 6).map(l => `
            <a class="store-btn" target="_blank" rel="noopener" href="${l.href}">
              ${l.label} <span aria-hidden="true">↗</span>
            </a>`).join('')}
          <a class="store-btn store-btn--amazon" target="_blank" rel="noopener" href="${links[6].href}">
            $&nbsp;&nbsp;${links[6].label} <span aria-hidden="true">↗</span>
          </a>
        </div>
      `;
      stores.appendChild(card);
    });
  }

  // text → ["Celeste", "Hollow Knight", ...]
  function extractTitles(text) {
    const set = new Set();
    let m;
    // 1) Lines like: 1. "Celeste" - desc
    const re = /["“](.+?)["”]\s*[-–—]/g;
    while ((m = re.exec(text))) set.add(t(m[1]));
    // 2) Quoted list lines at the bottom
    const re2 = /^\s*["“](.+?)["”]\s*$/gm;
    while ((m = re2.exec(text))) set.add(t(m[1]));
    return Array.from(set);
  }

  // ------- AI Prompts -------
  const SYSTEM_JSON = `
Return a JSON object with this exact shape:
{
  "summary": "1-2 sentences overall",
  "picks": [
    {
      "title": "Game Title",
      "blurb": "80-120 words explaining why it fits the request, include price ballpark and platforms.",
      "approx_price": "$10-$20"
    }
  ]
}
Only JSON. No markdown.
  `.trim();

  // ------- Events -------
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('loading', 'Finding games...');
    setActionsEnabled(false);
    if (reco)  reco.value = '';
    if (stores) stores.innerHTML = '';

    const user = buildPrompt();

    try {
      // Prefer JSON to keep formatting stable
      const out = await aiComplete({ system: SYSTEM_JSON, user, json: true });

      // Be tolerant: try straight parse, then salvage JSON substring if needed
      let data;
      try {
        data = JSON.parse(out);
      } catch {
        const first = out.indexOf('{');
        const last  = out.lastIndexOf('}');
        if (first !== -1 && last !== -1 && last > first) {
          try { data = JSON.parse(out.slice(first, last + 1)); } catch {}
        }
      }

      if (!data) {
        // Fallback: ask for clean text list (competitor-style)
        const txt = await aiComplete({
          system: 'List 8–10 matching games. Each item: "Title" - 1–2 sentences with platforms and approximate price.',
          user
        });
        if (reco) {
          reco.value = txt;
          autoResizeTextarea();
        }
        setStatus('success', 'Games found successfully!');
        setActionsEnabled(true);
        renderStores(extractTitles(txt));
        return;
      }

      const lines = [];
      const picks = (data?.picks || []).slice(0, 10); // cap like competitor
      picks.forEach((p, i) => {
        if (!p?.title || !p?.blurb) return;
        lines.push(`${i + 1}. "${clean(p.title)}" - ${clean(p.blurb)}`);
      });

      if (reco) {
        reco.value = lines.join('\n\n').trim();
        autoResizeTextarea();
      }
      setStatus('success', 'Games found successfully!');
      setActionsEnabled(true);
      renderStores(picks.map(p => p.title).filter(Boolean));

    } catch (err) {
      console.error('[game-finder] error:', err);
      setStatus('error', err?.message || 'Something went wrong');
      if (reco) {
        reco.value = (err?.message || 'Error') + '\n\nTry again in a moment.';
        autoResizeTextarea();
      }
      setActionsEnabled(false);
    }
  });

  btnCopy?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(reco?.value || '');
      btnCopy.textContent = '✓ Copied';
      setTimeout(() => (btnCopy.textContent = '📋 Copy Results'), 1200);
    } catch {}
  });

  btnClear?.addEventListener('click', () => {
    if (reco)  { reco.value = ''; autoResizeTextarea(); }
    if (stores) stores.innerHTML = '';
    setActionsEnabled(false);
    setStatus('idle', 'Ready to calculate');
  });

  // ------- init -------
  wireChips();
  setActionsEnabled(false);
  setStatus('idle', 'Ready to calculate');
})();
