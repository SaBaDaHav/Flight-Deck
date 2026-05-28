# Flight Deck — Handoff Notes
## For Next Claude Session

---

## Project Status
Live app: https://sabadahav.github.io/Flight-Deck/
Repo: https://github.com/SaBaDaHav/Flight-Deck
Local: C:\Users\sk118\Desktop\Flight-Deck
Full brief: CLAUDE.md in project root (gitignored)

---

## Recent Fixes (this session)

1. Block time 100:10 → 84:00 — stats useMemo now uses calcTotalBlockMinsWithLearned route fallback
2. 20,000 THB ค่าฝึกอบรม — fixed to flat monthly deduction (was multiplied by simDays)
3. Ground training excluded from transport — verified March 2026 payslip (was incorrectly included)
4. Payment month passed to calcMonthlyPay — deduction now checks payment month not today
5. DOM per diem 500 THB — now included in perDiem total (was silently zero)
6. INTER block classification — classRoute fallback now checks entry.route for mobile entries
7. ESLint — 0 errors, 0 warnings across all files

---

## Known Issues (remaining)
1. Duty: 0:00 and TAFB: 0:00 in bottom bar for mobile entries — acceptable (mobile has no duty/TAFB)
2. RosterAnalyser tab — needs real-world testing with live roster data
3. NAS migration pending (Phase 2 — RS815+, Docker, FastAPI, SQLite)

## Recent Fixes (this session — continued)
8. Mobile duplicate entries — deduplicate by date before saving (overlapping screenshots)
9. Missing legs detection — was checking e.route (undefined), now uses sectors/from/to
10. Block time 84:00 verified ✅ — June 2026 matches Merlot exactly

---

## Next Priorities

1. Validate March 2026 payslip numbers (CLAUDE.md section 8.8)
2. Build out RosterAnalyser tab (CLAUDE.md section 6)
3. Phase 2 NAS migration

---

## Stack
- React 18 + Vite + Tailwind CSS
- GitHub Pages (Phase 1 — current)
- Anthropic API key in GitHub Secrets as VITE_ANTHROPIC_API_KEY
- localStorage for data persistence

---

## How to Continue Development
cd C:\Users\sk118\Desktop\Flight-Deck
npm run dev          # local dev server
claude               # Claude Code for edits
git add . && git commit -m "msg" && git push  # deploy

GitHub Actions auto-deploys on push to main (~2 min).
