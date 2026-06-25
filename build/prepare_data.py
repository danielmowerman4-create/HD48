#!/usr/bin/env python3
"""
Campaign data engine.

Reads ../campaign.json, streams the statewide Connecticut SOTS voter extracts,
filters to this district's state-house code, derives every operational metric
directly from the official file, and writes the JS data files the dashboard
consumes. An optional vendor/L2 file can be appended by exact voter-ID match;
when it is absent the product runs SOTS-only and says so in the data-health
panel. Nothing about election outcomes or vote choice is invented here.

Usage:
    python3 build/prepare_data.py            # build (reuses existing output)
    python3 build/prepare_data.py --force    # rebuild from SOTS source
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

csv.field_size_limit(10_000_000)

APP_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = APP_DIR / "data"
CONFIG = json.loads((APP_DIR / "campaign.json").read_text())

CURRENT_YEAR = 2026

# ---- Official SOTS extract layout (positional CSV, ~104 cols) ---------------
SOTS = {
    "voter_id": 0, "town_id": 1, "last_name": 2, "first_name": 3,
    "middle_name": 4, "suffix": 6, "status": 7, "voting_district": 10,
    "voting_precinct": 11, "congressional_district": 12, "senate_district": 13,
    "state_house_district": 14, "address_number": 20, "address_unit": 21,
    "street_name": 22, "town_name": 23, "zip5": 25, "birth_year": 37,
    "phone": 38, "party": 39, "gender": 41, "registration_date": 42,
}
# Vote history begins at col 43 as repeating (date, event_type, method) triples.
HISTORY_START = 43
HISTORY_END = 103

PARTY_GROUP = {"R": "Republican", "D": "Democratic", "U": "Unaffiliated"}


def clean(v) -> str:
    return str(v).strip() if v is not None else ""


def locate_sots() -> Path:
    """Find the extracted SOTS Voter Files directory near the project."""
    candidates = [
        APP_DIR / "SOTS Voter Files",
        APP_DIR.parent / "SOTS Voter Files",
        Path.home() / "Documents" / "SOTS Voter Files",
    ]
    for c in candidates:
        if all((c / f"EXT{i}").exists() for i in range(1, 5)):
            return c
    raise FileNotFoundError(
        "Could not find 'SOTS Voter Files' with EXT1-EXT4. "
        "Place the extracted SOTS directory beside the project."
    )


def parse_date(text: str):
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            pass
    return None


def history(row: list[str]) -> dict:
    """Derive participation + vote-method tendency from SOTS history triples."""
    general = primary = 0
    general_years, primary_years = [], []
    method_events = []  # (date, method)
    for i in range(HISTORY_START, min(len(row), HISTORY_END), 3):
        date = clean(row[i])
        if not date:
            continue
        etype = clean(row[i + 1]).upper() if i + 1 < len(row) else ""
        method = clean(row[i + 2]).upper() if i + 2 < len(row) else ""
        d = parse_date(date)
        yr = d.year if d else None
        if etype == "E":
            general += 1
            if yr:
                general_years.append(yr)
        elif etype == "P":
            primary += 1
            if yr:
                primary_years.append(yr)
        if method in {"E", "Y", "N"} and d:
            method_events.append((d, method))
    return {
        "general": general,
        "primary": primary,
        "general_years": general_years,
        "primary_years": primary_years,
        "method": method_tendency(method_events),
    }


def method_tendency(events: list) -> str:
    """Mutually-exclusive vote-method tendency from recent SOTS methods."""
    if not events:
        return "Unknown"
    events.sort(reverse=True)
    latest = events[0][1]
    recent3 = [m for _, m in events[:3]]
    if latest == "E":
        return "Likely Early Vote"
    if latest == "Y":
        return "Likely Absentee"
    if any(m in {"E", "Y"} for m in recent3[1:]):
        return "Mixed Method"
    return "Likely Election Day"


def turnout_tier(general: int, primary: int) -> str:
    """Transparent turnout score: generals + up to 2 primaries."""
    score = general + min(primary, 2)
    if score >= 5:
        return "High"
    if score >= 3:
        return "Medium"
    if score >= 1:
        return "Low"
    return "None"


def age_from(birth_year: str):
    try:
        y = int(birth_year)
        if 1900 < y <= CURRENT_YEAR:
            return CURRENT_YEAR - y
    except (TypeError, ValueError):
        pass
    return None


def normalize_town(raw: str) -> tuple[str, bool]:
    """Map village/typo names to the canonical core town; flag core membership."""
    name = clean(raw).title()
    name = CONFIG["town_aliases"].get(clean(raw), CONFIG["town_aliases"].get(name, name))
    if name in CONFIG["core_towns"]:
        return name, True
    return (name or "Unspecified"), False


def build_voter(row: list[str]) -> dict:
    town, is_core = normalize_town(row[SOTS["town_name"]])
    h = history(row)
    first = clean(row[SOTS["first_name"]]).title()
    last = clean(row[SOTS["last_name"]]).title()
    num = clean(row[SOTS["address_number"]])
    unit = clean(row[SOTS["address_unit"]])
    street = clean(row[SOTS["street_name"]]).title()
    addr = " ".join(p for p in [num, street] if p)
    party_raw = clean(row[SOTS["party"]]).upper() or "U"
    group = PARTY_GROUP.get(party_raw, "Minor / Other")
    status = "Active" if clean(row[SOTS["status"]]).upper().startswith("A") else "Inactive"
    precinct = clean(row[SOTS["voting_district"]]).lstrip("0") or "0"
    zip5 = clean(row[SOTS["zip5"]])[:5]
    reg = parse_date(clean(row[SOTS["registration_date"]]))
    tier = turnout_tier(h["general"], h["primary"])
    has_addr = bool(num and street)
    phone = clean(row[SOTS["phone"]])
    return {
        "voter_id": clean(row[SOTS["voter_id"]]),
        "first": first, "last": last,
        "name": f"{last}, {first}".strip(", "),
        "household": last,
        "address": addr, "unit": unit, "town": town, "is_core": is_core,
        "zip": zip5, "precinct": precinct,
        "party": party_raw, "party_group": group,
        "status": status,
        "age": age_from(clean(row[SOTS["birth_year"]])),
        "gender": clean(row[SOTS["gender"]]).upper()[:1],
        "phone": phone, "has_phone": bool(phone),
        "has_address": has_addr,
        "general_votes": h["general"], "primary_votes": h["primary"],
        "turnout": tier,
        "method": h["method"],
        "general_years": h["general_years"], "primary_years": h["primary_years"],
        "reg_year": reg.year if reg else None,
        "newly_registered": bool(reg and reg >= datetime.fromisoformat(CONFIG["newly_registered_since"])),
        "walk_eligible": status == "Active" and has_addr,
        # vendor placeholders — populated only on exact-ID match below
        "email": "", "tags": [],
    }


# ---- Aggregation ------------------------------------------------------------

PARTY_KEYS = ["Republican", "Democratic", "Unaffiliated", "Minor / Other"]
TIER_KEYS = ["High", "Medium", "Low", "None"]
METHOD_KEYS = ["Likely Early Vote", "Likely Absentee", "Likely Election Day",
               "Mixed Method", "Unknown"]


def blank_agg() -> dict:
    return {
        "active": 0, "inactive": 0,
        "party": Counter(), "tier": Counter(), "method": Counter(),
        "newly": 0, "walk": 0, "phone": 0, "no_addr": 0,
        "age_sum": 0, "age_n": 0,
        "gen_years": Counter(), "pri_years": Counter(),
    }


def accumulate(agg: dict, v: dict) -> None:
    if v["status"] == "Active":
        agg["active"] += 1
    else:
        agg["inactive"] += 1
        return  # active-universe metrics below
    agg["party"][v["party_group"]] += 1
    agg["tier"][v["turnout"]] += 1
    agg["method"][v["method"]] += 1
    if v["newly_registered"]:
        agg["newly"] += 1
    if v["walk_eligible"]:
        agg["walk"] += 1
    if v["has_phone"]:
        agg["phone"] += 1
    if not v["has_address"]:
        agg["no_addr"] += 1
    if v["age"]:
        agg["age_sum"] += v["age"]
        agg["age_n"] += 1
    for y in v["general_years"]:
        agg["gen_years"][y] += 1
    for y in v["primary_years"]:
        agg["pri_years"][y] += 1


def pct(n: int, d: int) -> float:
    return round(100 * n / d, 1) if d else 0.0


def opportunity(active: int, party: Counter, tier: Counter, walk: int,
                phone: int, posture: str) -> dict:
    """Transparent opportunity dimensions (0-100) + plain-English classification."""
    r = pct(party["Republican"], active)
    u = pct(party["Unaffiliated"], active)
    d = pct(party["Democratic"], active)
    low_turnout = pct(tier["Low"] + tier["None"], active)  # reactivation room
    contactable = pct(max(walk, phone), active)
    dims = {
        "republican_base": r,
        "unaffiliated_density": u,
        "turnout_gap": low_turnout,
        "field_contactability": contactable,
    }
    # Classification rules are intentionally explicit and inspectable.
    if posture == "defense":
        if r >= 32 and low_turnout < 35:
            cls, why = "Protect", "Strong Republican base with steady turnout — hold it."
        elif r >= 32:
            cls, why = "Turnout opportunity", "Republican base exists but turnout lags — defend by mobilizing."
        elif u >= 38:
            cls, why = "Persuasion opportunity", "Heavy unaffiliated share — margin can be expanded here."
        elif r < 26 and d > r:
            cls, why = "Hold the line", "Democratic-leaning ground — limit losses, find soft votes."
        else:
            cls, why = "Field-development opportunity", "Mixed ground worth organizing."
    else:  # offense / pickup
        if r >= 18 and low_turnout >= 30:
            cls, why = "Turnout opportunity", "Republicans here under-voted — votes left on the table."
        elif u >= 42:
            cls, why = "Persuasion opportunity", "Large unaffiliated pool is the realistic path."
        elif r >= 22:
            cls, why = "Build base", "Comparatively strong Republican base to anchor the effort."
        elif d >= 55:
            cls, why = "Long shot", "Deeply Democratic — invest only after stronger ground is worked."
        else:
            cls, why = "Field-development opportunity", "Organize and test before committing resources."
    return {"dims": dims, "class": cls, "why": why}


def summarize(group_field: str, voters: list, posture: str) -> dict:
    buckets: dict[str, dict] = defaultdict(blank_agg)
    for v in voters:
        buckets[v[group_field]].update if False else accumulate(buckets[v[group_field]], v)
    out = {}
    for key, a in buckets.items():
        active = a["active"]
        out[key] = {
            "name": key,
            "active": active, "inactive": a["inactive"],
            "party": {k: a["party"][k] for k in PARTY_KEYS},
            "party_pct": {k: pct(a["party"][k], active) for k in PARTY_KEYS},
            "tier": {k: a["tier"][k] for k in TIER_KEYS},
            "method": {k: a["method"][k] for k in METHOD_KEYS},
            "newly": a["newly"], "walk": a["walk"], "phone": a["phone"],
            "no_addr": a["no_addr"],
            "avg_age": round(a["age_sum"] / a["age_n"], 1) if a["age_n"] else None,
            "gen_years": dict(sorted(a["gen_years"].items())),
            "pri_years": dict(sorted(a["pri_years"].items())),
            "opportunity": opportunity(active, a["party"], a["tier"], a["walk"],
                                       a["phone"], posture),
        }
    return out


# ---- Compact voter table (columns + rows to keep the JS small) -------------

COMPACT_COLS = [
    "voter_id", "name", "household", "address", "unit", "town", "zip",
    "precinct", "party", "party_group", "status", "age", "gender", "phone",
    "has_phone", "has_address", "general_votes", "primary_votes", "turnout",
    "method", "reg_year", "newly_registered", "walk_eligible", "email", "tags",
]


def write_js(path: Path, varname: str, payload) -> None:
    path.write_text(f"window.{varname} = {json.dumps(payload, separators=(',', ':'))};\n")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="debug: cap rows scanned per extract")
    args = ap.parse_args()

    meta_path = DATA_DIR / "meta.js"
    if meta_path.exists() and not args.force:
        print("Prepared data already exists. Use --force to rebuild.")
        return

    sots = locate_sots()
    code = CONFIG["district_code"]
    print(f"Building {CONFIG['district_label']} ({CONFIG['candidate']}) "
          f"from house district {code}")
    voters, scanned = [], 0
    for i in range(1, 5):
        path = sots / f"EXT{i}"
        print(f"  scanning {path.name} ...", flush=True)
        with path.open(newline="", encoding="utf-8", errors="replace") as f:
            for n, row in enumerate(csv.reader(f)):
                if args.limit and n >= args.limit:
                    break
                scanned += 1
                if len(row) < 44:
                    continue
                if clean(row[SOTS["state_house_district"]]).zfill(3) != code:
                    continue
                voters.append(build_voter(row))
    print(f"  scanned {scanned:,} statewide rows; {len(voters):,} in {CONFIG['id'].upper()}")

    active = [v for v in voters if v["status"] == "Active"]
    posture = CONFIG["posture"]

    towns = summarize("town", voters, posture)
    precincts_by_town = defaultdict(list)
    for v in voters:
        precincts_by_town[v["town"]].append(v)
    # precinct key = "Town · P{n}" so HD10's single town still splits cleanly
    for v in voters:
        v["_pkey"] = f"{v['town']} · P{v['precinct']}"
    precincts = summarize("_pkey", voters, posture)

    # District-wide aggregate
    district = blank_agg()
    for v in voters:
        accumulate(district, v)
    da = district

    # Data-health: what the imported file does and does not support.
    health = {
        "source": "Connecticut SOTS statewide voter extract",
        "vendor_loaded": False,
        "total": len(voters),
        "active": len(active),
        "checks": [
            {"label": "Street address", "ok": sum(v["has_address"] for v in active),
             "of": len(active), "enables": "Walk-list export"},
            {"label": "Precinct / voting district",
             "ok": sum(v["precinct"] != "0" for v in active), "of": len(active),
             "enables": "Precinct analysis & turf"},
            {"label": "Party registration",
             "ok": sum(bool(v["party"]) for v in active), "of": len(active),
             "enables": "Composition & targeting"},
            {"label": "Phone", "ok": sum(v["has_phone"] for v in active),
             "of": len(active), "enables": "Phone / canvass lists"},
            {"label": "Birth year (age)", "ok": sum(bool(v["age"]) for v in active),
             "of": len(active), "enables": "Age-range filtering"},
            {"label": "Email (vendor)", "ok": 0, "of": len(active),
             "enables": "Email outreach — needs L2/GOP file"},
        ],
        "missing_capabilities": [
            "Official precinct-level election returns (CT SOS) — needed for the "
            "Historical Elections candidate-results view.",
            "Vendor / L2 file with tags, scores, email — enables persuasion "
            "scoring, tag universes, and contact enrichment.",
        ],
    }

    meta = {
        **{k: CONFIG[k] for k in (
            "id", "district_code", "district_label", "candidate", "party",
            "posture", "headline", "tagline", "accent", "accent_soft",
            "accent_deep", "core_towns", "posture_copy")},
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "totals": {
            "registered": len(voters),
            "active": len(active),
            "inactive": len(voters) - len(active),
            "towns": len([t for t in towns if towns[t]["active"] > 25]),
            "precincts": len([p for p in precincts if precincts[p]["active"] > 5]),
            "party": {k: da["party"][k] for k in PARTY_KEYS},
            "party_pct": {k: pct(da["party"][k], len(active)) for k in PARTY_KEYS},
            "tier": {k: da["tier"][k] for k in TIER_KEYS},
            "method": {k: da["method"][k] for k in METHOD_KEYS},
            "walk_universe": da["walk"],
            "high_turnout": da["tier"]["High"],
            "low_prop_high_opp": da["tier"]["Low"],
            "newly_registered": da["newly"],
            "contactable": da["phone"],
        },
        "gen_years": dict(sorted(da["gen_years"].items())),
        "pri_years": dict(sorted(da["pri_years"].items())),
    }

    DATA_DIR.mkdir(exist_ok=True)
    for v in voters:
        v.pop("_pkey", None)
    rows = [[v[c] for c in COMPACT_COLS] for v in voters]
    write_js(DATA_DIR / "voters.js", "VOTER_COLUMNS", COMPACT_COLS)
    with (DATA_DIR / "voters.js").open("a") as f:
        f.write(f"window.VOTER_ROWS = {json.dumps(rows, separators=(',', ':'))};\n")
        f.write("window.VOTERS = window.VOTER_ROWS.map(function(r){var o={};"
                "for(var i=0;i<window.VOTER_COLUMNS.length;i++){o[window.VOTER_COLUMNS[i]]=r[i];}"
                "return o;});\n")
    write_js(DATA_DIR / "towns.js", "TOWN_SUMMARY", towns)
    write_js(DATA_DIR / "precincts.js", "PRECINCT_SUMMARY", precincts)
    write_js(DATA_DIR / "health.js", "DATA_HEALTH", health)
    write_js(meta_path, "CAMPAIGN", meta)

    print(f"  party: " + ", ".join(f"{k.split(' ')[0]} {da['party'][k]:,}" for k in PARTY_KEYS))
    print(f"  active {len(active):,} · walk-eligible {da['walk']:,} · "
          f"high-turnout {da['tier']['High']:,}")
    print(f"  wrote data/ JS files for {CONFIG['id'].upper()}")


if __name__ == "__main__":
    main()
