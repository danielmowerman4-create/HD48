# HD48 SOS/L2 Match Ceiling Audit

## Counts

- Active SOTS voters: 18,820
- L2 rows in current extract: 9,955
- Exact L2 to any HD48 SOTS row: 8,907 (89.5% of L2)
- Exact L2 to active HD48 SOTS row: 8,515 (45.2% of active SOTS)
- L2 rows that match inactive SOTS voters: 392
- L2 rows not present in the HD48 SOTS file by voter ID: 1,048
- Active L2 rows not present in the HD48 SOTS file by voter ID: 786

## Ceiling

- The current L2 extract can cover at most 9,955 of 18,820 active SOTS voters, or 52.9%, even with perfect matching.
- A 90% active-district L2 overlay would require roughly 16,938 active matched voters, so this file is short by about 6,983 L2 rows before matching technique matters.

## Tested Fallback

- Safe fallback key tested: first name + last name + birth year + residence ZIP + normalized residence address.
- L2 rows with enough fallback fields among rows not exact-matched to active SOTS: 1,434
- Unique active SOTS recoveries from fallback used by the universe builder: 6
- Ambiguous fallback hits: 0

## L2 Rows Not In HD48 SOTS By ID

- By L2 active flag: A 786, I 262
- By L2 current State House District: 048 1,048
- By residence city: COLCHESTER 599, LEBANON 207, BOZRAH 138, NORTH FRANKLIN 95, N FRANKLIN 6, GILMAN 3

## Recommended Method

1. Keep SOTS as the master eligibility file and require active SOTS status for campaign universes.
2. Match L2 by exact normalized `Voters_StateVoterID` to SOTS `VOTER_ID`.
3. Use the deterministic fallback key above only when the active SOTS voter has no exact L2 row and the name/birth/address match is unique.
4. Do not treat L2-only rows as active campaign voters unless they appear in the current SOTS file.
5. To reach 90% active coverage, request a fresh L2 export seeded from all active HD48 SOTS voter IDs, not a broader town/district query.
