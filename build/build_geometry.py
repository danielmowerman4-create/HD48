#!/usr/bin/env python3
"""
Build data/geometry.js from the bundled CT TIGER county-subdivision (town)
shapefile, clipped to this campaign's core towns. Town polygons are the
reliable geographic unit for Connecticut; precinct polygons are only emitted
when a precinct shapefile is supplied (the dashboard degrades gracefully to
non-map precinct views otherwise).

Usage: python3 build/build_geometry.py
"""
from __future__ import annotations
import json
from pathlib import Path

import geopandas as gpd

APP_DIR = Path(__file__).resolve().parent.parent
CONFIG = json.loads((APP_DIR / "campaign.json").read_text())
SHP = APP_DIR / "build" / "geo" / "tl_2023_09_cousub.shp"


def main() -> None:
    g = gpd.read_file(SHP).to_crs(4326)
    towns = CONFIG["core_towns"]
    sub = g[g["NAME"].isin(towns)][["NAME", "geometry"]].copy()
    # light simplification keeps the file small without visible distortion
    sub["geometry"] = sub["geometry"].simplify(0.0003, preserve_topology=True)
    features = []
    for _, rec in sub.iterrows():
        geom = json.loads(gpd.GeoSeries([rec["geometry"]], crs=4326).to_json())
        features.append({
            "type": "Feature",
            "properties": {"town": rec["NAME"]},
            "geometry": geom["features"][0]["geometry"],
        })
    fc = {"type": "FeatureCollection", "features": features}
    bounds = sub.total_bounds  # minx, miny, maxx, maxy
    payload = {
        "towns": fc,
        "bounds": [[float(bounds[1]), float(bounds[0])],
                   [float(bounds[3]), float(bounds[2])]],
        "has_precincts": False,
    }
    out = APP_DIR / "data" / "geometry.js"
    out.write_text("window.GEOMETRY = " + json.dumps(payload, separators=(",", ":")) + ";\n")
    print(f"wrote {out} with {len(features)} town polygons "
          f"({', '.join(sorted(sub['NAME']))})")


if __name__ == "__main__":
    main()
