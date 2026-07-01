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
root.setProperty("--camp", "#CF4133");   // primary campaign identity = Republican red (brand accent)
root.setProperty("--camp-lt", "#F06A5A"); // lighter campaign red for text / gradients on dark
root.setProperty("--camp-deep", "#7E2A22");
// program semantics used site-wide: BASE = red, PERSUASION = purple
root.setProperty("--base", "#CF4133");
root.setProperty("--base-lt", "#F06A5A");
root.setProperty("--persuasion", "#8B5CF6");
root.setProperty("--persuasion-lt", "#A78BFA");
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
  ["geography", "Data"],
  ["results", "Results"],
];
function buildNav() {
  const n = $("#nav");
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

/* ============================ DATA · EXPORT ============================ */
let exportView = "town";
function selectExportView(v) { exportView = v; route(); }
ROUTES.geography = function (view) {
  const TW = townList();
  const s = TARGET && TARGET.summary;
  const tByName = Object.fromEntries((TARGET && TARGET.towns ? TARGET.towns : []).map(t => [t.town, t]));
  const partyTgt = { "Republican": s ? s.parties.R : null, "Unaffiliated": s ? s.parties.U : null,
    "Democratic": s ? s.parties.D : null, "Minor / Other": s ? ((s.parties.IT || 0) + (s.parties.L || 0) + (s.parties.G || 0)) : null };

  const VIEWS = {
    town:  { label: "By Town", note: "Active registration by town", accent: "var(--teal-lt)",
      cols: [{ k: "town", l: "Town" }, { k: "active", l: "Active", n: 1 }, { k: "rep", l: "Republican", n: 1 }, { k: "una", l: "Unaffiliated", n: 1 }, { k: "dem", l: "Democratic", n: 1 }],
      rows: TW.map(t => ({ town: t.name, active: t.active, rep: t.party.Republican, una: t.party.Unaffiliated, dem: t.party.Democratic })) },
    party: { label: "By Party", note: "District registration and target universe by party", accent: "var(--gold-lt)",
      cols: [{ k: "party", l: "Party" }, { k: "reg", l: "Registered", n: 1 }, { k: "pct", l: "% Active" }, { k: "tgt", l: "In Target Universe", n: 1 }],
      rows: PARTY.map(p => ({ party: p, reg: T.party[p], pct: pc1(T.party_pct[p]), tgt: partyTgt[p] })) },
    rep:   { label: "Republican Targets", note: "Base GOTV — registered Republicans to turn out", accent: "var(--base-lt)",
      cols: [{ k: "town", l: "Town" }, { k: "rep", l: "Registered R", n: 1 }, { k: "pct", l: "% of Town" }],
      rows: TW.map(t => ({ town: t.name, rep: t.party.Republican, pct: pc1(t.party_pct.Republican) })) },
    unaff: { label: "Unaffiliated Targets", note: "Persuasion universe — unaffiliated-heavy persuadables", accent: "var(--persuasion-lt)",
      cols: [{ k: "town", l: "Town" }, { k: "pers", l: "Persuasion Targets", n: 1 }, { k: "rate", l: "Target Rate" }],
      rows: TW.map(t => { const x = tByName[t.name] || {}; return { town: t.name, pers: x.persuasion || 0, rate: pc1(x.target_rate || 0) }; }) },
    dem:   { label: "Democrat Targets", note: "Democratic crossover targets", accent: "#60A5FA",
      cols: [{ k: "town", l: "Town" }, { k: "cross", l: "Crossover Targets", n: 1 }],
      rows: TW.map(t => { const x = tByName[t.name] || {}; return { town: t.name, cross: x.dem_crossover || 0 }; }) },
  };
  if (!VIEWS[exportView]) exportView = "town";
  const V = VIEWS[exportView];

  const chips = Object.entries(VIEWS).map(([k, v]) => `<button class="seg-btn ${k === exportView ? "on" : ""}" data-xview="${k}">${v.label}</button>`).join("");
  const totals = {}; V.cols.forEach(c => { if (c.n) totals[c.k] = V.rows.reduce((a, r) => a + (typeof r[c.k] === "number" ? r[c.k] : 0), 0); });
  const body = V.rows.map(r => `<tr>${V.cols.map(c => `<td class="${c.n ? "num" : "nm"}">${c.n ? fmt(r[c.k]) : (r[c.k] == null ? "—" : r[c.k])}</td>`).join("")}</tr>`).join("");
  const totalRow = `<tr style="background:rgba(255,255,255,.02)">${V.cols.map((c, i) => `<td class="${c.n ? "num" : ""}" style="font-family:var(--ff-cond);font-weight:700;font-size:13px;color:var(--fg);border-top:2px solid var(--border-strong)">${i === 0 ? "Total" : (c.n ? fmt(totals[c.k]) : "")}</td>`).join("")}</tr>`;

  view.innerHTML = vhead("Field Data", "var(--teal-lt)", "Data · Export", "Aggregate · SOTS + L2") +
    `<p style="color:var(--fg-muted);font-size:13px;max-width:78ch;margin:-6px 0 16px;line-height:1.55">Filter the district by town, party and target program, then download any view as CSV. Aggregate counts only — no individual voter records.</p>
     <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">${chips}</div>
     <div class="vcard" style="padding:0;overflow:hidden">
       <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;padding:16px 20px 14px;flex-wrap:wrap">
         <div><span class="rlabel" style="color:${V.accent}">${V.label}</span><div style="font-family:var(--ff-body);font-size:11px;color:var(--fg-dim);margin-top:4px">${V.note}</div></div>
         <button class="btn pri" id="dl-csv" style="padding:9px 16px;font-size:12px;letter-spacing:1.5px;border-radius:5px">Download CSV ↓</button>
       </div>
       <div class="tbl-wrap pretty" style="border-radius:0;border-left:0;border-right:0;border-bottom:0"><table class="dtable"><thead><tr>${V.cols.map(c => `<th class="${c.n ? "num" : ""}">${c.l}</th>`).join("")}</tr></thead><tbody>${body}${totalRow}</tbody></table></div>
     </div>
     <div class="vbanner" style="margin-top:16px"><span class="tag" style="font-size:10px;color:var(--gold)">Aggregate</span><span class="kicker" style="text-transform:none;letter-spacing:0;font-family:var(--ff-body);font-size:10.5px">Counts only — no individual voter records are exported.</span></div>`;

  view.querySelectorAll("[data-xview]").forEach(b => b.onclick = () => selectExportView(b.dataset.xview));
  const dl = view.querySelector("#dl-csv");
  if (dl) dl.onclick = () => {
    const head = V.cols.map(c => c.l).join(",");
    const lines = V.rows.map(r => V.cols.map(c => String(r[c.k] == null ? "" : r[c.k])).join(","));
    const tot = V.cols.map((c, i) => i === 0 ? "Total" : (c.n ? totals[c.k] : "")).join(",");
    const csv = [head, ...lines, tot].join("\n");
    const a = el("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `hd48_${exportView}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  };
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
  geography: ["Data",     "Export the district by town, party and target program. Aggregate counts, downloadable as CSV."],
  results:   ["Results",  "Certified returns by office and town, with swing against the prior comparable race."],
};
function renderRail(active) {
  const rail = document.getElementById("rail");
  if (!rail) return;
  const s = standings();
  const ctx = RAIL_CTX[active] || RAIL_CTX.verdict;
  const segs = [["var(--base)", s.pBase], ["var(--persuasion)", s.pPersu], ["var(--npa)", s.pReg]]
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
/* margin-scale palette (D positive → blue, R negative → red) */
function vColor(m) { return m > 15 ? "#1D4ED8" : m > 5 ? "#5B8DEF" : m > -5 ? "#5B6B7E" : m > -15 ? "#E5564F" : "#C42A2A"; }
function vLabel(m) { return m > 15 ? "Safe D" : m > 5 ? "Lean D" : m > -5 ? "Toss-Up" : m > -15 ? "Lean R" : "Safe R"; }
function vTone(m)  { return m > 5 ? { txt: "#60A5FA", tint: "rgba(37,99,235,.15)", bd: "rgba(96,165,250,.35)" }
  : m > -5 ? { txt: "#AEB9C6", tint: "rgba(148,163,184,.13)", bd: "rgba(148,163,184,.32)" }
  : { txt: "#F87171", tint: "rgba(220,38,38,.14)", bd: "rgba(248,113,113,.35)" }; }
/* front-map fill: registration magnitude, deep slate → teal (non-partisan) */
function regColor(reg, min, max) {
  const t = max > min ? (reg - min) / (max - min) : .5;
  const lo = [23, 42, 60], hi = [47, 182, 200];
  return `rgb(${lo.map((c, i) => Math.round(c + (hi[i] - c) * (0.30 + .70 * t))).join(",")})`;
}
let verdictSel = null;

ROUTES.verdict = function (view) {
  const TS = TARGET && TARGET.summary;
  const dec = Math.abs(HMAIN.r - HMAIN.d);
  const persu = TS ? TS.persuasion_targets : T.party.Unaffiliated;
  // concentration: how few towns hold 60% of active voters
  const cp = townList().slice().sort((a, b) => b.active - a.active);
  const totAct = cp.reduce((s, p) => s + p.active, 0) || 1;
  let cum = 0, k = 0; for (const p of cp) { cum += p.active; k++; if (cum / totAct >= 0.6) break; }
  const concShare = Math.round(cum / totAct * 100);

  // real per-town records from the latest contested House race + registration + target model
  const HR = HMAINrace;
  const trows = TARGET && TARGET.towns ? TARGET.towns : [];
  const recs = (RES ? RES.towns : []).map(name => {
    const v = HR && HR.towns[name]; const two = v ? (v.d + v.r) : 0;
    const margin = two ? 100 * (v.d - v.r) / two : 0;
    const tt = trows.find(x => x.town === name) || {};
    return { name, margin, dPct: two ? 100 * v.d / two : 0, rPct: two ? 100 * v.r / two : 0,
      reg: TOWNS[name] ? TOWNS[name].active : 0, target: (tt.persuasion || 0) > 1000 };
  });
  const byName = Object.fromEntries(recs.map(r => [r.name, r]));
  const targetN = recs.filter(r => r.target).length;
  if (!byName[verdictSel]) verdictSel = (recs.find(r => r.target) || recs[0] || {}).name;
  const regs = recs.map(r => r.reg); const rMin = Math.min(...regs), rMax = Math.max(...regs);

  // turnout sparkline (real general-election ballots)
  const g = C.gen_years || {}; const yrs = [2018, 2020, 2022, 2024]; const gv = yrs.map(y => g[y] || 0);
  const gmax = Math.max(...gv) || 1;
  const tx = i => 10 + i * 88, ty = v => 78 - (v / gmax) * 66;
  const spPts = gv.map((v, i) => `${tx(i)},${ty(v).toFixed(1)}`).join(" ");
  const spDots = gv.map((v, i) => `<circle cx="${tx(i)}" cy="${ty(v).toFixed(1)}" r="4.5" fill="${i === 3 ? "var(--gold-lt)" : "var(--teal-lt)"}" stroke="var(--navy-mid)" stroke-width="2"></circle>`).join("");

  // cycle margins (real, oldest → newest)
  const cyc = (RES ? RES.order : []).map(kk => { const rc = RES.races[kk]; const m = resTotals(rc).margin;
    return { yr: "’" + String(rc.year).slice(2) + " " + (rc.kind === "House" ? "H" : "P"), m }; });
  const cycRows = cyc.map(c => {
    const d = c.m >= 0, w = Math.min(Math.abs(c.m) / 6 * 50, 50), col = d ? "#3B82F6" : "#DC2626", tc = d ? "#60A5FA" : "#F87171";
    const bar = d ? `right:50%;width:${w}%` : `left:50%;width:${w}%`;
    return `<div style="display:flex;align-items:center;gap:12px">
      <span style="width:52px;font-family:var(--ff-cond);font-weight:600;font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:var(--fg-muted)">${c.yr}</span>
      <div style="position:relative;flex:1;height:9px;background:rgba(255,255,255,.05);border-radius:2px"><span style="position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:rgba(255,255,255,.2)"></span><span style="position:absolute;top:2px;bottom:2px;${bar};background:${col};border-radius:2px"></span></div>
      <span style="width:46px;text-align:right;font-family:var(--ff-cond);font-weight:700;font-size:13px;color:${tc};font-variant-numeric:tabular-nums">${marginLabel(c.m)}</span></div>`;
  }).join("");

  const kpi = (n, lab, val, unit, sub, accent, valcol) => `<div style="background:var(--navy-card);border:1px solid var(--border);border-top:2px solid ${accent};border-radius:6px;padding:14px 16px 13px">
    <div style="font-family:var(--ff-cond);font-weight:600;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${accent}">${n} · ${lab}</div>
    <div style="font-family:var(--ff-cond);font-weight:700;font-size:40px;line-height:1;color:${valcol || "var(--fg)"};margin:6px 0 8px;font-variant-numeric:tabular-nums">${val}${unit ? `<span style="font-size:23px;color:var(--fg-muted)">${unit}</span>` : ""}</div>
    <div style="font-family:var(--ff-body);font-size:11px;color:var(--fg-muted)">${sub}</div></div>`;

  view.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 336px;gap:20px;align-items:start">
      <!-- CENTER: KPIs + district map -->
      <section style="display:flex;flex-direction:column;min-width:0">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px">
          ${kpi("01", "Margin", fmt(dec), "", "2024 decisive votes · protect the edge", "var(--camp-lt)")}
          ${kpi("02", "Map", concShare, "%", `turf in ${k} town${k > 1 ? "s" : ""} · concentrate`, "var(--teal-lt)")}
          ${kpi("03", "Targets", fmt(persu), "", "persuasion voters · win the swing", "var(--persuasion)", "var(--persuasion-lt)")}
        </div>

        <div style="display:flex;align-items:flex-end;justify-content:space-between;padding:20px 2px 12px">
          <div>
            <div style="font-family:var(--ff-cond);font-weight:600;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:var(--fg-muted)">District Map · Active Registration</div>
            <div style="font-family:var(--ff-body);font-size:11px;color:var(--fg-dim);margin-top:3px">${C.district_label} · ${recs.length} towns · click to inspect</div>
          </div>
          <div style="font-family:var(--ff-cond);font-weight:600;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--fg-dim)">Fewer ◂ &nbsp;·&nbsp; ▸ More</div>
        </div>

        <div style="position:relative;height:660px;border:1px solid var(--border);border-radius:10px;background:#0C1A2E;overflow:hidden">
          <div id="v-map" style="position:absolute;inset:0"></div>
          <div style="position:absolute;top:18px;left:18px;z-index:500;display:flex;align-items:center;gap:11px;padding:9px 15px;border-radius:6px;background:rgba(196,42,42,.15);border:1px solid rgba(196,42,42,.42)">
            <span style="font-family:var(--ff-cond);font-weight:700;font-size:15px;letter-spacing:1px;text-transform:uppercase;color:#F87171">▲ R Holds</span>
            <span style="width:1px;height:16px;background:rgba(255,255,255,.2)"></span>
            <span style="font-family:var(--ff-cond);font-weight:700;font-size:16px;color:var(--fg);font-variant-numeric:tabular-nums">${leanLabelReg(HMAIN.margin)}</span>
          </div>
          ${targetN ? `<div style="position:absolute;top:18px;right:18px;z-index:500;display:flex;align-items:center;gap:8px;padding:7px 13px;border-radius:6px;background:rgba(12,26,46,.72);border:1px solid var(--border);backdrop-filter:blur(6px)"><span style="color:var(--gold);font-size:12px">◎</span><span style="font-family:var(--ff-cond);font-weight:600;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--gold-lt)">${targetN} Target Town${targetN > 1 ? "s" : ""}</span></div>` : ""}
          <div style="position:absolute;left:18px;bottom:18px;z-index:500;padding:14px 16px;border-radius:8px;background:rgba(6,17,31,.74);border:1px solid var(--border-strong);backdrop-filter:blur(8px)">
            <div style="font-family:var(--ff-cond);font-weight:600;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--fg-muted);margin-bottom:9px">Active Registration</div>
            <div style="width:150px;height:10px;border-radius:3px;background:linear-gradient(90deg,${regColor(rMin, rMin, rMax)},${regColor(rMax, rMin, rMax)})"></div>
            <div style="display:flex;justify-content:space-between;margin-top:6px;font-family:var(--ff-cond);font-weight:600;font-size:10px;color:var(--fg-dim);font-variant-numeric:tabular-nums"><span>${fmt(rMin)}</span><span>${fmt(rMax)}</span></div>
          </div>
        </div>
      </section>

      <!-- RIGHT RAIL: selected town + turnout + reg + cycle margins -->
      <aside style="background:var(--navy-mid);border:1px solid var(--border);border-radius:8px;display:flex;flex-direction:column;overflow:hidden">
        <div id="v-sel" style="padding:20px 22px;border-bottom:1px solid var(--border)"></div>
        <div style="padding:20px 22px;border-bottom:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;align-items:baseline"><div style="font-family:var(--ff-cond);font-weight:600;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--fg-muted)">General-Election Turnout</div><div style="font-family:var(--ff-cond);font-weight:600;font-size:10px;letter-spacing:1px;color:var(--fg-dim)">’18 → ’24</div></div>
          <svg viewBox="0 0 284 90" style="width:100%;height:96px;display:block;margin-top:10px" preserveAspectRatio="none">
            <line x1="10" y1="78" x2="274" y2="78" stroke="rgba(255,255,255,.08)" stroke-width="1"></line>
            <polyline points="${spPts}" fill="none" stroke="var(--teal-lt)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></polyline>${spDots}
          </svg>
          <div style="display:flex;justify-content:space-between;margin-top:6px">${yrs.map((y, i) => `<div style="text-align:center;font-family:var(--ff-cond);font-weight:600;font-size:11px;color:${i === 3 ? "var(--gold-lt)" : "var(--fg-dim)"}">’${String(y).slice(2)}<span style="display:block;font-family:var(--ff-body);font-weight:400;font-size:10px;color:var(--fg-muted);margin-top:2px">${fmtK(gv[i])}</span></div>`).join("")}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border-bottom:1px solid var(--border)">
          <div style="background:var(--navy-mid);padding:16px 20px"><div style="font-family:var(--ff-cond);font-weight:600;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--fg-muted)">Active Reg.</div><div style="font-family:var(--ff-cond);font-weight:700;font-size:26px;line-height:1;color:var(--fg);margin-top:6px;font-variant-numeric:tabular-nums">${fmt(T.active)}</div></div>
          <div style="background:var(--navy-mid);padding:16px 20px"><div style="font-family:var(--ff-cond);font-weight:600;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--fg-muted)">${myYear} Turnout</div><div style="font-family:var(--ff-cond);font-weight:700;font-size:26px;line-height:1;color:var(--teal-lt);margin-top:6px;font-variant-numeric:tabular-nums">${fmt(HMAIN.two)}</div></div>
        </div>
        <div style="padding:20px 22px;flex:1">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px"><div style="font-family:var(--ff-cond);font-weight:600;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--fg-muted)">Cycle Margins</div><div style="font-family:var(--ff-body);font-size:9px;letter-spacing:.5px;color:var(--fg-dim)">P · President&nbsp;&nbsp;H · House</div></div>
          <div style="display:flex;flex-direction:column;gap:13px">${cycRows}</div>
        </div>
      </aside>
    </div>`;

  function paintSel() {
    const s = byName[verdictSel]; if (!s) return;
    const tone = vTone(s.margin);
    $("#v-sel").innerHTML = `
      <div style="font-family:var(--ff-cond);font-weight:600;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--fg-muted)">Selected Town</div>
      <div style="display:flex;align-items:center;gap:12px;margin-top:10px">
        <span style="width:15px;height:15px;border-radius:3px;flex-shrink:0;background:${vColor(s.margin)}"></span>
        <span style="font-family:var(--ff-display);font-weight:900;font-size:26px;line-height:1;color:var(--fg)">${s.name}</span>
        <span style="padding:4px 11px;border-radius:3px;background:${tone.tint};border:1px solid ${tone.bd};font-family:var(--ff-cond);font-weight:600;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${tone.txt}">${vLabel(s.margin)}</span>
      </div>
      <div style="margin-top:16px;display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;align-items:center;gap:10px"><span style="width:16px;font-family:var(--ff-cond);font-weight:700;font-size:12px;color:#60A5FA">D</span><div style="flex:1;height:10px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden"><div style="height:100%;width:${s.dPct}%;background:#3B82F6;border-radius:3px"></div></div><span style="width:40px;text-align:right;font-family:var(--ff-cond);font-weight:700;font-size:13px;color:#60A5FA;font-variant-numeric:tabular-nums">${pc1(s.dPct)}</span></div>
        <div style="display:flex;align-items:center;gap:10px"><span style="width:16px;font-family:var(--ff-cond);font-weight:700;font-size:12px;color:#F87171">R</span><div style="flex:1;height:10px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden"><div style="height:100%;width:${s.rPct}%;background:#DC2626;border-radius:3px"></div></div><span style="width:40px;text-align:right;font-family:var(--ff-cond);font-weight:700;font-size:13px;color:#F87171;font-variant-numeric:tabular-nums">${pc1(s.rPct)}</span></div>
      </div>
      <div style="margin-top:15px;display:flex;justify-content:space-between;align-items:baseline;padding-top:13px;border-top:1px solid var(--hairline)"><span style="font-family:var(--ff-cond);font-weight:600;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--fg-muted)">Active Reg.</span><span style="font-family:var(--ff-cond);font-weight:700;font-size:18px;color:var(--fg);font-variant-numeric:tabular-nums">${fmt(s.reg)}</span></div>
      ${s.target ? `<div style="margin-top:13px;display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:3px;background:rgba(212,160,23,.13);border:1px solid rgba(212,160,23,.32);font-family:var(--ff-cond);font-weight:600;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--gold-lt)">◎ Persuasion Target</div>` : ""}`;
  }
  paintSel();
  setTimeout(() => verdictMap(recs, byName, () => paintSel()), 30);
};

/* real 4-town district map, colored by active registration, click to select */
function verdictMap(recs, byName, onPick) {
  const host = document.getElementById("v-map");
  if (!host || !GEO || !GEO.towns) return;
  const regs = recs.map(r => r.reg), rMin = Math.min(...regs), rMax = Math.max(...regs);
  const map = L.map("v-map", { scrollWheelZoom: false, zoomControl: false, attributionControl: false,
    dragging: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false });
  const byLayer = {};
  const styleFor = name => { const r = byName[name]; const sel = name === verdictSel;
    return { fillColor: r ? regColor(r.reg, rMin, rMax) : "#25313f", fillOpacity: .95,
      color: sel ? "#F0B82A" : "rgba(255,255,255,.16)", weight: sel ? 2.5 : 1 }; };
  const applyOne = name => { if (byLayer[name]) byLayer[name].setStyle(styleFor(name)); };
  const layer = L.geoJSON(GEO.towns, {
    style: f => styleFor(f.properties.town),
    onEachFeature: (f, lyr) => {
      const name = f.properties.town; if (!byName[name]) return;
      byLayer[name] = lyr;
      lyr.on({
        click: () => { const prev = verdictSel; verdictSel = name; applyOne(prev); applyOne(name); onPick(); },
        mouseover: e => { if (name !== verdictSel) e.target.setStyle({ color: "rgba(255,255,255,.5)", weight: 1.5 }); },
        mouseout: () => applyOne(name),
      });
    }
  }).addTo(map);
  map.fitBounds(layer.getBounds(), { padding: [40, 40] });
  (window._maps = window._maps || []).push(map);
  // permanent town labels: name + active registration
  GEO.towns.features.forEach(f => {
    const name = f.properties.town, r = byName[name]; if (!byLayer[name] || !r) return;
    const c = byLayer[name].getBounds().getCenter();
    L.tooltip({ permanent: true, direction: "center", className: "v-town-lbl", opacity: 1 })
      .setLatLng(c)
      .setContent(`<div style="text-align:center;pointer-events:none;text-shadow:0 2px 10px rgba(0,0,0,.7)"><div style="font-family:var(--ff-display);font-weight:800;font-size:17px;letter-spacing:1px;text-transform:uppercase;color:#fff;line-height:1">${name}</div><div style="font-family:var(--ff-cond);font-weight:700;font-size:15px;color:rgba(255,255,255,.9);margin-top:3px;font-variant-numeric:tabular-nums">${fmt(r.reg)}</div></div>`)
      .addTo(map);
  });
}

/* ───────────────── ANALYSIS ───────────────── */
let analysisMetric = "persuasion_share";
let analysisTown = null;
const METRIC_SHORT = { persuasion_share: "Persuasion load", true_swing_rate: "True swing", base_lean_rate: "Base + lean", outdoor_l2_rate: "Outdoor / gun L2", election_day_rate: "Election Day" };
const METRIC_STYLE = {
  persuasion_share:  { rgb: [139, 92, 246],  hex: "#A78BFA", legend: "Share of persuasion core" },
  true_swing_rate:   { rgb: [167, 139, 250], hex: "#C4B5FD", legend: "Convertible swing rate" },
  base_lean_rate:    { rgb: [207, 65, 51],   hex: "#F06A5A", legend: "Base & lean to protect" },
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
    ["Persuasion Core", fmt(V.persuasion_core), "var(--persuasion-lt)", "swing + crossover pool"],
    ["Target Cushion", fmt(V.target_overage), "var(--teal-lt)", "targets over win number"],
  ].map(([l, v, c, n]) => `<div class="stat" style="--accent:${c};"><div class="sl">${l}</div><div class="sv">${v}</div><div class="ss">${n}</div></div>`).join("");

  const metricBtns = mapMetrics.map(m => `<button class="seg-btn ${m.key === analysisMetric ? "on" : ""}" data-analysis-metric="${m.key}">${METRIC_SHORT[m.key] || m.label}</button>`).join("");

  // selected-town detail panel (folds L2 texture into the console)
  const job = (sd.true_swing || 0) > 500 ? "Persuasion battlefield" : "Base / lean protection";
  const jobAccent = (sd.true_swing || 0) > 500 ? "var(--persuasion-lt)" : "var(--base-lt)";
  const detailRows = [
    ["Persuasion share", pc1(sd.persuasion_share), "var(--persuasion-lt)"],
    ["Base + lean", pc1(sd.base_lean_rate), "var(--base-lt)"],
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

    <div class="vcard" style="padding:20px 22px;margin-top:16px;">
      <div class="rlabel" style="margin-bottom:16px;">Party Registration by Town<span class="rlabel" style="color:var(--fg-dim);margin-left:8px;">who is on the rolls</span></div>
      <div style="display:flex;flex-direction:column;gap:14px;">
        ${townList().map(t => {
          const segs = [["Republican", "var(--base-lt)"], ["Unaffiliated", "#8AA0BC"], ["Democratic", "#60A5FA"], ["Minor / Other", "var(--gold-lt)"]];
          const bar = segs.map(([p, c]) => `<div style="width:${t.party_pct[p]}%;background:${c}"></div>`).join("");
          return `<div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
              <span class="r-num" style="font-size:14px;color:var(--fg);">${t.name}</span>
              <span class="r-num" style="font-size:12px;color:var(--fg-muted);">${fmt(t.active)} active · <span style="color:var(--base-lt);">${pc1(t.party_pct.Republican)} R</span></span>
            </div>
            <div style="display:flex;height:12px;border-radius:3px;overflow:hidden;background:rgba(255,255,255,.05);">${bar}</div>
          </div>`;
        }).join("")}
      </div>
      <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:16px;font-family:var(--ff-body);font-size:11px;color:var(--fg-dim);">
        <span style="display:flex;align-items:center;gap:6px;"><i style="width:11px;height:11px;border-radius:2px;background:var(--base-lt);"></i>Republican</span>
        <span style="display:flex;align-items:center;gap:6px;"><i style="width:11px;height:11px;border-radius:2px;background:#8AA0BC;"></i>Unaffiliated</span>
        <span style="display:flex;align-items:center;gap:6px;"><i style="width:11px;height:11px;border-radius:2px;background:#60A5FA;"></i>Democratic</span>
        <span style="display:flex;align-items:center;gap:6px;"><i style="width:11px;height:11px;border-radius:2px;background:var(--gold-lt);"></i>Minor</span>
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
  // program semantics: BASE = red, PERSUASION (incl. swing/lean) = purple, weak-D = blue
  const progColor = l => { const t = l.toLowerCase();
    return t.includes("base") ? "var(--base-lt)"
      : t.includes("weak dem") ? "var(--dem-lt)"
      : (t.includes("persuas") || t.includes("swing") || t.includes("lean")) ? "var(--persuasion-lt)"
      : "var(--fg-muted)"; };
  const barMix = (label, valStr, c, w, lw) => `<div style="display:flex;align-items:center;gap:14px;margin-bottom:12px;">
    <span class="tag" style="color:var(--fg);width:${lw || 160}px;flex-shrink:0;line-height:1.25;">${label}</span>
    <span class="r-num" style="font-size:14px;color:${c};width:52px;text-align:right;flex-shrink:0;">${valStr}</span>
    <div style="flex:1;height:8px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden;"><div style="height:100%;width:${w}%;background:${c};border-radius:4px;"></div></div>
  </div>`;
  const mixBlock = (pairs, lw, colorFn) => { const max = Math.max(...pairs.map(p => p[1])) || 1; return pairs.map(([l, v], i) => barMix(l, fmt(v), colorFn ? colorFn(l) : (typeColors[i] || "var(--fg-muted)"), Math.max(2, 100 * v / max), lw)).join(""); };
  const typeMix = mixBlock(entries(s.target_types), 210, progColor);
  const partyMix = mixBlock(entries(s.parties).map(([k, v]) => [partyName(k), v]), 110);
  const targetMetrics = {
    target_rate:   { label: "Target rate", get: t => t.target_rate, fmt: pc1, color: [34, 170, 188],  hex: "#22AABC", legend: "Targets ÷ likely voters" },
    targets:       { label: "Targets", get: t => t.targets, fmt: fmt, color: [212, 160, 23],  hex: "#F0B82A", legend: "Total targets" },
    persuasion:    { label: "Persuasion", get: t => t.persuasion, fmt: fmt, color: [139, 92, 246], hex: "#A78BFA", legend: "Persuasion targets" },
    dem_crossover: { label: "Weak D crossover", get: t => t.dem_crossover, fmt: fmt, color: [96, 165, 250],  hex: "#60A5FA", legend: "Weak-D crossover targets" },
  };
  if (!targetMetrics[targetMetric]) targetMetric = "target_rate";
  const tm = targetMetrics[targetMetric];
  const targetBtns = Object.entries(targetMetrics).map(([k, m]) => `<button class="seg-btn ${k === targetMetric ? "on" : ""}" data-target-metric="${k}">${m.label}</button>`).join("");

  // selected-town resolution + detail panel
  if (!TARGET.towns.some(t => t.town === targetTown)) targetTown = TARGET.towns[0] ? TARGET.towns[0].town : null;
  const sdt = TARGET.towns.find(t => t.town === targetTown) || {};
  const job = (sdt.persuasion || 0) > 1000 ? "Persuasion battlefield" : "High target rate";
  const jobAccent = (sdt.persuasion || 0) > 1000 ? "var(--persuasion-lt)" : "var(--teal-lt)";
  const detailRows = [
    ["Likely", fmt(sdt.likely), "var(--fg-dim)"],
    ["Targets", fmt(sdt.targets), "var(--fg)"],
    ["Rate", pc1(sdt.target_rate), "var(--gold-lt)"],
    ["Persuasion", fmt(sdt.persuasion), "var(--persuasion-lt)"],
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
      <div class="stat" style="--accent:var(--camp-lt);"><div class="sl">Targets</div><div class="sv">${fmt(s.targets)}</div><div class="ss">${pc1(s.target_rate)} of likely pool</div></div>
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

    `;

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
