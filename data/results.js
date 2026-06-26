/* HD-48 election results — official CT Secretary of the State, Statements of Vote.
   Sources (certified):
     2024: https://portal.ct.gov/-/media/sots/electionservices/statementofvote_pdfs/2024_statement_of_vote.pdf
     2022: https://portal.ct.gov/-/media/sots/electionservices/statementofvote_pdfs/sov_2022.pdf
     2020: https://portal.ct.gov/-/media/sots/electionservices/statementofvote_pdfs/2020-sov.pdf

   Notes:
   - The 48th Assembly District was redrawn in the 2021 redistricting. The CURRENT
     district (Bozrah, Colchester, Franklin, Lebanon) exists from 2022 onward, so the
     State House race is shown for 2022 and 2024 only. (Pre-2022 "District 48" covered
     Colchester, Lebanon, Mansfield & Windham — a different seat — and is not comparable.)
   - State Representative town rows are the HD-48 portion of each town (Lebanon is split).
   - Presidential rows are FULL-TOWN totals — CT does not split president by House
     district — so they are comparable year-to-year but not district-exact.
   - 2024 Rivers totals combine his Democratic + Working Families lines (cross-endorsed).
*/
window.HD48_RESULTS = {
  towns: ["Bozrah", "Colchester", "Franklin", "Lebanon"],
  order: ["house_2024", "house_2022", "pres_2024", "pres_2020"],
  compare: { house_2024: "house_2022", pres_2024: "pres_2020" },
  races: {
    house_2024: {
      label: "State House · 2024", office: "State Representative · District 48", year: 2024, kind: "House",
      dem: { name: "Christopher Rivers" }, rep: { name: "Mark DeCaprio" }, scope: "HD-48 returns",
      towns: { Bozrah: { d: 658, r: 861 }, Colchester: { d: 4718, r: 4348 }, Franklin: { d: 491, r: 664 }, Lebanon: { d: 1143, r: 1633 } }
    },
    house_2022: {
      label: "State House · 2022", office: "State Representative · District 48", year: 2022, kind: "House",
      dem: { name: "Christopher Rivers" }, rep: { name: "Mark DeCaprio" }, scope: "HD-48 returns",
      towns: { Bozrah: { d: 498, r: 664 }, Colchester: { d: 3664, r: 3393 }, Franklin: { d: 379, r: 535 }, Lebanon: { d: 909, r: 1284 } }
    },
    pres_2024: {
      label: "President · 2024", office: "President", year: 2024, kind: "President",
      dem: { name: "Kamala Harris" }, rep: { name: "Donald Trump" }, scope: "Full-town totals",
      towns: { Bozrah: { d: 685, r: 885 }, Colchester: { d: 4989, r: 4332 }, Franklin: { d: 545, r: 663 }, Lebanon: { d: 2009, r: 2381 } }
    },
    pres_2020: {
      label: "President · 2020", office: "President", year: 2020, kind: "President",
      dem: { name: "Joe Biden" }, rep: { name: "Donald Trump" }, scope: "Full-town totals",
      towns: { Bozrah: { d: 703, r: 817 }, Colchester: { d: 5216, r: 4243 }, Franklin: { d: 553, r: 674 }, Lebanon: { d: 2052, r: 2268 } }
    }
  }
};
