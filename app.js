/* Campaign Intelligence — candidate dashboard (aggregate only).
   Reads window.CAMPAIGN / TOWN_SUMMARY / PRECINCT_SUMMARY / GEOMETRY.
   No per-voter data is loaded or shown — every figure is an aggregate of the
   prepared SOTS data. */
(function () {
"use strict";
const C = window.CAMPAIGN, TOWNS = window.TOWN_SUMMARY, PREC = window.PRECINCT_SUMMARY, GEO = window.GEOMETRY, TARGET = window.TARGET_UNIVERSE;
const PARTY = ["Republican", "Democratic", "Unaffiliated", "Minor / Other"];
const PCOL = { "Republican": "#E05555", "Democratic": "#3A6AB8", "Unaffiliated": "#5A6E80", "Minor / Other": "#D4A017" };
const TIERS = ["High", "Medium", "Low", "None"];
const METHODS = ["Likely Early Vote", "Likely Absentee", "Likely Election Day", "Mixed Method", "Unknown"];

/* ---- apply campaign identity ---- */
const root = document.documentElement.style;
root.setProperty("--camp", "#22AABC");  // war-room primary action = teal; red is reserved for rating / opponent
document.title = C.headline + " · DM Strategies";
document.getElementById("h-title").innerHTML = "<b>" + C.headline + "</b>";
document.getElementById("b-gen").textContent = "Updated " + C.generated_at.replace("T", " · ").slice(0, 21);

/* ---- helpers ---- */
const $ = (s, r = document) => r.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const fmt = n => (n == null ? "—" : Math.round(n).toLocaleString());
const pct = (n, d) => d ? Math.round(1000 * n / d) / 10 : 0;
const pc1 = n => (n == null ? "—" : n.toFixed(1) + "%");
const T = C.totals;
const shortP = p => p === "Minor / Other" ? "Other" : p.replace("ublican", "").replace("ocratic", "").replace("affiliated", "naff");
const DTOWNS = (window.RESULTS && window.RESULTS.towns) || null; // district towns, when results are loaded
const townList = () => Object.values(TOWNS).filter(t => t.active > 25 && (!DTOWNS || DTOWNS.includes(t.name))).sort((a, b) => b.active - a.active);
const precList = () => Object.values(PREC).filter(p => p.active > 5).sort((a, b) => b.active - a.active);

/* ---- nav ---- */
const NAV = [
  ["verdict", "Verdict"],
  ["analysis", "Analysis"],
  ["targets", "Targets"],
  ["geography", "Map"],
  ["results", "Results"],
];
function buildNav() {
  const n = $("#nav");
  // Overview = the standalone command front page (full-page link, not a hash route)
  const ov = el("a", "tab"); ov.href = "overview.html";
  ov.innerHTML = `<span class="tab-pip"></span>Overview`;
  n.appendChild(ov);
  NAV.forEach(([id, lab]) => {
    const t = el("a", "tab"); t.dataset.route = id; t.href = "#" + id;
    t.innerHTML = `<span class="tab-pip"></span>${lab}`;
    n.appendChild(t);
  });
}

/* ---- router ---- */
const ROUTES = {};
const ROUTE_ALIASES = {
  datahealth: "targets",
  map: "geography",
};
function route() {
  const raw = (location.hash.replace("#", "") || "verdict").split("/")[0];
  const r = ROUTE_ALIASES[raw] || raw;
  document.querySelectorAll(".tab").forEach(a => {
    const active = a.dataset.route === r;
    a.classList.toggle("active", active);
    active ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
  });
  renderRail(r);
  $("#view").className = "view route-" + r;
  $("#view").innerHTML = "";
  window._charts && window._charts.forEach(c => c.destroy()); window._charts = [];
  window._maps && window._maps.forEach(m => { try { m.remove(); } catch (e) {} }); window._maps = [];
  (ROUTES[r] || ROUTES.verdict)($("#view"));
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

/* ---- chart factory ---- */
function chart(parent, cfg, h) {
  const wrap = el("div"); wrap.style.height = (h || 220) + "px"; wrap.style.position = "relative";
  const cv = el("canvas"); wrap.appendChild(cv); parent.appendChild(wrap);
  Chart.defaults.font.family = "'Outfit',system-ui,sans-serif";
  Chart.defaults.font.size = 12; Chart.defaults.color = "#6B87A3";
  window._charts.push(new Chart(cv, cfg));
}
const gridX = { grid: { display: false }, ticks: { autoSkip: false } };
const gridY = { grid: { color: "rgba(255,255,255,.05)" }, border: { display: false }, ticks: { precision: 0 } };

/* ============================ OVERVIEW ============================ */
ROUTES.overview = function (view) {
  pageHead(view, C.candidate + " — District Snapshot",
    "Aggregate registration and turnout intelligence. No individual voter records.");

  // four core registration numbers
  const k = el("div", "kpis");
  kpi(k, "Active voters", fmt(T.active), `${fmt(T.registered)} registered`);
  kpi(k, "Republican", fmt(T.party.Republican), pc1(T.party_pct.Republican) + " of active", "r");
  kpi(k, "Unaffiliated", fmt(T.party.Unaffiliated), pc1(T.party_pct.Unaffiliated) + " of active", "u");
  kpi(k, "Democratic", fmt(T.party.Democratic), pc1(T.party_pct.Democratic) + " of active", "d");
  view.appendChild(k);

  // one clean party-balance bar (replaces the bar chart + legend)
  view.appendChild(partyBar());

  // the strategic takeaway
  view.appendChild(narrative());

  // towns at a glance
  const tlist = el("div", "card"); tlist.style.marginTop = "22px";
  const head = el("div", "pad between"); head.style.paddingBottom = "0";
  head.innerHTML = `<p class="section-title" style="margin:0">Towns at a glance</p><a class="chip" href="#geography">Open geography →</a>`;
  tlist.appendChild(head);
  tlist.appendChild(rankTable(townList(), "town"));
  view.appendChild(tlist);
};

function partyBar() {
  const segs = [["Republican", "r"], ["Unaffiliated", "u"], ["Democratic", "d"], ["Minor / Other", "o"]];
  const card = el("div", "card pad"); card.style.marginTop = "22px";
  card.appendChild(el("p", "section-title", "Party balance of active voters<span class='ln'></span>"));
  const bar = el("div", "pbar");
  bar.innerHTML = segs.map(([p, c]) => {
    const w = T.party_pct[p];
    const inner = w >= 6 ? `<span>${c === "o" ? "Other" : shortP(p)}</span><b>${pc1(w)}</b>` : "";
    return `<div class="pbar-seg ${c}" style="width:${w}%">${inner}</div>`;
  }).join("");
  card.appendChild(bar);
  const lg = el("div", "pbar-legend");
  lg.innerHTML = segs.map(([p, c]) =>
    `<div class="it"><i class="${c}"></i><div><b>${fmt(T.party[p])}</b> <span class="muted">${c === "o" ? "Other" : shortP(p)}</span></div></div>`).join("");
  card.appendChild(lg);
  return card;
}

function narrative() {
  const tw = townList();
  const r = T.party_pct.Republican, u = T.party_pct.Unaffiliated, d = T.party_pct.Democratic;
  const byR = [...tw].sort((x, y) => y.party_pct.Republican - x.party_pct.Republican);
  const topR = byR[0], lowR = byR[byR.length - 1];
  const byU = [...tw].sort((x, y) => y.party_pct.Unaffiliated - x.party_pct.Unaffiliated)[0];
  const card = el("div", "narr"); card.style.marginTop = "22px";
  let html = `<h3>The Read</h3>`;
  if (C.posture === "defense") {
    html += `<p>Registration is near-even — <b>${pc1(r)} R</b>, <b>${pc1(d)} D</b>, <b>${pc1(u)} U</b>. The seat turns on turnout and the unaffiliated margin, not party share.</p>`;
    html += `<p>Strongest R ground: <b>${topR.name}</b> (${pc1(topR.party_pct.Republican)}). Most exposed: <b>${lowR.name}</b> (${pc1(lowR.party_pct.Republican)}). Unaffiliateds densest in <b>${byU.name}</b> (${pc1(byU.party_pct.Unaffiliated)}).</p>`;
  } else {
    const byRcount = [...tw].sort((x, y) => y.party.Republican - x.party.Republican)[0];
    html += `<p>The universe is <b>${pc1(d)} D</b>, <b>${pc1(u)} U</b>, <b>${pc1(r)} R</b>. With the seat open, the path runs through unaffiliated voters, not party conversion.</p>`;
    html += `<p>R votes concentrate in <b>${byRcount.name}</b>. <b>${fmt(T.tier.Low + T.tier.None)}</b> active voters are low-propensity — cheap to re-activate.</p>`;
  }
  card.innerHTML = html;
  return card;
}

/* ============================ GEOGRAPHY ============================ */
let geoMetric = "republican_share";
const GEO_METRICS = {
  republican_share: { label: "Republican share", get: t => t.party_pct.Republican, fmt: pc1, ramp: "r" },
  unaffiliated_share: { label: "Unaffiliated share", get: t => t.party_pct.Unaffiliated, fmt: pc1, ramp: "u" },
  democratic_share: { label: "Democratic share", get: t => t.party_pct.Democratic, fmt: pc1, ramp: "d" },
  turnout_gap: { label: "Low-turnout share", get: t => pct(t.tier.Low + t.tier.None, t.active), fmt: pc1, ramp: "a" },
  active: { label: "Active voters", get: t => t.active, fmt: fmt, ramp: "a" },
};
ROUTES.geography = function (view) {
  pageHead(view, "Town & Precinct Analysis",
    "Recolor the map by metric. Click any area to drill in.");

  if (GEO && GEO.towns && GEO.towns.features.length) {
    const mapCard = el("div", "card pad");
    const ctl = el("div", "between"); ctl.style.marginBottom = "12px";
    ctl.innerHTML = `<p class="section-title" style="margin:0">District map</p>`;
    const sel = el("select");
    sel.innerHTML = Object.entries(GEO_METRICS).map(([k, m]) => `<option value="${k}" ${k === geoMetric ? "selected" : ""}>${m.label}</option>`).join("");
    sel.onchange = () => { geoMetric = sel.value; paintMap(); };
    ctl.appendChild(sel); mapCard.appendChild(ctl);
    mapCard.appendChild(el("div")).id = "map";
    const lg = el("div", "legend"); lg.id = "map-legend"; lg.style.marginTop = "10px"; mapCard.appendChild(lg);
    view.appendChild(mapCard);
    setTimeout(initMap, 30);
  } else {
    const note = el("div", "note info");
    note.innerHTML = "<div>Town polygons unavailable — map shown at town level only.</div>";
    view.appendChild(note);
  }

  view.appendChild(sectionCard("Towns", rankTable(townList(), "town")));
  view.appendChild(sectionCard("Precincts", rankTable(precList(), "precinct")));
};

function rankTable(rows, kind) {
  const cols = [
    ["name", kind === "town" ? "Town" : "Precinct", false],
    ["active", "Active", true],
    ["r", "R %", true], ["u", "U %", true], ["d", "D %", true],
    ["high", "High-turn", true], ["opp", "Classification", false],
  ];
  const get = r => ({
    name: r.name, active: r.active,
    r: r.party_pct.Republican, u: r.party_pct.Unaffiliated, d: r.party_pct.Democratic,
    high: r.tier.High, opp: r.opportunity.class, raw: r,
  });
  const data = rows.map(get);
  return sortable(cols, data, (row) => {
    const tr = el("tr", "click");
    tr.tabIndex = 0; tr.setAttribute("role", "button");
    tr.onclick = () => drillTown(row.raw, kind);
    tr.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); drillTown(row.raw, kind); } };
    tr.innerHTML =
      `<td class="nm">${row.name}</td>` +
      `<td class="num">${fmt(row.active)}</td>` +
      `<td class="num t-r">${pc1(row.r)}</td>` +
      `<td class="num t-u">${pc1(row.u)}</td>` +
      `<td class="num t-d">${pc1(row.d)}</td>` +
      `<td class="num">${fmt(row.high)}</td>` +
      `<td><span class="chip tag-${row.opp.replace(/[ /]/g, '.')}">${row.opp}</span></td>`;
    return tr;
  });
}

/* generic sortable table */
function sortable(cols, data, rowFn) {
  const wrap = el("div", "tbl-wrap");
  const table = el("table");
  const thead = el("thead"); const trh = el("tr");
  let sortKey = "active", dir = -1;
  cols.forEach(([k, lab, num]) => {
    const th = el("th", num ? "num" : ""); th.innerHTML = lab + `<span class="ar">▼</span>`;
    th.onclick = () => { if (sortKey === k) dir = -dir; else { sortKey = k; dir = num ? -1 : 1; } render(); upArrows(); };
    th.dataset.k = k; trh.appendChild(th);
  });
  thead.appendChild(trh); table.appendChild(thead);
  const tbody = el("tbody"); table.appendChild(tbody);
  function upArrows() {
    trh.querySelectorAll("th").forEach(th => { const ar = th.querySelector(".ar"); ar.textContent = th.dataset.k === sortKey ? (dir < 0 ? "▼" : "▲") : "▼"; ar.style.opacity = th.dataset.k === sortKey ? ".9" : ".25"; });
  }
  function render() {
    const sorted = [...data].sort((a, b) => {
      const x = a[sortKey], y = b[sortKey];
      if (typeof x === "string") return dir * x.localeCompare(y);
      return dir * ((x || 0) - (y || 0));
    });
    tbody.innerHTML = ""; sorted.forEach(r => tbody.appendChild(rowFn(r)));
  }
  render(); upArrows();
  wrap.appendChild(table); return wrap;
}

/* ---- Leaflet map ---- */
let _map, _layer;
function initMap() {
  if (!document.getElementById("map")) return;
  _map = L.map("map", { scrollWheelZoom: false, attributionControl: false });
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", { maxZoom: 18 }).addTo(_map);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", { maxZoom: 18, pane: "markerPane" }).addTo(_map);
  _map.fitBounds(GEO.bounds, { padding: [18, 18] });
  (window._maps = window._maps || []).push(_map);
  paintMap();
}
/* generic choropleth builder (used by the turnout map) */
function makeMap(id, getVal, label, fmtFn, ramp, legendId) {
  const map = L.map(id, { scrollWheelZoom: false, attributionControl: false });
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", { maxZoom: 18 }).addTo(map);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", { maxZoom: 18, pane: "markerPane" }).addTo(map);
  map.fitBounds(GEO.bounds, { padding: [18, 18] });
  (window._maps = window._maps || []).push(map);
  const vals = GEO.towns.features.map(f => { const t = TOWNS[f.properties.town]; return t ? getVal(t) : 0; });
  const min = Math.min(...vals), max = Math.max(...vals);
  const layer = L.geoJSON(GEO.towns, {
    style: f => { const t = TOWNS[f.properties.town]; const v = t ? getVal(t) : 0;
      return { fillColor: rampColor(v, min, max, ramp), fillOpacity: .88, color: "#06111F", weight: 1.2 }; },
    onEachFeature: (f, lyr) => { const t = TOWNS[f.properties.town]; if (!t) return;
      lyr.bindTooltip(`<b>${t.name}</b><br>${label}: ${fmtFn(getVal(t))}<br>${fmt(t.active)} active`, { sticky: true });
      lyr.on({ mouseover: e => e.target.setStyle({ weight: 3, color: "#22AABC" }), mouseout: e => layer.resetStyle(e.target), click: () => drillTown(t, "town") });
    }
  }).addTo(map);
  const lg = legendId && document.getElementById(legendId);
  if (lg) lg.innerHTML = `<span class="muted">${label}:</span>` +
    `<span><i style="background:${rampColor(min, min, max, ramp)}"></i>${fmtFn(min)}</span>` +
    `<span><i style="background:${rampColor(max, min, max, ramp)}"></i>${fmtFn(max)}</span>`;
  return map;
}
function rampColor(v, min, max, ramp) {
  const t = max > min ? (v - min) / (max - min) : .5;
  const base = ramp === "r" ? [224, 85, 85] : ramp === "d" ? [58, 106, 184] : ramp === "u" ? [120, 134, 156] : [34, 170, 188];
  const lo = [18, 33, 51];
  return `rgb(${lo.map((c, i) => Math.round(c + (base[i] - c) * (0.22 + .78 * t))).join(",")})`;
}
function paintMap() {
  if (!_map) return;
  if (_layer) _map.removeLayer(_layer);
  const m = GEO_METRICS[geoMetric];
  const vals = GEO.towns.features.map(f => { const t = TOWNS[f.properties.town]; return t ? m.get(t) : 0; });
  const min = Math.min(...vals), max = Math.max(...vals);
  _layer = L.geoJSON(GEO.towns, {
    style: f => { const t = TOWNS[f.properties.town]; const v = t ? m.get(t) : 0;
      return { fillColor: rampColor(v, min, max, m.ramp), fillOpacity: .88, color: "#06111F", weight: 1.2 }; },
    onEachFeature: (f, lyr) => {
      const t = TOWNS[f.properties.town]; if (!t) return;
      lyr.bindTooltip(`<b>${t.name}</b><br>${m.label}: ${m.fmt(m.get(t))}<br>${fmt(t.active)} active`, { sticky: true });
      lyr.on({
        mouseover: e => e.target.setStyle({ weight: 3, color: "#22AABC" }),
        mouseout: e => _layer.resetStyle(e.target),
        click: () => drillTown(t, "town"),
      });
    }
  }).addTo(_map);
  $("#map-legend").innerHTML = `<span class="muted">${m.label}:</span>` +
    `<span><i style="background:${rampColor(min, min, max, m.ramp)}"></i>${m.fmt(min)}</span>` +
    `<span><i style="background:${rampColor(max, min, max, m.ramp)}"></i>${m.fmt(max)}</span>`;
}

/* ============================ TURNOUT ============================ */
ROUTES.turnout = function (view) {
  pageHead(view, "Turnout History",
    "The four general elections that decide the seat, and where turnout runs reliable or soft. A turnout signal — not a record of how anyone voted.");

  // the four cycles that matter
  const g = C.gen_years || {}, p = C.pri_years || {};
  const CYC = [["2018", "Midterm", "mid"], ["2020", "Presidential", "pres"], ["2022", "Midterm", "mid"], ["2024", "Presidential", "pres"]];
  const maxGen = Math.max(...CYC.map(c => g[c[0]] || 0)) || 1;
  const cg = el("div", "cyc-grid");
  cg.innerHTML = CYC.map(([yr, type, cls]) => {
    const gen = g[yr] || 0, pri = p[yr] || 0;
    return `<div class="cyc ${cls}">
      <div class="cyc-eyebrow">${yr} · ${type}</div>
      <div class="cyc-val">${fmt(gen)}</div>
      <div class="cyc-lab">general ballots</div>
      <div class="cyc-bar"><i style="width:${Math.round(100 * gen / maxGen)}%"></i></div>
      <div class="cyc-pri">${fmt(pri)} primary ballots</div></div>`;
  }).join("");
  view.appendChild(cg);

  // turnout map + written takeaways
  if (GEO && GEO.towns && GEO.towns.features.length) {
    const row = el("div", "grid"); row.style.gridTemplateColumns = "1.5fr 1fr"; row.style.marginTop = "22px"; row.style.alignItems = "stretch";
    const mapCard = el("div", "card pad");
    mapCard.appendChild(el("p", "section-title", "Turnout strength by town<span class='ln'></span>"));
    const md = el("div"); md.id = "tmap"; mapCard.appendChild(md);
    const lg = el("div", "legend"); lg.id = "tmap-legend"; lg.style.marginTop = "10px"; mapCard.appendChild(lg);
    row.appendChild(mapCard);
    row.appendChild(turnoutTakeaways());
    view.appendChild(row);
    setTimeout(() => makeMap("tmap", t => pct(t.tier.High, t.active), "High-turnout share", pc1, "a", "tmap-legend"), 30);
  } else {
    view.appendChild(turnoutTakeaways());
  }

  // tier + method graphics
  const row2 = el("div", "grid"); row2.style.gridTemplateColumns = "1fr 1fr"; row2.style.marginTop = "22px";
  const tc = el("div", "card pad");
  tc.appendChild(el("p", "section-title", "Turnout tiers<span class='ln'></span>"));
  chart(tc, doughnut(TIERS.map(t => T.tier[t]), TIERS, ["#65C8CF", "#2E8892", "#E7C772", "#5B7593"]), 200);
  const mc = el("div", "card pad");
  mc.appendChild(el("p", "section-title", "Vote-method tendency<span class='ln'></span>"));
  chart(mc, doughnut(METHODS.map(m => T.method[m]), ["Early", "Absentee", "Election Day", "Mixed", "Unknown"],
    ["#65C8CF", "#2E8892", "#E7C772", "#9DB4CC", "#4A5A6B"]), 200);
  row2.appendChild(tc); row2.appendChild(mc);
  view.appendChild(row2);
};

function turnoutTakeaways() {
  const tw = townList();
  const byHigh = [...tw].sort((a, b) => pct(b.tier.High, b.active) - pct(a.tier.High, a.active));
  const strong = byHigh[0], soft = byHigh[byHigh.length - 1];
  const distHigh = pct(T.high_turnout, T.active), distLow = pct(T.tier.Low + T.tier.None, T.active);
  const card = el("div", "narr"); card.style.margin = "0"; card.style.height = "100%";
  card.innerHTML = `<h3>Map Read</h3>
    <p><b>${strong.name}</b> turns out strongest (<b>${pc1(pct(strong.tier.High, strong.active))}</b> high-propensity). <b>${soft.name}</b> softest (<b>${pc1(pct(soft.tier.High, soft.active))}</b>) — the biggest reactivation upside.</p>
    <p>District-wide <b>${pc1(distHigh)}</b> high-propensity, <b>${pc1(distLow)}</b> rarely vote. Presidential years far outdraw midterms.</p>`;
  return card;
}

/* ============================ ELECTION RESULTS ============================ */
let resRace = "house_2024";
const RES = window.RESULTS;
function resTotals(race) {
  let d = 0, r = 0; Object.values(race.towns).forEach(t => { d += t.d; r += t.r; });
  const two = d + r; return { d, r, two, dPct: 100 * d / two, rPct: 100 * r / two, margin: 100 * (d - r) / two };
}
const marginLabel = m => (m >= 0 ? "D+" : "R+") + Math.abs(m).toFixed(1);
function colorForMargin(m) { // m = D − R, two-party points
  if (m > 15) return "#1A3A8C"; if (m > 5) return "#3A6AB8"; if (m > -5) return "#5A6E80"; if (m > -15) return "#E05555"; return "#CC2222";
}
const pcol = p => p === "D" ? "var(--dem-lt)" : p === "R" ? "var(--rep-lt)" : "var(--gold-lt)";
const pbar = p => p === "D" ? "var(--bar-d)" : p === "R" ? "var(--bar-r)" : "var(--npa)";
ROUTES.results = function (view) {
  if (!RES) { view.innerHTML = vhead("Certified Returns", "var(--teal-lt)", "Results", "") + `<div class="note"><div>Results data not loaded.</div></div>`; return; }
  if (!RES.races[resRace]) resRace = RES.order[0];
  const race = RES.races[resRace];
  const municipal = !!race.municipal;
  const splitTowns = race.splitTowns || [];
  const nTowns = RES.towns.length;

  // two-level selector: office group + cycle year
  const curGroup = RES.groups.find(gp => gp.keys.indexOf(resRace) >= 0) || RES.groups[0];
  const officePills = RES.groups.map(gp => {
    const on = gp === curGroup, latest = gp.keys[gp.keys.length - 1];
    return `<button class="rs-office ${on ? "on" : ""}" data-office="${latest}">${gp.office}</button>`;
  }).join("");
  const cyclePills = curGroup.keys.map(k => `<button class="rs-cyc ${k === resRace ? "on" : ""}" data-k="${k}">${RES.races[k].year}</button>`).join("");

  // turnout by cycle (flat tiles)
  const g = C.gen_years || {}; const years = [2018, 2020, 2022, 2024];
  const maxTurnout = Math.max(...years.map(y => g[y] || 0)) || 1;
  const turnoutTiles = years.map(y => { const v = g[y] || 0, mid = y % 4 !== 0;
    return `<div style="background:var(--navy-card);padding:18px 20px 20px;"><div class="rlabel" style="font-size:10px;margin-bottom:10px;">${y} <span style="color:var(--fg-dim);">· ${mid ? "Midterm" : "Presidential"}</span></div><div class="r-num" style="font-size:34px;line-height:1;">${fmt(v)}</div><div style="height:3px;background:rgba(255,255,255,.06);margin-top:14px;border-radius:2px;"><div style="width:${Math.round(100 * v / maxTurnout)}%;height:3px;background:var(--teal);border-radius:2px;"></div></div></div>`;
  }).join("");

  // headline + town rows
  let headline, townRows;
  if (!municipal) {
    const tot = resTotals(race);
    const prev = RES.compare[resRace] ? RES.races[RES.compare[resRace]] : null;
    const prevTot = prev ? resTotals(prev) : null;
    const win = tot.r >= tot.d ? "r" : "d";
    const winColor = win === "r" ? "var(--rep-lt)" : "var(--dem-lt)";
    let swingTxt = "first comparable cycle", swingColor = "var(--fg-muted)";
    if (prevTot) { const dm = tot.margin - prevTot.margin; swingTxt = `swing ${dm >= 0 ? "D" : "R"}+${Math.abs(dm).toFixed(1)} vs ${prev.year}`; swingColor = dm >= 0 ? "var(--dem-lt)" : "var(--rep-lt)"; }
    headline = `<div style="border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:30px 0 32px;margin-top:4px;">
      <div class="rlabel" style="margin-bottom:22px;">${race.office} · ${race.year} · ${race.scope}</div>
      <div class="rhead-grid" style="display:grid;grid-template-columns:1fr auto 1fr;gap:30px;align-items:end;margin-bottom:18px;">
        <div><div class="rlabel" style="color:var(--dem-lt);margin-bottom:8px;">${race.dem.name} <span style="color:var(--fg-muted);">(D)</span>${win === "d" ? ' <span style="color:var(--gold-lt);">✓</span>' : ""}</div><div class="r-num" style="font-size:52px;line-height:.9;">${fmt(tot.d)}</div><div class="r-num" style="font-size:13px;color:var(--fg-muted);margin-top:6px;">${pc1(tot.dPct)}</div></div>
        <div style="text-align:center;padding-bottom:6px;"><div class="rlabel" style="font-size:10px;margin-bottom:6px;">Margin</div><div class="r-num" style="font-size:30px;line-height:1;color:${winColor};">${marginLabel(tot.margin)}</div><div class="r-num" style="font-size:11px;margin-top:8px;color:${swingColor};">${swingTxt}</div></div>
        <div style="text-align:right;"><div class="rlabel" style="color:var(--rep-lt);margin-bottom:8px;">${race.rep.name} <span style="color:var(--fg-muted);">(R)</span>${win === "r" ? ' <span style="color:var(--gold-lt);">✓</span>' : ""}</div><div class="r-num" style="font-size:52px;line-height:.9;">${fmt(tot.r)}</div><div class="r-num" style="font-size:13px;color:var(--fg-muted);margin-top:6px;">${pc1(tot.rPct)}</div></div>
      </div>
      <div style="display:flex;height:8px;border-radius:2px;overflow:hidden;"><div style="width:${tot.dPct}%;background:var(--dem);"></div><div style="width:${tot.rPct}%;background:var(--rep);"></div></div>
    </div>`;
    townRows = RES.towns.map((tn, i) => {
      const t = race.towns[tn]; const bb = i < nTowns - 1 ? "border-bottom:1px solid var(--border);" : "";
      if (!t) return `<div class="trow" style="padding:15px 18px;${bb}"><div style="display:flex;justify-content:space-between;align-items:baseline;"><span class="r-num" style="font-size:15px;color:var(--fg);">${tn}</span><span class="rlabel" style="color:var(--fg-dim);">no data</span></div></div>`;
      const two = t.d + t.r; const mm = 100 * (t.d - t.r) / two; const mc = mm >= 0 ? "var(--dem-lt)" : "var(--rep-lt)";
      const isSplit = splitTowns.indexOf(tn) >= 0;
      let sw = "";
      if (prev && prev.towns[tn]) { const p = prev.towns[tn]; const pm = 100 * (p.d - p.r) / (p.d + p.r); const dm = mm - pm;
        sw = ` <span class="r-num" style="font-size:12px;margin-left:8px;color:${dm >= 0 ? "var(--dem-lt)" : "var(--rep-lt)"};">${dm >= 0 ? "▲ D" : "▼ R"}+${Math.abs(dm).toFixed(1)}</span>`; }
      return `<div class="trow" style="padding:15px 18px;${bb}">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px;"><span class="r-num" style="font-size:15px;color:var(--fg);">${tn}${isSplit ? ` <span class="rlabel" style="font-size:8px;color:var(--gold-lt);">· HD-48</span>` : ""}</span><span class="r-num" style="font-size:13px;letter-spacing:.5px;"><span style="color:${mc};">${marginLabel(mm)}</span>${sw}</span></div>
        <div style="display:flex;height:22px;border-radius:2px;overflow:hidden;"><div class="r-num" style="width:${100 * t.d / two}%;background:var(--dem);display:flex;align-items:center;padding-left:8px;font-size:11px;color:#fff;min-width:0;">${fmt(t.d)}</div><div class="r-num" style="width:${100 * t.r / two}%;background:var(--rep);display:flex;align-items:center;justify-content:flex-end;padding-right:8px;font-size:11px;color:#fff;min-width:0;">${fmt(t.r)}</div></div>
      </div>`;
    }).join("");
  } else {
    const holds = {};
    RES.towns.forEach(tn => { const t = race.towns[tn]; if (t) holds[t.a.p] = (holds[t.a.p] || 0) + 1; });
    const holdTxt = Object.entries(holds).map(([p, n]) => `${n} ${p}`).join(" · ");
    const chips = RES.towns.map(tn => { const t = race.towns[tn];
      if (!t) return `<div style="display:flex;align-items:center;gap:8px;"><span style="width:9px;height:9px;border-radius:2px;background:var(--fg-dim);flex-shrink:0;"></span><span class="r-num" style="font-size:13px;color:var(--fg-muted);">${tn}: no race</span></div>`;
      return `<div style="display:flex;align-items:center;gap:8px;"><span style="width:9px;height:9px;border-radius:2px;background:${pbar(t.a.p)};flex-shrink:0;"></span><span class="r-num" style="font-size:13px;color:var(--fg);">${tn}: ${t.a.n}</span><span class="rlabel" style="font-size:8px;color:${pcol(t.a.p)};">${t.a.p}</span></div>`;
    }).join("");
    headline = `<div style="border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:26px 0 28px;margin-top:4px;">
      <div class="rlabel" style="margin-bottom:16px;">First Selectman · ${race.year} · Municipal — by town</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap;">
        <div style="font-family:var(--ff-body);font-size:13px;color:var(--fg-muted);max-width:44ch;line-height:1.55;">Each town elects its own First Selectman.${holdTxt ? " Winners this cycle: " + holdTxt + "." : ""}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 26px;">${chips}</div>
      </div>
    </div>`;
    townRows = RES.towns.map((tn, i) => { const t = race.towns[tn]; const bb = i < nTowns - 1 ? "border-bottom:1px solid var(--border);" : "";
      if (!t) return `<div class="trow" style="padding:15px 18px;${bb}"><div style="display:flex;justify-content:space-between;align-items:baseline;"><span class="r-num" style="font-size:15px;color:var(--fg);">${tn}</span><span class="rlabel" style="color:var(--fg-dim);">no race this cycle</span></div></div>`;
      const a = t.a, b = t.b; const two = (a.v + b.v) || 1; const mar = 100 * (a.v - b.v) / two; const uno = b.v === 0;
      return `<div class="trow" style="padding:15px 18px;${bb}">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px;"><span class="r-num" style="font-size:15px;color:var(--fg);">${tn}</span><span class="r-num" style="font-size:13px;color:${pcol(a.p)};">${a.n} (${a.p}) ${uno ? "unopp." : "+" + Math.abs(mar).toFixed(1)}</span></div>
        <div style="display:flex;height:22px;border-radius:2px;overflow:hidden;background:#0F1A2C;"><div class="r-num" style="width:${100 * a.v / two}%;background:${pbar(a.p)};display:flex;align-items:center;padding-left:8px;font-size:11px;color:#fff;min-width:0;">${a.n} ${fmt(a.v)}</div>${uno ? "" : `<div class="r-num" style="width:${100 * b.v / two}%;background:${pbar(b.p)};display:flex;align-items:center;justify-content:flex-end;padding-right:8px;font-size:11px;color:#fff;min-width:0;">${fmt(b.v)} ${b.n}</div>`}</div>
      </div>`;
    }).join("");
  }

  view.innerHTML =
    vhead("Certified Returns", "var(--teal-lt)", "Results", "CT SOTS · ctemspublic") +
    `<div style="display:flex;align-items:center;justify-content:space-between;gap:28px;flex-wrap:wrap;margin-bottom:4px;">
      <div style="display:inline-flex;border:1px solid var(--border);border-radius:4px;overflow:hidden;flex-wrap:wrap;">${officePills}</div>
      <div style="display:inline-flex;align-items:center;gap:8px;"><span class="rlabel" style="font-size:10px;margin-right:4px;">Cycle</span>${cyclePills}</div>
    </div>

    ${headline}

    <div style="padding:34px 0 8px;">
      <div class="rlabel" style="margin-bottom:16px;">Turnout by cycle · ballots cast</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--border);border:1px solid var(--border);">${turnoutTiles}</div>
    </div>

    <div class="rmap-grid" style="display:grid;grid-template-columns:1.35fr 1fr;gap:24px;margin-top:34px;align-items:start;">
      <div>
        <div class="rlabel" style="margin-bottom:14px;">${municipal ? "Winner by town" : "Margin by town"}</div>
        <div style="position:relative;border:1px solid var(--border);border-radius:8px;overflow:hidden;">
          <div id="rmap" style="height:440px;border:0;border-radius:0;"></div>
          <div class="legend" id="rmap-legend" style="position:absolute;left:14px;bottom:14px;z-index:600;background:rgba(6,17,31,.82);border:1px solid var(--border);border-radius:4px;padding:8px 12px;backdrop-filter:blur(8px);gap:12px;"></div>
        </div>
      </div>
      <div>
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px;"><span class="rlabel">${municipal ? "Town result" : "Town result & swing"}</span><span class="rlabel" style="font-size:9px;color:var(--fg-dim);">${municipal ? "winner / runner-up" : "D votes / R votes"}</span></div>
        <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;">${townRows}</div>
      </div>
    </div>`;

  view.querySelectorAll("[data-office]").forEach(b => b.onclick = () => { resRace = b.dataset.office; route(); });
  view.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { resRace = b.dataset.k; route(); });
  setTimeout(() => resultsMap("rmap", race), 30);
};
function resultsMap(id, race) {
  const municipal = !!race.municipal;
  const partyFill = p => p === "R" ? "#CC2222" : p === "D" ? "#1A3A8C" : "#7C3AED";
  const map = L.map(id, { scrollWheelZoom: false, attributionControl: false });
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", { maxZoom: 18 }).addTo(map);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", { maxZoom: 18, pane: "markerPane" }).addTo(map);
  map.fitBounds(GEO.bounds, { padding: [26, 26] });
  (window._maps = window._maps || []).push(map);
  const layer = L.geoJSON(GEO.towns, {
    style: f => { const t = race.towns[f.properties.town];
      if (!t) return { fillColor: "#0F1A2C", fillOpacity: .5, color: "#06111F", weight: 1 };
      if (municipal) return { fillColor: partyFill(t.a.p), fillOpacity: .9, color: "#06111F", weight: 1.2 };
      const m = 100 * (t.d - t.r) / (t.d + t.r);
      return { fillColor: colorForMargin(m), fillOpacity: .9, color: "#06111F", weight: 1.2 }; },
    onEachFeature: (f, lyr) => { const t = race.towns[f.properties.town]; if (!t) return;
      let tip;
      if (municipal) { const a = t.a, b = t.b; tip = `<b>${f.properties.town}</b><br>${a.n} (${a.p}): ${fmt(a.v)}${b.v ? `<br>${b.n} (${b.p}): ${fmt(b.v)}` : " · unopposed"}`; }
      else { const m = 100 * (t.d - t.r) / (t.d + t.r); tip = `<b>${f.properties.town}</b><br>${race.rep.name}: ${fmt(t.r)}<br>${race.dem.name}: ${fmt(t.d)}<br>${marginLabel(m)}`; }
      lyr.bindTooltip(tip, { sticky: true });
      lyr.on({ mouseover: e => e.target.setStyle({ weight: 3, color: "#F0B82A" }), mouseout: e => layer.resetStyle(e.target) });
    }
  }).addTo(map);
  const lg = document.getElementById("rmap-legend");
  if (lg) lg.innerHTML = (municipal
    ? [["#1A3A8C", "D win"], ["#CC2222", "R win"], ["#7C3AED", "Other"]]
    : [["#1A3A8C", "Safe D"], ["#3A6AB8", "Lean D"], ["#5A6E80", "Even"], ["#E05555", "Lean R"], ["#CC2222", "Safe R"]])
    .map(([c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join("");
  return map;
}

/* ============================ VERDICT · BATTLEFIELD · PLAN ============================ */
/* config-driven: derive everything from the loaded RESULTS + campaign config */
const CORE = RES ? RES.towns.slice() : Object.keys(TOWNS).filter(t => TOWNS[t].active > 25);
const fmtK = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : "" + Math.round(n);
const houseKeys = RES ? RES.order.filter(k => RES.races[k].kind === "House") : [];
const presKeys = RES ? RES.order.filter(k => RES.races[k].kind === "President") : [];
const mainHouseKey = houseKeys.length ? houseKeys.reduce((a, b) => RES.races[a].year >= RES.races[b].year ? a : b) : (RES && RES.order[RES.order.length - 1]);
const HMAIN = mainHouseKey ? resTotals(RES.races[mainHouseKey]) : { d: 0, r: 0, two: 0, margin: 0 };
const HMAINrace = mainHouseKey ? RES.races[mainHouseKey] : null;
const corePrec = () => precList().filter(p => CORE.some(t => p.name.startsWith(t)));
const precTown = p => CORE.find(t => p.name.startsWith(t)) || "";
const netOpp = p => Math.round(p.active * p.opportunity.dims.unaffiliated_density / 100);
const winNumber = Math.floor((HMAIN.two) / 2) + 1;        // 50%+1 of the latest contested House turnout
/* the candidate's own party totals for the win-gauge */
const myParty = (C.party || "R") === "D" ? "d" : "r";
const myVotes = HMAIN[myParty];
const myLast = (C.candidate || "").split(" ").pop();
const myYear = HMAINrace ? HMAINrace.year : 2024;

function rateFromMargin(m) {
  const a = Math.abs(m), side = m >= 0 ? "D" : "R";
  const col = side === "R" ? "var(--rep-lt)" : "var(--dem-lt)";
  if (a < 2) return ["TOSS-UP", "var(--gold-lt)"];
  if (a < 6) return ["LEAN " + side, col];
  if (a < 12) return ["LIKELY " + side, col];
  return ["SAFE " + side, col];
}
function leanColorReg(l) { if (l > 12) return "var(--safe-d)"; if (l > 4) return "var(--likely-d)"; if (l > -4) return "var(--tossup)"; if (l > -12) return "var(--likely-r)"; return "var(--safe-r)"; }
function leanLabelReg(l) { const a = Math.abs(Math.round(l * 10) / 10); return (l >= 0 ? "D+" : "R+") + a; }
function townHouseMargin(town) { const t = HMAINrace && HMAINrace.towns[town]; return t ? 100 * (t.d - t.r) / (t.d + t.r) : 0; }
function chipFor(cls) { const c = cls.toLowerCase();
  if (c.indexOf("persuasion") >= 0) return "PERSUADE";
  if (c.indexOf("turnout") >= 0 || c.indexOf("protect") >= 0 || c.indexOf("base") >= 0) return "GOTV";
  if (c.indexOf("field") >= 0 || c.indexOf("regist") >= 0 || c.indexOf("expand") >= 0) return "EXPAND";
  return "HOLD";
}
function chipStyle(type) {
  const map = { GOTV: ["var(--teal-lt)", "rgba(26,139,154,.14)", "rgba(26,139,154,.34)"],
    PERSUADE: ["var(--gold-lt)", "rgba(212,160,23,.14)", "rgba(212,160,23,.34)"],
    EXPAND: ["var(--npa-lt)", "rgba(91,117,147,.16)", "rgba(91,117,147,.36)"],
    HOLD: ["var(--rep-lt)", "rgba(220,38,38,.12)", "rgba(220,38,38,.3)"] };
  const c = map[type] || map.HOLD;
  return `display:inline-block;font-family:var(--ff-cond);font-weight:600;font-size:10px;letter-spacing:1px;padding:2px 7px;border-radius:2px;color:${c[0]};background:${c[1]};border:1px solid ${c[2]};`;
}
function vhead(kick, kickCol, title, right) {
  return `<div class="vhead"><div><div class="kicker" style="color:${kickCol}">${kick}</div><div class="h-page">${title}</div></div><div class="kicker">${right}</div></div>`;
}

/* ───────────────── COMMAND RAIL (persistent standings) ───────────────── */
const RTS = TARGET && TARGET.summary;
function standings() {
  const [rating, ratingCol] = rateFromMargin(HMAIN.margin);
  const win = TARGET ? TARGET.win_number : winNumber;
  const winBase = TARGET ? TARGET.planning_turnout : HMAIN.two;
  const myV = myVotes, cleared = myV - win;
  const fill = winBase ? Math.min(100, 100 * myV / winBase) : 0;
  const base = RTS ? (RTS.target_types["Base GOTV"] || 0) : T.high_turnout;
  const persu = RTS ? RTS.persuasion_targets : T.party.Unaffiliated;
  const regist = RTS ? RTS.dem_crossover_targets : T.newly_registered;
  const uSum = (base + persu + regist) || 1;
  return { rating, ratingCol, win, winBase, myV, cleared, fill, base, persu, regist,
    pBase: base / uSum * 100, pPersu: persu / uSum * 100, pReg: regist / uSum * 100 };
}
const RAIL_CTX = {
  verdict:   ["Verdict",  "Where the race stands today: the margin to protect, the universe to move, and the votes still in play."],
  analysis:  ["Analysis", "Fixed-universe read on how base, lean and persuasion stack against the win number, town by town."],
  targets:   ["Targets",  "One contact universe: who to reach, by program and geography, mapped for field and paid."],
  geography: ["Map",      "District recolored by lean, persuasion, turnout and size. Click any town or precinct to drill in."],
  results:   ["Results",  "Certified returns by office and town, with swing against the prior comparable race."],
};
function renderRail(active) {
  const rail = document.getElementById("rail");
  if (!rail) return;
  const s = standings();
  const ctx = RAIL_CTX[active] || RAIL_CTX.verdict;
  const segs = [["var(--teal)", s.pBase], ["var(--gold)", s.pPersu], ["var(--npa)", s.pReg]]
    .map(([c, w]) => `<span style="flex:${Math.max(3, w)};background:${c};"></span>`).join("");
  rail.innerHTML = `
    <div class="rk">${C.posture === "defense" ? "2026 Defense" : "2026 Pickup"}</div>
    <div class="rt">Race<br>Dashboard</div>
    <div class="rsub">${C.candidate} · ${C.posture === "defense" ? "Incumbent defense" : "Open-seat pickup"}</div>
    <div class="rdiv"></div>
    <div class="rlabel">Rating</div>
    <div class="rrating" style="color:${s.ratingCol};">${s.rating}</div>
    <div class="rpill">▲ ${leanLabelReg(HMAIN.margin)} · Last State House</div>
    <div class="rcard">
      <div class="rlabel">Votes To Win</div>
      <div class="r-num" style="font-size:42px;line-height:1;color:var(--gold-lt);margin-top:4px;">${fmt(s.win)}</div>
      <div class="rlabel" style="color:var(--fg-dim);margin-top:4px;">50% + 1 of ${fmt(s.winBase)}</div>
      <div class="gauge"><div class="fill" style="width:${s.fill.toFixed(1)}%;"></div><div class="mark" style="left:50%;"></div></div>
      <div style="margin-top:16px;"><div class="rlabel">Cleared · vs win number</div><div class="r-num" style="font-size:26px;margin-top:3px;color:${s.cleared >= 0 ? "var(--teal-lt)" : "var(--rep-lt)"};">${s.cleared >= 0 ? "+" : "−"}${fmt(Math.abs(s.cleared))}</div></div>
      ${RTS ? `<div class="rdiv" style="margin:16px 0 0;"></div>
      <div class="rlabel" style="margin-top:14px;">Universe</div>
      <div class="r-num" style="font-size:24px;margin-top:3px;">${fmt(RTS.targets)} <span style="font-size:13px;color:var(--fg-muted);font-weight:400;">of ${fmt(RTS.likely_voters)}</span></div>
      <div class="rsplit">${segs}</div>` : ""}
    </div>
    ${active !== "verdict" ? `<div style="margin-top:18px;"><div class="rlabel">On ${ctx[0]}</div><div class="rctx" style="margin-top:7px;">${ctx[1]}</div></div>` : ""}
    <a class="rbtn" href="#targets">Open Targets <span>→</span></a>`;
  const f = rail.querySelector(".gauge .fill");
  if (f) { const w = f.style.width; f.style.transform = "scaleX(0)"; requestAnimationFrame(() => { f.style.transition = "transform .7s var(--ease-wr)"; f.style.transform = "scaleX(1)"; void w; }); }
}

/* ───────────────── THE VERDICT (war-room body) ───────────────── */
ROUTES.verdict = function (view) {
  const TS = TARGET && TARGET.summary;
  const dec = Math.abs(HMAIN.r - HMAIN.d);
  const win = TARGET ? TARGET.win_number : winNumber;
  const myV = myVotes;
  const base = TS ? (TS.target_types["Base GOTV"] || 0) : T.high_turnout;
  const persu = TS ? TS.persuasion_targets : T.party.Unaffiliated;
  const regist = TS ? TS.dem_crossover_targets : T.newly_registered;
  const uSum = (base + persu + regist) || 1;
  const pBase = base / uSum * 100, pPersu = persu / uSum * 100, pReg = regist / uSum * 100;
  // concentration: how few precincts hold 60% of core active voters
  const cp = corePrec().slice().sort((a, b) => b.active - a.active);
  const totAct = cp.reduce((s, p) => s + p.active, 0) || 1;
  let cum = 0, k = 0; for (const p of cp) { cum += p.active; k++; if (cum / totAct >= 0.6) break; }
  const concShare = Math.round(cum / totAct * 100);
  // cycle margins (oldest → newest contested races)
  const hist = (RES ? RES.order : []).map(kk => { const rc = RES.races[kk]; return ["’" + String(rc.year).slice(2) + " " + (rc.kind === "House" ? "H" : "P"), resTotals(rc).margin]; });
  const cycCells = hist.map(([yr, m]) => {
    const d = m >= 0, w = Math.min(50, Math.abs(m) * 9 + 8), col = d ? "var(--bar-d)" : "var(--bar-r)", tc = d ? "var(--dem-lt)" : "var(--rep-lt)";
    return `<div class="cyc-cell"><span class="yr">${yr}</span>
      <span class="mbar">${d ? `<i style="left:50%;width:${w}%;background:${col};"></i>` : `<i style="right:50%;width:${w}%;background:${col};"></i>`}</span>
      <span class="mval" style="color:${tc};">${marginLabel(m)}</span></div>`;
  }).join("");
  // turnout sparkline
  const g = C.gen_years || {}; const yrs = [2018, 2020, 2022, 2024]; const gv = yrs.map(y => g[y] || 0);
  const gmax = Math.max(...gv) || 1; const spPts = gv.map((v, i) => `${12 + i * 98},${(104 - (v / gmax) * 78).toFixed(1)}`);
  const miniStat = (lab, val, col) => `<div style="background:var(--navy-card);border:1px solid var(--border);border-radius:8px;padding:16px 18px;">
    <div class="rlabel">${lab}</div><div class="r-num" style="font-size:30px;margin-top:6px;color:${col};">${val}</div></div>`;
  const meta = TARGET ? TARGET.generated_at.slice(0, 10) + " · SOTS + L2" : C.generated_at.slice(0, 10) + " · SOTS + returns";

  view.innerHTML = `
    <div class="tray" style="margin-bottom:18px;">
      <div class="tray-h"><span class="ttl">Path To Victory · Universe Split</span><span class="meta">${meta}</span></div>
      <div class="usplit">
        <div style="flex:${Math.max(8, pBase)};background:var(--teal);color:#05121b;">Base · ${fmtK(base)} · ${Math.round(pBase)}%</div>
        <div style="flex:${Math.max(8, pPersu)};background:var(--gold);color:#241a02;">Persuasion · ${fmtK(persu)} · ${Math.round(pPersu)}%</div>
        <div style="flex:${Math.max(3, pReg)};background:var(--npa);color:#fff;justify-content:center;padding:0 8px;">${Math.round(pReg)}%</div>
      </div>
    </div>

    <div class="wpanel cols-3" style="grid-template-columns:repeat(3,1fr);">
      <div class="stat" style="--accent:var(--gold-lt);"><div class="sl">01 · Margin</div><div class="sv">${fmt(dec)}</div><div class="ss">2024 decisive votes · protect the edge</div></div>
      <div class="stat" style="--accent:var(--teal-lt);"><div class="sl">02 · Map</div><div class="sv">${concShare}<span style="font-size:24px;color:var(--fg-muted);">%</span></div><div class="ss">voters in ${k} precincts · concentrate turf</div></div>
      <div class="stat" style="--accent:var(--npa-lt);"><div class="sl">03 · Voters</div><div class="sv">${fmt(persu)}</div><div class="ss">${TARGET ? "persuasion targets" : "persuadables"} · win the swing</div></div>
    </div>

    <div class="wpanel" style="grid-template-columns:1.5fr 1fr;margin-top:18px;align-items:stretch;">
      <div class="tray">
        <div class="tray-h"><span class="ttl">General-Election Turnout</span><span class="meta" style="color:var(--gold-lt);">’18 → ’24</span></div>
        <div style="position:relative;margin-top:18px;"><svg viewBox="0 0 320 120" style="width:100%;height:auto;display:block;overflow:visible;">
          <line x1="0" y1="104" x2="320" y2="104" stroke="rgba(255,255,255,.1)" stroke-width="1"></line>
          <polyline points="${spPts.join(" ")}" fill="none" stroke="var(--teal-lt)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></polyline>
          ${spPts.map(p => { const [x, y] = p.split(","); return `<circle cx="${x}" cy="${y}" r="4" fill="var(--gold-lt)"></circle>`; }).join("")}
        </svg></div>
        <div style="display:flex;justify-content:space-between;margin-top:12px;">${yrs.map((y, i) => `<span class="meta" ${i === 3 ? 'style="color:var(--gold-lt);"' : ''}>’${String(y).slice(2)} · ${fmtK(gv[i])}</span>`).join("")}</div>
      </div>
      <div class="wpanel" style="grid-template-columns:1fr 1fr;gap:14px;align-content:start;">
        ${miniStat("Active Reg.", fmt(T.active), "var(--fg)")}
        ${miniStat(myYear + " Turnout", fmt(HMAIN.two), "var(--teal-lt)")}
        ${miniStat("Win Number", fmt(win), "var(--gold-lt)")}
        ${miniStat("Cleared vs Win", (myV - win >= 0 ? "+" : "−") + fmt(Math.abs(myV - win)), myV - win >= 0 ? "var(--teal-lt)" : "var(--rep-lt)")}
      </div>
    </div>

    <div class="tray" style="margin-top:18px;">
      <div class="tray-h"><span class="ttl">Cycle Margins</span><span class="meta">R ◂ ▸ D · P = President · H = State House</span></div>
      <div class="cyc-row">${cycCells}</div>
    </div>`;

  // bars grow from 0
  view.querySelectorAll(".usplit > div").forEach(d => {
    const t = d.style.flex; d.style.flex = "0.0001"; requestAnimationFrame(() => { d.style.flex = t; });
  });
};

/* ───────────────── ANALYSIS ───────────────── */
let analysisMetric = "persuasion_share";
let analysisTown = null;
const METRIC_SHORT = { persuasion_share: "Persuasion load", true_swing_rate: "True swing", base_lean_rate: "Base + lean", outdoor_l2_rate: "Outdoor / gun L2", election_day_rate: "Election Day" };
const METRIC_STYLE = {
  persuasion_share:  { rgb: [91, 117, 147],  hex: "#9DB4CC", legend: "Share of persuasion core" },
  true_swing_rate:   { rgb: [125, 148, 173], hex: "#B7C6D8", legend: "Convertible swing rate" },
  base_lean_rate:    { rgb: [26, 139, 154],  hex: "#22AABC", legend: "Base & lean to protect" },
  outdoor_l2_rate:   { rgb: [212, 160, 23],  hex: "#F0B82A", legend: "Outdoor / gun L2 cluster" },
  election_day_rate: { rgb: [34, 170, 188],  hex: "#22AABC", legend: "Election Day load" },
};
function selectAnalysisTown(name) { analysisTown = name; route(); }
ROUTES.analysis = function (view) {
  if (!TARGET || !TARGET.analysis) {
    view.innerHTML = vhead("Strategic Analysis", "var(--gold-lt)", "Analysis Not Loaded", "Run build/import_targets.py") +
      `<div class="note info"><div>Aggregate analysis is not loaded yet.</div></div>`;
    return;
  }
  const A = TARGET.analysis, V = A.vote_path, CON = A.consumer;
  const mapMetrics = (A.map && A.map.metrics) || [];
  if (!mapMetrics.some(m => m.key === analysisMetric)) analysisMetric = mapMetrics[0] ? mapMetrics[0].key : "persuasion_share";
  const metric = mapMetrics.find(m => m.key === analysisMetric) || { key: analysisMetric, label: "Analysis metric", suffix: "%" };
  const ms = METRIC_STYLE[metric.key] || METRIC_STYLE.base_lean_rate;
  const rows = (A.map && A.map.towns) || [];
  const byTown = Object.fromEntries(rows.map(t => [t.town, t]));
  if (!byTown[analysisTown]) analysisTown = rows[0] ? rows[0].town : null;
  const sd = byTown[analysisTown] || {};
  const top = (obj, n) => Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, n || 6);
  const barRows = (obj, total, color) => top(obj, 6).map(([k, v]) => {
    const w = total ? Math.max(2, 100 * v / total) : 0;
    return `<div style="display:grid;grid-template-columns:minmax(150px,1fr) 64px 1.2fr;gap:12px;align-items:center;">
      <span class="tag" style="color:var(--fg);">${k}</span><span class="r-num" style="text-align:right;font-size:14px;color:${color};">${fmt(v)}</span>
      <span class="scorebar" style="margin:0;"><i style="width:${w}%;background:${color};"></i></span></div>`;
  }).join("");

  // KPI atoms (stat-tile, accent top border)
  const kpis = [
    ["Gap After Base", fmt(V.gap_after_base), "var(--rep-lt)", "votes beyond base GOTV"],
    ["Base + Lean Gap", fmt(V.gap_after_base_plus_lean), "var(--gold-lt)", "net votes still required"],
    ["Persuasion Core", fmt(V.persuasion_core), "var(--npa-lt)", "swing + crossover pool"],
    ["Target Cushion", fmt(V.target_overage), "var(--teal-lt)", "targets over win number"],
  ].map(([l, v, c, n]) => `<div class="stat" style="--accent:${c};"><div class="sl">${l}</div><div class="sv">${v}</div><div class="ss">${n}</div></div>`).join("");

  const metricBtns = mapMetrics.map(m => `<button class="seg-btn ${m.key === analysisMetric ? "on" : ""}" data-analysis-metric="${m.key}">${METRIC_SHORT[m.key] || m.label}</button>`).join("");

  // selected-town detail panel (folds L2 texture into the console)
  const job = (sd.true_swing || 0) > 500 ? "Persuasion battlefield" : "Base / lean protection";
  const jobAccent = (sd.true_swing || 0) > 500 ? "var(--npa-lt)" : "var(--teal-lt)";
  const detailRows = [
    ["Persuasion share", pc1(sd.persuasion_share), "var(--npa-lt)"],
    ["Base + lean", pc1(sd.base_lean_rate), "var(--teal-lt)"],
    ["Election Day", pc1(sd.election_day_rate), "var(--teal-lt)"],
    ["Outdoor / gun", pc1(sd.outdoor_l2_rate), "var(--gold-lt)"],
    ["Age 50+", pc1(sd.age_50_plus_rate), "var(--fg)"],
    ["Veteran L2", fmt(sd.veteran_l2), "var(--fg)"],
  ].map(([k, v, c]) => `<div class="dpanel-row"><span class="k">${k}</span><span class="r-num" style="font-size:15px;color:${c};">${v}</span></div>`).join("");

  // town rank by current metric
  const ranked = rows.slice().sort((a, b) => (b[metric.key] || 0) - (a[metric.key] || 0));
  const rmax = Math.max(...ranked.map(t => t[metric.key] || 0)) || 1;
  const rankRows = ranked.map((t, i) => {
    const sel = t.town === analysisTown, v = t[metric.key] || 0;
    return `<div class="prow" data-atown="${t.town}" role="button" tabindex="0" style="${sel ? "background:rgba(34,170,188,.12);border-color:rgba(34,170,188,.35);" : ""}">
      <span class="r-num" style="font-size:12px;color:var(--fg-muted);width:18px;">${String(i + 1).padStart(2, "0")}</span>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;"><span class="r-num" style="font-size:15px;color:var(--fg);">${t.town}</span><span class="r-num" style="font-size:14px;color:${ms.hex};">${pc1(v)}</span></div>
        <div style="height:5px;border-radius:3px;background:rgba(255,255,255,.06);overflow:hidden;"><div style="height:100%;width:${100 * v / rmax}%;background:${ms.hex};border-radius:3px;"></div></div>
      </div></div>`;
  }).join("");

  view.innerHTML =
    vhead("Fixed Universe", "var(--gold-lt)", "Analysis", "Aggregate SOTS + L2") +
    `<div class="wpanel cols-4" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">${kpis}</div>

    <div class="read-banner" style="margin-bottom:16px;">
      <div class="r-num" style="font-size:46px;line-height:1;color:var(--teal-lt);flex-shrink:0;">${pc1(V.base_share_of_win)}</div>
      <div style="font-family:var(--ff-body);font-size:13.5px;line-height:1.55;color:var(--fg-muted);">Base GOTV covers this share of the win number. The rest is a clean <b style="color:var(--fg);font-weight:600;">persuasion-and-lean-support</b> problem — and most of it sits in ${A.town_strategy[0].town}.</div>
    </div>

    <div class="console-card" style="margin-bottom:16px;">
      <div class="console-head">
        <span class="rlabel">Strategic Map</span>
        <div class="seg">${metricBtns}</div>
      </div>
      <div class="console-body" style="display:grid;grid-template-columns:1.6fr 1fr;">
        <div class="amap-wrap" style="position:relative;border-right:1px solid var(--border);">
          <div id="amap" style="height:540px;border:0;border-radius:0;"></div>
          <div id="amap-legend" class="amap-legend"></div>
        </div>
        <div style="padding:18px;">
          <div style="background:rgba(15,33,64,.6);border:1px solid var(--border-strong);border-radius:8px;padding:16px 18px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
              <span class="r-num" style="font-size:22px;color:var(--fg);">${analysisTown || "—"}</span>
              <span class="rlabel" style="color:${jobAccent};">${job}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px;">${detailRows}</div>
          </div>
          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px;">
            <span class="rlabel">Town Rank</span><span class="rlabel" style="color:${ms.hex === "#F0B82A" ? "var(--gold-lt)" : "var(--teal-lt)"};">${METRIC_SHORT[metric.key] || metric.label}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">${rankRows}</div>
        </div>
      </div>
    </div>

    <div class="wpanel" style="grid-template-columns:1fr 1fr;gap:16px;">
      <div class="vcard" style="padding:20px 22px;">
        <div class="rlabel" style="margin-bottom:14px;">How The District Votes<span class="rlabel" style="color:var(--fg-dim);margin-left:8px;">method tendency</span></div>
        <div style="display:flex;flex-direction:column;gap:11px;">${barRows(CON.vote_methods, V.targets, "var(--teal-lt)")}</div>
      </div>
      <div class="vcard" style="padding:20px 22px;">
        <div class="rlabel" style="margin-bottom:14px;">Who Lives Here<span class="rlabel" style="color:var(--fg-dim);margin-left:8px;">age bands</span></div>
        <div style="display:flex;flex-direction:column;gap:11px;">${barRows(CON.age_bands, V.targets, "var(--gold-lt)")}</div>
      </div>
    </div>

    <div class="vbanner"><span class="tag" style="font-size:10px;color:var(--gold);">Guardrail</span><span class="kicker" style="text-transform:none;letter-spacing:0;font-family:var(--ff-body);font-size:10.5px;">Aggregate signals only. No voter-level records are shown.</span></div>`;

  view.querySelectorAll("[data-analysis-metric]").forEach(btn => btn.onclick = () => { analysisMetric = btn.dataset.analysisMetric; route(); });
  view.querySelectorAll("[data-atown]").forEach(eln => {
    const go = () => selectAnalysisTown(eln.dataset.atown);
    eln.onclick = go;
    eln.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
  });
  setTimeout(() => analysisMap("amap", metric, analysisTown), 30);
};

function analysisMap(id, metric, selTown) {
  const host = document.getElementById(id);
  if (!host || !GEO || !GEO.towns || !TARGET || !TARGET.analysis || !TARGET.analysis.map) return;
  const rows = TARGET.analysis.map.towns || [];
  const byTown = Object.fromEntries(rows.map(t => [t.town, t]));
  const ms = METRIC_STYLE[metric.key] || METRIC_STYLE.base_lean_rate;
  const vals = rows.map(t => t[metric.key] || 0);
  const min = Math.min(...vals), max = Math.max(...vals);
  const color = v => {
    const lo = [18, 33, 51];
    const t = max > min ? (v - min) / (max - min) : .5;
    return `rgb(${lo.map((c, i) => Math.round(c + (ms.rgb[i] - c) * (0.22 + .78 * t))).join(",")})`;
  };
  const map = L.map(id, { scrollWheelZoom: false, attributionControl: false });
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", { maxZoom: 18 }).addTo(map);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", { maxZoom: 18, pane: "markerPane" }).addTo(map);
  map.fitBounds(GEO.bounds, { padding: [26, 26] });
  (window._maps = window._maps || []).push(map);
  const layer = L.geoJSON(GEO.towns, {
    style: f => {
      const row = byTown[f.properties.town], sel = f.properties.town === selTown;
      return { fillColor: row ? color(row[metric.key] || 0) : "#0F1A2C", fillOpacity: .9, color: sel ? "#F0B82A" : "#06111F", weight: sel ? 3 : 1.2 };
    },
    onEachFeature: (f, lyr) => {
      const row = byTown[f.properties.town];
      if (!row) return;
      const v = row[metric.key] || 0;
      lyr.bindTooltip(`<div class="n">${row.town}</div><div class="v">${pc1(v)}</div>`, { permanent: true, direction: "center", className: "amap-lbl", opacity: 1 });
      lyr.on({ mouseover: e => e.target.setStyle({ weight: 3, color: "#F0B82A" }), mouseout: e => layer.resetStyle(e.target), click: () => selectAnalysisTown(row.town) });
    }
  }).addTo(map);
  const lg = document.getElementById("amap-legend");
  if (lg) lg.innerHTML = `<div class="rlabel" style="margin-bottom:8px;">${ms.legend}</div>
    <div style="width:150px;height:10px;border-radius:2px;background:linear-gradient(90deg,${color(min)},${color(max)});"></div>
    <div style="display:flex;justify-content:space-between;margin-top:5px;"><span class="r-num" style="font-size:10px;color:var(--fg-muted);">${pc1(min)}</span><span class="r-num" style="font-size:10px;color:var(--fg-muted);">${pc1(max)}</span></div>`;
}

/* ───────────────── TARGETS ───────────────── */
let targetMetric = "target_rate";
let targetTown = null;
function selectTargetTown(name) { targetTown = name; route(); }
ROUTES.targets = function (view) {
  if (!TARGET) {
    view.innerHTML = vhead("Target Universe", "var(--gold-lt)", "Targets Not Loaded", "Run build/import_targets.py") +
      `<div class="note info"><div>Target model data is not loaded yet. Run <code>python3 build/import_targets.py</code>, then refresh.</div></div>`;
    return;
  }
  const s = TARGET.summary;
  const partyName = p => (TARGET.party_labels && TARGET.party_labels[p]) || p;
  const entries = obj => Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
  const typeColors = ["var(--teal-lt)", "var(--gold-lt)", "var(--npa-lt)", "var(--dem-lt)", "var(--fg-muted)"];
  const barMix = (label, valStr, c, w, lw) => `<div style="display:flex;align-items:center;gap:14px;margin-bottom:12px;">
    <span class="tag" style="color:var(--fg);width:${lw || 160}px;flex-shrink:0;line-height:1.25;">${label}</span>
    <span class="r-num" style="font-size:14px;color:${c};width:52px;text-align:right;flex-shrink:0;">${valStr}</span>
    <div style="flex:1;height:8px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden;"><div style="height:100%;width:${w}%;background:${c};border-radius:4px;"></div></div>
  </div>`;
  const mixBlock = (pairs, lw) => { const max = Math.max(...pairs.map(p => p[1])) || 1; return pairs.map(([l, v], i) => barMix(l, fmt(v), typeColors[i] || "var(--fg-muted)", Math.max(2, 100 * v / max), lw)).join(""); };
  const typeMix = mixBlock(entries(s.target_types), 210);
  const partyMix = mixBlock(entries(s.parties).map(([k, v]) => [partyName(k), v]), 110);
  const auditMix = mixBlock(entries(s.not_targeted_parties).map(([k, v]) => [partyName(k), v]), 130);
  const publicExports = (TARGET.exports || []).filter(x => !/\.csv$/i.test(x.href || ""));
  const exportLinks = publicExports.map(x => `<a class="chip" href="${x.href}" download>${x.label}</a>`).join("");
  const targetMetrics = {
    target_rate:   { label: "Target rate", get: t => t.target_rate, fmt: pc1, color: [34, 170, 188],  hex: "#22AABC", legend: "Targets ÷ likely voters" },
    targets:       { label: "Targets", get: t => t.targets, fmt: fmt, color: [212, 160, 23],  hex: "#F0B82A", legend: "Total targets" },
    persuasion:    { label: "Persuasion", get: t => t.persuasion, fmt: fmt, color: [91, 117, 147], hex: "#9DB4CC", legend: "Persuasion targets" },
    dem_crossover: { label: "Weak D crossover", get: t => t.dem_crossover, fmt: fmt, color: [96, 165, 250],  hex: "#60A5FA", legend: "Weak-D crossover targets" },
  };
  if (!targetMetrics[targetMetric]) targetMetric = "target_rate";
  const tm = targetMetrics[targetMetric];
  const targetBtns = Object.entries(targetMetrics).map(([k, m]) => `<button class="seg-btn ${k === targetMetric ? "on" : ""}" data-target-metric="${k}">${m.label}</button>`).join("");

  // selected-town resolution + detail panel
  if (!TARGET.towns.some(t => t.town === targetTown)) targetTown = TARGET.towns[0] ? TARGET.towns[0].town : null;
  const sdt = TARGET.towns.find(t => t.town === targetTown) || {};
  const job = (sdt.persuasion || 0) > 1000 ? "Persuasion battlefield" : "High target rate";
  const jobAccent = (sdt.persuasion || 0) > 1000 ? "var(--npa-lt)" : "var(--teal-lt)";
  const detailRows = [
    ["Likely", fmt(sdt.likely), "var(--fg-dim)"],
    ["Targets", fmt(sdt.targets), "var(--fg)"],
    ["Rate", pc1(sdt.target_rate), "var(--gold-lt)"],
    ["Persuasion", fmt(sdt.persuasion), "var(--npa-lt)"],
    ["Weak D", fmt(sdt.dem_crossover), "var(--dem-lt)"],
    ["U/IT out", fmt(sdt.u_it_not_targeted), "var(--fg-dim)"],
  ].map(([k, v, c]) => `<div class="dpanel-row"><span class="k">${k}</span><span class="r-num" style="font-size:15px;color:${c};">${v}</span></div>`).join("");

  // town rank by current metric
  const ranked = TARGET.towns.slice().sort((a, b) => tm.get(b) - tm.get(a));
  const rmax = Math.max(...ranked.map(t => tm.get(t))) || 1;
  const rankRows = ranked.map((t, i) => {
    const sel = t.town === targetTown, v = tm.get(t);
    return `<div class="prow" data-ttown="${t.town}" role="button" tabindex="0" style="${sel ? "background:rgba(34,170,188,.12);border-color:rgba(34,170,188,.35);" : ""}">
      <span class="r-num" style="font-size:12px;color:var(--fg-muted);width:18px;">${String(i + 1).padStart(2, "0")}</span>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;"><span class="r-num" style="font-size:15px;color:var(--fg);">${t.town}</span><span class="r-num" style="font-size:14px;color:${tm.hex};">${tm.fmt(v)}</span></div>
        <div style="height:5px;border-radius:3px;background:rgba(255,255,255,.06);overflow:hidden;"><div style="height:100%;width:${100 * v / rmax}%;background:${tm.hex};border-radius:3px;"></div></div>
      </div></div>`;
  }).join("");

  view.innerHTML =
    vhead("2026 General", "var(--gold-lt)", "Targets", "Generated " + TARGET.generated_at.slice(0, 10)) +
    `<div class="wpanel cols-4" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">
      <div class="stat" style="--accent:var(--teal-lt);"><div class="sl">Likely Pool</div><div class="sv">${fmt(s.likely_voters)}</div><div class="ss">high + medium tiers</div></div>
      <div class="stat" style="--accent:var(--teal-lt);"><div class="sl">Turnout Plan</div><div class="sv">${fmt(TARGET.planning_turnout)}</div><div class="ss">working assumption</div></div>
      <div class="stat" style="--accent:var(--gold-lt);"><div class="sl">Win Number</div><div class="sv">${fmt(TARGET.win_number)}</div><div class="ss">50% + 1</div></div>
      <div class="stat" style="--accent:var(--npa-lt);"><div class="sl">Targets</div><div class="sv">${fmt(s.targets)}</div><div class="ss">${pc1(s.target_rate)} of likely pool</div></div>
    </div>

    <div class="console-card" style="margin-bottom:16px;">
      <div class="console-head">
        <span class="rlabel">Target Map</span>
        <div class="seg">${targetBtns}</div>
      </div>
      <div class="console-body" style="display:grid;grid-template-columns:1.6fr 1fr;">
        <div class="amap-wrap" style="position:relative;border-right:1px solid var(--border);">
          <div id="target-map" style="height:540px;border:0;border-radius:0;"></div>
          <div id="target-map-legend" class="amap-legend"></div>
        </div>
        <div style="padding:18px;">
          <div style="background:rgba(15,33,64,.6);border:1px solid var(--border-strong);border-radius:8px;padding:16px 18px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
              <span class="r-num" style="font-size:22px;color:var(--fg);">${targetTown || "—"}</span>
              <span class="rlabel" style="color:${jobAccent};">${job}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px;">${detailRows}</div>
          </div>
          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px;">
            <span class="rlabel">Town Rank</span><span class="rlabel" style="color:${tm.hex};">${tm.label}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">${rankRows}</div>
        </div>
      </div>
    </div>

    <div class="wpanel" style="grid-template-columns:1.25fr 1fr;gap:16px;margin-bottom:16px;align-items:start;">
      <div class="vcard" style="padding:20px 22px;">
        <div class="rlabel" style="margin-bottom:18px;">Target Type Mix</div>
        ${typeMix}
      </div>
      <div class="vcard" style="padding:20px 22px;">
        <div class="rlabel" style="margin-bottom:18px;">Target Party Mix</div>
        ${partyMix}
      </div>
    </div>

    <div class="vcard" style="padding:20px 22px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:16px;"><span class="rlabel">Not Targeted · Party Audit</span><span class="rlabel" style="color:var(--fg-dim);">who we are leaving out, and why</span></div>
      <div class="wpanel" style="grid-template-columns:1.5fr 1fr;gap:24px;align-items:start;">
        <div>${auditMix}</div>
        <div>
          <div class="rlabel" style="margin-bottom:10px;">L2 Coverage</div>
          <div class="dl">
            <dt>Likely voters matched</dt><dd>${fmt(s.l2_match.likely)}</dd>
            <dt>Targets matched</dt><dd>${fmt(s.l2_match.targets)}</dd>
            <dt>Not targeted overall</dt><dd>${fmt(s.not_targeted)}</dd>
          </div>
        </div>
      </div>
    </div>

    <div class="vcard" style="padding:18px 22px;margin-bottom:16px;">
      <div class="rlabel" style="margin-bottom:12px;">Public Summaries</div>
      <div style="display:flex;gap:9px;flex-wrap:wrap;">${exportLinks}</div>
    </div>
    <div class="vbanner"><span class="tag" style="font-size:10px;color:var(--gold);">Model</span><span class="kicker" style="text-transform:none;letter-spacing:0;font-family:var(--ff-body);font-size:10.5px;">Fixed universe for campaign planning; see public summaries for detail.</span></div>`;

  view.querySelectorAll("[data-target-metric]").forEach(btn => btn.onclick = () => { targetMetric = btn.dataset.targetMetric; route(); });
  view.querySelectorAll("[data-ttown]").forEach(eln => {
    const go = () => selectTargetTown(eln.dataset.ttown);
    eln.onclick = go;
    eln.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
  });
  setTimeout(() => targetMap("target-map", tm, targetTown), 30);
};

function targetMap(id, metric, selTown) {
  const host = document.getElementById(id);
  if (!host || !GEO || !GEO.towns || !TARGET || !TARGET.towns) return;
  const rows = TARGET.towns || [];
  const byTown = Object.fromEntries(rows.map(t => [t.town, t]));
  const base = metric.color || [101, 200, 207];
  const vals = rows.map(metric.get);
  const min = Math.min(...vals), max = Math.max(...vals);
  const color = v => {
    const lo = [18, 33, 51];
    const t = max > min ? (v - min) / (max - min) : .5;
    return `rgb(${lo.map((c, i) => Math.round(c + (base[i] - c) * (0.22 + .78 * t))).join(",")})`;
  };
  const map = L.map(id, { scrollWheelZoom: false, attributionControl: false });
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", { maxZoom: 18 }).addTo(map);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", { maxZoom: 18, pane: "markerPane" }).addTo(map);
  map.fitBounds(GEO.bounds, { padding: [26, 26] });
  (window._maps = window._maps || []).push(map);
  const layer = L.geoJSON(GEO.towns, {
    style: f => {
      const row = byTown[f.properties.town], sel = f.properties.town === selTown;
      return { fillColor: row ? color(metric.get(row)) : "#0F1A2C", fillOpacity: .9, color: sel ? "#F0B82A" : "#06111F", weight: sel ? 3 : 1.2 };
    },
    onEachFeature: (f, lyr) => {
      const row = byTown[f.properties.town];
      if (!row) return;
      lyr.bindTooltip(`<div class="n">${row.town}</div><div class="v">${metric.fmt(metric.get(row))}</div>`, { permanent: true, direction: "center", className: "amap-lbl", opacity: 1 });
      lyr.on({ mouseover: e => e.target.setStyle({ weight: 3, color: "#F0B82A" }), mouseout: e => layer.resetStyle(e.target), click: () => selectTargetTown(row.town) });
    }
  }).addTo(map);
  const lg = document.getElementById("target-map-legend");
  if (lg) lg.innerHTML = `<div class="rlabel" style="margin-bottom:8px;">${metric.legend || metric.label}</div>
    <div style="width:150px;height:10px;border-radius:2px;background:linear-gradient(90deg,${color(min)},${color(max)});"></div>
    <div style="display:flex;justify-content:space-between;margin-top:5px;"><span class="r-num" style="font-size:10px;color:var(--fg-muted);">${metric.fmt(min)}</span><span class="r-num" style="font-size:10px;color:var(--fg-muted);">${metric.fmt(max)}</span></div>`;
}

/* ───────────────── BATTLEFIELD ───────────────── */
let battleSel = 0;
ROUTES.battlefield = function (view) {
  const ps = corePrec().slice().sort((a, b) => netOpp(b) - netOpp(a));
  battleSel = Math.min(battleSel, ps.length - 1);
  const cur = ps[battleSel];
  const curLean = cur.party_pct.Democratic - cur.party_pct.Republican;

  const rows = ps.map((p, i) => {
    const dem = Math.round(100 * p.party_pct.Democratic / (p.party_pct.Democratic + p.party_pct.Republican));
    const type = chipFor(p.opportunity.class);
    const sel = i === battleSel, target = i < 5;
    const bg = sel ? "background:rgba(26,139,154,.14);border-color:rgba(26,139,154,.3);" : (target ? "background:rgba(212,160,23,.05);" : "");
    return `<div class="prow" style="${bg}" data-i="${i}" role="button" tabindex="0">
      <span class="num" style="font-size:12px;color:var(--fg-muted);width:20px;text-align:right;flex-shrink:0;">${String(i + 1).padStart(2, "0")}</span>
      <div style="flex:1;min-width:0;"><div style="display:flex;align-items:center;gap:8px;"><span class="num" style="font-size:14px;color:var(--fg);">${p.name}</span><span style="${chipStyle(type)}">${type}</span></div>
      <div style="display:flex;height:4px;border-radius:2px;overflow:hidden;margin-top:5px;background:#0F1A2C;"><div style="width:${dem}%;background:var(--dem);"></div><div style="width:${100 - dem}%;background:var(--rep);"></div></div></div>
      <div style="text-align:right;flex-shrink:0;"><div class="num" style="font-size:14px;color:var(--gold-lt);">${fmt(netOpp(p))}</div><div class="kicker" style="font-size:9px;">net opp</div></div></div>`;
  }).join("");

  // cartogram tiles from precincts, colored by their town's 2024 house margin
  const tiles = ps.map((p, i) => {
    const m = townHouseMargin(precTown(p)); const ring = i < 5;
    return `<div class="cartile" style="background:${colorForMargin(m)};${ring ? "box-shadow:0 0 0 2px var(--gold),inset 0 0 0 1px rgba(0,0,0,.3);" : "opacity:.92;"}"></div>`;
  }).join("");

  view.innerHTML =
    vhead("Path To Victory · Precinct Targeting", "var(--teal-lt)", "The Battlefield", "Click a precinct · gold ring = priority five") +
    `<div class="vrow" style="grid-template-columns:1fr 1fr;">
      <div style="background:var(--navy-mid);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:13px 16px;border-bottom:1px solid var(--border);"><span class="h-card">Precincts By Net Opportunity</span><span class="kicker" style="color:var(--fg-dim);">${ps.length} of ${ps.length}</span></div>
        <div id="prows" style="padding:6px;">${rows}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div class="vcard" style="border-color:var(--border-lt);padding:16px 18px;">
          <div style="display:flex;align-items:baseline;justify-content:space-between;"><div class="num" style="font-size:24px;color:var(--fg);">${cur.name}</div><div class="kicker">${precTown(cur)} · HD-48</div></div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden;margin-top:12px;">
            <div style="background:var(--navy-mid);padding:10px 12px;"><div class="h-card">Reg. Lean</div><div class="num" style="font-size:19px;margin-top:3px;color:${leanColorReg(curLean) === "var(--tossup)" ? "var(--fg-dim)" : leanColorReg(curLean)};">${leanLabelReg(curLean)}</div></div>
            <div style="background:var(--navy-mid);padding:10px 12px;"><div class="h-card">Active</div><div class="num" style="font-size:19px;margin-top:3px;">${fmt(cur.active)}</div></div>
            <div style="background:var(--navy-mid);padding:10px 12px;"><div class="h-card">Net Opp.</div><div class="num" style="font-size:19px;margin-top:3px;color:var(--gold-lt);">${fmt(netOpp(cur))}</div></div>
          </div>
          <div style="margin-top:12px;display:flex;gap:9px;align-items:center;"><span style="${chipStyle(chipFor(cur.opportunity.class))}">${chipFor(cur.opportunity.class)}</span><span class="lede" style="flex:1;color:var(--fg);">${cur.opportunity.why}</span></div>
        </div>
        <div style="background:var(--navy-mid);border:1px solid var(--border);border-radius:var(--r-lg);padding:16px 18px;flex:1;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><span class="h-card">District Map · 2024 House Margin</span><span class="kicker" style="color:var(--fg-dim);">click a town</span></div>
          <div id="bmap"></div>
          <div style="display:flex;gap:14px;margin-top:12px;flex-wrap:wrap;align-items:center;">
            <span style="display:flex;align-items:center;gap:6px;"><span style="width:14px;height:9px;border-radius:2px;background:var(--safe-d);"></span><span class="kicker">D</span></span>
            <span style="display:flex;align-items:center;gap:6px;"><span style="width:14px;height:9px;border-radius:2px;background:var(--tossup);"></span><span class="kicker">Even</span></span>
            <span style="display:flex;align-items:center;gap:6px;"><span style="width:14px;height:9px;border-radius:2px;background:var(--safe-r);"></span><span class="kicker">R</span></span>
            <span style="display:flex;align-items:center;gap:6px;margin-left:auto;"><span style="width:11px;height:11px;border-radius:2px;border:2px solid var(--gold);"></span><span class="kicker" style="color:var(--gold-lt);">Priority 5</span></span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(${Math.min(8, ps.length)},1fr);gap:5px;margin-top:14px;">${tiles}</div>
          <div class="kicker" style="font-size:9px;margin-top:8px;color:var(--fg-dim);">Cartogram · 1 tile = precinct, shaded by town 2024 house margin</div>
        </div>
      </div>
    </div>

    <div class="vrow" style="grid-template-columns:repeat(3,1fr);margin-top:14px;">
      <div style="background:linear-gradient(160deg,rgba(91,117,147,.14),rgba(15,33,64,.35));border:1px solid rgba(91,117,147,.3);border-radius:var(--r-lg);padding:16px 18px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;"><span class="kicker" style="color:var(--npa-lt);">Persuasion Universe</span><span class="tag" style="color:var(--npa-lt);">Lead</span></div>
        <div class="num" style="font-size:38px;line-height:1;margin-top:4px;">${fmt(T.party.Unaffiliated)}</div>
        <div style="height:8px;border-radius:4px;background:var(--npa);margin-top:10px;"></div></div>
      <div style="background:linear-gradient(160deg,rgba(26,139,154,.12),rgba(15,33,64,.35));border:1px solid rgba(26,139,154,.28);border-radius:var(--r-lg);padding:16px 18px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;"><span class="kicker" style="color:var(--teal-lt);">Turnout Universe</span><span class="tag" style="color:var(--teal-lt);">GOTV</span></div>
        <div class="num" style="font-size:38px;line-height:1;margin-top:4px;">${fmt(T.high_turnout)}</div>
        <div style="height:8px;border-radius:4px;background:#0F1A2C;margin-top:10px;overflow:hidden;"><div style="height:100%;width:${Math.round(100 * T.high_turnout / T.active)}%;background:var(--teal);"></div></div></div>
      <div style="background:linear-gradient(160deg,rgba(212,160,23,.1),rgba(15,33,64,.35));border:1px solid rgba(212,160,23,.28);border-radius:var(--r-lg);padding:16px 18px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;"><span class="kicker" style="color:var(--gold-lt);">Registration Upside</span><span class="tag" style="color:var(--gold-lt);">Expand</span></div>
        <div class="num" style="font-size:38px;line-height:1;margin-top:4px;">${fmt(T.newly_registered)}</div>
        <div style="height:8px;border-radius:4px;background:#0F1A2C;margin-top:10px;overflow:hidden;"><div style="height:100%;width:${Math.round(100 * T.newly_registered / T.active)}%;background:var(--gold);"></div></div></div>
    </div>`;

  view.querySelectorAll("#prows .prow").forEach(el => {
    const select = () => { battleSel = +el.dataset.i; route(); };
    el.onclick = select;
    el.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); } };
  });
  setTimeout(() => resultsMap("bmap", HMAINrace, null), 30);
};

/* ───────────────── THE PLAN ───────────────── */
ROUTES.plan = function (view) {
  const cp = corePrec().slice().sort((a, b) => b.active - a.active);
  const totAct = cp.reduce((s, p) => s + p.active, 0);
  let cum = 0, k = 0; for (const p of cp) { cum += p.active; k++; if (cum / totAct >= 0.6) break; }
  const conc = Math.round(cum / totAct * 100);
  const dec = Math.abs(HMAIN.r - HMAIN.d);
  const C0 = 263.9; // donut circumference
  const alloc = [["Field", 38, "var(--teal)", "var(--teal-lt)"], ["Mail", 27, "var(--gold)", "var(--gold-lt)"], ["Digital", 22, "var(--npa)", "var(--npa-lt)"], ["Data", 13, "var(--fg-muted)", "var(--fg-dim)"]];
  let off = 0; const arcs = alloc.map(([, pc, col]) => { const len = pc / 100 * C0; const s = `<circle cx="50" cy="50" r="42" fill="none" stroke="${col}" stroke-width="15" stroke-dasharray="${len.toFixed(1)} ${C0}" stroke-dashoffset="${(-off).toFixed(1)}"></circle>`; off += len; return s; }).join("");
  const legend = alloc.map(([lab, pc, col, lt]) => `<div style="display:flex;align-items:center;gap:9px;"><span style="width:10px;height:10px;border-radius:2px;background:${col};"></span><span class="tag" style="flex:1;color:var(--fg);">${lab}</span><span class="num" style="color:${lt};">${pc}%</span></div>`).join("");
  const phases = [["WK 18–12", "Register & Expand", "212,160,23", "var(--gold-lt)"], ["WK 12–5", "Persuade The Swing", "91,117,147", "var(--npa-lt)"], ["WK 5–1", "Bank Early Vote", "26,139,154", "var(--teal-lt)"], ["FINAL WK", "GOTV — Drive The Universe", "220,38,38", "var(--rep-lt)"]];
  const timeline = phases.map(([wk, lab, rgb, c]) => `<div style="display:flex;align-items:center;gap:10px;"><span class="num" style="width:66px;flex-shrink:0;font-size:11px;color:var(--fg-muted);">${wk}</span><div class="tag" style="flex:1;height:26px;border-radius:var(--r-sm);background:rgba(${rgb},.16);border:1px solid rgba(${rgb},.32);display:flex;align-items:center;padding:0 12px;color:${c};">${lab}</div></div>`).join("");
  const pillars = [
    ["Pillar 01", "var(--npa-lt)", "Persuasion First", "+" + fmt(dec), "2024 margin to defend", "var(--npa)"],
    ["Pillar 02", "var(--teal-lt)", "Concentrate Turf", k + "<span style='font-size:15px;color:var(--fg-muted);'> pcts</span>", conc + "% of voters", "var(--teal)"],
    ["Pillar 03", "var(--gold-lt)", "Bank The Vote", "60%", "of base, early", "var(--gold)"],
    ["Pillar 04", "var(--fg-dim)", "Data Discipline", "Weekly", "refresh vs SOTS", "var(--fg-muted)"],
  ].map(([k0, kc, t, v, s, bt]) => `<div style="background:var(--navy-mid);border:1px solid var(--border);border-radius:var(--r-lg);padding:18px;border-top:2px solid ${bt};"><div class="kicker" style="color:${kc};">${k0}</div><div class="tag" style="display:block;font-size:15px;margin-top:6px;">${t}</div><div class="num" style="font-size:30px;margin-top:8px;color:var(--fg);">${v}</div><div class="kicker" style="margin-top:3px;">${s}</div></div>`).join("");

  view.innerHTML =
    vhead("Strategic Program · 18 Weeks Out", "var(--teal-lt)", "The Plan", "Persuasion-led · concentrated · banked early") +
    `<div class="vrow" style="grid-template-columns:1.1fr 1fr;">
      <div class="vcard" style="padding:18px 20px;">
        <div class="h-card">Recommended Resource Allocation</div>
        <div style="display:flex;align-items:center;gap:22px;margin-top:14px;">
          <svg viewBox="0 0 100 100" style="width:128px;height:128px;flex-shrink:0;transform:rotate(-90deg);"><circle cx="50" cy="50" r="42" fill="none" stroke="#0F1A2C" stroke-width="15"></circle>${arcs}</svg>
          <div style="flex:1;display:flex;flex-direction:column;gap:10px;">${legend}</div>
        </div>
        <div class="kicker" style="font-size:9px;margin-top:14px;color:var(--fg-dim);">Recommended mix — adjust to budget and calendar.</div>
      </div>
      <div class="vcard" style="padding:18px 20px;">
        <div class="h-card">Program Timeline</div>
        <div style="display:flex;flex-direction:column;gap:9px;margin-top:14px;">${timeline}</div>
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);display:flex;justify-content:space-between;"><div><div class="h-card">Early vote opens</div><div class="num" style="font-size:16px;color:var(--teal-lt);margin-top:2px;">WEEK 3</div></div><div style="text-align:right;"><div class="h-card">Bank-before-eday</div><div class="num" style="font-size:16px;color:var(--gold-lt);margin-top:2px;">60% of base</div></div></div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;margin:22px 0 12px;"><span class="tag" style="font-size:12px;letter-spacing:2px;color:var(--gold-lt);">Four Strategic Pillars</span><span style="flex:1;height:1px;background:var(--border);"></span></div>
    <div class="vrow" style="grid-template-columns:repeat(4,1fr);">${pillars}</div>
    <div class="vbanner"><span class="tag" style="font-size:10px;color:var(--gold);">Note</span><span class="kicker" style="text-transform:none;letter-spacing:0;font-family:var(--ff-body);font-size:10.5px;">Pillar metrics are SOTS-derived; allocation, timeline and bank targets are a recommended program, not data.</span></div>`;
};

/* ───────────────── GEOGRAPHY · TOWN & PRECINCT ───────────────── */
let geoMode = "town";
/* fixed-domain metrics — color is anchored to absolute thresholds, so a small
   real gap reads as a small visual gap (no min/max stretching). */
function gSeq(v, lo, hi, base) { const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo))); const f = [20, 32, 50]; return `rgb(${f.map((c, i) => Math.round(c + (base[i] - c) * (0.16 + 0.84 * t))).join(",")})`; }
const GEOM = {
  lean:    { label: "Registration lean", get: t => t.party_pct.Democratic - t.party_pct.Republican, fmt: v => (v >= 0 ? "D+" : "R+") + (Math.round(Math.abs(v) * 10) / 10), color: v => colorForMargin(v), anchors: [["var(--safe-r)", "R+15"], ["var(--tossup)", "Even"], ["var(--safe-d)", "D+15"]] },
  unaff:   { label: "Persuasion pool", get: t => t.party_pct.Unaffiliated, fmt: pc1, color: v => gSeq(v, 30, 50, [167, 139, 250]), anchors: [["#2c2942", "30%"], ["#A78BFA", "50%"]] },
  turnout: { label: "Turnout risk", get: t => pct(t.tier.Low + t.tier.None, t.active), fmt: pc1, color: v => gSeq(v, 8, 40, [240, 184, 42]), anchors: [["#2c2a1d", "8%"], ["#F0B82A", "40%+"]] },
  size:    { label: "Active voters", get: t => t.active, fmt: fmt, color: v => gSeq(v, 0, 5500, [34, 170, 188]), anchors: [["#16313b", "fewer"], ["#22AABC", "more"]] },
};
ROUTES.geography = function (view) {
  if (!GEOM[geoMetric]) geoMetric = "lean";
  const m = GEOM[geoMetric];
  const metricKeys = [["lean", "Lean"], ["unaff", "Persuasion"], ["turnout", "Turnout"], ["size", "Size"]];
  const seg = metricKeys.map(([k, lab]) => `<button class="seg-btn ${k === geoMetric ? "on" : ""}" data-k="${k}">${lab}</button>`).join("");
  const modeSeg = [["town", "Town"], ["precinct", "Precinct"]].map(([k, lab]) => `<button class="seg-btn ${k === geoMode ? "on" : ""}" data-m="${k}">${lab}</button>`).join("");

  const towns = townList();
  const precs = corePrec();
  const list = geoMode === "town"
    ? towns.map(t => ({ name: t.name, v: m.get(t), sub: fmt(t.active) + " act", col: m.color(m.get(t)), kind: "town", obj: t }))
    : precs.map(p => ({ name: p.name, v: m.get(p), sub: fmt(p.active) + " act", col: m.color(m.get(p)), kind: "precinct", obj: p }));
  const rankRows = list.map((r, i) => `<div class="prow" data-i="${i}" role="button" tabindex="0" style="padding:13px 12px;">
    <span style="width:12px;height:12px;border-radius:3px;background:${r.col};flex-shrink:0;"></span>
    <span class="r-num" style="font-size:16px;flex:1;min-width:0;color:var(--fg);">${r.name}</span>
    <span class="r-num" style="font-size:15px;color:var(--gold-lt);">${m.fmt(r.v)}</span>
    <span class="rlabel" style="width:74px;text-align:right;">${r.sub}</span></div>`).join("");

  view.innerHTML =
    vhead("Geographic Breakdown · Recolor By Metric", "var(--teal-lt)", "Town & Precinct", "Click any area to drill in") +
    `<div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center;margin-bottom:16px;">
       <div class="seg">${seg}</div>
       <div style="display:flex;align-items:center;gap:10px;"><span class="rlabel">Map by</span><div class="seg">${modeSeg}</div></div>
     </div>
    <div class="wpanel" style="grid-template-columns:1.7fr 1fr;gap:16px;align-items:start;">
      <div class="console-card">
        <div style="display:flex;align-items:baseline;justify-content:space-between;padding:14px 18px 12px;"><span class="rlabel">District Map · ${m.label}</span><span class="rlabel">${geoMode === "town" ? towns.length + " towns" : precs.length + " precincts"}</span></div>
        <div id="gmap" style="height:520px;border:0;border-radius:0;"></div>
        <div class="legend" id="gmap-legend" style="padding:14px 18px;border-top:1px solid var(--border);"></div>
        ${geoMode === "precinct" ? `<div class="rlabel" style="font-size:9px;padding:0 18px 12px;color:var(--fg-dim);text-transform:none;letter-spacing:0;font-family:var(--ff-body);">Bubble size = active voters · placed within town (state publishes no precinct shapes)</div>` : ""}
      </div>
      <div class="vcard" style="padding:18px;">
        <div class="rlabel" style="margin-bottom:12px;">${geoMode === "town" ? "Town" : "Precinct"} Rank · ${m.label}</div>
        <div style="display:flex;flex-direction:column;gap:4px;">${rankRows}</div>
      </div>
    </div>`;

  view.querySelectorAll(".seg")[0].querySelectorAll("button").forEach(b => b.onclick = () => { geoMetric = b.dataset.k; route(); });
  view.querySelectorAll(".seg")[1].querySelectorAll("button").forEach(b => b.onclick = () => { geoMode = b.dataset.m; route(); });
  view.querySelectorAll(".prow").forEach(el => {
    const open = () => { const r = list[+el.dataset.i]; drillTown(r.obj, r.kind); };
    el.onclick = open;
    el.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
  });
  setTimeout(() => geoMap("gmap", m, geoMode, "gmap-legend"), 30);
};
function townCentroids() {
  const c = {};
  GEO.towns.features.forEach(f => {
    const ring = f.geometry.type === "Polygon" ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
    let lat = 0, lng = 0; ring.forEach(([x, y]) => { lng += x; lat += y; });
    c[f.properties.town] = [lat / ring.length, lng / ring.length];
  });
  return c;
}
function geoMap(id, m, mode, legendId) {
  const map = L.map(id, { scrollWheelZoom: false, attributionControl: false });
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", { maxZoom: 18 }).addTo(map);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", { maxZoom: 18, pane: "markerPane" }).addTo(map);
  map.fitBounds(GEO.bounds, { padding: [18, 18] });
  (window._maps = window._maps || []).push(map);
  if (mode === "town") {
    const layer = L.geoJSON(GEO.towns, {
      style: f => { const t = TOWNS[f.properties.town]; return { fillColor: t ? m.color(m.get(t)) : "#0F1A2C", fillOpacity: .85, color: "#06111F", weight: 1.2 }; },
      onEachFeature: (f, lyr) => { const t = TOWNS[f.properties.town]; if (!t) return;
        lyr.bindTooltip(`<b>${t.name}</b><br>${m.label}: ${m.fmt(m.get(t))}<br>${fmt(t.active)} active`, { sticky: true });
        lyr.on({ mouseover: e => e.target.setStyle({ weight: 3, color: "#22AABC" }), mouseout: e => layer.resetStyle(e.target), click: () => drillTown(t, "town") });
      }
    }).addTo(map);
  } else {
    L.geoJSON(GEO.towns, { style: { fillColor: "#0F1A2C", fillOpacity: .4, color: "rgba(255,255,255,.13)", weight: 1 } }).addTo(map);
    const precs = corePrec();
    const amax = Math.max(...precs.map(p => p.active));
    const cent = townCentroids(); const byTown = {};
    precs.forEach(p => { const t = precTown(p); (byTown[t] = byTown[t] || []).push(p); });
    Object.entries(byTown).forEach(([town, ps]) => {
      const c = cent[town]; if (!c) return;
      ps.forEach((p, i) => {
        const off = ps.length > 1 ? 0.02 : 0, ang = (i / ps.length) * 2 * Math.PI;
        const ll = [c[0] + off * Math.cos(ang), c[1] + off * Math.sin(ang) * 1.4];
        const rad = 8 + 16 * Math.sqrt(p.active / amax); // area ∝ voters
        const mk = L.circleMarker(ll, { radius: rad, fillColor: m.color(m.get(p)), fillOpacity: .9, color: "#06111F", weight: 1.5 });
        mk.bindTooltip(`<b>${p.name}</b><br>${m.label}: ${m.fmt(m.get(p))}<br>${fmt(p.active)} active`, { sticky: true });
        mk.on("click", () => drillTown(p, "precinct"));
        mk.on("mouseover", () => mk.setStyle({ weight: 3, color: "#22AABC" }));
        mk.on("mouseout", () => mk.setStyle({ weight: 1.5, color: "#06111F" }));
        mk.addTo(map);
      });
    });
  }
  const lg = legendId && document.getElementById(legendId);
  if (lg) lg.innerHTML = `<span class="muted">${m.label}</span>` +
    m.anchors.map(([c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join("");
}

/* ============================ DRILL-DOWN (aggregate) ============================ */
function drillTown(t, kind) {
  const o = t.opportunity;
  const body = el("div");
  body.innerHTML = `<div class="kpis" style="grid-template-columns:repeat(2,1fr)">
    ${kpiHtml("Active voters", fmt(t.active), fmt(t.inactive) + " inactive")}
    ${kpiHtml("High-turnout", fmt(t.tier.High), "5+ vote score")}
    ${kpiHtml("Low / none tier", fmt(t.tier.Low + t.tier.None), "reactivation room")}
    ${kpiHtml("Avg age", t.avg_age ? t.avg_age.toFixed(0) : "—", "")}</div>`;
  body.appendChild(el("p", "section-title", "Party composition"));
  const bars = el("div");
  PARTY.forEach(p => bars.innerHTML += `<div style="margin-bottom:7px"><div class="between" style="font-size:12px"><span>${shortP(p)}</span><b>${fmt(t.party[p])} · ${pc1(t.party_pct[p])}</b></div>
    <div class="scorebar"><i style="width:${t.party_pct[p]}%;background:${PCOL[p]}"></i></div></div>`);
  body.appendChild(bars);
  body.appendChild(el("p", "section-title", "Turnout & method"));
  body.appendChild(el("div", "dl", TIERS.map(k => `<dt>${k} turnout</dt><dd>${fmt(t.tier[k])}</dd>`).join("") +
    METHODS.filter(m => t.method[m]).map(m => `<dt class="muted">${m}</dt><dd>${fmt(t.method[m])}</dd>`).join("")));
  body.appendChild(el("p", "section-title", "Campaign takeaway"));
  body.appendChild(el("div", "narr", `<span class="chip tag-${o.class.replace(/[ /]/g, '.')}">${o.class}</span><p style="margin-top:9px">${o.why}</p>`));
  openDrawer(`${t.name}<div class="muted" style="font-size:12px;font-weight:400">${kind === "town" ? "Town" : "Precinct"} detail</div>`, body);
}
function openDrawer(h, body) {
  $("#dr-h").innerHTML = h; $("#dr-b").innerHTML = ""; $("#dr-b").appendChild(body);
  $("#drawer").classList.add("open"); $("#scrim").classList.add("open");
}
window.closeDrawer = () => { $("#drawer").classList.remove("open"); $("#scrim").classList.remove("open"); };
window.addEventListener("keydown", e => { if (e.key === "Escape") window.closeDrawer(); });

/* ============================ small UI helpers ============================ */
function pageHead(view, title, sub) {
  const h = el("div", "pagehead"); h.innerHTML = `<h2>${title}</h2><p>${sub}</p>`; view.appendChild(h);
}
function kpi(host, lab, val, sub, cls) {
  host.insertAdjacentHTML("beforeend", kpiHtml(lab, val, sub, cls));
}
function kpiHtml(lab, val, sub, cls) {
  return `<div class="kpi ${cls || ""}"><div class="bar"></div><div class="lab">${lab}</div><div class="val">${val}</div><div class="sub">${sub || ""}</div></div>`;
}
function doughnut(data, labels, colors) {
  return { type: "doughnut", data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: "#0D1F33" }] },
    options: { cutout: "62%", plugins: { legend: { position: "right", labels: { boxWidth: 9, font: { size: 11 } } } }, maintainAspectRatio: false } };
}
function sectionCard(title, content) {
  const c = el("div", "card"); c.style.marginTop = "18px";
  const h = el("div", "pad"); h.style.paddingBottom = "0"; h.innerHTML = `<p class="section-title">${title}<span class="ln"></span></p>`;
  c.appendChild(h);
  const w = el("div"); w.style.padding = "0 18px 18px"; w.appendChild(content); c.appendChild(w);
  return c;
}

/* ---- boot ---- */
buildNav();
route();
})();
