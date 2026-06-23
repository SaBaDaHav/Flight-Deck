# Flight Deck — Handoff Notes
## For Next Claude Session

---

## Project Status
Live app: https://sabadahav.github.io/Flight-Deck/
Repo: https://github.com/SaBaDaHav/Flight-Deck
Local: C:\Users\sk118\Desktop\Flight-Deck
Full brief: CLAUDE.md in project root (gitignored)

---

## All Fixes & Features (Complete History)

1. Block time 100:10 → 84:00 — route DB fallback in stats useMemo
2. 20,000 THB ค่าฝึกอบรม — flat monthly deduction
3. Ground training included in transport — verified March 2026 payslip
4. Payment month passed to calcMonthlyPay
5. DOM per diem 500 THB — included in perDiem total
6. INTER block classification — route field fallback for mobile entries
7. ESLint — 0 errors 0 warnings maintained
8. March 2026 validated — 406,561 THB exact
9. Mobile duplicate entries — deduplicate by date
10. Missing legs detection — uses sectors/from/to
11. Tax estimator — empirical calibration Jan-Apr payslips
12. Total block column added to Allowance table footer
13. Swap/Giveaway FTL Checker — full multi-day swap analysis with pay delta
14. Actual block time entry — per-leg off/on-block in EditEntryModal, FTL tracking only
15. RosterAnalyser cumulative bars — actualBlockMins → blockMins → scheduledBlock priority
16. Plain-language FTL explanations in DayModal — warning/violation/PSWM
17. HR Sheet upload — AI reads DOM/INT HR into Allowance columns
18. Δ THB and discrepancy panel hidden until HR scheduled values entered
19. Logbook upload — reads actual Flight Time from past Merlot rosters
20. Annual block hours view — month-by-month bar, 1,000h limit tracking
21. Export/Import backup — JSON file, bottom bar buttons
22. Timezone-aware FDP calculation — release time converted to departure station local time (src/constants/airport-timezones.js, all TVJ destinations covered)
23. Auto-detect releaseNextDay when release < report time
24. Desktop Roster auto-populates actualBlockMins for past months
25. Time input auto-format — type 0225 → 02:25
26. Cross-month overwrite bug fixed — roster upload only saves entries belonging to target month, other months only written if empty
27. Cumulative limits in DayModal — duty 7/14/28 days + flight 28 days from selected date, timezone-aware UTC calculation using departure/arrival station offsets
28. recalcDutyTime — duty time recalculated from report/release using per-airport UTC offset, more accurate than AI-read dutyTime column (verified exact match vs Merlot for June 2026: 43:18/78:12/133:31/83:08)
29. AI year-misread bug fixed — Desktop Roster and Swap Checker now force-correct entry year to match crew.period / requested year (AI was reading 2020, 2025 instead of 2026)
30. B737-SPT (Ground Instructor duty) excluded from flight hours — type changed to GROUND_TRAINING, not real flight time
31. Swap Checker entry type detection fixed — REST/RERRP2LD/RERRP36/STANDBY entries from friend's screenshot were hardcoded as type:'FLIGHT', causing false FDP violations on rest days. Now correctly classified via detectSwapEntryType()
32. Swap Checker violation explanations — shows specific FTL rule violated (FDP exceeded with OMA Table 7.1.2, rest shortfall with ORO.FTL.235) instead of generic "new violation" message
33. detectMySwapFlights rewritten — now finds ALL BKK-rooted flight chains within the swap date range (not just the first chain), fixing missed give-away flights like single-day round trips (e.g. TFU-1) that aren't directly connected to an earlier chain
34. B737-SPT confirmed as 8h ground duty (counts toward duty hour cumulative limits, never toward flight hours) — no max-consecutive-duty-days limit found in OMA or ftl-rules.js; rely on existing rolling duty limits (60h/7d, 110h/14d, 190h/28d) for swap/schedule safety checks instead
35. Confirmed via live swap check: Jul 2026 swap (give away PKX1-1/PKX1-2/TFU-1, take REST-1/ICN1-1/ICN1-2/BCNX_PL2-1/BCNX_PL2-2/RERRP2LD×2) is FTL legal — 0 violations, 2 warnings unchanged, net +16,730 THB

---

## Known Issues (remaining)

1. Duty/TAFB = 0:00 for mobile entries — acceptable (no duty/TAFB data in mobile format)
2. Mobile List block times approximate — use Desktop Roster for exact pay/FTL
3. Continuation row release time — desktop AI sometimes doesn't link --> release back to parent FLIGHT entry (shows — in DayModal). Workaround: manually toggle "Release next day (+1)" and enter release time in Edit duty modal
4. AI occasionally still misreads year on first parse attempt — code-level safeguard now corrects it automatically, but always spot-check the displayed month/year after any upload
5. iOS import — use iCloud.com to upload JSON, then Files app → iCloud Drive on iPhone (Google Drive direct picker doesn't work in Safari file input)
6. NAS migration pending (Phase 2)
7. No max-consecutive-duty-days rule exists in the app (none found in TVJ OMA either) — only rolling hour limits (7/14/28 day duty, 28 day flight) are checked. If a hard consecutive-day limit is later confirmed from OMA/OMC, add it as a new constant in ftl-rules.js rather than guessing a number.

---

## Next Session Priorities

1. Tax calibration — add May/June payslip when available (payment month 6/7) to src/lib/tax-calculator.js MONTHLY_DATA
2. Add refresh button to app top bar for iPhone home screen standalone mode (window.location.reload())
3. Verify cumulative limits (DayModal) against Merlot for a few more dates/months to confirm the timezone-aware recalc holds up generally, not just for June 2026
4. Phase 2 NAS migration — Synology RS815+, Docker, FastAPI, SQLite

---

## Cumulative FTL Limits — How It Works Now
- DayModal → click any flight → FTL Details shows Duty 7/14/28 days + Flight 28 days, calculated FROM that selected date
- Calculation loads roster entries from current + previous 2 months as needed
- Duty time per entry is recalculated from report/release timestamps using per-airport UTC offset (not the raw dutyTime column from Merlot, which can be unreliable when AI misreads it)
- Verified exact match against Merlot Rule Limit Summaries for 11/06/2026: Duty7=43:18, Duty14=78:12, Duty28=133:31, Flight28=83:08 — all matched after fixes
- If a discrepancy appears again, check: (a) entry year correct, (b) report/release times correct per Merlot screenshot, (c) entry.from/entry.to airports correct (used for timezone offset lookup)

---

## Swap Checker — How It Works Now
- Roster Analyser tab → scroll to Swap Checker section
- Upload friend's Merlot mobile screenshot (List view)
- detectMySwapFlights finds ALL your BKK-rooted flight chains within their requested date range (handles multiple separate trips, e.g. PKX1 + TFU1 in the same range)
- Entry types from friend's screenshot correctly classified (FLIGHT/REST→OFF/RERRP2LD/RERRP36/STANDBY) — prevents false FDP violations on their rest days being misapplied to your hypothetical swapped roster
- Shows: SWAP IS LEGAL / SWAP CREATES FTL VIOLATION, with specific rule citations (OMA Table 7.1.2 for FDP, ORO.FTL.235 for rest) for each new violation
- Full pay breakdown: give away vs take, net THB gain/loss
- Year is force-corrected in code (not just prompt) since AI was unreliable about respecting the injected year value

---

## B737-SPT / Ground Instructor Duty
- dutyCode containing "B737" + "SPT" = Ground Instructor teaching duty, NOT actual flight
- Automatically classified as type: GROUND_TRAINING on upload — excluded from flight hours and block time
- Cannot be swapped/given away (per K's note — keep this in mind for future swap-checker UX, e.g. a "non-swappable" flag was discussed but not yet implemented)

---

## Actual Block Time Tracking
- Enter via Calendar tab → click flight cell → Edit duty → Actual block time section (per-leg off/on-block, auto-formats 0225 → 02:25)
- OR upload past Merlot roster via Desktop Roster (past months auto-populate actualBlockMins from Flight Time column)
- Never affects pay calculation — pay always uses blockMins from route DB
- Priority chain: actualBlockMins → blockMins (route DB) → scheduledBlock (Merlot)

---

## Backup / Restore
- Export: ↓ Export in bottom bar → downloads JSON → upload to icloud.com
- Import desktop: ↑ Import → select JSON
- Import iPhone: icloud.com → upload JSON → Files app → iCloud Drive → Import
- Recommended: export monthly after uploading roster

---

## localStorage Keys
- flight-deck:roster:YYYY-MM — entries + actualBlockMins (always double-check year is correct after any upload)
- flight-deck:allowance:YYYY-MM — allowance checker rows
- flight-deck:rates — pay rates
- flight-deck:crew-profile — name/rank/ID/base
- flight-deck:learned-airports — DOM/INTER classifications
- flight-deck:learned-routes — custom block times

---

## Stack
- React 18 + Vite + Tailwind CSS
- GitHub Pages (Phase 1)
- Anthropic API key in GitHub Secrets as VITE_ANTHROPIC_API_KEY
- localStorage for data persistence

---

## How to Continue
cd C:\Users\sk118\Desktop\Flight-Deck
npm run dev
claude
git add . && git commit -m "msg" && git push

GitHub Actions auto-deploys on push to main (~2 min). Always verify the deploy went green before testing.
