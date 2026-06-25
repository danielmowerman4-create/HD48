/* Campaign Intelligence — config-driven dashboard.
   Reads window.CAMPAIGN / VOTERS / TOWN_SUMMARY / PRECINCT_SUMMARY / DATA_HEALTH / GEOMETRY.
   Every number shown is derived from the prepared SOTS data; nothing is hard-coded. */
(function () {
"use strict";
const C = window.CAMPAIGN, V = window.VOTERS, TOWNS = window.TOWN_SUMMARY,
      PREC = window.PRECINCT_SUMMARY, HEALTH = window.DATA_HEALTH, GEO = window.GEOMETRY;
const PARTY = ["Republican", "Democratic", "Unaffiliated", "Minor / Other"];
const PCOL = { "Republican": "#C2403B", "Democratic": "#2F6FB0", "Unaffiliated": "#6b7689", "Minor / Other": "#B0883B" };
const TIERS = ["High", "Medium", "Low", "None"];
const METHODS = ["Likely Early Vote", "Likely Absentee", "Likely Election Day", "Mixed Method", "Unknown"];

/* ---- apply campaign identity ---- */
const root = document.documentElement.style;
root.setProperty("--accent", C.accent);
root.setProperty("--accent-soft", C.accent_soft);
root.setProperty("--accent-deep", C.accent_deep);
document.title = C.headline + " · Campaign Intelligence";
document.getElementById("b-name").textContent = C.district_label;
document.getElementById("b-sub").textContent = C.candidate + " · " + (C.posture === "defense" ? "Incumbent defense" : "Open-seat pickup");
document.getElementById("b-pill").textContent = C.posture_copy.frame;
document.getElementById("b-gen").textContent = "Generated " + C.generated_at.replace("T", " ");

/* campaign switcher (separate repos, separate ports) */
const SWITCH = [
  { id: "hd48", label: "HD 48", url: "http://localhost:8048/" },
  { id: "hd10", label: "HD 10", url: "http://localhost:8010/" },
];
document.getElementById("switch").innerHTML = SWITCH.map(s =>
  `<a href="${s.url}" class="${s.id === C.id ? "on" : ""}">${s.label}</a>`).join("");

/* ---- helpers ---- */
const $ = (s, r = document) => r.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const fmt = n => (n == null ? "—" : Math.round(n).toLocaleString());
const pct = (n, d) => d ? Math.round(1000 * n / d) / 10 : 0;
const pc1 = n => (n == null ? "—" : n.toFixed(1) + "%");
const sum = a => a.reduce((x, y) => x + y, 0);
const T = C.totals;
const ACTIVE = V.filter(v => v.status === "Active");

/* short party label */
const shortP = p => p === "Minor / Other" ? "Other" : p.replace("ublican", "").replace("ocratic", "").replace("affiliated", "naff");

const townList = () => Object.values(TOWNS).filter(t => t.active > 25).sort((a, b) => b.active - a.active);
const precList = () => Object.values(PREC).filter(p => p.active > 5).sort((a, b) => b.active - a.active);

/* ---- nav ---- */
const NAV = [
  ["overview", "Overview", "M3 12h7V3H3v9Zm0 9h7v-7H3v7Zm9 0h9v-9h-9v9Zm0-18v7h9V3h-9Z"],
  ["geography", "Geography", "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6Zm6-2v14m6-12v14"],
  ["historical", "Historical Elections", "M3 3v18h18M7 15l4-5 3 3 5-7"],
  ["universe", "Voter Universe", "M3 5h18M3 12h18M3 19h18"],
  ["opportunity", "Opportunity", "M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7l3-7Z"],
  ["walklists", "Walk Lists", "M9 3h6l1 4H8l1-4Zm-1 6h8l1 12H7L8 9Z"],
  ["datahealth", "Data Health", "M12 2a10 10 0 100 20 10 10 0 000-20Zm-1 5h2v6h-2V7Zm0 8h2v2h-2v-2Z"],
];
function buildNav() {
  const n = $("#nav");
  n.appendChild(el("div", "nav-sec", "Workspace"));
  NAV.forEach(([id, lab, d]) => {
    const a = el("a"); a.dataset.route = id;
    a.innerHTML = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="${d}"/></svg><span>${lab}</span>`;
    a.onclick = () => location.hash = id;
    n.appendChild(a);
  });
}

/* ---- router ---- */
const ROUTES = {};
function route() {
  const r = (location.hash.replace("#", "") || "overview").split("/")[0];
  document.querySelectorAll(".nav a").forEach(a => a.classList.toggle("active", a.dataset.route === r));
  const meta = NAV.find(x => x[0] === r) || NAV[0];
  $("#t-title").textContent = meta[1];
  $("#view").innerHTML = ""; window._charts && window._charts.forEach(c => c.destroy()); window._charts = [];
  (ROUTES[r] || ROUTES.overview)($("#view"));
  document.getElementById("side").classList.remove("show");
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

/* ---- chart factory ---- */
function chart(parent, cfg, h) {
  const wrap = el("div"); wrap.style.height = (h || 220) + "px"; wrap.style.position = "relative";
  const cv = el("canvas"); wrap.appendChild(cv); parent.appendChild(wrap);
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 12; Chart.defaults.color = "#465065";
  window._charts.push(new Chart(cv, cfg));
}
const gridX = { grid: { display: false }, ticks: { autoSkip: false } };
const gridY = { grid: { color: "#eef1f6" }, border: { display: false }, ticks: { precision: 0 } };

/* ============================ OVERVIEW ============================ */
ROUTES.overview = function (view) {
  pageHead(view, C.candidate + " — Executive Overview",
    C.posture_copy.mission + " Every figure below is computed live from the active voter universe.");

  // KPI grid
  const k = el("div", "kpis");
  const a = T.active;
  kpi(k, "Active voters", fmt(a), `${fmt(T.registered)} registered · ${fmt(T.inactive)} inactive`);
  kpi(k, "Republican", fmt(T.party.Republican), pc1(T.party_pct.Republican) + " of active", "r");
  kpi(k, "Unaffiliated", fmt(T.party.Unaffiliated), pc1(T.party_pct.Unaffiliated) + " of active", "u");
  kpi(k, "Democratic", fmt(T.party.Democratic), pc1(T.party_pct.Democratic) + " of active", "d");
  view.appendChild(k);
  const k2 = el("div", "kpis"); k2.style.marginTop = "14px";
  kpi(k2, "Walk-list universe", fmt(T.walk_universe), "active w/ mailing address");
  kpi(k2, "High-turnout voters", fmt(T.high_turnout), "5+ vote score");
  kpi(k2, C.posture === "defense" ? "Low-prop / persuadable" : "Low-prop opportunity",
    fmt(T.low_prop_high_opp), "1-vote tier — reactivation room");
  kpi(k2, "Towns · Precincts", `${T.towns} · ${T.precincts}`, fmt(T.newly_registered) + " newly registered");
  view.appendChild(k2);

  // two-column: composition charts + narrative
  const row = el("div", "grid"); row.style.gridTemplateColumns = "1.35fr 1fr"; row.style.marginTop = "20px";
  const left = el("div", "card pad");
  left.appendChild(el("p", "section-title", "Party composition of active voters<span class='ln'></span>"));
  chart(left, {
    type: "bar",
    data: {
      labels: PARTY.map(shortP),
      datasets: [{ data: PARTY.map(p => T.party[p]), backgroundColor: PARTY.map(p => PCOL[p]), borderRadius: 4, maxBarThickness: 64 }]
    },
    options: { plugins: { legend: { display: false } }, scales: { x: gridX, y: gridY }, maintainAspectRatio: false }
  }, 210);
  const leg = el("div", "legend"); leg.style.marginTop = "10px";
  leg.innerHTML = PARTY.map(p => `<span><i style="background:${PCOL[p]}"></i>${shortP(p)} ${pc1(T.party_pct[p])}</span>`).join("");
  left.appendChild(leg);

  const right = narrative();
  row.appendChild(left); row.appendChild(right);
  view.appendChild(row);

  // turnout + method + participation timeline
  const row2 = el("div", "grid"); row2.style.gridTemplateColumns = "1fr 1fr 1.3fr"; row2.style.marginTop = "18px";
  const tc = el("div", "card pad");
  tc.appendChild(el("p", "section-title", "Turnout tiers<span class='ln'></span>"));
  chart(tc, doughnut(TIERS.map(t => T.tier[t]), TIERS, ["#2f9e6f", "#7bb37e", "#cdb24a", "#c9ccd4"]), 180);
  const mc = el("div", "card pad");
  mc.appendChild(el("p", "section-title", "Vote-method tendency<span class='ln'></span>"));
  chart(mc, doughnut(METHODS.map(m => T.method[m]), ["Early", "Absentee", "Election Day", "Mixed", "Unknown"],
    ["#2F6FB0", "#5e9bd1", "#C2403B", "#B0883B", "#c9ccd4"]), 180);
  const pcd = el("div", "card pad");
  pcd.appendChild(el("p", "section-title", "Ballots cast by current registrants, by year<span class='ln'></span>"));
  partTimeline(pcd, 180);
  row2.appendChild(tc); row2.appendChild(mc); row2.appendChild(pcd);
  view.appendChild(row2);

  // strongest / softest towns
  const tw = townList();
  const tlist = el("div", "card"); tlist.style.marginTop = "18px";
  const head = el("div", "pad between"); head.style.paddingBottom = "0";
  head.innerHTML = `<p class="section-title" style="margin:0">Towns at a glance</p><a class="chip" href="#geography">Open geography →</a>`;
  tlist.appendChild(head);
  tlist.appendChild(rankTable(tw, "town"));
  view.appendChild(tlist);
};

function narrative() {
  const tw = townList(), pr = precList();
  const a = T.active;
  const rShare = T.party_pct.Republican, uShare = T.party_pct.Unaffiliated, dShare = T.party_pct.Democratic;
  const lowTier = pct(T.tier.Low + T.tier.None, a);
  // strongest / weakest R towns by R share
  const byR = [...tw].sort((x, y) => y.party_pct.Republican - x.party_pct.Republican);
  const topR = byR[0], lowR = byR[byR.length - 1];
  const byU = [...tw].sort((x, y) => y.party_pct.Unaffiliated - x.party_pct.Unaffiliated)[0];
  const card = el("div", "narr");
  let html = `<h3>📍 What the district is telling us</h3>`;
  if (C.posture === "defense") {
    html += `<p>Across ${tw.length} towns the active universe is <b>${pc1(rShare)} Republican</b>, <b>${pc1(dShare)} Democratic</b>, and <b>${pc1(uShare)} unaffiliated</b>. Registration alone is close, so the seat is held on turnout and unaffiliated margin, not party share.</p>`;
    html += `<p><b>${topR.name}</b> is the strongest Republican ground (${pc1(topR.party_pct.Republican)} R). <b>${lowR.name}</b> is the most exposed (${pc1(lowR.party_pct.Republican)} R) and needs the tightest defense.</p>`;
    html += `<p>Unaffiliated voters are densest in <b>${byU.name}</b> (${pc1(byU.party_pct.Unaffiliated)}). <b>${fmt(T.tier.Low)}</b> active voters sit in the lowest turnout tier — the reactivation pool to protect the margin.</p>`;
  } else {
    const byRcount = [...tw].sort((x, y) => y.party.Republican - x.party.Republican)[0];
    html += `<p>The active universe is <b>${pc1(dShare)} Democratic</b>, <b>${pc1(uShare)} unaffiliated</b>, and <b>${pc1(rShare)} Republican</b>. With the incumbent gone, the realistic path runs through the <b>${fmt(T.party.Unaffiliated)}</b> unaffiliated voters, not party conversion.</p>`;
    html += `<p>Republican votes are most concentrated in <b>${byRcount.name}</b>’s precincts. <b>${fmt(T.tier.Low + T.tier.None)}</b> active voters are low-propensity — including Republicans who under-voted and are cheap to re-activate.</p>`;
    html += `<p>This is an opportunity district, not a safe one: treat every figure as a map of where to <b>test and organize first</b>, not a prediction of the result.</p>`;
  }
  card.innerHTML = html;
  return card;
}

function partTimeline(parent, h) {
  const g = C.gen_years || {}, p = C.pri_years || {};
  const years = [...new Set([...Object.keys(g), ...Object.keys(p)])].map(Number).filter(y => y >= 2012).sort();
  chart(parent, {
    type: "line",
    data: {
      labels: years,
      datasets: [
        { label: "General", data: years.map(y => g[y] || 0), borderColor: "#2F6FB0", backgroundColor: "rgba(47,111,176,.08)", fill: true, tension: .3, pointRadius: 2 },
        { label: "Primary", data: years.map(y => p[y] || 0), borderColor: C.accent, backgroundColor: "transparent", tension: .3, pointRadius: 2 },
      ]
    },
    options: { plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } }, scales: { x: gridX, y: gridY }, maintainAspectRatio: false }
  }, h);
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
    "Geographic breakdown of the active universe. Choose a metric to recolor the map; click any town or precinct row for a full drill-down.");

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
    note.innerHTML = "<span>ℹ️</span><div>Precinct polygons aren’t available for this district yet, so the map is shown at town level only. Precinct analysis below remains fully data-driven. Supply a precinct shapefile to enable a precinct choropleth.</div>";
    view.appendChild(note);
  }

  // town comparison chart
  const cc = el("div", "card pad"); cc.style.marginTop = "18px";
  cc.appendChild(el("p", "section-title", "Towns ranked by Republican vs Unaffiliated share<span class='ln'></span>"));
  const tw = townList();
  chart(cc, {
    type: "bar",
    data: {
      labels: tw.map(t => t.name),
      datasets: [
        { label: "Republican", data: tw.map(t => t.party_pct.Republican), backgroundColor: PCOL.Republican, borderRadius: 3 },
        { label: "Unaffiliated", data: tw.map(t => t.party_pct.Unaffiliated), backgroundColor: PCOL.Unaffiliated, borderRadius: 3 },
        { label: "Democratic", data: tw.map(t => t.party_pct.Democratic), backgroundColor: PCOL.Democratic, borderRadius: 3 },
      ]
    },
    options: { plugins: { legend: { position: "bottom", labels: { boxWidth: 10 } } }, scales: { x: gridX, y: { ...gridY, ticks: { callback: v => v + "%" } } }, maintainAspectRatio: false }
  }, Math.max(200, tw.length * 14 + 120));
  view.appendChild(cc);

  // town table
  view.appendChild(sectionCard("Towns", rankTable(tw, "town")));
  // precinct table
  view.appendChild(sectionCard("Precincts", rankTable(precList(), "precinct")));
};

function rankTable(rows, kind) {
  const cols = [
    ["name", kind === "town" ? "Town" : "Precinct", false],
    ["active", "Active", true],
    ["r", "R %", true], ["u", "U %", true], ["d", "D %", true],
    ["high", "High-turn", true], ["walk", "Walk univ", true], ["opp", "Classification", false],
  ];
  const get = r => ({
    name: r.name, active: r.active,
    r: r.party_pct.Republican, u: r.party_pct.Unaffiliated, d: r.party_pct.Democratic,
    high: r.tier.High, walk: r.walk, opp: r.opportunity.class, raw: r,
  });
  const data = rows.map(get);
  return sortable(cols, data, (row) => {
    const tr = el("tr", "click");
    tr.onclick = () => drillTown(row.raw, kind);
    tr.innerHTML =
      `<td class="nm">${row.name}</td>` +
      `<td class="num">${fmt(row.active)}</td>` +
      `<td class="num t-r">${pc1(row.r)}</td>` +
      `<td class="num t-u">${pc1(row.u)}</td>` +
      `<td class="num t-d">${pc1(row.d)}</td>` +
      `<td class="num">${fmt(row.high)}</td>` +
      `<td class="num">${fmt(row.walk)}</td>` +
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
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", { maxZoom: 18 }).addTo(_map);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png", { maxZoom: 18, pane: "markerPane" }).addTo(_map);
  _map.fitBounds(GEO.bounds, { padding: [18, 18] });
  paintMap();
}
function rampColor(v, min, max, ramp) {
  const t = max > min ? (v - min) / (max - min) : .5;
  const base = ramp === "r" ? [194, 64, 59] : ramp === "d" ? [47, 111, 176] : ramp === "u" ? [107, 118, 137] : [178, 58, 46];
  const lo = [245, 247, 250];
  return `rgb(${lo.map((c, i) => Math.round(c + (base[i] - c) * (0.15 + .85 * t))).join(",")})`;
}
function paintMap() {
  if (!_map) return;
  if (_layer) _map.removeLayer(_layer);
  const m = GEO_METRICS[geoMetric];
  const vals = GEO.towns.features.map(f => { const t = TOWNS[f.properties.town]; return t ? m.get(t) : 0; });
  const min = Math.min(...vals), max = Math.max(...vals);
  _layer = L.geoJSON(GEO.towns, {
    style: f => { const t = TOWNS[f.properties.town]; const v = t ? m.get(t) : 0;
      return { fillColor: rampColor(v, min, max, m.ramp), fillOpacity: .82, color: "#fff", weight: 1.5 }; },
    onEachFeature: (f, lyr) => {
      const t = TOWNS[f.properties.town]; if (!t) return;
      lyr.bindTooltip(`<b>${t.name}</b><br>${m.label}: ${m.fmt(m.get(t))}<br>${fmt(t.active)} active`, { sticky: true });
      lyr.on({
        mouseover: e => e.target.setStyle({ weight: 3, color: "#0d131f" }),
        mouseout: e => _layer.resetStyle(e.target),
        click: () => drillTown(t, "town"),
      });
    }
  }).addTo(_map);
  $("#map-legend").innerHTML = `<span class="muted">${m.label}:</span>` +
    `<span><i style="background:${rampColor(min, min, max, m.ramp)}"></i>${m.fmt(min)}</span>` +
    `<span><i style="background:${rampColor(max, min, max, m.ramp)}"></i>${m.fmt(max)}</span>`;
}

/* ============================ HISTORICAL ============================ */
ROUTES.historical = function (view) {
  pageHead(view, "Historical Elections",
    "Participation history reconstructed from the official SOTS vote record of today’s registered voters. This is a turnout signal — not a count of how anyone voted, which is secret.");

  const card = el("div", "card pad");
  card.appendChild(el("p", "section-title", "Ballots cast by current registrants — general vs primary<span class='ln'></span>"));
  partTimeline(card, 260);
  card.appendChild(el("div", "note info",
    "<span>ℹ️</span><div>Counts reflect people <b>currently registered</b> in the district who cast a ballot in each year, from SOTS history. Recent cycles look larger partly because more of today’s voters were registered then. Treat as a relative turnout gauge.</div>"));
  view.appendChild(card);

  // turnout tier composition (district)
  const tcard = el("div", "card pad"); tcard.style.marginTop = "18px";
  tcard.appendChild(el("p", "section-title", "Turnout-tier composition of the active universe<span class='ln'></span>"));
  chart(tcard, {
    type: "bar",
    data: { labels: TIERS, datasets: [{ data: TIERS.map(t => T.tier[t]), backgroundColor: ["#2f9e6f", "#7bb37e", "#cdb24a", "#c9ccd4"], borderRadius: 4, maxBarThickness: 70 }] },
    options: { indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: gridY, y: gridX }, maintainAspectRatio: false }
  }, 180);
  view.appendChild(tcard);

  // official returns — honest empty state with ingest framing
  const empty = el("div", "card"); empty.style.marginTop = "18px";
  empty.innerHTML = `<div class="empty"><div class="ic">🗳️</div>
    <h3>Official candidate returns not yet loaded</h3>
    <p style="max-width:60ch;margin:6px auto">Republican / Democratic vote share, margins, and ${C.posture === "defense" ? "the 2018→2022→2024 transition to the incumbent" : "the 2024 baseline for the open seat"} require precinct- and town-level <b>Connecticut SOS election return data</b>. The field mapping is ready — drop returns into <code>Data Health → Imports</code> to populate this view. No results are fabricated here.</p>
    <div style="margin-top:14px" class="legend center">${["2018", "2020", "2022", "2024", "2026"].map(y => `<span class="chip">${y}<span class="muted"> needs returns</span></span>`).join("")}</div>
    </div>`;
  view.appendChild(empty);
};

/* ============================ VOTER UNIVERSE ============================ */
const UNIVERSES = {
  all: { label: "All active voters", fn: v => v.status === "Active" },
  core_r: { label: "Core Republican turnout", fn: v => v.party_group === "Republican" && (v.turnout === "High" || v.turnout === "Medium") },
  react_r: { label: "Republican reactivation", fn: v => v.party_group === "Republican" && (v.turnout === "Low" || v.turnout === "None") && v.status === "Active" },
  unaff: { label: "Unaffiliated persuasion universe", fn: v => v.party_group === "Unaffiliated" && v.status === "Active" },
  unaff_high: { label: "High-turnout unaffiliateds", fn: v => v.party_group === "Unaffiliated" && v.turnout === "High" },
  low_r: { label: "Low-turnout Republicans", fn: v => v.party_group === "Republican" && (v.turnout === "Low" || v.turnout === "None") },
  newreg: { label: "Newly registered voters", fn: v => v.newly_registered && v.status === "Active" },
  door: { label: "Door-knocking priority universe", fn: v => v.walk_eligible && v.party_group !== "Democratic" && v.turnout !== "None" },
  review: { label: "Data review universe", fn: v => v.status === "Active" && (!v.has_address || v.precinct === "0") },
};
let uFilter = { universe: "all", town: "", party: "", tier: "", method: "", status: "Active", search: "", walk: false, phone: false };
let uCols = ["name", "town", "precinct", "party_group", "turnout", "method", "general_votes", "walk_eligible"];
const ALLCOLS = [
  ["name", "Name"], ["town", "Town"], ["precinct", "Precinct"], ["party_group", "Party"],
  ["status", "Status"], ["turnout", "Turnout"], ["method", "Vote method"],
  ["general_votes", "Gen votes"], ["primary_votes", "Pri votes"], ["age", "Age"],
  ["address", "Address"], ["phone", "Phone"], ["walk_eligible", "Walk OK"], ["newly_registered", "New reg"],
];
ROUTES.universe = function (view) {
  pageHead(view, "Voter Universe Explorer",
    "Fast, filterable operational view of the active file. Start from a named universe, refine with filters, then export a campaign-ready list.");

  const layout = el("div", "grid"); layout.style.gridTemplateColumns = "248px 1fr"; layout.style.alignItems = "start";
  // filter rail
  const rail = el("div", "card pad"); rail.style.position = "sticky"; rail.style.top = "76px";
  rail.appendChild(el("p", "section-title", "Universe<span class='ln'></span>"));
  rail.appendChild(field("Named universe", selectEl(Object.entries(UNIVERSES).map(([k, u]) => [k, u.label]), uFilter.universe, v => { uFilter.universe = v; renderU(); })));
  rail.appendChild(field("Town", selectEl([["", "All towns"]].concat(townList().map(t => [t.name, t.name])), uFilter.town, v => { uFilter.town = v; renderU(); })));
  rail.appendChild(field("Party", selectEl([["", "All"], ...PARTY.map(p => [p, shortP(p)])], uFilter.party, v => { uFilter.party = v; renderU(); })));
  rail.appendChild(field("Turnout tier", selectEl([["", "All"], ...TIERS.map(t => [t, t])], uFilter.tier, v => { uFilter.tier = v; renderU(); })));
  rail.appendChild(field("Vote method", selectEl([["", "All"], ...METHODS.map(m => [m, m])], uFilter.method, v => { uFilter.method = v; renderU(); })));
  rail.appendChild(field("Status", selectEl([["Active", "Active"], ["", "Active + Inactive"], ["Inactive", "Inactive"]], uFilter.status, v => { uFilter.status = v; renderU(); })));
  const s = el("input"); s.type = "text"; s.placeholder = "Search name…"; s.value = uFilter.search;
  s.oninput = () => { uFilter.search = s.value; renderU(); };
  rail.appendChild(field("Search", s));
  const tg = el("div"); tg.style.display = "flex"; tg.style.flexDirection = "column"; tg.style.gap = "8px"; tg.style.marginTop = "12px";
  tg.appendChild(toggleEl("Walk-eligible only", uFilter.walk, v => { uFilter.walk = v; renderU(); }));
  tg.appendChild(toggleEl("Has phone", uFilter.phone, v => { uFilter.phone = v; renderU(); }));
  rail.appendChild(tg);
  layout.appendChild(rail);

  const main = el("div", "col");
  const bar = el("div", "card pad between");
  bar.innerHTML = `<div id="u-count"></div>`;
  const btns = el("div", "controls");
  btns.appendChild(btn("Columns", colMenu));
  btns.appendChild(btn("Export CSV", () => exportRows(filteredU(), "csv", "Current_View")));
  btns.appendChild(btn("Export XLSX", () => exportRows(filteredU(), "xlsx", "Current_View"), true));
  bar.appendChild(btns);
  main.appendChild(bar);
  main.appendChild(el("div")).id = "u-table";
  layout.appendChild(main);
  view.appendChild(layout);
  renderU();

  function colMenu() {
    const picked = ALLCOLS.filter(([k]) => uCols.includes(k)).length;
    const body = el("div");
    body.innerHTML = `<p class="muted" style="margin-top:0">Choose columns for the table & export.</p>`;
    ALLCOLS.forEach(([k, lab]) => {
      body.appendChild(toggleEl(lab, uCols.includes(k), v => {
        if (v) uCols.push(k); else uCols = uCols.filter(c => c !== k); renderU();
      }));
    });
    openDrawer("Columns", body);
  }
};
function filteredU() {
  const f = uFilter, ufn = UNIVERSES[f.universe].fn;
  const q = f.search.toLowerCase();
  return V.filter(v =>
    ufn(v) &&
    (!f.town || v.town === f.town) &&
    (!f.party || v.party_group === f.party) &&
    (!f.tier || v.turnout === f.tier) &&
    (!f.method || v.method === f.method) &&
    (!f.status || v.status === f.status) &&
    (!f.walk || v.walk_eligible) &&
    (!f.phone || v.has_phone) &&
    (!q || v.name.toLowerCase().includes(q)));
}
function renderU() {
  const rows = filteredU();
  $("#u-count") && ($("#u-count").innerHTML =
    `<span class="hl" style="font-size:18px">${fmt(rows.length)}</span> <span class="muted">voters · ${UNIVERSES[uFilter.universe].label}</span>`);
  const host = $("#u-table"); if (!host) return; host.innerHTML = "";
  const wrap = el("div", "tbl-wrap"); const table = el("table");
  const thead = el("thead"); const trh = el("tr");
  uCols.forEach(k => { const lab = (ALLCOLS.find(c => c[0] === k) || [k, k])[1];
    const num = ["general_votes", "primary_votes", "age"].includes(k);
    trh.appendChild(el("th", num ? "num" : "", lab)); });
  thead.appendChild(trh); table.appendChild(thead);
  const tbody = el("tbody");
  const cap = 400;
  rows.slice(0, cap).forEach(v => {
    const tr = el("tr", "click"); tr.onclick = () => drillVoter(v);
    tr.innerHTML = uCols.map(k => cellU(v, k)).join("");
    tbody.appendChild(tr);
  });
  table.appendChild(tbody); wrap.appendChild(table); host.appendChild(wrap);
  if (rows.length > cap) host.appendChild(el("div", "muted", `<div style="padding:10px 4px;font-size:12px">Showing first ${cap.toLocaleString()} of ${fmt(rows.length)} — refine filters or export to get the full set.</div>`));
}
function cellU(v, k) {
  const num = ["general_votes", "primary_votes", "age"].includes(k);
  let val = v[k];
  if (k === "name") return `<td class="nm">${v.name}</td>`;
  if (k === "party_group") return `<td><span class="chip" style="border-color:${PCOL[v.party_group]}55;color:${PCOL[v.party_group]}">${shortP(v.party_group)}</span></td>`;
  if (k === "walk_eligible" || k === "newly_registered") return `<td>${val ? "✓" : "<span class='muted'>—</span>"}</td>`;
  if (k === "address") return `<td>${v.address || "<span class='muted'>missing</span>"}</td>`;
  if (val == null || val === "") val = "<span class='muted'>—</span>";
  return `<td class="${num ? "num" : ""}">${val}</td>`;
}

/* ============================ OPPORTUNITY ============================ */
ROUTES.opportunity = function (view) {
  pageHead(view, "Opportunity Analysis",
    "Transparent, explainable scoring — no black box. Each area is scored on four measurable dimensions and given a recommended operational use.");

  // formula explainer
  const ex = el("div", "card pad");
  ex.appendChild(el("p", "section-title", "How areas are classified<span class='ln'></span>"));
  ex.innerHTML += `<div class="dl" style="grid-template-columns:auto 1fr">
    <dt>Republican base</dt><dd class="muted right">R share of active voters</dd>
    <dt>Unaffiliated density</dt><dd class="muted right">U share of active voters</dd>
    <dt>Turnout gap</dt><dd class="muted right">% of active voters in Low/None turnout tiers (reactivation room)</dd>
    <dt>Field contactability</dt><dd class="muted right">% of active voters reachable by address or phone</dd></div>
    <p class="muted" style="font-size:12px;margin-bottom:0">${C.posture === "defense"
      ? "Defense rules: strong R + steady turnout → <b>Protect</b>; strong R + turnout gap → <b>Turnout opportunity</b>; heavy U → <b>Persuasion opportunity</b>; D-leaning → <b>Hold the line</b>."
      : "Pickup rules: under-voted R → <b>Turnout opportunity</b>; large U pool → <b>Persuasion opportunity</b>; comparatively strong R → <b>Build base</b>; deep D → <b>Long shot</b>."}</p>`;
  view.appendChild(ex);

  const tw = townList();
  const grid = el("div", "grid"); grid.style.gridTemplateColumns = "repeat(auto-fill,minmax(280px,1fr))"; grid.style.marginTop = "18px";
  tw.forEach(t => grid.appendChild(oppCard(t, "town")));
  view.appendChild(sectionCard("Towns — opportunity profile", grid, true));

  // precinct opportunity table
  view.appendChild(sectionCard("Precincts — opportunity ranking", oppTable(precList())));
};
function oppCard(t, kind) {
  const o = t.opportunity, d = o.dims;
  const card = el("div", "card pad click"); card.style.cursor = "pointer"; card.onclick = () => drillTown(t, kind);
  card.innerHTML = `<div class="between"><b>${t.name}</b><span class="chip tag-${o.class.replace(/[ /]/g, '.')}">${o.class}</span></div>
    <p class="muted" style="font-size:12.5px;margin:8px 0 12px">${o.why}</p>`;
  [["Republican base", d.republican_base, PCOL.Republican], ["Unaffiliated density", d.unaffiliated_density, PCOL.Unaffiliated],
  ["Turnout gap", d.turnout_gap, "#c98a23"], ["Contactability", d.field_contactability, "#2f9e6f"]].forEach(([lab, v, col]) => {
    card.innerHTML += `<div style="margin-bottom:7px"><div class="between" style="font-size:11.5px"><span class="muted">${lab}</span><b>${pc1(v)}</b></div>
      <div class="scorebar"><i style="width:${Math.min(100, v)}%;background:${col}"></i></div></div>`;
  });
  return card;
}
function oppTable(rows) {
  const cols = [["name", "Precinct", false], ["active", "Active", true], ["base", "R base", true], ["uden", "U density", true], ["gap", "Turnout gap", true], ["contact", "Contact", true], ["cls", "Recommended use", false]];
  const data = rows.map(r => ({ name: r.name, active: r.active, base: r.opportunity.dims.republican_base, uden: r.opportunity.dims.unaffiliated_density, gap: r.opportunity.dims.turnout_gap, contact: r.opportunity.dims.field_contactability, cls: r.opportunity.class, raw: r }));
  return sortable(cols, data, row => {
    const tr = el("tr", "click"); tr.onclick = () => drillTown(row.raw, "precinct");
    tr.innerHTML = `<td class="nm">${row.name}</td><td class="num">${fmt(row.active)}</td>
      <td class="num t-r">${pc1(row.base)}</td><td class="num t-u">${pc1(row.uden)}</td>
      <td class="num">${pc1(row.gap)}</td><td class="num">${pc1(row.contact)}</td>
      <td><span class="chip tag-${row.cls.replace(/[ /]/g, '.')}">${row.cls}</span></td>`;
    return tr;
  });
}

/* ============================ WALK LISTS ============================ */
let wl = { town: "", precinct: "", party: "", tier: "", history: "", excludeInactive: true, requireAddr: true, dedupe: false, max: 0, group: "precinct" };
ROUTES.walklists = function (view) {
  pageHead(view, "Walk List Builder",
    "Build, preview, and export a field-ready canvass list. Lists are scoped to this campaign only and include exactly the columns a walker needs.");

  if (T.walk_universe < 20) {
    view.appendChild(noWalk()); return;
  }
  const layout = el("div", "grid"); layout.style.gridTemplateColumns = "300px 1fr"; layout.style.alignItems = "start";
  const rail = el("div", "card pad"); rail.style.position = "sticky"; rail.style.top = "76px";
  rail.appendChild(el("p", "section-title", "Build your turf<span class='ln'></span>"));
  rail.appendChild(field("Town", selectEl([["", "All towns"]].concat(townList().map(t => [t.name, t.name])), wl.town, v => { wl.town = v; wl.precinct = ""; redrawWL(rail); render(); })));
  const precs = precList().filter(p => !wl.town || p.name.startsWith(wl.town));
  rail.appendChild(field("Precinct", selectEl([["", "All precincts"]].concat(precs.map(p => [p.name, p.name])), wl.precinct, v => { wl.precinct = v; render(); }), "wl-prec"));
  rail.appendChild(field("Party", selectEl([["", "All parties"], ...PARTY.map(p => [p, shortP(p)])], wl.party, v => { wl.party = v; render(); })));
  rail.appendChild(field("Turnout tier", selectEl([["", "All tiers"], ...TIERS.map(t => [t, t])], wl.tier, v => { wl.tier = v; render(); })));
  rail.appendChild(field("Vote history", selectEl([["", "Any"], ["voted_gen", "Has general history"], ["no_gen", "No general history"]], wl.history, v => { wl.history = v; render(); })));
  rail.appendChild(field("Group list by", selectEl([["precinct", "Precinct"], ["town", "Town"], ["street", "Street"], ["household", "Household"]], wl.group, v => { wl.group = v; render(); })));
  const mx = el("input"); mx.type = "number"; mx.min = 0; mx.placeholder = "No cap"; mx.value = wl.max || "";
  mx.oninput = () => { wl.max = parseInt(mx.value) || 0; render(); };
  rail.appendChild(field("Max doors", mx));
  const tg = el("div"); tg.style.cssText = "display:flex;flex-direction:column;gap:8px;margin-top:12px";
  tg.appendChild(toggleEl("Exclude inactive voters", wl.excludeInactive, v => { wl.excludeInactive = v; render(); }));
  tg.appendChild(toggleEl("Require mailing address", wl.requireAddr, v => { wl.requireAddr = v; render(); }));
  tg.appendChild(toggleEl("One row per household", wl.dedupe, v => { wl.dedupe = v; render(); }));
  rail.appendChild(tg);
  layout.appendChild(rail);

  const main = el("div", "col");
  const summary = el("div", "card pad"); summary.id = "wl-summary"; main.appendChild(summary);
  const prevCard = el("div", "card"); const ph = el("div", "pad between"); ph.style.paddingBottom = "8px";
  ph.innerHTML = `<p class="section-title" style="margin:0">List preview</p>`;
  const exp = el("div", "controls");
  exp.appendChild(btn("Export CSV", () => exportRows(walkRows(), "csv", "Walk_List", WALK_COLS)));
  exp.appendChild(btn("Export XLSX", () => exportRows(walkRows(), "xlsx", "Walk_List", WALK_COLS), true));
  exp.appendChild(btn("Print view", () => printWalk()));
  ph.appendChild(exp); prevCard.appendChild(ph);
  prevCard.appendChild(el("div")).id = "wl-table"; main.appendChild(prevCard);
  layout.appendChild(main);
  view.appendChild(layout);
  render();

  function render() {
    const rows = walkRows();
    const byTier = {}; TIERS.forEach(t => byTier[t] = 0); rows.forEach(r => byTier[r._tier]++);
    summary.innerHTML = `<div class="between"><p class="section-title" style="margin:0">Universe preview</p>
      <span class="badge"><span class="dot"></span>${fmt(rows.length)} doors</span></div>
      <div class="kpis" style="margin-top:14px;grid-template-columns:repeat(4,1fr)">
        ${kpiHtml("Doors on list", fmt(rows.length), wl.dedupe ? "households" : "individuals")}
        ${kpiHtml("Republican", fmt(rows.filter(r => r.Party === "R").length), "on this list")}
        ${kpiHtml("Unaffiliated", fmt(rows.filter(r => r.Party === "U").length), "on this list")}
        ${kpiHtml("High-turnout", fmt(rows.filter(r => r._tier === "High").length), "5+ vote score")}
      </div>`;
    const host = $("#wl-table"); host.innerHTML = "";
    if (!rows.length) { host.appendChild(el("div", "empty", "<div class='ic'>🚪</div><h3>No doors match</h3><p>Loosen a filter to build your turf.</p>")); return; }
    const wrap = el("div", "tbl-wrap"); const table = el("table");
    table.innerHTML = `<thead><tr>${WALK_COLS.map(c => `<th>${c}</th>`).join("")}</tr></thead>`;
    const tb = el("tbody");
    rows.slice(0, 150).forEach(r => tb.appendChild(el("tr", "", WALK_COLS.map(c => `<td>${r[c] ?? ""}</td>`).join(""))));
    table.appendChild(tb); wrap.appendChild(table); host.appendChild(wrap);
    if (rows.length > 150) host.appendChild(el("div", "muted", `<div style="padding:10px;font-size:12px">Showing 150 of ${fmt(rows.length)} — export for the full turf.</div>`));
  }
  window._wlRender = render;
};
function redrawWL(rail) { /* refresh precinct options when town changes */
  const host = rail.querySelector("#wl-prec"); if (!host) return;
  const precs = precList().filter(p => !wl.town || p.name.startsWith(wl.town));
  host.querySelector("select").innerHTML = [["", "All precincts"]].concat(precs.map(p => [p.name, p.name]))
    .map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
}
const WALK_COLS = ["Household", "Voter", "Address", "Unit", "Town", "ZIP", "Precinct", "Party", "Turnout", "Vote method", "Gen votes", "Phone", "Notes"];
function walkRows() {
  let rows = V.filter(v => {
    if (wl.excludeInactive && v.status !== "Active") return false;
    if (wl.requireAddr && !v.has_address) return false;
    if (wl.town && v.town !== wl.town) return false;
    if (wl.precinct && (v.town + " · P" + v.precinct) !== wl.precinct) return false;
    if (wl.party && v.party_group !== wl.party) return false;
    if (wl.tier && v.turnout !== wl.tier) return false;
    if (wl.history === "voted_gen" && v.general_votes < 1) return false;
    if (wl.history === "no_gen" && v.general_votes >= 1) return false;
    return true;
  });
  // group / sort
  const keyFns = {
    precinct: v => v.town + " P" + v.precinct.padStart(3, "0") + " " + v.address,
    town: v => v.town + " " + v.address,
    street: v => (v.address.replace(/^\d+\s*/, "") || "zzz") + " " + v.town,
    household: v => v.town + " " + v.household + " " + v.address,
  };
  rows.sort((a, b) => keyFns[wl.group](a).localeCompare(keyFns[wl.group](b)));
  if (wl.dedupe) {
    const seen = new Set(); rows = rows.filter(v => { const k = v.town + "|" + v.address + "|" + v.household; if (seen.has(k)) return false; seen.add(k); return true; });
  }
  if (wl.max > 0) rows = rows.slice(0, wl.max);
  return rows.map(v => ({
    Household: v.household, Voter: v.name, Address: v.address, Unit: v.unit, Town: v.town,
    ZIP: v.zip, Precinct: v.precinct, Party: v.party, Turnout: v.turnout, "Vote method": v.method,
    "Gen votes": v.general_votes, Phone: v.phone, Notes: "", _tier: v.turnout,
  }));
}
function noWalk() {
  const c = el("div", "card");
  c.innerHTML = `<div class="empty"><div class="ic">🚧</div><h3>Walk lists need a complete voter file</h3>
    <p style="max-width:58ch;margin:6px auto">This district’s current import has too few usable street addresses to build a canvass list. A full L2 / SOTS voter file with residential addresses is required before walk-list export can be enabled. Email-only exports support phone and digital lists but not doors.</p></div>`;
  return c;
}
function printWalk() {
  const rows = walkRows();
  const w = window.open("", "_blank");
  w.document.write(`<html><head><title>${C.headline} Walk List</title>
    <style>body{font:12px -apple-system,system-ui,sans-serif;margin:24px}h1{font-size:16px}
    table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:5px 7px;text-align:left;font-size:11px}
    th{background:#f0f0f0}.h{display:flex;justify-content:space-between;border-bottom:2px solid ${C.accent};padding-bottom:8px;margin-bottom:12px}</style></head><body>
    <div class="h"><h1>${C.district_label} · ${C.candidate} — Walk List</h1><div>${fmt(rows.length)} doors · ${new Date().toLocaleDateString()}</div></div>
    <table><thead><tr>${WALK_COLS.filter(c => c !== "Notes").map(c => `<th>${c}</th>`).join("")}<th style="width:120px">Result / Notes</th></tr></thead>
    <tbody>${rows.map(r => `<tr>${WALK_COLS.filter(c => c !== "Notes").map(c => `<td>${r[c] ?? ""}</td>`).join("")}<td></td></tr>`).join("")}</tbody></table></body></html>`);
  w.document.close(); w.print();
}

/* ============================ DATA HEALTH ============================ */
ROUTES.datahealth = function (view) {
  pageHead(view, "Data Health & Imports",
    "What the imported data supports today, what’s missing, and how to add more. Campaign files only — CSV, XLSX, XLS. No PDF workflow.");

  // coverage
  const cov = el("div", "card pad");
  cov.appendChild(el("p", "section-title", "Field coverage of the active universe<span class='ln'></span>"));
  HEALTH.checks.forEach(c => {
    const p = pct(c.ok, c.of);
    const col = p >= 90 ? "#2f9e6f" : p >= 50 ? "#c98a23" : "#c2433b";
    cov.appendChild(el("div", "", `<div class="between" style="font-size:13px;margin:10px 0 5px">
      <span><b>${c.label}</b> <span class="muted">— ${c.enables}</span></span>
      <span class="mono">${fmt(c.ok)}/${fmt(c.of)} · ${pc1(p)}</span></div>
      <div class="coverbar"><div class="track"><i style="width:${p}%;background:${col}"></i></div></div>`));
  });
  view.appendChild(cov);

  // source + missing
  const row = el("div", "grid"); row.style.gridTemplateColumns = "1fr 1fr"; row.style.marginTop = "18px";
  const src = el("div", "card pad");
  src.appendChild(el("p", "section-title", "Loaded datasets<span class='ln'></span>"));
  src.innerHTML += `<div class="tbl-wrap"><table><thead><tr><th>Dataset</th><th>Rows</th><th>Status</th></tr></thead>
    <tbody>
    <tr><td class="nm">SOTS statewide extract → ${C.id.toUpperCase()}</td><td class="num">${fmt(HEALTH.total)}</td><td><span class="chip tag-Protect">Master</span></td></tr>
    <tr><td class="nm">Vendor / L2 file</td><td class="num">${HEALTH.vendor_loaded ? "—" : "0"}</td><td><span class="chip">${HEALTH.vendor_loaded ? "Appended" : "Not loaded"}</span></td></tr>
    <tr><td class="nm">CT SOS election returns</td><td class="num">0</td><td><span class="chip">Not loaded</span></td></tr>
    </tbody></table></div>`;
  const miss = el("div", "card pad");
  miss.appendChild(el("p", "section-title", "Still needed for full analysis<span class='ln'></span>"));
  miss.innerHTML += HEALTH.missing_capabilities.map(m => `<div class="note" style="margin-bottom:10px"><span>⚠️</span><div>${m}</div></div>`).join("");
  row.appendChild(src); row.appendChild(miss);
  view.appendChild(row);

  // import explainer
  const imp = el("div", "card pad"); imp.style.marginTop = "18px";
  imp.appendChild(el("p", "section-title", "Add data<span class='ln'></span>"));
  imp.innerHTML += `<p class="muted" style="margin-top:0">Drop a campaign data file to enrich the workspace. The field mapper recognizes common aliases for voter ID, name, address, municipality, precinct, party, status, election participation, candidate score, tags, email, phone, and district code. New imports never overwrite the master file silently — matches are appended by exact voter ID.</p>
    <div class="note info"><span>📁</span><div>Accepted formats: <b>CSV, XLSX, XLS</b>. PDF files are not accepted. Generate this prepared dataset from source with <code>python3 build/prepare_data.py --force</code>.</div></div>`;
  view.appendChild(imp);
};

/* ============================ DRILL-DOWNS ============================ */
function drillTown(t, kind) {
  const o = t.opportunity;
  const body = el("div");
  body.innerHTML = `<div class="kpis" style="grid-template-columns:repeat(2,1fr)">
    ${kpiHtml("Active voters", fmt(t.active), fmt(t.inactive) + " inactive")}
    ${kpiHtml("Walk universe", fmt(t.walk), "address-ready")}
    ${kpiHtml("High-turnout", fmt(t.tier.High), "")}
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
  body.appendChild(el("p", "section-title", "Data coverage"));
  body.appendChild(el("div", "dl", `<dt>Walk-eligible</dt><dd>${pc1(pct(t.walk, t.active))}</dd>
    <dt>Has phone</dt><dd>${pc1(pct(t.phone, t.active))}</dd>
    <dt>Missing address</dt><dd>${fmt(t.no_addr)}</dd>
    <dt>Newly registered</dt><dd>${fmt(t.newly)}</dd>`));
  openDrawer(`${t.name}<div class="muted" style="font-size:12px;font-weight:400">${kind === "town" ? "Town" : "Precinct"} detail</div>`, body);
}
function drillVoter(v) {
  const body = el("div");
  body.innerHTML = `<div class="dl">
    <dt>Voter ID</dt><dd class="mono">${v.voter_id}</dd>
    <dt>Party</dt><dd>${v.party_group} (${v.party})</dd>
    <dt>Status</dt><dd>${v.status}</dd>
    <dt>Town</dt><dd>${v.town}</dd>
    <dt>Precinct</dt><dd>${v.precinct}</dd>
    <dt>Address</dt><dd>${v.address || "—"} ${v.unit || ""}</dd>
    <dt>ZIP</dt><dd>${v.zip}</dd>
    <dt>Age</dt><dd>${v.age || "—"}</dd>
    <dt>Turnout tier</dt><dd>${v.turnout}</dd>
    <dt>General votes</dt><dd>${v.general_votes}</dd>
    <dt>Primary votes</dt><dd>${v.primary_votes}</dd>
    <dt>Vote method</dt><dd>${v.method}</dd>
    <dt>Reg year</dt><dd>${v.reg_year || "—"}</dd>
    <dt>Walk-eligible</dt><dd>${v.walk_eligible ? "Yes" : "No"}</dd>
    <dt>Phone</dt><dd>${v.phone || "—"}</dd></div>`;
  openDrawer(`${v.name}<div class="muted" style="font-size:12px;font-weight:400">Voter detail</div>`, body);
}
function openDrawer(h, body) {
  $("#dr-h").innerHTML = h; $("#dr-b").innerHTML = ""; $("#dr-b").appendChild(body);
  $("#drawer").classList.add("open"); $("#scrim").classList.add("open");
}
window.closeDrawer = () => { $("#drawer").classList.remove("open"); $("#scrim").classList.remove("open"); };

/* ============================ EXPORT ============================ */
function exportRows(rows, kind, name, cols) {
  if (!rows.length) { alert("Nothing to export with the current filters."); return; }
  let data;
  if (cols) data = rows.map(r => { const o = {}; cols.forEach(c => o[c] = r[c] ?? ""); return o; });
  else data = rows.map(v => { const o = {}; uCols.forEach(c => o[(ALLCOLS.find(a => a[0] === c) || [c, c])[1]] = v[c] ?? ""); return o; });
  const fname = `${C.id.toUpperCase()}_${name}_${stamp()}`;
  const ws = XLSX.utils.json_to_sheet(data);
  if (kind === "csv") {
    download(XLSX.utils.sheet_to_csv(ws), fname + ".csv", "text/csv");
  } else {
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, C.id.toUpperCase());
    XLSX.writeFile(wb, fname + ".xlsx");
  }
}
function download(text, fname, mime) {
  const a = el("a"); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = fname; a.click();
}
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

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
  return { type: "doughnut", data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: "#fff" }] },
    options: { cutout: "62%", plugins: { legend: { position: "right", labels: { boxWidth: 9, font: { size: 11 } } } }, maintainAspectRatio: false } };
}
function sectionCard(title, content, isNode) {
  const c = el("div", "card"); c.style.marginTop = "18px";
  const h = el("div", "pad"); h.style.paddingBottom = "0"; h.innerHTML = `<p class="section-title">${title}<span class="ln"></span></p>`;
  c.appendChild(h);
  if (isNode) { const w = el("div", "pad"); w.style.paddingTop = "14px"; w.appendChild(content); c.appendChild(w); }
  else { const w = el("div"); w.style.padding = "0 18px 18px"; w.appendChild(content); c.appendChild(w); }
  return c;
}
function field(label, control, id) {
  const f = el("label", "fld"); f.style.marginBottom = "12px"; if (id) f.id = id;
  f.appendChild(el("span", "", label)); f.appendChild(control); return f;
}
function selectEl(opts, val, onchange) {
  const s = el("select"); s.innerHTML = opts.map(([v, l]) => `<option value="${v}" ${v === val ? "selected" : ""}>${l}</option>`).join("");
  s.onchange = () => onchange(s.value); return s;
}
function toggleEl(label, on, onchange) {
  const l = el("label", "toggle"); const i = el("input"); i.type = "checkbox"; i.checked = on;
  i.onchange = () => onchange(i.checked); l.appendChild(i); l.appendChild(el("span", "", label)); return l;
}
function btn(label, onclick, pri) {
  const b = el("button", "btn" + (pri ? " pri" : ""), label); b.onclick = onclick; return b;
}

/* ---- boot ---- */
buildNav();
route();
})();
