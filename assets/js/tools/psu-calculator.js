/* PSU Calculator — CineForge
 * Matches competitor UX: status pill, tiles, breakdown, and PSU rec cards.
 * Uses shared Gemini helper (window.cf.gemini or window.Gemini) first.
 * Robust fallback: POST /api/gemini, else direct Google endpoint with key from
 * localStorage('cf-gemini-key'), window.CINEFORGE_GEMINI_KEY, or <meta name="gemini-key">.
 */

(function init() {
  // form events
  document.getElementById('psu-form')?.addEventListener('submit', onSubmit);
  document.getElementById('psu-clear')?.addEventListener('click', clearForm);

  // initial placeholder
  setTiles({ total: '—', recommended: '—', eff: '—' });
  setStatus('No Gemini key set — ready to use local fallback.', '⚠️');
})();

/* ---------------- UI helpers ---------------- */
function setStatus(text, icon = 'ℹ️', kind = '') {
  const pill = document.getElementById('psu-status');
  const txt = document.getElementById('psu-status-text');
  if (txt) txt.textContent = text;
  if (pill) {
    pill.classList.remove('success', 'warn');
    if (kind) pill.classList.add(kind);
  }
  const ico = pill?.querySelector('.ico');
  if (ico) ico.textContent = icon;
}

function setTiles({ total, recommended, eff }) {
  const t1 = document.getElementById('tile-total');
  const t2 = document.getElementById('tile-recommended');
  const t3 = document.getElementById('tile-eff');
  if (t1) t1.textContent = total;
  if (t2) t2.textContent = recommended;
  if (t3) t3.textContent = eff;
}

function showBreakdown(items) {
  const box = document.getElementById('breakdown');
  const list = document.getElementById('bdList');
  if (!box || !list) return;
  if (!items || !items.length) {
    box.style.display = 'none';
    list.innerHTML = '';
    return;
  }
  box.style.display = '';
  list.innerHTML = `<ul class="info-list">${items
    .map((i) => `<li><b>${escapeHtml(i.label)}:</b> ${escapeHtml(String(i.watts))} W</li>`)
    .join('')}</ul>`;
}

function showRecommendations(recs) {
  const wrap = document.getElementById('psu-recos');
  const list = document.getElementById('psu-recs-list');
  if (!wrap || !list) return;
  if (!recs || !recs.length) {
    wrap.style.display = 'none';
    list.innerHTML = '';
    return;
  }
  wrap.style.display = '';
  list.innerHTML = recs
    .slice(0, 4)
    .map((r) => {
      const q = r.query || `${r.name} ${r.wattage || ''} ${r.rating || ''} PSU`;
      const href = `https://www.amazon.com/s?k=${encodeURIComponent(q)}&tag=cineforge-20`;
      return `
        <div class="psu-card">
          <div>
            <div style="font-weight:800">${escapeHtml(r.name || 'Power Supply')}</div>
            <div class="badges">
              ${chip(`${r.wattage || '—'}W`)}
              ${chip(r.rating || '80+ Bronze')}
              ${chip(r.price || '$—')}
            </div>
          </div>
          <a class="view-btn" href="${href}" target="_blank" rel="noopener">View on Amazon →</a>
        </div>`;
    })
    .join('');
  function chip(text) {
    return `<span class="badge-chip">${escapeHtml(text)}</span>`;
  }
}

function clearForm() {
  const form = document.getElementById('psu-form');
  if (!form) return;
  form.reset();
  setTiles({ total: '—', recommended: '—', eff: '—' });
  showBreakdown([]);
  showRecommendations([]);
  setStatus('Cleared. Enter parts and calculate.', 'ℹ️');
}

/* ---------------- Submit handler ---------------- */
async function onSubmit(e) {
  e.preventDefault();

  const inputs = getInputs();
  // quick sanity: require CPU/GPU present (they always are with defaults)
  setStatus('Calculating with AI…', '⏳');

  const prompt = buildPrompt(inputs);

  let data;
  try {
    const text = await getGeminiText(prompt);
    data = parseGeminiJSON(text);
    setStatus('Calculation complete!', '✅', 'success');
  } catch (err) {
    const msg = String(err?.message || err);
    if (/Missing Gemini API key/i.test(msg)) {
      setStatus('No Gemini key set — showing local calculation fallback.', '⚠️', 'warn');
    } else if (/NO_PROXY/.test(msg)) {
      setStatus('AI proxy not found — using local fallback.', '⚠️', 'warn');
    } else {
      setStatus('AI request failed — using local fallback.', '⚠️', 'warn');
    }
    console.warn('[PSU Gemini error]', err);
    data = localFallback(inputs);
  }

  // Render UI
  setTiles({
    total: data.total_draw_w ? `${data.total_draw_w}W` : '—',
    recommended: data.recommended_psu_w ? `${data.recommended_psu_w}W` : '—',
    eff: data.efficiency_tier || '—',
  });
  showBreakdown(data.breakdown || []);
  showRecommendations(data.recommendations || []);
}

/* ---------------- Inputs & Prompt ---------------- */
function getInputs() {
  const val = (id) => {
    const el = document.getElementById(id);
    if (!el) return '';
    if (el.type === 'checkbox') return !!el.checked;
    return el.value || '';
  };
  return {
    cpu: val('cpu'),
    gpu: val('gpu'),
    ram_sticks: Number(val('ram') || 2),
    drives: Number(val('drives') || 1),
    mobo: val('mobo'), // entry | mid | high
    cooling: val('cool'), // air | aio120 | aio360
    overclock: val('oc'),
  };
}

function buildPrompt(p) {
  /* Ask for strict JSON so parsing is bulletproof. */
  return `
You are a PC power estimation assistant. Given the user's parts, estimate realistic system power draw and recommend PSU wattage and efficiency, similar to popular PSU calculators.

Parts:
- CPU: ${p.cpu}
- GPU: ${p.gpu}
- RAM sticks: ${p.ram_sticks}
- Storage drives: ${p.drives}
- Motherboard class: ${p.mobo} (entry|mid|high)
- Cooling: ${p.cooling} (air|aio120|aio360)
- Overclock planned: ${p.overclock ? 'yes' : 'no'}

Rules:
- Compute an estimated total system draw at peak gaming load, then add ~30% headroom for the recommended PSU.
- Choose a reasonable efficiency tier string like "80+ Bronze", "80+ Gold", or "80+ Platinum".
- Provide a short component breakdown list (label + watts) covering CPU, GPU, Motherboard, RAM total, Storage total, Cooling/Fans, and Misc/USB.
- Provide 2–4 PSU suggestions with fields: name, wattage, rating (80+ tier), price (approx), and "query" for an Amazon search.

IMPORTANT: Return ONLY a JSON object (no markdown, no explanation). The schema:

{
  "total_draw_w": number,
  "recommended_psu_w": number,
  "efficiency_tier": "80+ Gold",
  "breakdown": [{"label":"CPU","watts":170}, ...],
  "recommendations": [
    {"name":"Corsair RM750x (2021)","wattage":750,"rating":"80+ Gold","price":"$120","query":"Corsair RM750x 80+ Gold"},
    ...
  ]
}
`.trim();
}

/* ---------------- Gemini helpers (robust) ---------------- */
async function getGeminiText(prompt) {
  // 1) preferred shared helper
  if (window?.cf?.gemini?.generateText) {
    const r = await window.cf.gemini.generateText(prompt, { model: window.CINEFORGE_GEMINI_MODEL || 'gemini-2.0-flash' });
    if (r) return String(r);
  }
  // 2) alternate helper
  if (window?.Gemini?.generateText) {
    const r = await window.Gemini.generateText(prompt, { model: window.CINEFORGE_GEMINI_MODEL || 'gemini-2.0-flash' });
    if (r) return String(r);
  }

  // Keys & endpoints
  const key =
    window.CINEFORGE_GEMINI_KEY ||
    localStorage.getItem('cf-gemini-key') ||
    document.querySelector('meta[name="gemini-key"]')?.content ||
    '';

  // 3) try local proxy
  const proxy = window.API_BASE?.gemini || '/api/gemini';
  try {
    const r = await fetch(proxy, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { 'x-api-key': key } : {}) },
      body: JSON.stringify({ prompt, model: window.CINEFORGE_GEMINI_MODEL || 'gemini-2.0-flash' })
    });
    if (!r.ok) {
      if (r.status === 404) throw new Error('NO_PROXY');
      throw new Error(`Gemini HTTP ${r.status}`);
    }
    const data = await r.json();
    return data.text || data.output || data.result || JSON.stringify(data);
  } catch (err) {
    if (String(err.message) !== 'NO_PROXY') {
      // If it's not the explicit missing-proxy signal, rethrow and let caller fallback.
      throw err;
    }
  }

  // 4) direct Google endpoint (needs API key)
  if (!key) throw new Error('Missing Gemini API key (set localStorage "cf-gemini-key" or window.CINEFORGE_GEMINI_KEY or <meta name="gemini-key">).');

  const base = 'https://generativelanguage.googleapis.com/v1beta';
  const model = 'models/gemini-2.0-flash:generateContent';
  const r = await fetch(`${base}/${model}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4 }
    })
  });
  if (!r.ok) throw new Error(`Gemini HTTP ${r.status}`);
  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  return text || JSON.stringify(data);
}

/* ---------------- Parsing & Fallback ---------------- */
function parseGeminiJSON(text) {
  if (!text) throw new Error('Empty Gemini response');

  // If Gemini wrapped it in a code fence, strip it.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;

  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    // Sometimes models add stray prose; try to extract first {...} block.
    const brace = raw.match(/\{[\s\S]*\}/);
    if (!brace) throw new Error('JSON parse failed');
    obj = JSON.parse(brace[0]);
  }

  // Normalize shapes
  obj.breakdown = Array.isArray(obj.breakdown) ? obj.breakdown : [];
  obj.recommendations = Array.isArray(obj.recommendations) ? obj.recommendations : [];
  return obj;
}

function localFallback(p) {
  // Simple deterministic estimator (reasonable ranges)
  const CPU_TDP = {
    'i5-12400': 65,
    'i5-13400F': 65,
    'i7-13700KF': 125,
    'r5-5600': 65,
    'r5-7600': 65,
    'r7-7800x3d': 120,
    'r9-7950x': 170
  };
  const GPU_TDP = {
    rtx3060: 170,
    rtx4070: 200,
    rtx4080: 320,
    rtx4090: 450,
    rx6600: 132,
    rx7700xt: 245,
    rx7800xt: 263,
    rx7900xtx: 355
  };

  const cpu = CPU_TDP[p.cpu] ?? 95;
  const gpu = GPU_TDP[p.gpu] ?? 150;
  const mobo = p.mobo === 'entry' ? 25 : p.mobo === 'high' ? 55 : 40;
  const ram = (p.ram_sticks || 2) * 8; // ~8W each
  const storage = (p.drives || 1) * 6; // mix SSD/HDD
  const fans = 10 * (p.cooling === 'aio360' ? 4 : p.cooling === 'aio120' ? 3 : 2);
  const pump = p.cooling === 'air' ? 0 : 8;
  const misc = 30;

  let total = cpu + gpu + mobo + ram + storage + fans + pump + misc;
  if (p.overclock) total *= 1.15;

  const totalW = Math.round(total);
  const recommended = roundUp50(Math.max(450, Math.round(totalW * 1.3)));

  const efficiency =
    recommended >= 1000 ? '80+ Platinum' :
    recommended >= 750  ? '80+ Gold' :
    recommended >= 650  ? '80+ Gold' :
    '80+ Bronze / Gold';

  const breakdown = [
    { label: 'CPU', watts: cpu },
    { label: 'GPU', watts: gpu },
    { label: 'Motherboard', watts: mobo },
    { label: `RAM (${p.ram_sticks}x)`, watts: ram },
    { label: `Storage (${p.drives}x)`, watts: storage },
    { label: 'Cooling/Fans', watts: fans + pump },
    { label: 'Misc/USB', watts: misc },
    { label: 'Overclock', watts: p.overclock ? 'Yes (+15%)' : 'No' }
  ];

  const recs = [
    { name: 'Corsair CX550M', wattage: 550, rating: '80+ Bronze', price: '$45–60', query: 'Corsair CX550M 550W' },
    { name: 'Corsair RM750x (2021)', wattage: 750, rating: '80+ Gold', price: '$110–130', query: 'Corsair RM750x 80+ Gold' },
    { name: 'Seasonic Focus GX-850', wattage: 850, rating: '80+ Gold', price: '$120–150', query: 'Seasonic Focus GX-850 Gold' },
    { name: 'EVGA SuperNOVA 1000 P3', wattage: 1000, rating: '80+ Platinum', price: '$170–220', query: 'EVGA SuperNOVA 1000 Platinum' }
  ].filter(r => r.wattage >= recommended * 0.9).slice(0, 3);

  return {
    total_draw_w: totalW,
    recommended_psu_w: recommended,
    efficiency_tier: efficiency,
    breakdown,
    recommendations: recs
  };
}

/* ---------------- Utils ---------------- */
function roundUp50(n) {
  return Math.ceil(n / 50) * 50;
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
