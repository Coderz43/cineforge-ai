/* FPS Calculator — CineForge
 * Competitor-style UI renderer + estimator + Gemini-assisted paste parser
 * Works with fps-calculator.html provided by you.
 */

(function init() {
  // ====== Shortcuts & Elements ======
  const $ = (id) => document.getElementById(id);

  // Forms
  const formQuick  = $('fps-form');
  const formPaste  = $('fps-form-paste');
  const clearBtn   = $('fps-clear');

  // Inputs
  const inCPU   = $('cpu');
  const inGPU   = $('gpu');
  const inRes   = $('res');
  const inQual  = $('qual');
  const inGame  = $('game');
  const inRAM   = $('ramgb');
  const inRT    = $('rt');
  const inDLSS  = $('dlss');
  const inFSR   = $('fsr');

  // Result container (we’ll fully control its HTML for a competitor-like layout)
  const resultsRoot = $('results');

  // Legacy top numbers (still used by status pill on first load)
  const elMain   = $('fpsMain');
  const elNote   = $('fpsNote');
  const elKpis   = $('kpis');
  const elLow1   = $('low1');
  const elAvg    = $('avg');
  const elPeak   = $('peak');
  const elBottleBox = $('bottleneckBox');
  const elBottle = $('bottleneck');

  // Status pill
  const pill = $('fps-status');
  const pillText = $('fps-status-text');
  function setStatus(text, ok = true, iconOk = '✅', iconWarn = '⚠️') {
    if (!pill || !pillText) return;
    pillText.innerHTML = text;
    pill.classList.remove('status-ok', 'status-warn');
    pill.classList.add(ok ? 'status-ok' : 'status-warn');
    pill.querySelector('.ico').textContent = ok ? iconOk : iconWarn;
  }

  function resetResults() {
    elMain.textContent = 'Ready to calculate';
    elNote.innerHTML = 'Select your components and click <b>Calculate FPS</b> to see your results.';
    elKpis.style.display = 'none';
    elBottleBox.style.display = 'none';
    resultsRoot.dataset.hydrated = '0';
  }

  clearBtn?.addEventListener('click', () => {
    resetResults();
    setStatus('Form cleared. Fill inputs and calculate again.', true, '🧹');
  });

  // ====== Estimator (balanced & conservative) ======
  const GPU_BASE_1080_HIGH = {
    rtx3060: 95, rtx4060: 110, rtx4070: 150, rtx4080: 210, rtx4090: 260,
    rx6600: 90, rx7700xt: 145, rx7800xt: 170, rx7900xtx: 240
  };
  const CPU_TIERS = {
    "r5-5600": 1.00, "i5-12400": 1.00,
    "i5-13400F": 1.05, "r5-7600": 1.08,
    "i7-13700KF": 1.15, "r7-7800x3d": 1.25, "r9-7950x": 1.20
  };
  const GAME_WEIGHTS = {
    cyberpunk: 1.00, rdr2: 0.95, cs2: 1.9, valorant: 1.7,
    fortnite: 1.3, gtav: 1.35, eldenring: 1.05, apex: 1.4, pubg: 1.2
  };
  const RES_SCALE  = { "1080": 1.00, "1440": 0.72, "2160": 0.47 };
  const QUAL_SCALE = { low: 1.25, med: 1.05, high: 1.00, ultra: 0.88 };
  const RT_PENALTY = 0.70; // ~30% hit
  const DLSS_BOOST = 1.25; // Quality/Auto
  const FSR_BOOST  = 1.18;

  const fmt = (n) => Math.round(n);

  function estimate({ cpu, gpu, res, qual, game, ramGB, rt, dlss, fsr }) {
    const base = GPU_BASE_1080_HIGH[gpu] ?? 100;
    const weight = GAME_WEIGHTS[game] ?? 1.0;

    let fps = base * (RES_SCALE[res] ?? 1) * (QUAL_SCALE[qual] ?? 1) * weight;

    if (rt) fps *= RT_PENALTY;
    if (dlss && gpu.startsWith('rtx')) fps *= DLSS_BOOST;
    if (fsr) fps *= FSR_BOOST;

    const headroom = CPU_TIERS[cpu] ?? 1.0;
    const cpuCeil = (res === "1080" ? 170 : res === "1440" ? 220 : 280) * headroom;

    const avg = Math.min(fps, cpuCeil);
    const low1 = Math.max(30, avg * 0.70);
    const peak = avg * 1.25;

    // Bottleneck guess
    let mainLimit = 'Balanced';
    if (avg >= cpuCeil - 2) mainLimit = 'CPU';
    else if (rt || qual === 'ultra' || res === '2160') mainLimit = 'GPU';

    let bottleMsg =
      mainLimit === 'CPU'
        ? 'Likely CPU-bound for these settings (try higher resolution or increase graphics quality).'
        : mainLimit === 'GPU'
          ? 'Likely GPU-bound (reduce RT/quality or enable DLSS/FSR).'
          : 'Balanced — no strong bottleneck expected.';

    if ((ramGB || '').toUpperCase() === '8GB') {
      bottleMsg += ' Note: 8GB RAM may cause stutter and longer loads in modern titles.';
    }

    // Performance level buckets (competitor-like)
    let level = 'Poor';
    if (avg >= 120) level = 'Excellent';
    else if (avg >= 60) level = 'Good';
    else if (avg >= 30) level = 'Playable';

    return {
      low1: fmt(low1),
      avg: fmt(avg),
      peak: fmt(peak),
      mainLimit,
      level,
      bottleMsg
    };
  }

  // ====== Scenario helpers (for competitor-like tabs above the summary) ======
  function buildScenariosFromForm() {
    const base = readForm();
    const s1 = estimate({ ...base, rt: false, dlss: false, fsr: false }); // Raster
    // Choose DLSS for RTX, otherwise FSR if user had one checked; still enforce RT on
    const useDLSS = base.gpu.startsWith('rtx');
    const s2 = estimate({
      ...base,
      rt: true,
      dlss: useDLSS,
      fsr: !useDLSS,
    }); // RT + Balanced (keep user quality)
    // RT + Performance (slightly lower quality to simulate “performance” preset)
    const perfQual = base.qual === 'ultra' ? 'high' : base.qual === 'high' ? 'med' : base.qual;
    const s3 = estimate({
      ...base,
      qual: perfQual,
      rt: true,
      dlss: useDLSS,
      fsr: !useDLSS
    });

    return {
      Raster: s1,
      'RT + Balanced': s2,
      'RT + Performance': s3
    };
  }

  function perfBadge(level) {
    // small colored chip-like span using inline styles so no extra CSS is required
    const map = {
      Excellent: '#34d399', // green
      Good: '#a7f3d0',      // mint
      Playable: '#fbbf24',  // amber
      Poor: '#f87171'       // red
    };
    const bg = map[level] || '#a7f3d0';
    const fg = '#0b0e14';
    return `<span style="display:inline-block;padding:6px 10px;border-radius:999px;background:${bg};color:${fg};font-weight:700;font-size:.85rem">${level}</span>`;
  }

  function bottleBadge(what) {
    const clr = what === 'CPU' ? '#60a5fa' : what === 'GPU' ? '#f472b6' : '#93c5fd';
    return `<span style="display:inline-block;padding:6px 10px;border-radius:999px;background:${clr}33;color:#cbd5e1;border:1px solid ${clr}55;font-weight:700;font-size:.85rem">${what}</span>`;
  }

  // ====== DOM Rendering (competitor-like layout) ======
  function renderCompetitorUI(all, activeKey, meta) {
    const { gameTxt, resTxt, qualTxt } = meta;

    const tabs = Object.keys(all)
      .map(k => {
        const on = k === activeKey ? 'is-on' : '';
        return `<button class="scenario-tab ${on}" data-scenario="${k}" style="
          border:1px solid rgba(255,255,255,.12);background:#0b0e14;color:#cbd5e1;
          padding:8px 12px;border-radius:10px;cursor:pointer;margin-right:8px;
          ${on ? 'background:#181c27;border-color:#7b3ff2;box-shadow:0 0 0 2px rgba(123,63,242,.25) inset' : ''}
        ">${k}</button>`;
      })
      .join('');

    const pick = all[activeKey];

    // Summary row: Estimated FPS • Bottleneck • Performance Level
    const summary = `
      <div class="result-box" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px">
        <div class="card-like" style="border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:16px;background:#0f1117;text-align:center">
          <div style="font-size:34px;font-weight:900">${pick.avg}</div>
          <div style="opacity:.85">Estimated FPS</div>
          <div style="margin-top:6px;opacity:.7;font-size:.86rem">${resTxt} • ${qualTxt}</div>
        </div>
        <div class="card-like" style="border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:16px;background:#0f1117;text-align:center">
          <div style="margin-bottom:6px">${bottleBadge(pick.mainLimit)}</div>
          <div style="opacity:.85">Performance Bottleneck</div>
          <div style="opacity:.7;font-size:.86rem">Main limiting factor</div>
        </div>
        <div class="card-like" style="border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:16px;background:#0f1117;text-align:center">
          <div style="margin-bottom:6px">${perfBadge(pick.level)}</div>
          <div style="opacity:.85">Performance Level</div>
          <div style="opacity:.7;font-size:.86rem">Overall rating</div>
        </div>
      </div>
    `;

    // KPI row: 1% Low • Average • Peak
    const kpis = `
      <div class="result-box" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px">
        ${['1% Low', 'Average', 'Peak'].map((label, i) => {
          const val = i === 0 ? pick.low1 : i === 1 ? pick.avg : pick.peak;
          return `
            <div style="border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:14px;background:#0b0e14;text-align:center">
              <div style="opacity:.85">${label}</div>
              <div style="font-size:22px;font-weight:800;margin-top:6px">${val}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Lower detail grid (2 columns)
    const config = `
      <div class="result-box" style="border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:16px">
        <div style="font-weight:800;margin-bottom:10px">🕹️ Game Configuration</div>
        <div style="display:grid;gap:10px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div class="dim">Game:</div><div style="font-weight:700">${gameTxt}</div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div class="dim">Settings:</div>
            <div><span style="padding:6px 10px;border-radius:999px;background:#0f1117;border:1px solid rgba(255,255,255,.12)">${resTxt}</span>
                 <span style="padding:6px 10px;border-radius:999px;background:#0f1117;border:1px solid rgba(255,255,255,.12);margin-left:6px">${qualTxt}</span></div>
          </div>
        </div>
      </div>
    `;

    const target = `
      <div class="result-box" style="border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:16px">
        <div style="font-weight:800;margin-bottom:10px">⚡ Performance Target</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div class="dim">Target FPS:</div>
          <div style="padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:#0f1117;font-weight:800">${pick.avg} FPS</div>
        </div>
        <div style="border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:10px;background:#0b0e14;opacity:.9">
          Great for casual gaming
        </div>
      </div>
    `;

    const perf = `
      <div class="result-box" style="border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:16px">
        <div style="font-weight:800;margin-bottom:10px">⚡ FPS Performance</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div class="dim">Current Estimate:</div>
          <div style="padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:#0f1117;font-weight:800">${pick.avg} FPS</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <div style="width:8px;height:8px;border-radius:999px;background:#7b3ff2"></div>
          <div class="dim">Resolution: ${resTxt} • Quality: ${qualTxt}</div>
        </div>
      </div>
    `;

    const bottle = `
      <div class="result-box" style="border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:16px">
        <div style="font-weight:800;margin-bottom:10px">📊 Bottleneck Analysis</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div class="dim">Main Limitation:</div>
          <div>${bottleBadge(pick.mainLimit)}</div>
        </div>
        <div style="border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:10px;background:#0b0e14;opacity:.9">
          ${pick.bottleMsg}
        </div>
      </div>
    `;

    const compare = `
      <div class="result-box" style="border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:16px">
        <div style="font-weight:800;margin-bottom:12px">📊 Performance Comparison</div>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px">
          <div style="border:1px solid rgba(52,211,153,.35);border-radius:12px;padding:14px;text-align:center;background:#052e27">
            <div style="font-weight:900">120+ FPS</div>
            <div style="opacity:.8;font-size:.85rem">Competitive Gaming</div>
            <div style="opacity:.7;font-size:.8rem">Smooth, responsive</div>
          </div>
          <div style="border:1px solid rgba(167,243,208,.35);border-radius:12px;padding:14px;text-align:center;background:#0a2c33">
            <div style="font-weight:900">60–119 FPS</div>
            <div style="opacity:.8;font-size:.85rem">Standard Gaming</div>
            <div style="opacity:.7;font-size:.8rem">Good experience</div>
          </div>
          <div style="border:1px solid rgba(251,191,36,.35);border-radius:12px;padding:14px;text-align:center;background:#332c09">
            <div style="font-weight:900">30–59 FPS</div>
            <div style="opacity:.8;font-size:.85rem">Playable</div>
            <div style="opacity:.7;font-size:.8rem">May stutter</div>
          </div>
        </div>
      </div>
    `;

    // Compose full results
    resultsRoot.innerHTML = `
      <div class="result-box" style="border:1px solid rgba(123,63,242,.35);background:linear-gradient(180deg,#10131c,#0c0f18);border-radius:12px;padding:14px;margin-bottom:12px">
        <div style="font-weight:800">🎯 Performance Results</div>
        <div class="dim" style="margin-top:6px">Your <b>${gameTxt}</b> performance at <b>${resTxt}</b> <b>${qualTxt}</b></div>
      </div>

      <div class="result-box" style="padding:12px">
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">${tabs}</div>
        ${summary}
      </div>

      ${kpis}

      <div style="display:grid;grid-template-columns:1fr;gap:12px;margin-top:12px">
        <div style="display:grid;grid-template-columns:1fr;gap:12px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            ${config}
            ${target}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            ${perf}
            ${bottle}
          </div>
          ${compare}
        </div>
      </div>
    `;

    // Wire scenario tab clicks
    resultsRoot.querySelectorAll('.scenario-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        renderCompetitorUI(all, btn.dataset.scenario, meta);
      });
    });
    resultsRoot.dataset.hydrated = '1';
  }

  function readForm() {
    return {
      cpu:   inCPU.value,
      gpu:   inGPU.value,
      res:   inRes.value,
      qual:  inQual.value,
      game:  inGame.value,
      ramGB: inRAM.value,
      rt:    inRT.checked,
      dlss:  inDLSS.checked,
      fsr:   inFSR.checked
    };
  }

  function runCalcAndRender() {
    const data = readForm();
    // Original small KPIs (kept for backward-compat — also drives status pill)
    const out = estimate(data);
    elMain.textContent = `${out.avg} FPS Estimated`;
    const resTxt  = inRes.options[inRes.selectedIndex].textContent;
    const qualTxt = inQual.options[inQual.selectedIndex].textContent;
    const gameTxt = inGame.options[inGame.selectedIndex]?.textContent || 'Selected Game';
    elNote.innerHTML = `Game: <b>${gameTxt}</b> • Resolution: <b>${resTxt}</b> • Quality: <b>${qualTxt}</b>`;
    elKpis.style.display = 'grid';
    elLow1.textContent = out.low1;
    elAvg.textContent  = out.avg;
    elPeak.textContent = out.peak;
    elBottleBox.style.display = 'block';
    elBottle.textContent = out.bottleMsg;

    // Competitor-style big layout
    const scenarios = buildScenariosFromForm();
    renderCompetitorUI(scenarios, 'Raster', { gameTxt, resTxt, qualTxt });
  }

  // Submit handlers
  formQuick?.addEventListener('submit', (e) => {
    e.preventDefault();
    runCalcAndRender();
    setStatus('Calculation complete!', true);
  });

  // ====== Paste → Gemini parse → populate → render ======
  formPaste?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = ($('paste').value || '').trim();
    if (!text) return setStatus('Paste your specs first.', false);

    try {
      setStatus('Parsing specs with AI…', true, '⏳');
      const prompt = buildParsePrompt(text);
      const ai = await getGeminiText(prompt);
      const parsed = safeJson(ai);
      if (!parsed || typeof parsed !== 'object') throw new Error('AI did not return valid JSON');

      applyParsedToUI(parsed);
      runCalcAndRender();
      setStatus('Specs parsed and FPS calculated!', true);
    } catch (err) {
      const msg = String(err?.message || err);
      if (/Missing Gemini API key/i.test(msg)) {
        setStatus('No Gemini key set — local calculation still works. Add key in localStorage "cf-gemini-key".', false);
      } else if (/HTTP 404/.test(msg) || /NO_PROXY/.test(msg)) {
        setStatus('AI proxy not found — local calculation only.', false);
      } else {
        setStatus('Could not parse via AI — try adjusting your text. Local calculator still works.', false);
      }
      console.warn('[FPS Gemini parse error]', err);
    }
  });

  // ====== Paste-mode helpers ======
  function buildParsePrompt(spec) {
    return `
You are a precise parser. Read the user PC/game specs and return STRICT JSON with these keys:
{"cpu":"...","gpu":"...","ramGB":"16GB","resolution":"1080|1440|2160","quality":"low|med|high|ultra","rt":true|false,"dlss":true|false,"fsr":true|false,"game":"cyberpunk|rdr2|cs2|valorant|fortnite|gtav|eldenring|apex|pubg"}
- Map model names to closest supported option.
- resolution → pick 1080/1440/2160 based on text like 1920x1080, 2560x1440, 4K, etc.
- Return ONLY JSON. No backticks, no prose.

User Specs:
${spec}`.trim();
  }

  function safeJson(raw) {
    try {
      const s = String(raw).trim().replace(/^```json|```$/g, '').replace(/^```|```$/g, '');
      return JSON.parse(s);
    } catch { return null; }
  }

  function pickOptionByValue(select, wanted) {
    const v = String(wanted || '').toLowerCase();
    let chosen = false;
    [...select.options].forEach((opt, idx) => {
      if (!chosen && String(opt.value).toLowerCase() === v) {
        select.selectedIndex = idx; chosen = true;
      }
    });
    return chosen;
  }

  function applyParsedToUI(p) {
    const cpuMap = [
      ['i5-12400', ['i5-12400','12400']],
      ['i5-13400F',['i5-13400f','13400']],
      ['i7-13700KF',['i7-13700','13700','13700kf']],
      ['r5-5600',['ryzen 5 5600','r5 5600','5600']],
      ['r5-7600',['ryzen 5 7600','r5 7600','7600']],
      ['r7-7800x3d',['7800x3d','ryzen 7 7800x3d']],
      ['r9-7950x',['7950x','ryzen 9 7950x']]
    ];
    const gpuMap = [
      ['rtx3060',['3060','rtx 3060']],
      ['rtx4060',['4060','rtx 4060']],
      ['rtx4070',['4070','rtx 4070']],
      ['rtx4080',['4080','rtx 4080']],
      ['rtx4090',['4090','rtx 4090']],
      ['rx6600',['rx 6600','6600']],
      ['rx7700xt',['7700 xt','rx 7700 xt']],
      ['rx7800xt',['7800 xt','rx 7800 xt']],
      ['rx7900xtx',['7900 xtx','rx 7900 xtx']]
    ];
    const gameMap = [
      ['cyberpunk',['cyberpunk']],
      ['rdr2',['red dead','rdr2']],
      ['cs2',['cs2','counter-strike','counter strike']],
      ['valorant',['valorant']],
      ['fortnite',['fortnite']],
      ['gtav',['gta v','gtav']],
      ['eldenring',['elden ring','eldenring']],
      ['apex',['apex']],
      ['pubg',['pubg','battlegrounds']]
    ];

    function fuzzySet(select, needle, pairs) {
      const n = String(needle || '').toLowerCase();
      if (pickOptionByValue(select, needle)) return;
      for (const [val, keys] of pairs) {
        if (keys.some(k => n.includes(k))) { pickOptionByValue(select, val); return; }
      }
    }

    fuzzySet(inCPU,  p.cpu,  cpuMap);
    fuzzySet(inGPU,  p.gpu,  gpuMap);

    const resRaw = (p.resolution || p.res || '').toString();
    const r = /2160|4k/i.test(resRaw) ? '2160' : /1440|2k/i.test(resRaw) ? '1440' : '1080';
    pickOptionByValue(inRes, r);

    const q = String(p.quality || '').toLowerCase();
    pickOptionByValue(inQual, (q.startsWith('ultra') ? 'ultra' : q.startsWith('low') ? 'low' : q.startsWith('med') ? 'med' : 'high'));

    inRT.checked   = !!p.rt;
    inDLSS.checked = !!p.dlss;
    inFSR.checked  = !!p.fsr;

    const rg = String(p.ramGB || '').toUpperCase();
    [...inRAM.options].forEach((opt, idx) => { if (rg === opt.value.toUpperCase()) inRAM.selectedIndex = idx; });

    fuzzySet(inGame, p.game, gameMap);
  }

  // Initial reset state
  resetResults();
})();

/* ---------- Gemini helpers (same pattern used across tools) ---------- */
async function getGeminiText(prompt){
  if (window?.cf?.gemini?.generateText){
    const r = await window.cf.gemini.generateText(prompt,{model: window.CINEFORGE_GEMINI_MODEL || 'gemini-2.0-flash'});
    if (r) return String(r);
  }
  if (window?.Gemini?.generateText){
    const r = await window.Gemini.generateText(prompt,{model: window.CINEFORGE_GEMINI_MODEL || 'gemini-2.0-flash'});
    if (r) return String(r);
  }

  const key = localStorage.getItem('cf-gemini-key') || document.querySelector('meta[name="gemini-key"]')?.content || window.CINEFORGE_GEMINI_KEY || '';
  const proxy = window.API_BASE?.gemini || '/api/gemini';
  try {
    const r = await fetch(proxy,{
      method:'POST',
      headers:{'Content-Type':'application/json', ...(key?{'x-api-key':key}:{})},
      body:JSON.stringify({prompt, model: window.CINEFORGE_GEMINI_MODEL || 'gemini-2.0-flash'})
    });
    if(!r.ok){
      if (r.status === 404) throw new Error('NO_PROXY');
      throw new Error(`Gemini HTTP ${r.status}`);
    }
    const data = await r.json();
    return data.text || data.output || data.result || JSON.stringify(data);
  } catch (err) {
    if (String(err.message) !== 'NO_PROXY') throw err;
  }

  if (!key) throw new Error('Missing Gemini API key (set localStorage "cf-gemini-key" or <meta name="gemini-key">).');
  const base = 'https://generativelanguage.googleapis.com/v1beta';
  const model = 'models/gemini-2.0-flash:generateContent';
  const r = await fetch(`${base}/${model}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 }
    })
  });
  if (!r.ok) throw new Error(`Gemini HTTP ${r.status}`);
  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('') || '';
  return text || JSON.stringify(data);
}
