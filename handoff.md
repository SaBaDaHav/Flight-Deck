# Flight Deck — Handoff Notes
## For Next Claude Session

---

## Project Status
Live app: https://sabadahav.github.io/Flight-Deck/
Repo: https://github.com/SaBaDaHav/Flight-Deck
Local: C:\Users\sk118\Desktop\Flight-Deck
Full brief: CLAUDE.md in project root (gitignored)

---

## All Fixes & Features (Complete Session History)

1. Block time 100:10 → 84:00 — route DB fallback in stats useMemo
2. 20,000 THB ค่าฝึกอบรม — flat monthly deduction (was multiplied by simDays)
3. Ground training included in transport — verified March 2026 payslip
4. Payment month passed to calcMonthlyPay — deduction checks payment month not today
5. DOM per diem 500 THB — now included in perDiem total
6. INTER block classification — route field fallback for mobile entries
7. ESLint — 0 errors 0 warnings maintained throughout
8. March 2026 validated — 406,561 THB exact
9. Mobile duplicate entries — deduplicate by date (overlapping screenshots)
10. Missing legs detection — uses sectors/from/to not e.route
11. Block time 84:00 verified — June 2026 matches Merlot
12. Tax estimator — empirical calibration from Jan-Apr payslips, 100% accurate
13. Total block column added to Allowance table footer
14. Debug console.log removed from all files
15. Work month → Payment month label added to PayBreakdown
16. Swap/Giveaway FTL Checker — upload friend's screenshot, auto-detects multi-day swap chain from BKK homebase, full month FTL re-analysis, pay delta calculation
17. Actual block time entry — per-leg off-block/on-block in EditEntryModal, auto-sums to total, FTL tracking only, not used for pay
18. RosterAnalyser cumulative bars use actualBlockMins → blockMins → scheduledBlock priority chain
19. Plain-language FTL explanations in DayModal — warning/violation/rest violation/PSWM descriptions
20. HR Sheet upload button — amber button in Allowance tab, AI reads scheduled block minutes into DOM HR / INT HR columns
21. Δ THB column hidden until HR scheduled values entered
22. Discrepancy panel hidden until HR scheduled values entered
23. Logbook upload — amber button in Calendar tab, reads actual Flight Time from past Merlot rosters
24. Annual block hours view in RosterAnalyser — month-by-month bar chart, 1,000h limit tracking
25. Missing Total column cell in AllowanceRow — was causing column shift
26. Export/Import backup — ↓ Export / ↑ Import buttons in bottom bar, single JSON file
27. iOS import fix — accept filter updated for iPhone Safari
28. Timezone-aware FDP calculation — release time converted from arrival airport local to departure airport local time
29. Airport timezone DB (src/constants/airport-timezones.js) — all TVJ destinations covered
30. Auto-detect releaseNextDay — when release < report time, automatically sets true
31. Desktop Roster auto-populates actualBlockMins for past months from Flight Time column
32. FTL cap — dutyTime capped at 20h to prevent TAFB being mistaken for FDP
33. Time input auto-format — type 0225 gets formatted to 02:25 in off/on-block fields
34. parseTimeToMins handles both HH:MM and raw HHMM formats
35. BKK-NST and NST-BKK added to route DB (80 min each)
36. June 2026 verified with Desktop Roster upload — 93:35 matches Merlot exactly
37. June roster updated — new flights added vs original (93:35 vs original 84:25)

---

## Known Issues (remaining)

1. Duty/TAFB = 0:00 for mobile entries — acceptable (mobile has no duty/TAFB data)
2. Mobile List block times approximate — TPI-adjusted actuals need Desktop Roster
3. Continuation row release time — desktop AI doesn't link --> release back to parent FLIGHT entry (release shows — in DayModal for overnight international flights). Workaround: manually toggle "Release next day (+1)" in Edit duty modal and enter release time.
4. iPhone home screen shortcut has no refresh button — use Safari browser for refresh, or add refresh button to app (TODO)
5. iOS import — use iCloud.com to upload JSON, then Files app → iCloud Drive on iPhone
6. NAS migration pending (Phase 2)

---

## Next Session Priorities

1. Add refresh button to app top bar (for iPhone home screen standalone mode) — window.location.reload()
2. Fix continuation row release time parsing — critical for correct FDP on international overnight flights
3. Tax calibration — add May payslip when it arrives (payment month 6)
4. Phase 2 NAS migration

---

## Tax Calibration — Update Monthly
When new payslip arrives, add to src/lib/tax-calculator.js MONTHLY_DATA:
  { paymentMonth: N, income: [monthly income], tax: [monthly ภาษี] }
Payment month = work month + 1 (e.g. May work → June payment = month 6)
Current data: Jan(1)–Apr(4) calibrated. Next: add May payslip (payment month 6).

---

## Actual Block Time Tracking
- Enter via Calendar tab → click flight cell → Edit duty → Actual block time section
- Per-leg entry with auto-format: type 0225 → becomes 02:25
- OR upload past Merlot roster via Desktop Roster (past months auto-populate actualBlockMins)
- OR use Logbook button (amber) for explicit logbook upload
- Used ONLY for FTL cumulative tracking — never affects pay
- Priority chain: actualBlockMins → blockMins (route DB) → scheduledBlock (Merlot)
- FFS simulator hours NOT counted toward 1,000h/year limit (EASA ORO.FTL.1)

---

## FDP Timezone Calculation
- File: src/constants/airport-timezones.js
- All TVJ destinations have UTC offsets defined
- FDP calculated in departure station local time (EASA requirement)
- BKK→KIX example: report 00:15 BKK (GMT+7), release 11:32 KIX (GMT+9) = 09:32 BKK → FDP 9:17 ✅
- releaseNextDay auto-detected when release < report time

---

## Backup / Restore
- Export: click ↓ Export in bottom bar → downloads JSON → upload to icloud.com
- Import desktop: click ↑ Import → select JSON
- Import iPhone: icloud.com → upload JSON → iPhone Files app → iCloud Drive → Import
- Recommended: export monthly after uploading roster

---

## Swap Checker
- Roster Analyser tab → scroll to bottom
- Upload friend's Merlot mobile screenshot
- Auto-detects multi-day swap: follows BKK departure chain until return to BKK
- Shows: FTL legal/illegal + full month re-analysis + pay breakdown
- Homebase = BKK (hardcoded in detectMySwapFlights)

---

## localStorage Keys
- flight-deck:roster:YYYY-MM — entries + actualBlockMins
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

GitHub Actions auto-deploys on push to main (~2 min).
