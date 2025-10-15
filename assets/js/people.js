// assets/js/people.js
import { getPerson, getPersonCredits } from "./api.js";

// Utilities
const $ = (q, c = document) => c.querySelector(q);
const $$ = (q, c = document) => Array.from(c.querySelectorAll(q));

const params = new URLSearchParams(location.search);
const personId = params.get("id");

const IMG = {
  base: "https://image.tmdb.org/t/p/",
  profile(size, path) {
    return path ? `${this.base}${size}${path}` : "assets/icons/profile-fallback.svg";
  },
  poster(size, path) {
    return path ? `${this.base}${size}${path}` : "assets/icons/poster-fallback.svg";
  },
};

const el = {
  name: $("#personName"),
  facts: $("#personFacts"),
  bio: $("#personBio"),
  hero: $("#profileHero"),
  photo: $(".profile-photo"),
  knownForPills: $("#knownForPills"),
  creditsGrid: $("#creditsGrid"),
  segBtns: $$(".seg-btn"),
  deptFilter: $("#deptFilter"),
  sortFilter: $("#sortFilter"),
  year: $("#year"),
  themeToggle: $("#theme-toggle"),
};

if (el.year) el.year.textContent = new Date().getFullYear();

// Theme toggle
el.themeToggle?.addEventListener("click", () => {
  const root = document.documentElement;
  const current = root.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try { localStorage.setItem("cineforge-theme", next); } catch {}
});
(() => {
  const saved = localStorage.getItem("cineforge-theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);
})();

// Guard
if (!personId) {
  el.name.textContent = "Person not found";
  el.bio.textContent = "Missing `id` in URL.";
  throw new Error("Missing person id");
}

// State
let cast = [];
let crew = [];
let activeRole = "cast"; // 'cast' or 'crew'

// Loaders
async function loadPerson() {
  const data = await getPerson(personId);
  renderHero(data);
  renderBio(data);
}

async function loadCredits() {
  const data = await getPersonCredits(personId);
  cast = Array.isArray(data.cast) ? data.cast : [];
  crew = Array.isArray(data.crew) ? data.crew : [];
  buildKnownFor(cast);
  buildDeptOptions([...cast, ...crew]);
  renderCredits();
}

// Renderers
function renderHero(p) {
  el.name.textContent = p.name || "Unknown";
  el.photo.style.backgroundImage = `url("${IMG.profile("w300", p.profile_path)}")`;

  const facts = [];
  if (p.known_for_department) facts.push(fact(`Known for: ${p.known_for_department}`));
  if (p.birthday) facts.push(fact(`Born: ${formatDate(p.birthday)}`));
  if (p.place_of_birth) facts.push(fact(p.place_of_birth));
  if (p.deathday) facts.push(fact(`Died: ${formatDate(p.deathday)}`));
  el.facts.innerHTML = facts.join("");

  function fact(text) {
    return `<span class="fact">${escapeHTML(text)}</span>`;
  }
}

function renderBio(p) {
  const bio = (p.biography || "").trim();
  el.bio.textContent = bio || "Biography not available.";
}

function buildKnownFor(items) {
  const top = [...items]
    .filter(x => x.poster_path)
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 8);

  el.knownForPills.innerHTML = top.map(x => {
    const title = x.media_type === "tv" ? x.name : x.title;
    const year = getYear(x.release_date || x.first_air_date);
    return `
      <button class="pill" data-mid="${x.id}" data-type="${x.media_type || 'movie'}" title="${escapeHTML(title)}">
        ${escapeHTML(title)}${year ? ` <span class="year">(${year})</span>` : ""}
      </button>
    `;
  }).join("");

  el.knownForPills.querySelectorAll(".pill").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-mid");
      const type = btn.getAttribute("data-type") || "movie";
      window.open(`https://www.themoviedb.org/${type}/${id}`, "_blank");
    });
  });
}

function buildDeptOptions(all) {
  const depts = new Set();
  all.forEach(x => {
    if (x.department) depts.add(x.department);
    if (x.known_for_department) depts.add(x.known_for_department);
    if (x.job && !x.department) depts.add(x.job);
  });
  const current = el.deptFilter.value;
  el.deptFilter.innerHTML = `<option value="">All Departments</option>` +
    [...depts].sort().map(d => `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`).join("");
  if (current) el.deptFilter.value = current;
}

function renderCredits() {
  const raw = activeRole === "cast" ? cast : crew;

  const dept = el.deptFilter.value || "";
  let list = raw.filter(x =>
    !dept ||
    (x.department && x.department === dept) ||
    (x.known_for_department && x.known_for_department === dept) ||
    (x.job && x.job === dept)
  );

  const sort = el.sortFilter.value;
  list = sortCredits(list, sort);

  el.creditsGrid.innerHTML = list.length
    ? list.map(tileHTML).join("")
    : `<div class="muted" style="opacity:.7">No credits found.</div>`;
}

function sortCredits(items, sort) {
  const byPopularity = (a, b) => (b.popularity || 0) - (a.popularity || 0);
  const toTime = (x) => new Date(x?.release_date || x?.first_air_date || "0001-01-01").getTime();

  switch (sort) {
    case "popularity.asc": return [...items].sort((a, b) => -byPopularity(a, b));
    case "date.desc": return [...items].sort((a, b) => toTime(b) - toTime(a));
    case "date.asc": return [...items].sort((a, b) => toTime(a) - toTime(b));
    default: return [...items].sort(byPopularity);
  }
}

function tileHTML(x) {
  const title = x.media_type === "tv" ? (x.name || "Untitled") : (x.title || "Untitled");
  const year = getYear(x.release_date || x.first_air_date);
  const sub = activeRole === "cast"
    ? (x.character ? `as ${x.character}` : "Cast")
    : (x.job ? x.job : x.department || "Crew");

  const poster = IMG.poster("w342", x.poster_path);

  return `
    <a class="tile" href="https://www.themoviedb.org/${x.media_type || 'movie'}/${x.id}" target="_blank" rel="noopener">
      <div class="tile-poster" style="background-image:url('${poster}')"></div>
      <div class="tile-meta">
        <div class="tile-title">${escapeHTML(title)} ${year ? `<span class="year">(${year})</span>` : ""}</div>
        <div class="tile-sub">${escapeHTML(sub)}</div>
        ${x.popularity ? `<div class="tile-pop">Popularity: ${Math.round(x.popularity)}</div>` : ""}
      </div>
    </a>
  `;
}

// Helpers
function getYear(d) { return d && d.slice(0, 4); }
function formatDate(d) {
  try { return new Date(d).toLocaleDateString(); } catch { return d; }
}
function escapeHTML(s) {
  return (s || "").replace(/[&<>"']/g, m =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])
  );
}

// Events
el.segBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    el.segBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeRole = btn.dataset.role || "cast";
    renderCredits();
  });
});
el.deptFilter.addEventListener("change", renderCredits);
el.sortFilter.addEventListener("change", renderCredits);

// Boot
(async () => {
  try {
    await loadPerson();
    await loadCredits();
  } catch (e) {
    el.name.textContent = "Loading…";
    $(".sub", el.hero)?.insertAdjacentHTML("afterend",
      `<p style="opacity:.8;margin-top:8px">Could not load this person. Please try again later.</p>`);
    console.error(e);
  }
})();
