// /assets/js/image-ident.js
// Poster/screenshot → title guesses with OCR + filename fallback.

export async function imageSuggest(fileOrFiles) {
  const files = await toFiles(fileOrFiles);
  const { guesses } = await identifyFromImages(files);

  // ✅ normalize first guess for strict matching
  const best = guesses[0] ? normalizeTitle(guesses[0]) : '';
  return { query: best, mediaType: 'multi', guesses: guesses.map(normalizeTitle) };
}

export async function identifyFromImages(filesIn) {
  const files = await toFiles(filesIn);
  const all = new Set();

  for (const f of (files || []).slice(0, 5)) {
    const g = await guessFromFile(f);
    g.forEach(s => s && all.add(normalizeTitle(s)));
  }
  return { guesses: Array.from(all).slice(0, 6), mediaType: 'multi' };
}

/* ---------------- internal helpers ---------------- */

async function toFiles(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    const out = [];
    for (const x of input) out.push(...(await toFiles(x)));
    return out;
  }
  if (typeof input === 'string') {
    const url = input;
    const res = await fetch(url);
    const blob = await res.blob();
    const name = url.split('/').pop()?.split('?')[0] || 'image.png';
    const type = blob.type && blob.type !== 'application/octet-stream' ? blob.type : 'image/png';
    return [new File([blob], name, { type })];
  }
  if (input instanceof File) return [input];
  if (input instanceof Blob) return [new File([input], 'image.png', { type: input.type || 'image/png' })];
  return [];
}

async function guessFromFile(file) {
  const out = new Set();

  // 1) OCR passes
  try {
    const passes = [
      null,                                    // full
      { kind: 'center', hPct: 0.45 },          // center band
      { kind: 'band', y: 0.05, hPct: 0.25 },   // top band
      { kind: 'band', y: 0.35, hPct: 0.22 },   // middle-top
      { kind: 'band', y: 0.55, hPct: 0.22 },   // middle-bottom
      { kind: 'band', y: 0.75, hPct: 0.22 },   // bottom band
    ];
    for (const crop of passes) {
      const txt = await ocr(file, crop);
      if (!txt) continue;
      textToCandidates(txt).forEach(s => out.add(normalizeTitle(s)));
      if (out.size >= 8) break;
    }
  } catch {
    /* swallow OCR errors */
  }

  // 2) Filename fallback (last resort if OCR empty)
  if (out.size === 0) {
    const rawName = file?.name || '';
    if (shouldTrustFilename(rawName)) {
      const byName = nameToTitle(rawName);
      if (byName) out.add(normalizeTitle(byName));
    }
  }

  return Array.from(out);
}

/* ---------- Filename heuristic ---------- */
function shouldTrustFilename(name) {
  if (!name) return false;
  const base = name.replace(/\.[a-z0-9]+$/i, '');
  const hasSep = /[\s._-]/.test(base);
  const singleToken = !hasSep;
  if (singleToken) {
    if (base.length > 14 && /\d/.test(base)) return false;
  }
  return true;
}

function nameToTitle(name) {
  if (!name) return '';
  name = name.replace(/\.[a-z0-9]+$/i, '');
  name = name.replace(/[_\-\.]+/g, ' ');
  name = name.replace(/\b(1080p|720p|2160p|4k|bluray|hdrip|webrip|x264|x265|dvdrip|yts|yify)\b/ig, ' ');
  name = name.replace(/\b(hindi|english|urdu|dubbed|subbed|multi\s*audio)\b/ig, ' ');
  name = name.replace(/\[(.*?)\]|\((.*?)\)/g, ' ');
  name = name.replace(/\s{2,}/g, ' ').trim();

  const m = name.match(/(.+?)\s(?:\(|\[)?(19|20)\d{2}(?:\)|\])?/);
  const core = m ? m[1].trim() : name;
  return toTitleCase(core.split(' ').slice(0, 5).join(' '));
}

function toTitleCase(s) {
  return s.replace(/\w\S*/g, t => t[0].toUpperCase() + t.slice(1).toLowerCase());
}

/* ---------------- OCR (Tesseract.js) ---------------- */
let _ocrDown = false;

async function loadTesseract() {
  if (globalThis.__cf_tess) return globalThis.__cf_tess;
  globalThis.__cf_tess = (async () => {
    const esm = await import(
      /* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js'
    ).catch(() => null);
    if (esm?.createWorker || esm?.default?.createWorker) return esm;

    const umd = await import(
      /* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
    ).catch(() => null);
    if (umd?.default?.createWorker) return umd.default;
    if (umd?.createWorker) return umd;

    const v4 = await import(
      /* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/tesseract.js@4.0.2/dist/tesseract.min.js'
    ).catch(() => null);
    if (v4?.default?.createWorker) return v4.default;
    if (v4?.createWorker) return v4;

    return null;
  })();
  return globalThis.__cf_tess;
}

async function ocr(file, crop = null) {
  if (_ocrDown) return '';
  try {
    const dataUrl = await fileToDataURL(file);
    const prepped = await preprocess(dataUrl, 1400, crop);

    const mod = await loadTesseract();
    if (!mod) { _ocrDown = true; return ''; }

    const createWorker =
      mod.createWorker ||
      mod?.default?.createWorker ||
      (globalThis.Tesseract && globalThis.Tesseract.createWorker);

    if (!createWorker) { _ocrDown = true; return ''; }

    const worker = await createWorker();
    // ✅ removed deprecated calls – language preloaded in v5
    await worker.load();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');

    const res = await Promise.race([
      worker.recognize(prepped, {
        tessedit_char_blacklist: '‘’“”´`~!@#$%^&*_+=\\|{}<>',
      }),
      new Promise(r => setTimeout(() => r(null), 7000)),
    ]);

    await worker.terminate?.();
    return res?.data?.text || '';
  } catch {
    _ocrDown = true;
    return '';
  }
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function preprocess(src, maxW = 1400, crop = null) {
  const img = await loadImage(src);

  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (crop && crop.kind === 'center') {
    sh = Math.round(img.height * (crop.hPct || 0.4));
    sy = Math.round((img.height - sh) / 2);
  } else if (crop && crop.kind === 'band') {
    sh = Math.round(img.height * (crop.hPct || 0.22));
    sy = Math.round(img.height * (crop.y ?? 0));
  }

  const scale = Math.min(1, maxW / sw);
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));

  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);

  // grayscale + contrast
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  const contrast = 1.3;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.2126 * d[i] + 0.7152 * d[i+1] + 0.0722 * d[i+2];
    let v = (y - 128) * contrast + 128;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    d[i] = d[i+1] = d[i+2] = v;
  }
  ctx.putImageData(id, 0, 0);

  return c.toDataURL('image/png');
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous';
    img.src = src;
  });
}

/* ------------- OCR text → candidates ------------- */
const STOP_WORDS = new Set([
  'IMAX','3D','PRESENTS','AND','IN','AT','OF','WITH',
  'COMING','SOON','ONLY','EXPERIENCE','SUMMER','WINTER','SPRING','FALL',
  'TRAILER','OFFICIAL','MOTION','PICTURE','SOUNDTRACK','FEATURE','FILM'
]);

function textToCandidates(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  // merge consecutive short lines → handle split titles
  const merged = [];
  for (let i=0;i<lines.length;i++) {
    const cur = lines[i];
    const nxt = lines[i+1];
    if (cur && nxt && cur.length <= 12 && nxt.length <= 12) {
      merged.push(cur + ' ' + nxt);
      i++;
    } else {
      merged.push(cur);
    }
  }

  const rough = [];
  for (let raw of merged) {
    let s = raw.replace(/[^A-Za-z0-9:'&\-\s]/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (!s) continue;
    const words = s.split(/\s+/).filter(w => !STOP_WORDS.has(w.toUpperCase()));
    if (!words.length) continue;
    const core = toTitleCase(words.join(' '));
    if (core.length < 3 || core.length > 60) continue;
    rough.push(core);
  }

  // dedupe + cap
  const seen = new Set();
  const out = [];
  for (const r of rough) {
    const key = r.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out.slice(0, 6);
}

/* ---------------- Normalizer ---------------- */
function normalizeTitle(s) {
  return (s || '')
    .trim()
    .replace(/\s{2,}/g, ' ')
    .toLowerCase();
}

/* Debug */
export async function __debugTesseract() {
  try {
    const mod = await loadTesseract();
    return { ok: !!mod, hasGlobal: !!globalThis.Tesseract };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
