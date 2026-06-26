/* Campaign Intelligence — candidate dashboard (aggregate only).
   Reads window.CAMPAIGN / TOWN_SUMMARY / PRECINCT_SUMMARY / GEOMETRY.
   No per-voter data is loaded or shown — every figure is an aggregate of the
   prepared SOTS data. */
(function () {
"use strict";
const C = window.CAMPAIGN, TOWNS = window.TOWN_SUMMARY, PREC = window.PRECINCT_SUMMARY, GEO = window.GEOMETRY;
const PARTY = ["Republican", "Democratic", "Unaffiliated", "Minor / Other"];
const PCOL = { "Republican": "#E05555", "Democratic": "#3A6AB8", "Unaffiliated": "#5A6E80", "Minor / Other": "#D4A017" };
const TIERS = ["High", "Medium", "Low", "None"];
const METHODS = ["Likely Early Vote", "Likely Absentee", "Likely Election Day", "Mixed Method", "Unknown"];

/* ---- apply campaign identity ---- */
const root = document.documentElement.style;
root.setProperty("--camp", C.accent || "#22AABC");
document.title = C.headline + " · DM Strategies";
document.getElementById("h-title").innerHTML = "<b>" + C.headline + "</b>";
document.getElementById("b-name").textContent = C.district_label;
document.getElementById("b-sub").textContent = C.candidate + " · " + (C.posture === "defense" ? "Incumbent defense" : "Open-seat pickup");
document.getElementById("b-pill").textContent = C.posture_copy.frame;
document.getElementById("b-gen").textContent = "Updated " + C.generated_at.replace("T", " · ").slice(0, 21);

/* ---- helpers ---- */
const $ = (s, r = document) => r.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const fmt = n => (n == null ? "—" : Math.round(n).toLocaleString());
const pct = (n, d) => d ? Math.round(1000 * n / d) / 10 : 0;
const pc1 = n => (n == null ? "—" : n.toFixed(1) + "%");
const T = C.totals;
const shortP = p => p === "Minor / Other" ? "Other" : p.replace("ublican", "").replace("ocratic", "").replace("affiliated", "naff");
const townList = () => Object.values(TOWNS).filter(t => t.active > 25).sort((a, b) => b.active - a.active);
const precList = () => Object.values(PREC).filter(p => p.active > 5).sort((a, b) => b.active - a.active);

/* ---- nav ---- */
const NAV = [
  ["overview", "Overview"],
  ["geography", "Geography"],
  ["turnout", "Turnout"],
];
function buildNav() {
  const n = $("#nav");
  NAV.forEach(([id, lab]) => {
    const t = el("div", "tab"); t.dataset.route = id;
    t.innerHTML = `<span class="tab-pip"></span>${lab}`;
    t.onclick = () => location.hash = id;
    n.appendChild(t);
  });
}

/* ---- router ---- */
const ROUTES = {};
function route() {
  const r = (location.hash.replace("#", "") || "overview").split("/")[0];
  document.querySelectorAll(".tab").forEach(a => a.classList.toggle("active", a.dataset.route === r));
  const meta = NAV.find(x => x[0] === r) || NAV[0];
  $("#t-title").textContent = meta[1];
  $("#view").innerHTML = "";
  window._charts && window._charts.forEach(c => c.destroy()); window._charts = [];
  window._maps && window._maps.forEach(m => { try { m.remove(); } catch (e) {} }); window._maps = [];
  (ROUTES[r] || ROUTES.overview)($("#view"));
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
    "An aggregate snapshot of the registered voter file. No individual voter records are shown.");

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
  const rShare = T.party_pct.Republican, uShare = T.party_pct.Unaffiliated, dShare = T.party_pct.Democratic;
  const byR = [...tw].sort((x, y) => y.party_pct.Republican - x.party_pct.Republican);
  const topR = byR[0], lowR = byR[byR.length - 1];
  const byU = [...tw].sort((x, y) => y.party_pct.Unaffiliated - x.party_pct.Unaffiliated)[0];
  const card = el("div", "narr"); card.style.marginTop = "22px";
  let html = `<h3>📍 What the district is telling us</h3>`;
  if (C.posture === "defense") {
    html += `<p>Across ${tw.length} towns the active universe is <b>${pc1(rShare)} Republican</b>, <b>${pc1(dShare)} Democratic</b>, and <b>${pc1(uShare)} unaffiliated</b>. Registration alone is close, so the seat is held on turnout and unaffiliated margin, not party share.</p>`;
    html += `<p><b>${topR.name}</b> is the strongest Republican ground (${pc1(topR.party_pct.Republican)} R). <b>${lowR.name}</b> is the most exposed (${pc1(lowR.party_pct.Republican)} R) and needs the tightest defense.</p>`;
    html += `<p>Unaffiliated voters are densest in <b>${byU.name}</b> (${pc1(byU.party_pct.Unaffiliated)}). <b>${fmt(T.tier.Low)}</b> active voters sit in the lowest turnout tier — the pool to protect the margin.</p>`;
  } else {
    const byRcount = [...tw].sort((x, y) => y.party.Republican - x.party.Republican)[0];
    html += `<p>The active universe is <b>${pc1(dShare)} Democratic</b>, <b>${pc1(uShare)} unaffiliated</b>, and <b>${pc1(rShare)} Republican</b>. With the incumbent gone, the realistic path runs through the <b>${fmt(T.party.Unaffiliated)}</b> unaffiliated voters, not party conversion.</p>`;
    html += `<p>Republican votes are most concentrated in <b>${byRcount.name}</b>. <b>${fmt(T.tier.Low + T.tier.None)}</b> active voters are low-propensity — including Republicans who under-voted and are cheap to re-activate.</p>`;
    html += `<p>This is an opportunity district: treat every figure as a map of where to <b>focus first</b>, not a prediction of the result.</p>`;
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
    "Geographic breakdown of the active universe. Choose a metric to recolor the map; click any town or precinct for a full drill-down.");

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
    note.innerHTML = "<span>ℹ️</span><div>Town polygons aren’t available for this district yet, so the map is shown at town level only.</div>";
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
    tr.onclick = () => drillTown(row.raw, kind);
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
    "The four general elections that decide this seat, and where the district’s reliable and soft-turnout towns are. A turnout signal only — never a record of how anyone voted.");

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
  chart(tc, doughnut(TIERS.map(t => T.tier[t]), TIERS, ["#34D399", "#1A8B9A", "#F0B82A", "#5A6E80"]), 200);
  const mc = el("div", "card pad");
  mc.appendChild(el("p", "section-title", "Vote-method tendency<span class='ln'></span>"));
  chart(mc, doughnut(METHODS.map(m => T.method[m]), ["Early", "Absentee", "Election Day", "Mixed", "Unknown"],
    ["#3A6AB8", "#60A5FA", "#E05555", "#F0B82A", "#5A6E80"]), 200);
  row2.appendChild(tc); row2.appendChild(mc);
  view.appendChild(row2);
};

function turnoutTakeaways() {
  const tw = townList();
  const byHigh = [...tw].sort((a, b) => pct(b.tier.High, b.active) - pct(a.tier.High, a.active));
  const strong = byHigh[0], soft = byHigh[byHigh.length - 1];
  const distHigh = pct(T.high_turnout, T.active), distLow = pct(T.tier.Low + T.tier.None, T.active);
  const card = el("div", "narr"); card.style.margin = "0"; card.style.height = "100%";
  card.innerHTML = `<h3>🗺️ Map takeaways</h3>
    <p><b>${strong.name}</b> turns out strongest — <b>${pc1(pct(strong.tier.High, strong.active))}</b> of its active voters are high-propensity (5+ vote score).</p>
    <p><b>${soft.name}</b> is the softest at <b>${pc1(pct(soft.tier.High, soft.active))}</b> — the district’s biggest reactivation upside.</p>
    <p>District-wide, <b>${pc1(distHigh)}</b> of active voters are high-propensity and <b>${pc1(distLow)}</b> rarely vote. Presidential years (<b>2020, 2024</b>) draw far more ballots than midterms (<b>2018, 2022</b>).</p>`;
  return card;
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
