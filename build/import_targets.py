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
    "l2_reconciliation": "hd48_l2_sos_reconciliation.csv",
    "l2_reconciliation_summary": "hd48_l2_sos_reconciliation_summary.md",
    "l2_match_ceiling": "hd48_l2_sos_match_ceiling.md",
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


def pct(n: int | float, d: int | float) -> float:
    return round(100 * n / d, 1) if d else 0


def top_counts(rows: list[dict[str, str]], key: str, limit: int = 8) -> dict[str, int]:
    counts = Counter((row.get(key) or "").strip() or "Unspecified" for row in rows)
    counts.pop("Unspecified", None)
    return dict(counts.most_common(limit))


def split_l2_signals(value: str) -> list[str]:
    signals = []
    for part in (value or "").split(";"):
        signal = part.strip()
        if not signal:
            continue
        if signal.startswith("raw weak total"):
            signal = "Raw weak ensemble score"
        elif signal.endswith(")") and " (" in signal:
            signal = signal.rsplit(" (", 1)[0].strip()
        signals.append(signal)
    return signals


def top_split_signals(rows: list[dict[str, str]], key: str, limit: int = 10) -> dict[str, int]:
    counts: Counter[str] = Counter()
    for row in rows:
        counts.update(split_l2_signals(row.get(key, "")))
    counts.pop("Unspecified", None)
    return dict(counts.most_common(limit))


def age_band(row: dict[str, str]) -> str:
    try:
        age = int(float(row.get("age_2026_est") or ""))
    except ValueError:
        return "Unknown"
    if age < 35:
        return "18-34"
    if age < 50:
        return "35-49"
    if age < 65:
        return "50-64"
    if age < 80:
        return "65-79"
    return "80+"


def build_analysis(likely: list[dict[str, str]], targets: list[dict[str, str]],
                   persuasion: list[dict[str, str]], dem: list[dict[str, str]],
                   towns: list[dict[str, int | str | float]]) -> dict[str, object]:
    target_types = Counter(row.get("general_target_type") or "Unspecified" for row in targets)
    base = target_types["Base GOTV"]
    lean = target_types["Lean Support Persuasion/GOTV"]
    true_swing = target_types["True Swing Persuasion"]
    weak_d = target_types["Weak Democrat Persuasion"]
    win = PLANNING_TURNOUT // 2 + 1
    target_count = len(targets)

    town_type_counts: dict[str, Counter[str]] = {}
    for row in targets:
        town_type_counts.setdefault(row.get("town") or "Unspecified", Counter())[row.get("general_target_type") or "Unspecified"] += 1
    town_strategy = []
    for row in towns:
        town = str(row["town"])
        types = town_type_counts.get(town, Counter())
        likely_count = int(row["likely"])
        town_targets = int(row["targets"])
        persuasion_count = int(row["persuasion"])
        town_strategy.append({
            "town": town,
            "likely": likely_count,
            "targets": town_targets,
            "target_rate": row["target_rate"],
            "target_share": pct(town_targets, target_count),
            "persuasion": persuasion_count,
            "persuasion_share": pct(persuasion_count, len(persuasion)),
            "base_gotv": types["Base GOTV"],
            "lean_support": types["Lean Support Persuasion/GOTV"],
            "true_swing": types["True Swing Persuasion"],
            "weak_dem": types["Weak Democrat Persuasion"],
        })

    segments = []
    for label in ["Base GOTV", "Lean Support Persuasion/GOTV", "True Swing Persuasion", "Weak Democrat Persuasion"]:
        rows = [row for row in targets if row.get("general_target_type") == label]
        segments.append({
            "segment": label,
            "count": len(rows),
            "vote_methods": count_by(rows, "vote_method_tendency", 4),
            "household_party": top_counts(rows, "household_party_signal", 5),
            "consumer_signals": top_split_signals(rows, "expanded_l2_signal", 5),
            "context_signals": top_split_signals(rows, "weak_context_signal", 5),
        })

    return {
        "vote_path": {
            "win_number": win,
            "planning_turnout": PLANNING_TURNOUT,
            "likely_voters": len(likely),
            "targets": target_count,
            "target_overage": target_count - win,
            "base_gotv": base,
            "base_share_of_win": pct(base, win),
            "gap_after_base": max(0, win - base),
            "base_plus_lean": base + lean,
            "gap_after_base_plus_lean": max(0, win - base - lean),
            "persuasion_core": len(persuasion),
            "true_swing": true_swing,
            "weak_dem": weak_d,
        },
        "program_mix": [
            {"label": "Base GOTV", "count": base, "share": pct(base, target_count), "role": "protect"},
            {"label": "Lean Support Persuasion/GOTV", "count": lean, "share": pct(lean, target_count), "role": "secure"},
            {"label": "True Swing Persuasion", "count": true_swing, "share": pct(true_swing, target_count), "role": "convert"},
            {"label": "Weak Democrat Persuasion", "count": weak_d, "share": pct(weak_d, target_count), "role": "cross-pressured"},
        ],
        "town_strategy": town_strategy,
        "consumer": {
            "age_bands": dict(Counter(age_band(row) for row in targets).most_common()),
            "vote_methods": count_by(targets, "vote_method_tendency"),
            "household_party": top_counts(targets, "household_party_signal", 8),
            "issue_signals": top_split_signals(targets, "issue_political_signal", 10),
            "expanded_l2_signals": top_split_signals(targets, "expanded_l2_signal", 10),
            "context_signals": top_split_signals(targets, "weak_context_signal", 8),
            "commercial_signals": top_split_signals(targets, "l2_weak_feature_signal", 12),
            "segments": segments,
            "reads": [
                "The target universe is older and highly habitual: 63% are 50+, and nearly all targets sit in Very High, High, or Medium turnout tiers.",
                "The persuasion universe is not a generic middle: L2 texture points to outdoor, gun-owner, veteran, business-owner, and blue-collar/commercial-interest clusters.",
                "Colchester carries the largest true-swing load; Lebanon, Bozrah, and Franklin are more base/lean-support protection environments.",
                "Election Day and early vote are both large enough to need separate programs; do not let early-vote banking cannibalize Election Day base protection.",
            ],
        },
    }


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
        "l2_reconciliation": "L2/SOTS reconciliation audit",
        "l2_reconciliation_summary": "L2/SOTS reconciliation summary",
        "l2_match_ceiling": "L2/SOTS match ceiling",
    }
    for key, filename in FILES.items():
        src = source / filename
        if not src.exists():
            continue
        dst = EXPORT_DIR / filename
        shutil.copy2(src, dst)
        if not filename.lower().endswith(".csv"):
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
            "The public dashboard loads aggregate modeled counts only; voter-level exports are intentionally not linked.",
            "One target universe includes base GOTV, lean-support persuasion/GOTV, true swing persuasion, and weak Democrat persuasion.",
        ],
    }
    data["analysis"] = build_analysis(likely, targets, persuasion, dem, data["towns"])

    DATA_DIR.mkdir(exist_ok=True)
    (DATA_DIR / "targets.js").write_text(
        "window.TARGET_UNIVERSE = " + json.dumps(data, indent=2, sort_keys=True) + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {DATA_DIR / 'targets.js'}")
    print(f"Copied {len(data['exports'])} files into {EXPORT_DIR}")


if __name__ == "__main__":
    main()
