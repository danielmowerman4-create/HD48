/* HD-48 election results — official CT Secretary of the State, Election Night Reporting
   (ctemspublic.tgstg.net), extracted per town for Bozrah, Colchester, Franklin & Lebanon.

   Notes:
   - Presidential & Governor rows are FULL-TOWN totals (statewide offices).
   - State House rows are the HD-48 portion of each town. Lebanon is split across House
     districts by block, so its State House number is only the HD-48 slice of the town
     (full-town Lebanon is larger — see the presidential/governor rows).
   - First Selectman rows are MUNICIPAL: each town runs its own race, so they store the
     town's own top-two candidates (a = winner, b = runner-up) with party. Many are
     unopposed, cross-endorsed, or D-vs-petitioning; Lebanon held no 2023 race.
   - Cross-endorsed lines (e.g. Democratic + Working Families) are summed per candidate.
   - P = petitioning candidate, I = independent/other. Two-party partisan margins use
     the Democratic and Republican nominee totals.
*/
window.RESULTS = {
  note: "Official CT SOTS election-night returns (ctemspublic). Presidential & governor rows are full-town; State House is the HD-48 portion (Lebanon is split by block); First Selectman rows are municipal, by town.",
  towns: ["Bozrah", "Colchester", "Franklin", "Lebanon"],
  order: ["pres_2020", "house_2022", "pres_2024", "house_2024"],
  compare: { pres_2020: "pres_2016", pres_2024: "pres_2020", gov_2022: "gov_2018", house_2024: "house_2022", fs_2019: "fs_2017", fs_2021: "fs_2019", fs_2023: "fs_2021", fs_2025: "fs_2023" },
  groups: [
    { office: "President", keys: ["pres_2016", "pres_2020", "pres_2024"] },
    { office: "Governor", keys: ["gov_2018", "gov_2022"] },
    { office: "State House · HD-48", keys: ["house_2022", "house_2024"] },
    { office: "First Selectman", keys: ["fs_2017", "fs_2019", "fs_2021", "fs_2023", "fs_2025"] }
  ],
  races: {
    pres_2016: { label: "President · 2016", office: "President", group: "President", year: 2016, kind: "President", scope: "Full-town totals",
      rep: { name: "Trump" }, dem: { name: "Clinton" },
      towns: { Bozrah: { d: 536, r: 764 }, Colchester: { d: 3898, r: 4108 }, Franklin: { d: 413, r: 613 }, Lebanon: { d: 1583, r: 2115 } } },
    pres_2020: { label: "President · 2020", office: "President", group: "President", year: 2020, kind: "President", scope: "Full-town totals",
      rep: { name: "Trump" }, dem: { name: "Biden" },
      towns: { Bozrah: { d: 703, r: 817 }, Colchester: { d: 5216, r: 4243 }, Franklin: { d: 553, r: 674 }, Lebanon: { d: 2052, r: 2268 } } },
    pres_2024: { label: "President · 2024", office: "President", group: "President", year: 2024, kind: "President", scope: "Full-town totals",
      rep: { name: "Trump" }, dem: { name: "Harris" },
      towns: { Bozrah: { d: 685, r: 885 }, Colchester: { d: 5002, r: 4332 }, Franklin: { d: 545, r: 663 }, Lebanon: { d: 2009, r: 2381 } } },
    gov_2018: { label: "Governor · 2018", office: "Governor", group: "Governor", year: 2018, kind: "Governor", scope: "Full-town totals",
      rep: { name: "Stefanowski" }, dem: { name: "Lamont" },
      towns: { Bozrah: { d: 420, r: 667 }, Colchester: { d: 3221, r: 3817 }, Franklin: { d: 368, r: 530 }, Lebanon: { d: 1351, r: 1867 } } },
    gov_2022: { label: "Governor · 2022", office: "Governor", group: "Governor", year: 2022, kind: "Governor", scope: "Full-town totals",
      rep: { name: "Stefanowski" }, dem: { name: "Lamont" },
      towns: { Bozrah: { d: 498, r: 676 }, Colchester: { d: 3809, r: 3339 }, Franklin: { d: 391, r: 526 }, Lebanon: { d: 1435, r: 1857 } } },
    house_2022: { label: "State House · 2022", office: "State Representative · District 48", group: "State Representative · District 48", year: 2022, kind: "House", scope: "HD-48 returns", splitTowns: ["Lebanon"],
      rep: { name: "DeCaprio" }, dem: { name: "Rivers" },
      towns: { Bozrah: { d: 498, r: 664 }, Colchester: { d: 3664, r: 3393 }, Franklin: { d: 379, r: 535 }, Lebanon: { d: 909, r: 1284 } } },
    house_2024: { label: "State House · 2024", office: "State Representative · District 48", group: "State Representative · District 48", year: 2024, kind: "House", scope: "HD-48 returns", splitTowns: ["Lebanon"],
      rep: { name: "DeCaprio" }, dem: { name: "Rivers" },
      towns: { Bozrah: { d: 658, r: 861 }, Colchester: { d: 4726, r: 4348 }, Franklin: { d: 491, r: 664 }, Lebanon: { d: 1143, r: 1633 } } },
    fs_2017: { label: "First Selectman · 2017", office: "First Selectman", group: "First Selectman", year: 2017, kind: "Municipal", municipal: true, scope: "Municipal · by town",
      towns: { Bozrah: { a: { n: "Pianka", p: "D", v: 322 }, b: { n: "Gilman", p: "R", v: 175 } }, Colchester: { a: { n: "Shilosky", p: "D", v: 2412 }, b: { n: "McNair 11", p: "WI", v: 218 } }, Franklin: { a: { n: "Grant, II", p: "D", v: 402 }, b: { n: "Levasseur", p: "PC", v: 126 } }, Lebanon: { a: { n: "Petrie", p: "R", v: 1039 }, b: { n: "Spedaliere", p: "D", v: 557 } } } },
    fs_2019: { label: "First Selectman · 2019", office: "First Selectman", group: "First Selectman", year: 2019, kind: "Municipal", municipal: true, scope: "Municipal · by town",
      towns: { Bozrah: { a: { n: "Zorn", p: "R", v: 322 }, b: { n: "Pianka", p: "D", v: 292 } }, Colchester: { a: { n: "Bylone", p: "D", v: 2143 }, b: { n: "Shilosky", p: "R", v: 1862 } }, Franklin: { a: { n: "Grant", p: "D", v: 319 }, b: { n: "—", p: "I", v: 0 } }, Lebanon: { a: { n: "Cwikla", p: "D", v: 1102 }, b: { n: "Nowosad", p: "PC", v: 778 } } } },
    fs_2021: { label: "First Selectman · 2021", office: "First Selectman", group: "First Selectman", year: 2021, kind: "Municipal", municipal: true, scope: "Municipal · by town",
      towns: { Bozrah: { a: { n: "Pianka", p: "D", v: 371 }, b: { n: "Tarasevich", p: "R", v: 287 } }, Colchester: { a: { n: "Bisbikos", p: "R", v: 2783 }, b: { n: "Bylone", p: "D", v: 2466 } }, Franklin: { a: { n: "Grant", p: "D", v: 334 }, b: { n: "—", p: "I", v: 0 } }, Lebanon: { a: { n: "Cwikla", p: "D", v: 904 }, b: { n: "Lathrop", p: "R", v: 731 } } } },
    fs_2023: { label: "First Selectman · 2023", office: "First Selectman", group: "First Selectman", year: 2023, kind: "Municipal", municipal: true, scope: "Municipal · by town",
      towns: { Bozrah: { a: { n: "Pianka", p: "D", v: 446 }, b: { n: "—", p: "I", v: 0 } }, Colchester: { a: { n: "Dennler", p: "D", v: 3515 }, b: { n: "Bisbikos", p: "R", v: 1887 } }, Franklin: { a: { n: "Miner", p: "R", v: 438 }, b: { n: "Grant", p: "D", v: 289 } } } },
    fs_2025: { label: "First Selectman · 2025", office: "First Selectman", group: "First Selectman", year: 2025, kind: "Municipal", municipal: true, scope: "Municipal · by town",
      towns: { Bozrah: { a: { n: "Pianka", p: "R", v: 510 }, b: { n: "—", p: "I", v: 0 } }, Colchester: { a: { n: "Dennler", p: "D", v: 3329 }, b: { n: "Thomas", p: "R", v: 1516 } }, Franklin: { a: { n: "Novosad", p: "R", v: 376 }, b: { n: "Curran", p: "PC", v: 269 } }, Lebanon: { a: { n: "Smith", p: "D", v: 1470 }, b: { n: "—", p: "I", v: 0 } } } },
  }
};
