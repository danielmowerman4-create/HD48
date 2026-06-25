"""
Core-calculation tests: turnout scoring, vote-method tendency, party
normalization, town normalization, history parsing, opportunity classification,
walk-list eligibility, and campaign isolation. Run from the repo root:

    python3 -m pytest tests/ -q
"""
import importlib.util
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("prepare_data", ROOT / "build" / "prepare_data.py")
pd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pd)
CONFIG = json.loads((ROOT / "campaign.json").read_text())


def test_turnout_tier_is_transparent():
    assert pd.turnout_tier(5, 0) == "High"
    assert pd.turnout_tier(3, 2) == "High"      # 3 + min(2,2)=5
    assert pd.turnout_tier(3, 0) == "Medium"
    assert pd.turnout_tier(1, 0) == "Low"
    assert pd.turnout_tier(0, 0) == "None"
    # primaries are capped at +2 so they cannot dominate the score
    assert pd.turnout_tier(0, 9) == "Low"      # 0 + min(9,2) = 2
    assert pd.turnout_tier(3, 9) == "High"     # 3 + 2 = 5


def test_vote_method_tendency():
    from datetime import datetime
    d = datetime
    assert pd.method_tendency([]) == "Unknown"
    assert pd.method_tendency([(d(2024, 11, 5), "E")]) == "Likely Early Vote"
    assert pd.method_tendency([(d(2024, 11, 5), "Y")]) == "Likely Absentee"
    assert pd.method_tendency([(d(2024, 11, 5), "N")]) == "Likely Election Day"
    # recent election-day but earlier early-vote => mixed
    assert pd.method_tendency([(d(2024, 11, 5), "N"), (d(2022, 11, 8), "E")]) == "Mixed Method"


def test_age_from():
    assert pd.age_from("1990") == pd.CURRENT_YEAR - 1990
    assert pd.age_from("") is None
    assert pd.age_from("3000") is None


def test_town_normalization_uses_aliases():
    # every alias must resolve to a declared core town
    for alias, target in CONFIG["town_aliases"].items():
        name, is_core = pd.normalize_town(alias)
        assert name == target
        assert is_core is True
    # an unrelated town is not flagged core
    _, is_core = pd.normalize_town("Hartford")
    assert is_core is False


def test_history_parses_general_and_primary():
    row = [""] * 104
    # (date, type, method) triples from index 43
    row[43:46] = ["11/05/2024", "E", "N"]   # general, election day
    row[46:49] = ["08/13/2024", "P", "E"]   # primary, early vote
    row[49:52] = ["11/08/2022", "E", "Y"]   # general, absentee
    h = pd.history(row)
    assert h["general"] == 2
    assert h["primary"] == 1
    assert 2024 in h["general_years"] and 2022 in h["general_years"]
    assert h["method"] in {"Likely Early Vote", "Mixed Method"}


def test_party_group_mapping():
    assert pd.PARTY_GROUP["R"] == "Republican"
    assert pd.PARTY_GROUP["D"] == "Democratic"
    assert pd.PARTY_GROUP["U"] == "Unaffiliated"
    assert "L" not in pd.PARTY_GROUP  # minor parties fall through to "Minor / Other"


def test_opportunity_is_explainable_and_posture_aware():
    party = Counter({"Republican": 40, "Democratic": 25, "Unaffiliated": 30, "Minor / Other": 5})
    tier = Counter({"High": 60, "Medium": 20, "Low": 15, "None": 5})
    o = pd.opportunity(100, party, tier, walk=90, phone=70, posture="defense")
    assert o["class"] == "Protect"           # strong R, steady turnout
    assert o["dims"]["republican_base"] == 40
    assert o["why"]                           # always carries a reason
    # same ground under an offense posture is framed differently
    o2 = pd.opportunity(100, party, tier, walk=90, phone=70, posture="offense")
    assert o2["class"] in {"Build base", "Turnout opportunity", "Persuasion opportunity"}


def test_walk_eligibility_rule():
    # walk_eligible requires Active status AND a usable street address
    base = ["x"] * 104
    base[pd.SOTS["status"]] = "A"
    base[pd.SOTS["address_number"]] = "12"
    base[pd.SOTS["street_name"]] = "Main St"
    base[pd.SOTS["party"]] = "R"
    base[pd.SOTS["town_name"]] = CONFIG["core_towns"][0]
    v = pd.build_voter(base)
    assert v["walk_eligible"] is True
    base[pd.SOTS["status"]] = "I"
    assert pd.build_voter(base)["walk_eligible"] is False
    base[pd.SOTS["status"]] = "A"
    base[pd.SOTS["address_number"]] = ""
    assert pd.build_voter(base)["walk_eligible"] is False


def test_campaign_isolation():
    # this repo's config targets exactly one district and one candidate
    assert CONFIG["district_code"] in {"048", "010"}
    assert CONFIG["id"] in {"hd48", "hd10"}
    # generated data, if present, must match this district only
    meta_js = ROOT / "data" / "meta.js"
    if meta_js.exists():
        meta = json.loads(meta_js.read_text().split("=", 1)[1].rstrip(";\n"))
        assert meta["district_code"] == CONFIG["district_code"]
        assert meta["id"] == CONFIG["id"]
