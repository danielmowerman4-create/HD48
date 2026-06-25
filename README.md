# HD 48 · Mark DeCaprio — Campaign Intelligence

A standalone, browser-based campaign intelligence dashboard for **Connecticut
State House District 48** (Colchester, Lebanon, Bozrah, Franklin). General-election
**defense** posture for the incumbent Republican.

It runs entirely on your computer. The official Connecticut SOTS statewide voter
file is the master source; every metric shown is derived from that file. No voter
data is uploaded anywhere, and nothing about election outcomes or vote choice is
invented — vote choice is secret and is never claimed here.

This product is a sibling of the HD 10 dashboard. The two are deliberately
separate repos so campaign data can never blend between districts.

## 1. Prepare the data

Place the extracted **`SOTS Voter Files/`** directory (containing `EXT1`–`EXT4`)
beside this folder or in `~/Documents`, then:

```bash
python3 build/prepare_data.py --force     # streams ~2.5M statewide rows, filters to HD48
python3 build/build_geometry.py           # writes town polygons for the map
```

This writes the `data/*.js` files the dashboard reads:
`meta.js`, `voters.js`, `towns.js`, `precincts.js`, `health.js`, `geometry.js`.

Requires `geopandas` for the geometry step (`pip install geopandas`). The data
step is pure standard-library Python.

## 2. Open the dashboard

```bash
./serve.command          # → http://localhost:8048/
```

(Use the local server, not `file://`, so the browser can load the data files.)

## 3. What's inside

| Section | What it answers |
|---|---|
| **Overview** | Active universe, party composition, turnout, "what the district is telling us" |
| **Geography** | Town & precinct tables + choropleth map, drill-downs |
| **Historical Elections** | SOTS participation timeline (turnout proxy); slot for official CT SOS returns |
| **Voter Universe** | Fast, filterable table with named universes + CSV/XLSX export |
| **Opportunity** | Transparent, explainable scoring → Protect / Turnout / Persuasion / Field |
| **Walk Lists** | Filterable canvass-list builder with CSV/XLSX export + print view |
| **Data Health** | Field coverage, loaded datasets, what's still needed. CSV/XLSX/XLS only — no PDF |

## 4. Data rules

- SOTS is the master file. A vendor/L2 file is **append-only**, matched by exact
  voter ID. None is loaded yet — the workspace runs SOTS-only and says so.
- Turnout tier = generals + up to 2 primaries (5+ High, 3–4 Medium, 1–2 Low).
- Vote-method tendency comes from the most recent SOTS method on record.
- The "Historical Elections" candidate-results view stays empty until official
  CT SOS precinct/town returns are imported. No results are fabricated.

## 5. Tests

```bash
python3 -m pytest tests/ -q
```

Covers turnout scoring, vote-method tendency, town/party normalization, history
parsing, opportunity classification, walk-list eligibility, and campaign isolation.
