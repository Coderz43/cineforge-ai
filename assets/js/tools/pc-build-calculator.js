/* PC Build Calculator — CineForge
 * Matches competitor UX: status pill, mono output, copy, and Quick Buy Links.
 * PRIMARY PATH: uses shared Gemini helper from /assets/js/tools/gemini.js
 *  - window.cf.gemini.generateText(prompt, {model})
 *  - window.Gemini.generateText(prompt, {model})
 * FALLBACKS: /api/gemini → direct Google endpoint (needs API key).
 */

(function init() {
  // active nav highlight
  const here = (location.pathname.replace(/\/+$/,'') || '/');
  document.querySelectorAll('.nav-chip').forEach(a=>{
    const route=a.getAttribute('data-route');
    if((route==='/'&&here==='/')||(route!=='/'&&here.endsWith(route))) a.classList.add('is-active');
  });

  // theme toggle (persist)
  const root=document.documentElement, btn=document.getElementById('theme-toggle');
  const preferred = localStorage.getItem('cf-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light':'dark');
  setTheme(preferred);
  btn?.addEventListener('click',()=>setTheme(root.getAttribute('data-theme')==='light'?'dark':'light'));
  function setTheme(t){ root.setAttribute('data-theme',t); localStorage.setItem('cf-theme',t); }

  // footer year
  const y=document.getElementById('year'); if(y) y.textContent=new Date().getFullYear();

  // quick chips -> fill budget & usage
  document.querySelectorAll('.chip[data-fill-budget]').forEach(ch=>{
    ch.addEventListener('click',()=>{
      const b = ch.getAttribute('data-fill-budget') || '';
      const u = ch.getAttribute('data-fill-usage') || '';
      const bEl = document.getElementById('pc-budget');
      const uEl = document.getElementById('pc-usage');
      if (bEl) bEl.value = b;
      if (uEl) uEl.value = u;
    });
  });

  // clear form
  document.getElementById('pc-clear')?.addEventListener('click',()=>{
    ['pc-budget','pc-usage','pc-notes'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.value='';
    });
    setPlaceholder();
  });

  // submit
  document.getElementById('pc-form')?.addEventListener('submit', onSubmit);

  // initial placeholder
  setPlaceholder();
})();

/* ---------- UI helpers ---------- */
function setPlaceholder(){
  const out=document.getElementById('pc-output');
  const res=document.getElementById('pc-result');
  if(!out || !res) return;
  out.style.display='block';
  res.style.display='none';
  out.innerHTML = `<span>ℹ️</span><span>Fill in your requirements and click <strong>Calculate My Build</strong>.</span>`;
}

function showWorking(msg='Calculating your build with AI…', icon='⏳'){
  const out=document.getElementById('pc-output');
  const res=document.getElementById('pc-result');
  if(out) out.style.display='none';
  if(res) res.style.display='';
  setStatus(msg, icon);
}

function setStatus(text, icon='ℹ️'){
  const s=document.getElementById('pc-status');
  const t=document.getElementById('pc-status-text');
  if(s?.firstElementChild) s.firstElementChild.textContent=icon;
  if(t) t.textContent=text;
}

/* ---------- Submit ---------- */
async function onSubmit(e){
  e.preventDefault();
  const budget = Number(document.getElementById('pc-budget').value || 0);
  const usage  = document.getElementById('pc-usage').value;
  const notes  = (document.getElementById('pc-notes').value || '').trim();

  if(!budget || budget < 300){
    setPlaceholder();
    document.getElementById('pc-output').innerHTML='<span>⚠️</span><span>Please enter a budget of at least $300.</span>';
    return;
  }
  if(!usage){
    setPlaceholder();
    document.getElementById('pc-output').innerHTML='<span>⚠️</span><span>Please select your primary usage.</span>';
    return;
  }

  showWorking();

  const prompt = buildPrompt({budget, usage, notes});
  let text;
  try{
    text = await getGeminiText(prompt);
    if(!text || typeof text!=='string') throw new Error('Empty response');
    setStatus('Build calculation complete!', '✅');
  }catch(err){
    const msg = String(err?.message || err);
    if (/Missing Gemini API key/i.test(msg)) {
      setStatus('No Gemini key set — showing local recommendation fallback. Add key in localStorage "cf-gemini-key" or window.CINEFORGE_GEMINI_KEY.', '⚠️');
    } else if (/HTTP 404/.test(msg) || /NO_PROXY/.test(msg)) {
      setStatus('AI proxy not found — using local recommendation fallback.', '⚠️');
    } else {
      setStatus('AI request failed — showing local recommendation fallback.', '⚠️');
    }
    console.warn('[Gemini error]', err);
    text = localFallback({budget, usage, notes});
  }

  // render recommendation text
  const pre=document.getElementById('pc-reco');
  if(pre) pre.textContent=text;

  // copy to clipboard
  const copyBtn = document.getElementById('pc-copy');
  if (copyBtn && !copyBtn._cfBound) {
    copyBtn._cfBound = true;
    copyBtn.addEventListener('click', async ()=>{
      try{
        await navigator.clipboard.writeText(pre?.textContent || '');
        setStatus('Copied to clipboard!', '📋');
      }catch{
        setStatus('Copy failed — select text manually.', '⚠️');
      }
    });
  }

  // build Quick Buy Links from parsed parts
  const parts = parsePartsFromMarkdown(text);
  renderBuyLinks(parts);
}

/* ---------- Prompt ---------- */
function buildPrompt({budget, usage, notes}){
  const label = ({
    gaming:'Gaming',
    content:'Content Creation',
    workstation:'Professional Workstation',
    office:'Office/Productivity',
    gaming_streaming:'Gaming + Streaming',
    enthusiast:'Enthusiast/High-End'
  })[usage] || 'General Use';

  return `
You are a professional PC building assistant. Create a realistic, compatible parts list for the user.

Budget (USD): ${budget}
Primary Usage: ${label}
Preferences/Notes: ${notes || 'None'}

Rules:
- Output in markdown. Use this exact field order and label syntax:
  **CPU**: <name> - $<price>
  **CPU Cooler**: <name> - $<price> (optional when using stock)
  **Motherboard**: <name> - $<price>
  **RAM**: <size/speed> - $<price>
  **Storage - SSD**: <name> - $<price>
  **Storage - HDD**: <name> - $<price> (optional)
  **GPU**: <name> - $<price> (use iGPU if budget too low, and say so)
  **Case**: <name> - $<price>
  **Power Supply**: <name> - $<price>
  **Operating System**: <name> - $<price> (optional)
- After parts, include:
  - **Total Estimated Cost**: $X
  - **Performance Summary**: one short paragraph
  - **Notes**: one short paragraph
- Keep it ~250–300 words. Prefer current-gen sensible options for the budget.
`.trim();
}

/* ---------- Gemini helpers (helper → proxy → direct) ---------- */
async function getGeminiText(prompt){
  const model = window.CINEFORGE_GEMINI_MODEL || 'gemini-2.0-flash';

  // 1) shared helper from /assets/js/tools/gemini.js (preferred)
  if (window?.cf?.gemini?.generateText){
    const r = await window.cf.gemini.generateText(prompt,{model});
    if (r) return String(r);
  }
  if (window?.Gemini?.generateText){
    const r = await window.Gemini.generateText(prompt,{model});
    if (r) return String(r);
  }

  // 2) local proxy (/api/gemini)
  const key = localStorage.getItem('cf-gemini-key')
          || window.CINEFORGE_GEMINI_KEY
          || document.querySelector('meta[name="gemini-key"]')?.content
          || '';
  const proxy = window.API_BASE?.gemini || '/api/gemini';
  try {
    const r = await fetch(proxy,{
      method:'POST',
      headers:{'Content-Type':'application/json', ...(key?{'x-api-key':key}:{})},
      body:JSON.stringify({prompt, model})
    });
    if(!r.ok){
      if (r.status === 404) throw new Error('NO_PROXY');
      throw new Error(`Gemini HTTP ${r.status}`);
    }
    const data = await r.json();
    return data.text || data.output || data.result || JSON.stringify(data);
  } catch (err) {
    if (String(err.message) !== 'NO_PROXY') {
      if (!(err instanceof Error && err.message === 'NO_PROXY')) throw err;
    }
  }

  // 3) direct Google endpoint (needs API key)
  if (!key) {
    throw new Error('Missing Gemini API key (set localStorage "cf-gemini-key", window.CINEFORGE_GEMINI_KEY, or <meta name="gemini-key">).');
  }
  const base = 'https://generativelanguage.googleapis.com/v1beta';
  const endpoint = 'models/gemini-2.0-flash:generateContent';
  const r = await fetch(`${base}/${endpoint}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 }
    })
  });
  if (!r.ok) throw new Error(`Gemini HTTP ${r.status}`);
  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('') || '';
  return text || JSON.stringify(data);
}

/* ---------- Parse markdown → parts ---------- */
function parsePartsFromMarkdown(md){
  const lines = md.split(/\r?\n/);
  const map = {};
  const wanted = [
    'CPU','CPU Cooler','Motherboard','RAM',
    'Storage - SSD','Storage - HDD','GPU',
    'Case','Power Supply','Operating System'
  ];
  for (const w of wanted){
    const re = new RegExp(`^\\*\\*${w.replace(/[-/\\^$*+?.()|[\\]{}]/g,'\\$&')}\\*\\*:\\s*(.+)$`,'i');
    const found = lines.find(l=>re.test(l));
    if(found){
      const val = found.replace(/^(\*\*.+?\*\*:\s*)/,'').trim();
      map[w]=val;
    }
  }
  return map;
}

/* ---------- Buy links UI (single-line with ellipsis) ---------- */
function renderBuyLinks(parts){
  const grid = document.getElementById('pc-buylinks');
  if(!grid) return;

  const items = [
    ['CPU', 'cpu'],
    ['CPU Cooler', 'cpu+cooler'],
    ['Motherboard', 'motherboard'],
    ['RAM', 'ddr5+ram'],
    ['Storage - SSD', 'nvme+ssd'],
    ['Storage - HDD', 'internal+hdd'],
    ['Case', 'pc+case+airflow'],
    ['Power Supply', 'psu+80+gold'],
    ['Operating System', 'windows+11+home']
  ].filter(([label]) => parts[label]); // only show if present

  grid.innerHTML = items.map(([label])=>{
    const raw   = parts[label] || label;
    const clean = raw.replace(/\s+-\s+\$?[0-9.,]+$/i, ''); // drop trailing " - $price"
    const short = (clean.length>32?clean.slice(0,32)+'…':clean);
    const href  = `https://www.amazon.com/s?k=${encodeURIComponent(clean)}&tag=cineforge-20`;
    return `
      <a class="buy-link" href="${href}" target="_blank" rel="noopener">
        <span class="ico">↗</span>
        <span class="txt">${label}: ${short}</span>
      </a>
    `;
  }).join('');
}

/* ---------- Local fallback ---------- */
function localFallback({budget, usage, notes}){
  let cpu='AMD Ryzen 5 5600 - $129',
      cooler='Stock - $0',
      mobo='B550 ATX - $110',
      ram='16GB DDR4-3200 - $45',
      ssd='1TB NVMe Gen3 - $60',
      hdd='',
      gpu='Integrated (or GTX 1650 used) - $0–120',
      psu='550W 80+ Bronze - $50',
      pcCase='Airflow ATX - $70',
      os='Windows 11 Home - $139';

  if(budget>=1200){
    cpu='Ryzen 5 7600 - $209';
    mobo='B650 - $160';
    ram='32GB DDR5-6000 - $95';
    ssd='1TB NVMe Gen4 - $80';
    gpu='RTX 4070 / RX 7800 XT - $480–530';
    psu='650W 80+ Gold - $90';
    cooler='120/240 AIO - $70–110';
  }
  if(budget>=2000){
    cpu='Ryzen 7 7800X3D - $369';
    mobo='B650E - $230';
    ram='32GB DDR5-6000 - $110';
    ssd='2TB NVMe Gen4 - $150';
    gpu='RTX 4080 / RX 7900 XTX - $900–1000';
    psu='850W 80+ Gold - $140';
    cooler='240–360 AIO - $120';
  }
  if(budget>=3500){
    cpu='Ryzen 9 7950X - $549';
    mobo='X670E - $350';
    ram='64GB DDR5-6400 - $260';
    ssd='2TB NVMe Gen4 + 4TB SATA - $320';
    gpu='RTX 4090 - $1699';
    psu='1000W 80+ Platinum - $260';
    cooler='360 AIO - $200';
  }

  if(usage==='office'){ gpu='Integrated - $0'; }
  if(usage==='content' || usage==='workstation'){
    ram = budget>=1500 ? '64GB DDR5-6000 - $220' : '32GB DDR5-6000 - $110';
    ssd = budget>=1500 ? '2TB NVMe Gen4 - $150' : '1–2TB NVMe - $80–150';
  }

  const total = Math.round(budget*0.9);
  return `**CPU**: ${cpu}
- Balanced performance for this budget tier.

**CPU Cooler**: ${cooler}
- Keeps temps under control with moderate noise.

**Motherboard**: ${mobo}
- Compatible chipset with sensible I/O and upgrade path.

**RAM**: ${ram}
- Enough capacity/speed for the target workload.

**Storage - SSD**: ${ssd}
- Fast OS/apps drive. Add more if needed.

**GPU**: ${gpu}
- Primary performance driver for games/acceleration.

**Case**: ${pcCase}
- Good airflow and GPU clearance.

**Power Supply**: ${psu}
- Reliable unit with appropriate headroom.

**Operating System**: ${os}

- **Total Estimated Cost**: $${total}
- **Performance Summary**: Smooth ${usage.replace('_',' / ')} experience at this budget; upgrade GPU/SSD later as needed.
- **Notes**: Check case GPU length & cooler height; update BIOS; prefer PCIe Gen4 NVMe when available.

(Preferences: ${notes || 'None'})`;
}
