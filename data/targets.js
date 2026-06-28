window.TARGET_UNIVERSE = {
  "exports": [
    {
      "filename": "hd48_2026_likely_voter_universe.csv",
      "href": "exports/hd48_2026_likely_voter_universe.csv",
      "key": "likely",
      "label": "Likely voter universe"
    },
    {
      "filename": "hd48_2026_likely_voter_targets.csv",
      "href": "exports/hd48_2026_likely_voter_targets.csv",
      "key": "targets",
      "label": "One target universe"
    },
    {
      "filename": "hd48_2026_likely_persuasion_targets.csv",
      "href": "exports/hd48_2026_likely_persuasion_targets.csv",
      "key": "persuasion",
      "label": "Persuasion targets"
    },
    {
      "filename": "hd48_2026_likely_democrat_crossover_targets.csv",
      "href": "exports/hd48_2026_likely_democrat_crossover_targets.csv",
      "key": "dem_crossover",
      "label": "Democratic crossover targets"
    },
    {
      "filename": "hd48_2026_likely_democrat_crossover_review_audit.csv",
      "href": "exports/hd48_2026_likely_democrat_crossover_review_audit.csv",
      "key": "dem_review",
      "label": "Democratic review/listening audit"
    },
    {
      "filename": "hd48_2026_likely_unaffiliated_not_targeted.csv",
      "href": "exports/hd48_2026_likely_unaffiliated_not_targeted.csv",
      "key": "u_it_not_targeted",
      "label": "Unaffiliated/Independent not targeted"
    },
    {
      "filename": "hd48_2026_likely_voter_target_summary.md",
      "href": "exports/hd48_2026_likely_voter_target_summary.md",
      "key": "target_summary",
      "label": "Target universe summary"
    },
    {
      "filename": "hd48_2026_likely_democrat_crossover_targets_summary.md",
      "href": "exports/hd48_2026_likely_democrat_crossover_targets_summary.md",
      "key": "dem_summary",
      "label": "Democratic crossover summary"
    },
    {
      "filename": "hd48_l2_sos_reconciliation.csv",
      "href": "exports/hd48_l2_sos_reconciliation.csv",
      "key": "l2_reconciliation",
      "label": "L2/SOTS reconciliation audit"
    },
    {
      "filename": "hd48_l2_sos_reconciliation_summary.md",
      "href": "exports/hd48_l2_sos_reconciliation_summary.md",
      "key": "l2_reconciliation_summary",
      "label": "L2/SOTS reconciliation summary"
    },
    {
      "filename": "hd48_l2_sos_match_ceiling.md",
      "href": "exports/hd48_l2_sos_match_ceiling.md",
      "key": "l2_match_ceiling",
      "label": "L2/SOTS match ceiling"
    }
  ],
  "generated_at": "2026-06-27T21:26:06",
  "model": "HD48 2026 general-election likely-voter and target universe",
  "notes": [
    "Likely voters are turnout tiers Very High, High, and Medium.",
    "The dashboard loads aggregate modeled counts only; voter-level rows are available as local export files.",
    "One target universe includes base GOTV, lean-support persuasion/GOTV, true swing persuasion, and weak Democrat persuasion."
  ],
  "party_labels": {
    "D": "Democratic",
    "G": "Green",
    "IT": "Independent",
    "L": "Libertarian",
    "R": "Republican",
    "U": "Unaffiliated"
  },
  "planning_turnout": 12000,
  "source_directory": "/Users/danielmowerman/Documents/HD48_General_Universe",
  "summary": {
    "contact_priority": {
      "High": 7242,
      "Medium": 714
    },
    "dem_crossover_priorities": {
      "A - Strong D Crossover": 17,
      "B - Solid D Crossover": 79,
      "C - Soft D Crossover": 112
    },
    "dem_crossover_targets": 208,
    "expected_turnout_from_probabilities": 10610,
    "l2_match": {
      "dem_crossover": 208,
      "likely": 5877,
      "targets": 3690
    },
    "likely_voters": 12030,
    "not_targeted": 4074,
    "not_targeted_parties": {
      "D": 3459,
      "G": 3,
      "IT": 21,
      "U": 586,
      "Worki": 5
    },
    "parties": {
      "D": 208,
      "G": 1,
      "IT": 159,
      "L": 25,
      "R": 3451,
      "U": 4112
    },
    "persuasion_targets": 4162,
    "support_leans": {
      "Lean Opposition": 167,
      "Lean Support": 2129,
      "Soft Opposition": 36,
      "Soft Support": 1815,
      "Strong Support": 1457,
      "Swing / Unknown": 2352
    },
    "target_rate": 66.1,
    "target_types": {
      "Base GOTV": 3586,
      "Lean Support Persuasion/GOTV": 1814,
      "True Swing Persuasion": 2348,
      "Weak Democrat Persuasion": 208
    },
    "targets": 7956,
    "turnout_tiers": {
      "High": 1507,
      "Medium": 1465,
      "Very High": 4984
    },
    "u_it_not_targeted": 607
  },
  "towns": [
    {
      "dem_crossover": 68,
      "likely": 7525,
      "persuasion": 2614,
      "target_rate": 63.2,
      "targets": 4759,
      "town": "Colchester",
      "u_it_not_targeted": 417
    },
    {
      "dem_crossover": 61,
      "likely": 2297,
      "persuasion": 798,
      "target_rate": 71.4,
      "targets": 1639,
      "town": "Lebanon",
      "u_it_not_targeted": 107
    },
    {
      "dem_crossover": 42,
      "likely": 1237,
      "persuasion": 410,
      "target_rate": 67.9,
      "targets": 840,
      "town": "Bozrah",
      "u_it_not_targeted": 49
    },
    {
      "dem_crossover": 37,
      "likely": 971,
      "persuasion": 340,
      "target_rate": 73.9,
      "targets": 718,
      "town": "Franklin",
      "u_it_not_targeted": 34
    }
  ],
  "win_number": 6001
};
