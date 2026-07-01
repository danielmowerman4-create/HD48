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

/* ============================ DATA · CONTACT LIST BUILDER ============================ */
let voterRows = null, voterErr = null, dataSel = null;
const PARTY_LABEL = { R: "Republican", D: "Democrat", U: "Unaffiliated", IT: "Independent", L: "Libertarian", G: "Green", Worki: "Working Families" };
function splitCSVLine(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) { const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else { if (c === ",") { out.push(cur); cur = ""; } else if (c === '"') q = true; else cur += c; } }
  out.push(cur); return out;
}
function parseVoterCSV(text) {
  const lines = text.split(/\r?\n/); const head = splitCSVLine(lines[0]); const ix = k => head.indexOf(k);
  const iId = ix("voter_id"), iFn = ix("first_name"), iLn = ix("last_name"), iAd = ix("residential_address"),
    iMa = ix("mailing_address"), iPt = ix("party"), iTn = ix("town"), iPh = ix("phone"),
    iLr = ix("support_lean_r"), iGn = ix("recent_general_count"), iPr = ix("contact_priority"), iMu = ix("mail_universe");
  const rows = [];
  for (let i = 1; i < lines.length; i++) { if (!lines[i]) continue; const f = splitCSVLine(lines[i]);
    rows.push({ id: f[iId], fn: f[iFn], ln: f[iLn], addr: f[iAd], mailing: iMa >= 0 ? f[iMa] : "", party: f[iPt], town: f[iTn],
      phone: iPh >= 0 ? f[iPh] : "", leanR: iLr >= 0 ? f[iLr] : "", gens: iGn >= 0 ? (+f[iGn] || 0) : 0,
      prio: iPr >= 0 ? f[iPr] : "", mailu: iMu >= 0 ? f[iMu] : "" }); }
  return rows;
}
function leanBucket(lr) { lr = lr || ""; return /Support/.test(lr) ? "LeanR" : /Oppos/.test(lr) ? "LeanD" : "Swing"; }
function partyGroup(code) { return code === "R" ? "R" : code === "D" ? "D" : code === "U" ? "U" : "O"; }
function addrParts(a) { const street = (a || "").split(",")[0].trim(); const m = street.match(/^(\d+[A-Za-z\-]*)\s+(.*)$/); return m ? [m[1], m[2]] : ["", street]; }
function csvCell(v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

ROUTES.geography = function (view) {
  const TOWNS_LIST = ["Colchester", "Lebanon", "Bozrah", "Franklin"];
  const PARTIES = [["R", "Republican"], ["D", "Democrat"], ["U", "Unaffiliated"], ["IT", "Independent"], ["L", "Libertarian"], ["G", "Green"], ["Worki", "Working Families"]];
  if (voterErr) {
    view.innerHTML = vhead("Contact List", "var(--teal-lt)", "Data · Build a List", "Load the voter file") +
      `<div class="vcard" style="padding:28px 26px;max-width:76ch;">
        <div class="rlabel" style="margin-bottom:10px;">Load Voter File</div>
        <div style="font-family:var(--ff-body);font-size:13.5px;color:var(--fg-muted);line-height:1.55;margin-bottom:18px;">The voter file is not bundled in the public build (individual records stay off the public web). Load <code>hd48_2026_likely_voter_universe.csv</code> from this device to build lists — it is read in your browser and never uploaded.</div>
        <label class="btn pri" style="display:inline-flex;align-items:center;gap:10px;padding:12px 20px;font-size:12px;letter-spacing:1.5px;border-radius:6px;cursor:pointer;">Choose voter CSV<input id="d-file" type="file" accept=".csv" style="display:none;"></label>
        <div style="font-family:var(--ff-body);font-size:11px;color:var(--fg-dim);margin-top:14px;">Export columns: First Name · Last Name · State Voter ID · Address No. · Street Name · Party.</div>
      </div>`;
    const fi = view.querySelector("#d-file");
    if (fi) fi.onchange = e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { try { voterRows = parseVoterCSV(String(rd.result)); voterErr = null; route(); } catch (err) { voterErr = "parse error"; route(); } }; rd.readAsText(f); };
    return;
  }
  if (!voterRows) {
    view.innerHTML = vhead("Contact List", "var(--teal-lt)", "Data · Build a List", "Loading voter file…") +
      `<div class="note info"><div>Loading the Likely 2026 Voter file…</div></div>`;
    fetch("exports/hd48_2026_likely_voter_universe.csv").then(r => { if (!r.ok) throw new Error("absent"); return r.text(); }).then(t => { voterRows = parseVoterCSV(t); route(); }).catch(() => { voterErr = "absent"; route(); });
    return;
  }
  const PGROUPS = [["R", "Republican"], ["D", "Democrat"], ["U", "Unaffiliated"], ["O", "Independent / Other"]];
  const LEANS = [["LeanR", "Lean Republican"], ["Swing", "Swing"], ["LeanD", "Lean Democrat"]];
  if (!dataSel) dataSel = { towns: new Set(TOWNS_LIST), pgroups: new Set(["R", "D", "U", "O"]), leans: new Set(["LeanR", "Swing", "LeanD"]), search: "", extra: "" };
  const XPRED = { ahard: r => /High/.test(r.prio), mail: r => r.mailu && !/^none/i.test(r.mailu), "3of3": r => r.gens >= 3 };

  const filtered = () => { const q = dataSel.search.trim().toLowerCase();
    return voterRows.filter(r => {
      if (!dataSel.towns.has(r.town)) return false;
      if (!dataSel.pgroups.has(partyGroup(r.party))) return false;
      if (r.party === "U" && !dataSel.leans.has(leanBucket(r.leanR))) return false;
      if (dataSel.extra && XPRED[dataSel.extra] && !XPRED[dataSel.extra](r)) return false;
      if (q && !(r.fn + " " + r.ln + " " + r.addr + " " + r.id).toLowerCase().includes(q)) return false;
      return true;
    });
  };
  const pcount = { ahard: voterRows.filter(XPRED.ahard).length, mail: voterRows.filter(XPRED.mail).length,
    leanRU: voterRows.filter(r => r.party === "U" && leanBucket(r.leanR) === "LeanR").length, "3of3": voterRows.filter(XPRED["3of3"]).length };

  const cbTown = TOWNS_LIST.map(t => `<label class="dcheck"><input type="checkbox" data-town="${t}" ${dataSel.towns.has(t) ? "checked" : ""}>${t}</label>`).join("");
  const cbParty = PGROUPS.map(([c, l]) => `<label class="dcheck"><input type="checkbox" data-pg="${c}" ${dataSel.pgroups.has(c) ? "checked" : ""}>${l}</label>`).join("");
  const cbLean = LEANS.map(([c, l]) => `<label class="dcheck"><input type="checkbox" data-lean="${c}" ${dataSel.leans.has(c) ? "checked" : ""}>${l}</label>`).join("");
  const expBtn = (id, lab, pri) => `<button class="${pri ? "btn pri" : "seg-btn"}" data-exp="${id}" style="${pri ? "padding:11px 18px;font-size:12px;letter-spacing:1.5px;border-radius:6px;" : ""}">${lab}</button>`;

  view.innerHTML = vhead("Contact List", "var(--teal-lt)", "Data · Build a List", "Likely 2026 Voter file · " + fmt(voterRows.length)) +
    `<div class="wpanel" style="grid-template-columns:1fr 322px;gap:16px;align-items:start;">
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div class="vcard" style="padding:20px 22px;">
          <div class="rlabel" style="margin-bottom:10px;">Search</div>
          <input id="d-search" placeholder="Name, address, or voter ID" value="${dataSel.search.replace(/"/g, "&quot;")}" style="width:100%;box-sizing:border-box;padding:12px 15px;border-radius:8px;border:1px solid var(--border-strong);background:#0B1A2C;color:var(--fg);font-family:var(--ff-body);font-size:14px;outline:none;">
        </div>
        <div class="vcard" style="padding:20px 22px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;"><span class="rlabel">Towns</span><button class="seg-btn" data-all="towns">All</button><button class="seg-btn" data-none="towns">None</button></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px 22px;">${cbTown}</div>
        </div>
        <div class="vcard" style="padding:20px 22px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;"><span class="rlabel">Party</span><button class="seg-btn" data-all="pgroups">All</button><button class="seg-btn" data-none="pgroups">None</button></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px 22px;">${cbParty}</div>
        </div>
        <div class="vcard" style="padding:20px 22px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;"><span class="rlabel">Unaffiliated Lean</span><span class="rlabel" style="color:var(--fg-dim);">applies to U voters</span></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px 22px;">${cbLean}</div>
        </div>
      </div>

      <div class="vcard" style="padding:0;overflow:hidden;position:sticky;top:120px;">
        <div style="padding:22px;border-bottom:1px solid var(--border);background:linear-gradient(180deg,rgba(34,170,188,.09),transparent);">
          <div class="rlabel">In Current List</div>
          <div id="d-count" class="r-num" style="font-size:48px;line-height:.9;color:var(--teal-lt);margin-top:6px;">—</div>
          <div class="rlabel" style="color:var(--fg-dim);margin-top:4px;">voters selected</div>
        </div>
        <div style="padding:18px 22px;border-bottom:1px solid var(--border);">
          <div class="rlabel" style="margin-bottom:10px;">Export</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${expBtn("csv", "CSV ↓", true)}${expBtn("walk", "Walk List")}${expBtn("mail", "Mail File")}${expBtn("households", "Households")}${expBtn("phones", "Phones")}${expBtn("reset", "Reset")}
          </div>
        </div>
        <div style="padding:18px 22px;">
          <div class="rlabel" style="margin-bottom:10px;">Quick Presets</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            <button class="seg-btn" data-preset="ahard">A Hard (${fmt(pcount.ahard)})</button>
            <button class="seg-btn" data-preset="mail">Full Mail (${fmt(pcount.mail)})</button>
            <button class="seg-btn" data-preset="leanRU">Lean R U (${fmt(pcount.leanRU)})</button>
            <button class="seg-btn" data-preset="3of3">3-of-3 (${fmt(pcount["3of3"])})</button>
          </div>
        </div>
      </div>
    </div>
    <div class="vbanner" style="margin-top:16px;"><span class="tag" style="font-size:10px;color:var(--gold);">Voter file</span><span class="kicker" style="text-transform:none;letter-spacing:0;font-family:var(--ff-body);font-size:10.5px;">CSV: First · Last · State Voter ID · Address No. · Street · Party. Mail File uses mailing address; Phones needs a number; Households dedupes by address. Individual voter records.</span></div>`;

  const refresh = () => { const c = $("#d-count"); if (c) c.textContent = fmt(filtered().length); };
  refresh();

  const dl = (head, lines, name) => { const a = el("a"); a.href = URL.createObjectURL(new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href); };
  const doExport = type => {
    if (type === "reset") { dataSel = null; route(); return; }
    const rows = filtered();
    if (type === "mail") return dl(["First Name", "Last Name", "Mailing Address", "Party"], rows.map(r => [r.fn, r.ln, r.mailing || r.addr, PARTY_LABEL[r.party] || r.party].map(csvCell).join(",")), "hd48_mail_file.csv");
    if (type === "phones") return dl(["First Name", "Last Name", "Phone", "Party"], rows.filter(r => r.phone).map(r => [r.fn, r.ln, r.phone, PARTY_LABEL[r.party] || r.party].map(csvCell).join(",")), "hd48_phones.csv");
    if (type === "households") { const hh = {}; rows.forEach(r => { const p = addrParts(r.addr); if (!hh[r.addr]) hh[r.addr] = { no: p[0], st: p[1], town: r.town, n: 0 }; hh[r.addr].n++; });
      return dl(["Address No.", "Street Name", "Town", "Voters"], Object.values(hh).map(h => [h.no, h.st, h.town, h.n].map(csvCell).join(",")), "hd48_households.csv"); }
    const recs = rows.map(r => { const p = addrParts(r.addr); return { no: p[0], st: p[1], r }; });
    if (type === "walk") recs.sort((a, b) => a.st.localeCompare(b.st) || (parseInt(a.no) || 0) - (parseInt(b.no) || 0));
    dl(["First Name", "Last Name", "State Voter ID", "Address No.", "Street Name", "Party"], recs.map(({ no, st, r }) => [r.fn, r.ln, r.id, no, st, PARTY_LABEL[r.party] || r.party].map(csvCell).join(",")), type === "walk" ? "hd48_walk_list.csv" : "hd48_contact_list.csv");
  };

  view.querySelectorAll("[data-town]").forEach(cb => cb.onchange = () => { cb.checked ? dataSel.towns.add(cb.dataset.town) : dataSel.towns.delete(cb.dataset.town); refresh(); });
  view.querySelectorAll("[data-pg]").forEach(cb => cb.onchange = () => { cb.checked ? dataSel.pgroups.add(cb.dataset.pg) : dataSel.pgroups.delete(cb.dataset.pg); refresh(); });
  view.querySelectorAll("[data-lean]").forEach(cb => cb.onchange = () => { cb.checked ? dataSel.leans.add(cb.dataset.lean) : dataSel.leans.delete(cb.dataset.lean); refresh(); });
  view.querySelectorAll("[data-all]").forEach(b => b.onclick = () => { if (b.dataset.all === "towns") dataSel.towns = new Set(TOWNS_LIST); else dataSel.pgroups = new Set(["R", "D", "U", "O"]); route(); });
  view.querySelectorAll("[data-none]").forEach(b => b.onclick = () => { if (b.dataset.none === "towns") dataSel.towns = new Set(); else dataSel.pgroups = new Set(); route(); });
  view.querySelectorAll("[data-preset]").forEach(b => b.onclick = () => { const p = b.dataset.preset;
    dataSel = { towns: new Set(TOWNS_LIST), pgroups: new Set(["R", "D", "U", "O"]), leans: new Set(["LeanR", "Swing", "LeanD"]), search: "", extra: "" };
    if (p === "leanRU") { dataSel.pgroups = new Set(["U"]); dataSel.leans = new Set(["LeanR"]); } else dataSel.extra = p;
    route(); });
  const se = $("#d-search"); if (se) se.oninput = () => { dataSel.search = se.value; refresh(); };
  view.querySelectorAll("[data-exp]").forEach(b => b.onclick = () => doExport(b.dataset.exp));
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
  analysis:  ["Analysis", "District profile: age, senior share, vote method, and outdoor/gun texture by town."],
  targets:   ["Targets",  "The Likely 2026 Voter universe, plus a separate Republican Turnout Lift pool."],
  geography: ["Data",     "Build a contact list: filter by town, party and search, then export names, IDs, addresses as CSV."],
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
  const map = L.map("v-map", { scrollWheelZoom: false, attributionControl: false });
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", { maxZoom: 18 }).addTo(map);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", { maxZoom: 18, pane: "markerPane" }).addTo(map);
  map.fitBounds(GEO.bounds, { padding: [26, 26] });
  (window._maps = window._maps || []).push(map);
  const byLayer = {};
  const styleFor = name => { const r = byName[name]; const sel = name === verdictSel;
    return { fillColor: r ? regColor(r.reg, rMin, rMax) : "#0F1A2C", fillOpacity: .84,
      color: sel ? "#F0B82A" : "#06111F", weight: sel ? 3 : 1.2 }; };
  const applyOne = name => { if (byLayer[name]) byLayer[name].setStyle(styleFor(name)); };
  const layer = L.geoJSON(GEO.towns, {
    style: f => styleFor(f.properties.town),
    onEachFeature: (f, lyr) => {
      const name = f.properties.town, r = byName[name]; if (!r) return;
      byLayer[name] = lyr;
      lyr.bindTooltip(`<div class="n">${name}</div><div class="v">${fmt(r.reg)}</div>`, { permanent: true, direction: "center", className: "amap-lbl", opacity: 1 });
      lyr.on({
        click: () => { const prev = verdictSel; verdictSel = name; applyOne(prev); applyOne(name); onPick(); },
        mouseover: e => { if (name !== verdictSel) e.target.setStyle({ weight: 3, color: "#F0B82A" }); },
        mouseout: () => applyOne(name),
      });
    }
  }).addTo(map);
}

/* ───────────────── ANALYSIS · DISTRICT PROFILE ───────────────── */
let analysisMetric = "age_50_plus_rate";
let analysisTown = null;
const METRIC_SHORT = { age_50_plus_rate: "Senior 50+", outdoor_l2_rate: "Outdoor · Gun", election_day_rate: "Election Day", early_vote_rate: "Early Vote", rep_pct: "Republican %", una_pct: "Unaffiliated %" };
const METRIC_STYLE = {
  age_50_plus_rate:  { rgb: [34, 170, 188],  hex: "#22AABC", legend: "Age 50+ share" },
  outdoor_l2_rate:   { rgb: [212, 160, 23],  hex: "#F0B82A", legend: "Outdoor / gun L2 cluster" },
  election_day_rate: { rgb: [207, 65, 51],   hex: "#F06A5A", legend: "Election Day share" },
  early_vote_rate:   { rgb: [111, 168, 214], hex: "#6FA8D6", legend: "Early vote share" },
  rep_pct:           { rgb: [207, 65, 51],   hex: "#F06A5A", legend: "Republican registration share" },
  una_pct:           { rgb: [138, 160, 188], hex: "#8AA0BC", legend: "Unaffiliated registration share" },
};
function selectAnalysisTown(name) { analysisTown = name; route(); }
ROUTES.analysis = function (view) {
  if (!TARGET || !TARGET.analysis) {
    view.innerHTML = vhead("Strategic Analysis", "var(--gold-lt)", "Analysis Not Loaded", "Run build/import_targets.py") +
      `<div class="note info"><div>Aggregate analysis is not loaded yet.</div></div>`;
    return;
  }
  const A = TARGET.analysis, CON = A.consumer;
  const rows = ((A.map && A.map.towns) || []).map(t => {
    const ts = TOWNS[t.town] || { party_pct: {} };
    return { ...t, rep_pct: ts.party_pct.Republican || 0, una_pct: ts.party_pct.Unaffiliated || 0, dem_pct: ts.party_pct.Democratic || 0 };
  });
  const byTown = Object.fromEntries(rows.map(t => [t.town, t]));
  if (!byTown[analysisTown]) analysisTown = rows[0] ? rows[0].town : null;
  const sd = byTown[analysisTown] || {};

  const METRICS = [
    { key: "age_50_plus_rate", label: "Senior 50+" },
    { key: "outdoor_l2_rate", label: "Outdoor · Gun" },
    { key: "election_day_rate", label: "Election Day" },
    { key: "early_vote_rate", label: "Early Vote" },
    { key: "rep_pct", label: "Republican %" },
    { key: "una_pct", label: "Unaffiliated %" },
  ];
  if (!METRICS.some(m => m.key === analysisMetric)) analysisMetric = "age_50_plus_rate";
  const metric = METRICS.find(m => m.key === analysisMetric);
  const ms = METRIC_STYLE[metric.key];

  // district summary numbers (headline only — everything else is mapped)
  const ab = CON.age_bands || {};
  const abKnown = Object.entries(ab).reduce((a, [k, v]) => a + (k === "Unknown" ? 0 : v), 0) || 1;
  const senior = (ab["65-79"] || 0) + (ab["80+"] || 0);
  const vm = CON.vote_methods || {}; const vmTot = Object.values(vm).reduce((a, v) => a + v, 0) || 1;
  const eday = vm["Likely Election Day"] || 0, early = vm["Likely Early Vote"] || 0;
  const gun = (CON.context_signals || {})["gun-owner model"] || 0;
  const kpis = [
    ["Senior Share", pc1(100 * senior / abKnown), "var(--teal-lt)", "age 65+ of universe"],
    ["Election Day", pc1(100 * eday / vmTot), "var(--camp-lt)", "vote-method tendency"],
    ["Early Vote", pc1(100 * early / vmTot), "#6FA8D6", "vote-method tendency"],
    ["Gun-Owner Signal", fmt(gun), "var(--gold-lt)", "L2 model flag"],
  ].map(([l, v, c, n]) => `<div class="stat" style="--accent:${c};"><div class="sl">${l}</div><div class="sv">${v}</div><div class="ss">${n}</div></div>`).join("");

  const metricBtns = METRICS.map(m => `<button class="seg-btn ${m.key === analysisMetric ? "on" : ""}" data-analysis-metric="${m.key}">${m.label}</button>`).join("");

  const detailRows = [
    ["Senior 50+", pc1(sd.age_50_plus_rate), "var(--teal-lt)"],
    ["Outdoor / gun", pc1(sd.outdoor_l2_rate), "var(--gold-lt)"],
    ["Election Day", pc1(sd.election_day_rate), "var(--camp-lt)"],
    ["Early Vote", pc1(sd.early_vote_rate), "#6FA8D6"],
    ["Republican %", pc1(sd.rep_pct), "var(--base-lt)"],
    ["Unaffiliated %", pc1(sd.una_pct), "#8AA0BC"],
    ["Veteran L2", fmt(sd.veteran_l2), "var(--fg)"],
    ["Business L2", fmt(sd.business_l2), "var(--fg)"],
  ].map(([k, v, c]) => `<div class="dpanel-row"><span class="k">${k}</span><span class="r-num" style="font-size:15px;color:${c};">${v}</span></div>`).join("");

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
    vhead("District Profile · Mapped", "var(--teal-lt)", "Analysis", "Aggregate SOTS + L2") +
    `<div class="wpanel cols-4" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">${kpis}</div>

    <div class="console-card">
      <div class="console-head">
        <span class="rlabel">District Map · Voter Texture<span class="rlabel" style="color:var(--fg-dim);margin-left:8px;">recolor by trait · click a town</span></span>
        <div class="seg">${metricBtns}</div>
      </div>
      <div class="console-body" style="display:grid;grid-template-columns:1.7fr 1fr;">
        <div class="amap-wrap" style="position:relative;border-right:1px solid var(--border);">
          <div id="amap" style="height:600px;border:0;border-radius:0;"></div>
          <div id="amap-legend" class="amap-legend"></div>
        </div>
        <div style="padding:18px;">
          <div style="background:rgba(15,33,64,.6);border:1px solid var(--border-strong);border-radius:8px;padding:16px 18px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <span class="r-num" style="font-size:22px;color:var(--fg);">${analysisTown || "—"}</span>
              <span class="rlabel" style="color:${ms.hex};">${METRIC_SHORT[metric.key]}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px;">${detailRows}</div>
          </div>
          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px;">
            <span class="rlabel">Town Rank</span><span class="rlabel" style="color:${ms.hex};">${METRIC_SHORT[metric.key]}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">${rankRows}</div>
        </div>
      </div>
    </div>

    <div class="vbanner" style="margin-top:16px;"><span class="tag" style="font-size:10px;color:var(--gold);">Not in L2 build</span><span class="kicker" style="text-transform:none;letter-spacing:0;font-family:var(--ff-body);font-size:10.5px;">Average income, language, homeowner and family signals are not in the current SOTS/L2 extract — wire them once the vendor file lands. Aggregate signals only; no voter-level records shown.</span></div>`;

  view.querySelectorAll("[data-analysis-metric]").forEach(btn => btn.onclick = () => { analysisMetric = btn.dataset.analysisMetric; route(); });
  view.querySelectorAll("[data-atown]").forEach(eln => {
    const go = () => selectAnalysisTown(eln.dataset.atown);
    eln.onclick = go;
    eln.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
  });
  setTimeout(() => analysisMap("amap", rows, metric, analysisTown), 30);
};

function analysisMap(id, rows, metric, selTown) {
  const host = document.getElementById(id);
  if (!host || !GEO || !GEO.towns || !rows || !rows.length) return;
  const byTown = Object.fromEntries(rows.map(t => [t.town, t]));
  const ms = METRIC_STYLE[metric.key] || METRIC_STYLE.age_50_plus_rate;
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

/* ───────────────── TARGETS · LIKELY 2026 VOTER ───────────────── */
let targetSel = null, targetMetric = "R", tuApplyStyles = null;
const TGT_METRICS = [
  { key: "R", label: "R Targets", get: t => t.R, rgb: [207, 65, 51], hex: "#F06A5A", note: "Republican targets by town" },
  { key: "U", label: "U Targets", get: t => t.U, rgb: [139, 92, 246], hex: "#A78BFA", note: "Unaffiliated targets by town" },
  { key: "D", label: "D Targets", get: t => t.D, rgb: [59, 130, 246], hex: "#60A5FA", note: "Democratic crossover targets by town" },
  { key: "lift", label: "Turnout Lift", get: t => t.lift, rgb: [212, 160, 23], hex: "#F0B82A", note: "R turnout-lift pool by town" },
];
function tgtRecs() {
  return (TARGET && TARGET.towns ? TARGET.towns : []).map(t => {
    const bp = t.tgt_by_party || { R: 0, U: 0, D: 0 };
    const regR = TOWNS[t.town] ? TOWNS[t.town].party.Republican : 0;
    return { name: t.town, likely: t.likely, target_rate: t.target_rate, reg: TOWNS[t.town] ? TOWNS[t.town].active : 0,
      R: bp.R, U: bp.U, D: bp.D, lift: Math.max(0, regR - bp.R) };
  });
}
function selectTargetTown(name) { targetSel = name; if (tuApplyStyles) tuApplyStyles(); paintTargetSel(); }
function paintTargetSel() {
  const host = document.getElementById("tu-sel"); if (!host) return;
  const r = tgtRecs().find(x => x.name === targetSel); if (!r) return;
  const row = (k, v, c) => `<div class="dpanel-row"><span class="k">${k}</span><span class="r-num" style="font-size:15px;color:${c};">${v}</span></div>`;
  host.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <span class="r-num" style="font-size:24px;color:var(--fg);">${r.name}</span>
      <span class="rlabel" style="color:var(--teal-lt);">${fmt(r.likely)} likely</span>
    </div>
    ${row("R Targets", fmt(r.R), "#F06A5A")}
    ${row("U Targets", fmt(r.U), "#A78BFA")}
    ${row("D Targets", fmt(r.D), "#60A5FA")}
    ${row("Turnout Lift", fmt(r.lift), "#F0B82A")}
    ${row("Active reg.", fmt(r.reg), "var(--fg)")}`;
}
ROUTES.targets = function (view) {
  if (!TARGET) {
    view.innerHTML = vhead("Turnout Model", "var(--gold-lt)", "Universe Not Loaded", "Run build/import_targets.py") +
      `<div class="note info"><div>Turnout model data is not loaded yet. Run <code>python3 build/import_targets.py</code>, then refresh.</div></div>`;
    return;
  }
  const s = TARGET.summary;
  const likely = s.likely_voters;
  const win = TARGET.win_number, plan = TARGET.planning_turnout;
  const cleared = myVotes - win;
  const recs = tgtRecs();
  const byName = Object.fromEntries(recs.map(r => [r.name, r]));
  if (!byName[targetSel]) targetSel = recs.slice().sort((a, b) => b.likely - a.likely)[0] ? recs.slice().sort((a, b) => b.likely - a.likely)[0].name : null;
  if (!TGT_METRICS.some(m => m.key === targetMetric)) targetMetric = "R";
  const M = TGT_METRICS.find(m => m.key === targetMetric);
  const ranked = recs.slice().sort((a, b) => M.get(b) - M.get(a));
  const mmax = Math.max(...ranked.map(t => M.get(t)), 1);
  // Turnout Lift district total: active registered Republicans outside the Likely-Voter universe
  const lift = Math.max(0, (T.party.Republican || 0) - (s.parties.R || 0));

  const kpi = (lab, val, sub, accent, valcol) => `<div class="stat" style="--accent:${accent};"><div class="sl">${lab}</div><div class="sv" style="color:${valcol || "var(--fg)"};">${val}</div><div class="ss">${sub}</div></div>`;
  const crit = (col, items) => items.map(c => `<div style="display:flex;align-items:flex-start;gap:11px;padding:11px 0;border-bottom:1px solid var(--hairline);">
      <span style="color:${col};font-size:14px;flex-shrink:0;line-height:1.3;">✓</span>
      <span style="font-family:var(--ff-body);font-size:13.5px;color:var(--fg);line-height:1.45;">${c}</span></div>`).join("");
  const metricBtns = TGT_METRICS.map(m => `<button class="seg-btn ${m.key === targetMetric ? "on" : ""}" data-tmetric="${m.key}">${m.label}</button>`).join("");
  const rankRows = ranked.map((t, i) => `<div class="prow" data-ttown="${t.name}" role="button" tabindex="0" style="${t.name === targetSel ? "background:rgba(34,170,188,.12);border-color:rgba(34,170,188,.35);" : ""}">
      <span class="r-num" style="font-size:12px;color:var(--fg-muted);width:18px;">${String(i + 1).padStart(2, "0")}</span>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;"><span class="r-num" style="font-size:15px;color:var(--fg);">${t.name}</span><span class="r-num" style="font-size:14px;color:${M.hex};">${fmt(M.get(t))}</span></div>
        <div style="height:5px;border-radius:3px;background:rgba(255,255,255,.06);overflow:hidden;"><div style="height:100%;width:${100 * M.get(t) / mmax}%;background:${M.hex};border-radius:3px;"></div></div>
      </div></div>`).join("");

  view.innerHTML =
    vhead("2026 Turnout Model", "var(--gold-lt)", "Likely 2026 Voter", "Generated " + TARGET.generated_at.slice(0, 10)) +
    `<div class="wpanel cols-4" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px;">
      ${kpi("Likely 2026 Voter", fmt(likely), "the main universe", "var(--teal-lt)", "var(--teal-lt)")}
      ${kpi("Win Number", fmt(win), "50% + 1", "var(--gold)", "var(--gold-lt)")}
      ${kpi("Turnout Plan", fmt(plan), "working assumption", "var(--teal-lt)")}
      ${kpi("Cleared vs Win", (cleared >= 0 ? "+" : "−") + fmt(Math.abs(cleared)), "likely vs win number", cleared >= 0 ? "var(--teal-lt)" : "var(--camp-lt)", cleared >= 0 ? "var(--teal-lt)" : "var(--camp-lt)")}
    </div>

    <div class="console-card" style="margin-bottom:16px;">
      <div class="console-head"><span class="rlabel">District Map · <span style="color:${M.hex};">${M.label}</span></span><div class="seg">${metricBtns}</div></div>
      <div class="console-body" style="display:grid;grid-template-columns:1.6fr 1fr;">
        <div class="amap-wrap" style="position:relative;border-right:1px solid var(--border);">
          <div id="tu-map" style="height:560px;border:0;border-radius:0;background:#0B1A2E;"></div>
          <div id="tu-legend" class="amap-legend"></div>
        </div>
        <div style="padding:18px;">
          <div id="tu-sel" style="background:rgba(15,33,64,.6);border:1px solid var(--border-strong);border-radius:8px;padding:16px 18px;margin-bottom:16px;"></div>
          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px;">
            <span class="rlabel">Town Rank</span><span class="rlabel" style="color:${M.hex};">${M.label}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">${rankRows}</div>
        </div>
      </div>
    </div>

    <div class="vcard" style="padding:20px 22px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
        <span class="rlabel">Who Qualifies as a Likely 2026 Voter</span>
        <span class="rlabel" style="color:var(--fg-dim);">enters if any hold</span>
      </div>
      <div class="wpanel" style="grid-template-columns:1fr 1fr;gap:0 28px;">
        <div>${crit("var(--teal-lt)", ["Voted in 2022 <b>and</b> at least one other recent election", "Voted in the last two general elections"])}</div>
        <div>${crit("var(--teal-lt)", ["Voted in 3 of 4 or 4 of 4 recent generals", "New mover or new registrant who has already voted"])}</div>
      </div>
    </div>

    <div class="vcard" style="padding:0;overflow:hidden;margin-top:16px;border-color:rgba(207,65,51,.35);">
      <div style="display:flex;align-items:center;gap:16px;padding:20px 22px;background:linear-gradient(90deg,rgba(207,65,51,.10),transparent);border-bottom:1px solid var(--border);">
        <div style="flex:1;">
          <div class="rlabel" style="color:var(--camp-lt);">Turnout Lift · GOTV Expansion</div>
          <div style="font-family:var(--ff-body);font-size:12.5px;color:var(--fg-muted);margin-top:5px;max-width:52ch;line-height:1.5;">A separate mobilization pool: active Republicans who are <b style="color:var(--fg);font-weight:600;">not</b> in the Likely 2026 Voter universe but have voted at least once since 2021.</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div class="r-num" style="font-size:52px;line-height:.85;color:var(--camp-lt);">${fmt(lift)}</div>
          <div class="rlabel" style="color:var(--fg-muted);margin-top:4px;">registered Republicans</div>
        </div>
      </div>
      <div style="padding:16px 22px 20px;">
        <div class="rlabel" style="margin-bottom:6px;">Qualifies When All Hold</div>
        ${crit("var(--camp-lt)", [
          "Active registration",
          "Registered Republican",
          "Not in the Likely 2026 Voter universe",
          "Voted at least once since 2021 (any election from 2021 onward)",
        ])}
        <div style="font-family:var(--ff-body);font-size:10.5px;color:var(--fg-dim);margin-top:12px;line-height:1.5;">Sized from registered Republicans minus those already modeled as likely; sharpen with a 2021-onward vote-history flag.</div>
      </div>
    </div>

    <div class="vbanner" style="margin-top:16px;"><span class="tag" style="font-size:10px;color:var(--gold);">Model</span><span class="kicker" style="text-transform:none;letter-spacing:0;font-family:var(--ff-body);font-size:10.5px;">Likely 2026 Voter is the planning universe. Turnout Lift is a separate GOTV pool and is not part of it.</span></div>`;

  paintTargetSel();
  view.querySelectorAll("[data-tmetric]").forEach(b => b.onclick = () => { targetMetric = b.dataset.tmetric; route(); });
  view.querySelectorAll("[data-ttown]").forEach(eln => {
    const go = () => selectTargetTown(eln.dataset.ttown);
    eln.onclick = go;
    eln.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
  });
  setTimeout(() => targetUnivMap(recs, byName, M), 30);
};

/* ramp deep-navy → metric hue by value */
function rampTo(v, min, max, rgb) {
  const t = max > min ? (v - min) / (max - min) : .5;
  const lo = [18, 34, 52];
  return `rgb(${lo.map((c, i) => Math.round(c + (rgb[i] - c) * (0.26 + .74 * t))).join(",")})`;
}
/* district map — towns shaded by the selected target metric, click to inspect */
function targetUnivMap(recs, byName, M) {
  const host = document.getElementById("tu-map");
  if (!host || !GEO || !GEO.towns) return;
  const vals = recs.map(r => M.get(r)), lo = Math.min(...vals), hi = Math.max(...vals);
  const map = L.map("tu-map", { scrollWheelZoom: false, attributionControl: false });
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", { maxZoom: 18 }).addTo(map);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", { maxZoom: 18, pane: "markerPane" }).addTo(map);
  map.fitBounds(GEO.bounds, { padding: [26, 26] });
  (window._maps = window._maps || []).push(map);
  const byLayer = {};
  const styleFor = name => { const r = byName[name]; const sel = name === targetSel;
    return { fillColor: r ? rampTo(M.get(r), lo, hi, M.rgb) : "#0F1A2C", fillOpacity: .84,
      color: sel ? "#F0B82A" : "#06111F", weight: sel ? 3 : 1.2 }; };
  const applyOne = name => { if (byLayer[name]) byLayer[name].setStyle(styleFor(name)); };
  tuApplyStyles = () => Object.keys(byLayer).forEach(applyOne);
  const layer = L.geoJSON(GEO.towns, {
    style: f => styleFor(f.properties.town),
    onEachFeature: (f, lyr) => {
      const name = f.properties.town, r = byName[name]; if (!r) return;
      byLayer[name] = lyr;
      lyr.bindTooltip(`<div class="n">${name}</div><div class="v">${fmt(M.get(r))}</div>`, { permanent: true, direction: "center", className: "amap-lbl", opacity: 1 });
      lyr.on({
        click: () => selectTargetTown(name),
        mouseover: e => { if (name !== targetSel) e.target.setStyle({ weight: 3, color: "#F0B82A" }); },
        mouseout: () => applyOne(name),
      });
    }
  }).addTo(map);
  const lg = document.getElementById("tu-legend");
  if (lg) lg.innerHTML = `<div class="rlabel" style="margin-bottom:8px;color:${M.hex};">${M.label}</div>
    <div style="width:150px;height:10px;border-radius:3px;background:linear-gradient(90deg,${rampTo(lo, lo, hi, M.rgb)},${rampTo(hi, lo, hi, M.rgb)});"></div>
    <div style="display:flex;justify-content:space-between;margin-top:5px;"><span class="r-num" style="font-size:10px;color:var(--fg-muted);">${fmt(lo)}</span><span class="r-num" style="font-size:10px;color:var(--fg-muted);">${fmt(hi)}</span></div>`;
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
