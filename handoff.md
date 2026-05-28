# Flight Deck — Handoff Notes
## For Next Claude Session

---

## Project Status
Live app: https://sabadahav.github.io/Flight-Deck/
Repo: https://github.com/SaBaDaHav/Flight-Deck
Local: C:\Users\sk118\Desktop\Flight-Deck
Full brief: CLAUDE.md in project root (gitignored)

---

## All Fixes This Session

1. Block time 100:10 → 84:00 — route DB fallback in stats useMemo
2. 20,000 THB ค่าฝึกอบรม — flat monthly deduction (was multiplied by simDays)
3. Ground training included in transport — verified March 2026 payslip
4. Payment month passed to calcMonthlyPay — deduction checks payment month not today
5. DOM per diem 500 THB — now included in perDiem total
6. INTER block classification — route field fallback for mobile entries
7. ESLint — 0 errors 0 warnings
8. March 2026 validated — 406,561 THB exact
9. Mobile duplicate entries — deduplicate by date (overlapping screenshots)
10. Missing legs detection — uses sectors/from/to not e.route
11. Block time 84:00 verified — June 2026 matches Merlot
12. Tax estimator — empirical calibration from Jan-Apr payslips, 100% accurate
13. Total block column added to Allowance table footer
14. Debug console.log removed from all files

---

## Known Issues (remaining)

1. Duty/TAFB = 0:00 for mobile entries — acceptable (mobile has no duty/TAFB data)
2. Mobile List uses route DB block times — approximate (TPI-adjusted actuals need Desktop Roster)
3. Tax calibration — update MONTHLY_DATA in src/lib/tax-calculator.js each month with new payslip
4. RosterAnalyser tab — needs real-world testing with June data
5. NAS migration pending (Phase 2)

---

## Tax Calibration — Update Monthly
When new payslip arrives, add to src/lib/tax-calculator.js MONTHLY_DATA:
  { paymentMonth: N, income: [monthly income], tax: [monthly ภาษี] }
Payment month = work month + 1 (e.g. June work → July payment = month 7)

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
