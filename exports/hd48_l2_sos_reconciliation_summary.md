# HD48 L2/SOS Reconciliation

## Headline

- L2 rows: 9,955
- Exact L2 rows found anywhere in statewide SOS: 9,562 (96.1% of L2)
- Exact L2 rows that are current active HD48 SOTS voters: 8,515 (45.2% of active HD48 SOTS)
- Current active HD48 SOTS voters: 18,820

## Classification

- exact_current_active_hd48: 8,515
- exact_statewide_not_current_hd48: 655
- l2_only_not_found_statewide: 393
- exact_current_inactive_hd48: 392

## Exact-ID Quality Check For HD48 Matches

- first=True, last=True, birth_year=True: 8,761
- first=True, last=False, birth_year=True: 116
- first=False, last=True, birth_year=True: 18
- first=True, last=True, birth_year=False: 10
- first=False, last=False, birth_year=True: 2

## Fallback Review

- Unique active-HD48 fallback candidates with same name/birth and either same address or unique name/birth: 11
- Safe unique name/birth/address overlays used by the universe builder: 6
- Same-address fallback candidates already covered by exact active L2 overlays: 1
- Same-address fallback candidates reviewed: 7
- Name/birth-only fallback candidates held out for review: 4
- The automatic overlay is limited to active SOTS voters without an exact L2 row and a unique same-name, same-birth-year, same-residential-address L2 row.

## Interpretation

- We can truthfully match 9k+ L2 rows to SOS statewide by exact voter ID.
- We cannot truthfully claim 9k+ current active HD48 L2 overlays from this file.
- The gap is not mostly formatting. It is file composition: the L2 extract includes stale/out-of-district rows and is missing thousands of active HD48 SOTS voters.
- For 90% active-HD48 coverage, request an L2 export seeded from the active HD48 SOTS voter IDs.

CSV audit: `/Users/danielmowerman/Documents/HD48_General_Universe/hd48_l2_sos_reconciliation.csv`