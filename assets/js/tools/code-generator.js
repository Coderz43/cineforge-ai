// /assets/js/tools/code-generator.js
// CineForge — Code Generator (two-select version)
// Populates selects, calls Gemini (via your helper or direct HTTP), renders result, stores recents.

const LANGUAGES = [
  "Python","JavaScript","TypeScript","Java","C++","C#","Go","Rust","PHP",
  "Ruby","Swift","Kotlin","Dart","Scala","R","MATLAB","SQL","HTML/CSS",
  "Shell/Bash","PowerShell"
];

const CODE_TYPES = [
  "Function/Method","Class/Object","Algorithm","Data Structure","API Integration",
  "Database Query","Web Component","CLI Tool","Unit Test","Configuration",
  "Utility Script","Full Application"
];

// ---------- DOM ----------
const form = document.getElementById("cg-form");
const selLang = document.getElementById("cg-lang");
const selType = document.getElementById("cg-type");
const descEl  = document.getElementById("cg-desc");
const out     = document.getElementById("cg-output");
const resultsGrid = document.getElementById("cg-results");

// Add all options (keep first placeholder intact)
(function populateSelects(){
  const add = (select, items)=> {
    // remove any pre-filled non-placeholder options
    [...select.querySelectorAll("option")].slice(1).forEach(o=>o.remove());
    const frag = document.createDocumentFragment();
    items.forEach(v=>{
      const opt = document.createElement("option");
      opt.value = v; opt.textContent = v;
      frag.appendChild(opt);
    });
    select.appendChild(frag);
  };
  add(selLang, LANGUAGES);
  add(selType, CODE_TYPES);
})();

// Example chips already set by page inline script; nothing to add here.

// ---------- Helpers ----------
const escapeHTML = (s) =>
  s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

function setBusy(isBusy){
  const btn = form.querySelector('button[type="submit"]');
  if (!btn) return;
  btn.disabled = isBusy;
  btn.textContent = isBusy ? "Generating…" : "⚙️ Generate Code";
}

function headerBadge(text){
  const span = document.createElement("span");
  span.textContent = text.toUpperCase();
  span.style.opacity = ".85";
  span.style.fontSize = ".78rem";
  span.style.letterSpacing = ".08em";
  span.style.marginRight = "8px";
  return span;
}

function copyButtonFor(code){
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Copy";
  btn.className = "btn";
  btn.style.padding = "6px 10px";
  btn.style.border = "1px solid rgba(255,255,255,.18)";
  btn.style.borderRadius = "10px";
  btn.style.marginLeft = "8px";
  btn.addEventListener("click", async ()=>{
    try {
      await navigator.clipboard.writeText(code);
      btn.textContent = "Copied!";
      setTimeout(()=>btn.textContent = "Copy", 1000);
    } catch {
      btn.textContent = "Failed";
      setTimeout(()=>btn.textContent = "Copy", 1000);
    }
  });
  return btn;
}

function saveRecent(item){
  try{
    const key = "cg-recent-v1";
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    list.unshift(item);
    while(list.length > 12) list.pop();
    localStorage.setItem(key, JSON.stringify(list));
    renderRecent();
  }catch{}
}

function renderRecent(){
  if (!resultsGrid) return;
  resultsGrid.innerHTML = "";
  let list = [];
  try { list = JSON.parse(localStorage.getItem("cg-recent-v1") || "[]"); } catch {}
  if (!list.length) return;

  list.forEach(({lang,type,desc,code})=>{
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div><strong>${escapeHTML(lang||"")}</strong> • ${escapeHTML(type||"")}</div>
      </div>
      <div style="opacity:.9;margin-bottom:8px">${escapeHTML(desc)}</div>
      <pre class="codebox"><code>${escapeHTML(code)}</code></pre>
    `;
    resultsGrid.appendChild(card);
  });
}
renderRecent();

function buildPrompt(lang, type, desc){
  const lines = [
    `You are CineForge's coding assistant. Return ONLY code and short comments.`,
    `Language: ${lang || "Auto"}`,
    `Type: ${type || "General"}`,
    `Requirements: ${desc}`,
    `- Use best practices and clear naming.`,
    `- Include minimal inline comments and (if relevant) a small usage example.`,
    `- If the request is framework-specific, follow standard conventions.`,
  ];
  return lines.join("\n");
}

// ---------- Gemini wiring ----------
// We'll try (1) your helper: window.cf.gemini.generateText
// then (2) any global Gemini.generateText
// then (3) direct HTTP with API key from localStorage('cf-gemini-key') or <meta name="gemini-key">

async function geminiGenerateText(prompt){
  // 1) Your helper (preferred)
  try {
    const helper = window?.cf?.gemini?.generateText || window?.Gemini?.generateText;
    if (typeof helper === "function"){
      const text = await helper(prompt, {
        // Allow your helper to pick model; but we pass a suggested one
        modelHint: "gemini-2.0-flash"
      });
      if (text) return String(text);
    }
  } catch (e) {
    console.debug("[cg] helper call failed:", e);
  }

  // 2) Direct HTTP
  const key = (document.querySelector('meta[name="gemini-key"]')?.content || localStorage.getItem("cf-gemini-key") || "").trim();
  if (!key) throw new Error("NO_API_KEY");

  const models = ["gemini-2.0-flash","gemini-1.5-pro"];
  let lastErr = null;

  for (const model of models){
    try{
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
      const body = {
        contents: [{ role: "user", parts: [{ text: prompt }]}],
        generationConfig: { temperature: 0.3 }
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok){
        const t = await res.text();
        throw new Error(`HTTP ${res.status}: ${t}`);
      }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map(p=>p.text).join("") || "";
      if (text) return text;
      throw new Error("EMPTY_RESPONSE");
    }catch(err){
      lastErr = err;
    }
  }
  throw lastErr || new Error("GENERATION_FAILED");
}

// If the model is unavailable, produce a simple, helpful local snippet.
function localFallback(lang, type, desc){
  if ((lang||"").toLowerCase().includes("javascript")) {
    return `// ${type || "Utility"} — ${desc}
function debounce(fn, delay = 300, { leading = false, trailing = true } = {}) {
  let t, invoked = false;
  return (...args) => {
    const callNow = leading && !t;
    clearTimeout(t);
    t = setTimeout(() => {
      if (trailing && !callNow) fn(...args);
      t = null; invoked = false;
    }, delay);
    if (callNow && !invoked) { invoked = true; fn(...args); }
  };
}
// Usage: const onScroll = debounce(() => {...}, 200);`;
  }

  // Default to Python
  return `# ${type || "Utility"} — ${desc}
from functools import wraps
import time

def retry(times=3, delay=0.2, exceptions=(Exception,)):
    """Retry a function on failure."""
    def deco(fn):
        @wraps(fn)
        def wrapper(*a, **kw):
            for i in range(times):
                try:
                    return fn(*a, **kw)
                except exceptions:
                    if i == times - 1:
                        raise
                    time.sleep(delay)
        return wrapper
    return deco

# Example:
# @retry(times=5, delay=0.5)
# def fetch_resource(): ...`;
}

// Extract just a code block if the LLM returns markdown; otherwise return as-is.
function extractCode(text){
  const fence = text.match(/```[a-zA-Z0-9_-]*\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  return text.trim();
}

// ---------- Render ----------
function renderOutput(lang, type, code, note){
  const wrap = document.createElement("div");
  wrap.innerHTML = "";
  wrap.style.display = "block";

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.justifyContent = "space-between";
  row.style.marginBottom = "8px";
  const left = document.createElement("div");
  left.appendChild(headerBadge(lang || "AUTO"));
  const sep = document.createElement("span");
  sep.textContent = "• " + (type || "General");
  sep.style.opacity = ".8";
  left.appendChild(sep);
  const right = document.createElement("div");
  right.appendChild(copyButtonFor(code));
  row.appendChild(left);
  row.appendChild(right);

  const pre = document.createElement("pre");
  pre.className = "codebox";
  pre.innerHTML = `<code>${escapeHTML(code)}</code>`;

  const p = document.createElement("p");
  p.style.opacity = ".85";
  p.style.marginTop = "10px";
  p.textContent = note;

  wrap.appendChild(row);
  wrap.appendChild(pre);
  wrap.appendChild(p);

  out.innerHTML = "";
  out.classList.remove("placeholder");
  out.appendChild(wrap);
}

// ---------- Submit ----------
form.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const lang = selLang.value || "Auto";
  const type = selType.value || "General";
  const desc = (descEl.value || "").trim();

  if (!desc){
    descEl.focus();
    descEl.placeholder = "Please describe what to generate…";
    return;
  }

  setBusy(true);
  out.innerHTML = `<div class="placeholder"><div class="big">⌛</div><p>Generating…</p></div>`;

  const prompt = buildPrompt(lang, type, desc);

  try{
    const raw = await geminiGenerateText(prompt);
    const code = extractCode(raw) || raw || localFallback(lang, type, desc);
    renderOutput(lang, type, code, "Generated by Gemini.");
    saveRecent({ lang, type, desc, code });
  }catch(err){
    console.warn("[cg] generation failed:", err?.message || err);
    const code = localFallback(lang, type, desc);
    const msg = (err && (err.message === "NO_API_KEY" || /API key/i.test(err.message)))
      ? "Local fallback used (no/invalid API key). Add your key to localStorage as 'cf-gemini-key' or <meta name=\"gemini-key\">."
      : "Local fallback used (model temporarily unavailable).";
    renderOutput(lang, type, code, msg);
    saveRecent({ lang, type, desc, code });
  }finally{
    setBusy(false);
  }
});
