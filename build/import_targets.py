#!/usr/bin/env python3
"""
Import the HD48 2026 modeled target universe into the local dashboard.

The app remains aggregate-first: this script copies the voter-level CSV outputs
into exports/ for local download, then writes data/targets.js with summary
counts for the dashboard UI.
"""
from __future__ import annotations

import argparse
import csv
import json
import shutil
from collections import Counter
from datetime import datetime
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = APP_DIR / "data"
EXPORT_DIR = APP_DIR / "exports"
DEFAULT_SOURCE = Path.home() / "Documents" / "HD48_General_Universe"

PLANNING_TURNOUT = 12_000

FILES = {
    "likely": "hd48_2026_likely_voter_universe.csv",
    "targets": "hd48_2026_likely_voter_targets.csv",
    "persuasion": "hd48_2026_likely_persuasion_targets.csv",
    "dem_crossover": "hd48_2026_likely_democrat_crossover_targets.csv",
    "dem_review": "hd48_2026_likely_democrat_crossover_review_audit.csv",
    "u_it_not_targeted": "hd48_2026_likely_unaffiliated_not_targeted.csv",
    "target_summary": "hd48_2026_likely_voter_target_summary.md",
    "dem_summary": "hd48_2026_likely_democrat_crossover_targets_summary.md",
}

PARTY_LABELS = {
    "R": "Republican",
    "D": "Democratic",
    "U": "Unaffiliated",
    "IT": "Independent",
    "L": "Libertarian",
    "G": "Green",
}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def count_by(rows: list[dict[str, str]], key: str, limit: int | None = None) -> dict[str, int]:
    counts = Counter((row.get(key) or "Unspecified").strip() or "Unspecified" for row in rows)
    items = counts.most_common(limit) if limit else sorted(counts.items())
    return dict(items)


def party_counts(rows: list[dict[str, str]]) -> dict[str, int]:
    counts = Counter((row.get("party") or "Unspecified").strip() or "Unspecified" for row in rows)
    order = ["R", "D", "U", "IT", "L", "G"]
    out = {k: counts.pop(k) for k in order if counts.get(k)}
    out.update(dict(sorted(counts.items())))
    return out


def town_rows(likely: list[dict[str, str]], targets: list[dict[str, str]],
              persuasion: list[dict[str, str]], dem: list[dict[str, str]],
              u_not: list[dict[str, str]]) -> list[dict[str, int | str | float]]:
    likely_by = Counter(row.get("town") or "Unspecified" for row in likely)
    target_by = Counter(row.get("town") or "Unspecified" for row in targets)
    persuasion_by = Counter(row.get("town") or "Unspecified" for row in persuasion)
    dem_by = Counter(row.get("town") or "Unspecified" for row in dem)
    u_not_by = Counter(row.get("town") or "Unspecified" for row in u_not)
    towns = sorted(likely_by, key=lambda t: (-likely_by[t], t))
    return [
        {
            "town": town,
            "likely": likely_by[town],
            "targets": target_by[town],
            "target_rate": round(100 * target_by[town] / likely_by[town], 1) if likely_by[town] else 0,
            "persuasion": persuasion_by[town],
            "dem_crossover": dem_by[town],
            "u_it_not_targeted": u_not_by[town],
        }
        for town in towns
    ]


def l2_matches(rows: list[dict[str, str]]) -> int:
    return sum(1 for row in rows if (row.get("l2_match_flag") or "").upper() == "Y")


def not_targeted_party_counts(likely: list[dict[str, str]], targets: list[dict[str, str]]) -> dict[str, int]:
    target_ids = {row.get("voter_id") for row in targets}
    not_targeted = [row for row in likely if row.get("voter_id") not in target_ids]
    return party_counts(not_targeted)


def copy_exports(source: Path) -> list[dict[str, str]]:
    EXPORT_DIR.mkdir(exist_ok=True)
    copied = []
    labels = {
        "likely": "Likely voter universe",
        "targets": "One target universe",
        "persuasion": "Persuasion targets",
        "dem_crossover": "Democratic crossover targets",
        "dem_review": "Democratic review/listening audit",
        "u_it_not_targeted": "Unaffiliated/Independent not targeted",
        "target_summary": "Target universe summary",
        "dem_summary": "Democratic crossover summary",
    }
    for key, filename in FILES.items():
        src = source / filename
        if not src.exists():
            continue
        dst = EXPORT_DIR / filename
        shutil.copy2(src, dst)
        copied.append({"key": key, "label": labels[key], "href": f"exports/{filename}", "filename": filename})
    return copied


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    args = ap.parse_args()

    source = args.source.expanduser().resolve()
    missing = [name for name in FILES.values() if not (source / name).exists()]
    if missing:
        raise SystemExit(f"Missing source files in {source}: {', '.join(missing)}")

    likely = read_csv(source / FILES["likely"])
    targets = read_csv(source / FILES["targets"])
    persuasion = read_csv(source / FILES["persuasion"])
    dem = read_csv(source / FILES["dem_crossover"])
    u_not = read_csv(source / FILES["u_it_not_targeted"])

    turnout_expected = round(sum(float(row.get("turnout_probability") or 0) for row in likely))
    target_types = count_by(targets, "general_target_type")
    dem_priorities = count_by([row for row in dem if row.get("dem_crossover_priority")], "dem_crossover_priority")

    data = {
        "generated_at": datetime.now().replace(microsecond=0).isoformat(),
        "source_directory": str(source),
        "model": "HD48 2026 general-election likely-voter and target universe",
        "planning_turnout": PLANNING_TURNOUT,
        "win_number": PLANNING_TURNOUT // 2 + 1,
        "summary": {
            "likely_voters": len(likely),
            "expected_turnout_from_probabilities": turnout_expected,
            "targets": len(targets),
            "target_rate": round(100 * len(targets) / len(likely), 1) if likely else 0,
            "persuasion_targets": len(persuasion),
            "dem_crossover_targets": len(dem),
            "u_it_not_targeted": len(u_not),
            "not_targeted": len(likely) - len(targets),
            "target_types": target_types,
            "parties": party_counts(targets),
            "not_targeted_parties": not_targeted_party_counts(likely, targets),
            "turnout_tiers": count_by(targets, "turnout_tier"),
            "support_leans": count_by(targets, "support_lean_r"),
            "contact_priority": count_by(targets, "contact_priority"),
            "dem_crossover_priorities": dem_priorities,
            "l2_match": {
                "likely": l2_matches(likely),
                "targets": l2_matches(targets),
                "dem_crossover": l2_matches(dem),
            },
        },
        "towns": town_rows(likely, targets, persuasion, dem, u_not),
        "exports": copy_exports(source),
        "party_labels": PARTY_LABELS,
        "notes": [
            "Likely voters are turnout tiers Very High, High, and Medium.",
            "The dashboard loads aggregate modeled counts only; voter-level rows are available as local export files.",
            "One target universe includes base GOTV, lean-support persuasion/GOTV, true swing persuasion, and weak Democrat persuasion.",
        ],
    }

    DATA_DIR.mkdir(exist_ok=True)
    (DATA_DIR / "targets.js").write_text(
        "window.TARGET_UNIVERSE = " + json.dumps(data, indent=2, sort_keys=True) + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {DATA_DIR / 'targets.js'}")
    print(f"Copied {len(data['exports'])} files into {EXPORT_DIR}")


if __name__ == "__main__":
    main()
