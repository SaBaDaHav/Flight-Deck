# Flight Deck — Handoff Notes
## For Next Claude Session

---

## Project Status
Live app: https://sabadahav.github.io/Flight-Deck/
Repo: https://github.com/SaBaDaHav/Flight-Deck
Local: C:\Users\sk118\Desktop\Flight-Deck
Full brief: CLAUDE.md in project root (gitignored)

---

## All Fixes & Features This Session

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
23. Logbook upload — amber button in Calendar tab, reads actual Flight Time from past Merlot rosters, stores as actualBlockMins
24. Annual block hours view in RosterAnalyser — month-by-month bar chart, 1,000h limit tracking, actual (amber) vs scheduled (blue)
25. Missing Total column cell in AllowanceRow — was causing column shift showing wrong values in SIM/DayPay

---

## Known Issues (remaining)

1. Duty/TAFB = 0:00 for mobile entries — acceptable (mobile has no duty/TAFB data)
2. Mobile List uses route DB block times — approximate (TPI-adjusted actuals need Desktop Roster)
3. localStorage only — data exists in one browser only, no backup/export yet
4. NAS migration pending (Phase 2)

---

## Next Session Priorities

1. Export/Import JSON — backup all localStorage data, restore on any device (critical before NAS migration)
2. Tax calibration — add May payslip when it arrives (payment month 6, add to src/lib/tax-calculator.js MONTHLY_DATA)
3. Phase 2 NAS migration — Synology RS815+, Docker, FastAPI, SQLite

---

## Tax Calibration — Update Monthly
When new payslip arrives, add to src/lib/tax-calculator.js MONTHLY_DATA:
  { paymentMonth: N, income: [monthly income], tax: [monthly ภาษี] }
Payment month = work month + 1 (e.g. May work → June payment = month 6)
Current data: Jan(1)–Apr(4) calibrated. Next: add May payslip (payment month 6).

---

## Actual Block Time Tracking
- Enter via Calendar tab → click flight cell → Edit duty → Actual block time section
- Per-leg entry: each sector shows own off-block/on-block fields
- OR upload past Merlot roster via Logbook button (amber) — reads Flight Time column as actual
- Used ONLY for FTL cumulative tracking in Roster Analyser tab
- Never affects pay calculation
- Priority chain: actualBlockMins → blockMins (route DB) → scheduledBlock (Merlot)

---

## Logbook Upload Notes
- Button: Calendar tab → amber "Logbook" button
- Upload past month Merlot desktop roster screenshots (1 or 2 images)
- AI reads Flight Time column (= real actual block after flight completion)
- If month already has roster data → only updates actualBlockMins, preserves schedule
- If month has no roster data → creates full entry with actualBlockMins set
- Annual view in RosterAnalyser shows amber bars for months with logbook data

---

## Swap Checker Notes
- Located in Roster Analyser tab → scroll to bottom
- Upload friend's Merlot mobile screenshot
- Auto-detects multi-day swap chain: finds your BKK departure, follows until return to BKK
- Loads correct month roster even if their flights are in different month than currently viewed
- Shows: FTL legal/illegal + full month re-analysis + pay breakdown (give away vs take)
- Homebase = BKK (hardcoded in detectMySwapFlights)

---

## localStorage Keys
- flight-deck:roster:YYYY-MM — monthly roster entries + actualBlockMins
- flight-deck:allowance:YYYY-MM — allowance checker data
- flight-deck:rates — pay rates
- flight-deck:crew-profile — name/rank/ID/base
- flight-deck:learned-airports — DOM/INTER airport classifications
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
