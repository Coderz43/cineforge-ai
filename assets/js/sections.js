// /assets/js/sections.js
// Injects: Features, How It Works, FAQ (accordion), Footer (black)

function faqJSONLD() {
  // Minimal FAQPage schema from the questions used below
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "How accurate is CineForge’s identification?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text":
            "For titles, we query TMDB directly and filter by strict matching. For poster screenshots we run local OCR and only show a result if the title matches exactly. This avoids false positives."
        }
      },
      {
        "@type": "Question",
        "name": "What can I use to search?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text":
            "Type a title, describe a mood, or upload poster/screenshot PNGs. CineForge blends your text with TMDB and our OCR pipeline to surface exact matches and strong candidates."
        }
      },
      {
        "@type": "Question",
        "name": "Is CineForge free to use?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text":
            "Yes. We use TMDB data and run all image identification locally in your browser during development."
        }
      },
      {
        "@type": "Question",
        "name": "Does it work in any country?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text":
            "Search works globally. “Where to Watch” honors your selected region so provider rows reflect availability in your country."
        }
      },
      {
        "@type": "Question",
        "name": "What if I only remember vague details?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text":
            "Use Describe mode. Write a quick vibe like “witty heist with friends” or “slow-burn space survival”; we pass that to the AI suggestor (dev uses passthrough) and search TMDB."
        }
      },
      {
        "@type": "Question",
        "name": "How does the visual analysis work?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text":
            "We OCR several cropped bands of the image to read title text and then cross-check those strings against TMDB with strict matching."
        }
      }
    ]
  };
}

function mountJSONLD(obj) {
  const el = document.createElement('script');
  el.type = 'application/ld+json';
  el.textContent = JSON.stringify(obj);
  document.head.appendChild(el);
}

export function injectCineForgeSections() {
  const welcome = document.getElementById('welcome');
  if (!welcome) return;

  const html = `
  <section class="cfx cfx-features" aria-labelledby="cf-feat-title">
    <div class="cfw">
      <p class="eyebrow">Why CineForge</p>
      <h2 id="cf-feat-title">Everything you need—fast and accurate</h2>
      <div class="cf-grid">
        <article class="cf-card" tabindex="0">
          <div class="cf-ico">🎯</div>
          <h3>Strict Title Matching</h3>
          <p>Poster OCR + exact TMDB title match. No junk results.</p>
        </article>
        <article class="cf-card" tabindex="0">
          <div class="cf-ico">🧭</div>
          <h3>Describe → Results</h3>
          <p>Say the vibe (e.g., “witty heist with friends”). We map it to strong movie/TV picks.</p>
        </article>
        <article class="cf-card" tabindex="0">
          <div class="cf-ico">🖼️</div>
          <h3>Screenshot Aware</h3>
          <p>Drop a poster/screenshot (PNG). We read visible text across smart crops.</p>
        </article>
        <article class="cf-card" tabindex="0">
          <div class="cf-ico">📺</div>
          <h3>Where to Watch</h3>
          <p>Instant providers by region: stream, rent, buy, or free—right in the details.</p>
        </article>
        <article class="cf-card" tabindex="0">
          <div class="cf-ico">⚡</div>
          <h3>Typeahead</h3>
          <p>Live TMDB titles while you type in Movie/TV mode.</p>
        </article>
        <article class="cf-card" tabindex="0">
          <div class="cf-ico">🧩</div>
          <h3>Smart Filters</h3>
          <p>Sort by rating/year and filter by genres without leaving the page.</p>
        </article>
      </div>
    </div>
  </section>

  <section class="cfx cfx-steps" aria-labelledby="cf-steps-title">
    <div class="cfw">
      <h2 id="cf-steps-title">Convert in 4 simple steps</h2>
      <ol class="steps">
        <li class="step">
          <span class="num">01</span>
          <h3>Pick a Mode</h3>
          <p>Choose <strong>Describe</strong> for vibes or <strong>Movie/TV</strong> for precise titles.</p>
        </li>
        <li class="step">
          <span class="num">02</span>
          <h3>Add Input</h3>
          <p>Type a title/description, or attach a PNG poster/screenshot.</p>
        </li>
        <li class="step">
          <span class="num">03</span>
          <h3>Suggest</h3>
          <p>Hit <strong>Suggest</strong>. We search TMDB and show exact matches first.</p>
        </li>
        <li class="step">
          <span class="num">04</span>
          <h3>Explore</h3>
          <p>Open a card to watch the trailer and see providers for your region.</p>
        </li>
      </ol>
    </div>
  </section>

  <section class="cfx cfx-faq" aria-labelledby="cf-faq-title">
    <div class="cfw">
      <p class="eyebrow">FAQ</p>
      <h2 id="cf-faq-title">Everything you need to know about CineForge</h2>
      <div class="faq" role="list">
        ${[
          {
            q: 'How accurate is CineForge’s identification?',
            a: 'We run strict matching on titles and require OCR guesses to equal the TMDB title (year must match if present).'
          },
          {
            q: 'What can I use to search?',
            a: 'Type a title, describe the mood, or upload a PNG with visible title text.'
          },
          {
            q: 'Is CineForge free to use?',
            a: 'Yes. Development uses local OCR and direct TMDB calls with your read key.'
          },
          {
            q: 'Does it work in any country?',
            a: 'Yes. Region-aware provider lists reflect streaming availability for your selected country.'
          },
          {
            q: 'What if I only remember vague details?',
            a: 'Switch to Describe mode and write a short vibe; we map it to relevant results.'
          },
          {
            q: 'How does the visual analysis work?',
            a: 'We preprocess your image, scan several bands with OCR, extract words likely to be a title, then cross-check on TMDB.'
          }
        ]
          .map(
            ({ q, a }, i) => `
          <details class="qa" role="listitem">
            <summary class="qa-head" aria-controls="faq-a-${i}">
              <span>${q}</span>
              <svg class="chev" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2"/></svg>
            </summary>
            <div id="faq-a-${i}" class="qa-body">${a}</div>
          </details>`
          )
          .join('')}
      </div>
    </div>
  </section>
  `;

  welcome.insertAdjacentHTML('afterend', html);

  // small hover/keyboard lift effect on feature cards
  document.querySelectorAll('.cf-card').forEach(card => {
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.classList.toggle('is-active');
        setTimeout(() => card.classList.remove('is-active'), 180);
      }
    });
  });

  // Footer quick links → switch modes smoothly
  document.querySelectorAll('[data-foot-nav="describe"]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('mode-describe')?.click();
      document.getElementById('search-input')?.focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
  document.querySelectorAll('[data-foot-nav="title"]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('mode-title')?.click();
      document.getElementById('search-input')?.focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // Add FAQ structured data
  mountJSONLD(faqJSONLD());
}

// Auto-run when imported
injectCineForgeSections();
