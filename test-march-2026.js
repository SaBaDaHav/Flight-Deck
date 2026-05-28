// March 2026 payslip validation — CLAUDE.md section 8.8
// Run with: node test-march-2026.js

import { calcMonthlyPay } from './src/lib/pay-calculator.js';
import { DEFAULT_RATES } from './src/constants/default-rates.js';

const rates = {
  ...DEFAULT_RATES,
  usdThb: 35.55,
  otherIncome: 500,
};

const days = [];

// 12 pure DOM flight days — 2080 min DOM total, 42 legs across these + 2 INTER days
// Distribute: 12 days × ~3-4 legs, exact DOM mins
days.push({ domMins: 174, interMins: 0, legs: 4, perDiem: null,    isSim: false, isGround: false, isTraining: false });
days.push({ domMins: 174, interMins: 0, legs: 4, perDiem: null,    isSim: false, isGround: false, isTraining: false });
days.push({ domMins: 174, interMins: 0, legs: 4, perDiem: null,    isSim: false, isGround: false, isTraining: false });
days.push({ domMins: 174, interMins: 0, legs: 4, perDiem: null,    isSim: false, isGround: false, isTraining: false });
days.push({ domMins: 174, interMins: 0, legs: 4, perDiem: null,    isSim: false, isGround: false, isTraining: false });
days.push({ domMins: 174, interMins: 0, legs: 4, perDiem: null,    isSim: false, isGround: false, isTraining: false });
days.push({ domMins: 174, interMins: 0, legs: 4, perDiem: null,    isSim: false, isGround: false, isTraining: false });
days.push({ domMins: 174, interMins: 0, legs: 4, perDiem: null,    isSim: false, isGround: false, isTraining: false });
days.push({ domMins: 174, interMins: 0, legs: 4, perDiem: null,    isSim: false, isGround: false, isTraining: false });
days.push({ domMins: 174, interMins: 0, legs: 4, perDiem: null,    isSim: false, isGround: false, isTraining: false });
days.push({ domMins: 174, interMins: 0, legs: 4, perDiem: null,    isSim: false, isGround: false, isTraining: false });
days.push({ domMins: 146, interMins: 0, legs: 2, perDiem: 'DOM',   isSim: false, isGround: false, isTraining: false });
// 12th DOM day is the CNX layover day (legs=2, perDiem DOM)
// 12×174 = 2088, adjust last: 2080 - 11×174 = 2080-1914 = 166 → use 146+20 split above
// Simpler: just use exact totals below and accept minor per-day rounding

// 2 INTER departure days — 2785 min INTER total, 2 legs
days.push({ domMins: 0, interMins: 1393, legs: 1, perDiem: 'INTER', isSim: false, isGround: false, isTraining: false });
days.push({ domMins: 0, interMins: 1392, legs: 1, perDiem: 'INTER', isSim: false, isGround: false, isTraining: false });

// 2 ground training days
days.push({ domMins: 0, interMins: 0, legs: 0, perDiem: null, isSim: false, isGround: true,  isTraining: false });
days.push({ domMins: 0, interMins: 0, legs: 0, perDiem: null, isSim: false, isGround: true,  isTraining: false });

// 1 SIM day
days.push({ domMins: 0, interMins: 0, legs: 0, perDiem: null, isSim: true,  isGround: false, isTraining: false });

// Fix DOM total: 11×174 + 146 = 1914+146 = 2060 — short by 20. Add 20 to one day:
days[0].domMins += 20; // now 194, total DOM = 2080 ✅

// Fix legs: currently 11×4 + 1×2 + 2×1 = 44+2+2 = 48 — too many
// Adjust: use legs that sum to 44
// 10 days × 4 legs = 40, 1 day × 2 legs = 2, 2 INTER days × 1 leg = 2 → total 44 ✅
for (let i = 10; i < 12; i++) days[i].legs = 2;
// Now: days 0-9 = 4 legs each (40), day 10 = 4, day 11 = 2, day12-13 INTER = 1 each
// 40 + 4 + 2 - 4 + 2 = still off. Use simplest exact split:
// Reset all legs
days.forEach(d => d.legs = 0);
// 44 legs across 14 flight days: assign manually
const flightDayLegs = [4,4,4,4,4,4,4,4,4,2,2,2,1,1]; // sums to 44
flightDayLegs.forEach((l,i) => days[i].legs = l);

const result = calcMonthlyPay(days, rates, 1, 2026, 4);

const domTotal   = days.reduce((s,d) => s + d.domMins,   0);
const interTotal = days.reduce((s,d) => s + d.interMins, 0);
const legsTotal  = days.reduce((s,d) => s + d.legs,      0);
console.log(`\nInput check: DOM=${domTotal}min INTER=${interTotal}min Legs=${legsTotal}`);
console.log('(expect:     DOM=2080     INTER=2785      Legs=44)\n');

console.log('=== MARCH 2026 VALIDATION ===');
console.log('เงินเดือน:        ', result.income.baseSalary.toFixed(2),                                          '(expect 112,910.00)');
console.log('ค่าเซกเตอร์:      ', result.income.sector.toFixed(2),                                              '(expect  36,960.00)');
console.log('ค่าสอน:           ', result.income.kaonPay.toFixed(2),                                             '(expect  20,160.00)');
console.log('ค่าผลงาน:         ', result.income.performanceAllow.toFixed(2),                                    '(expect  48,390.00)');
console.log('ค่ายานพาหนะ NT:   ', result.income.transport.toFixed(2),                                           '(expect  12,600.00)');
console.log('ค่าชม.บิน Tax:    ', (result.income.domBlockTax + result.income.interBlockTax).toFixed(2),         '(expect 146,685.35)');
console.log('ค่าพักข้ามคืน:    ', result.income.perDiem.toFixed(2),                                             '(expect   4,766.00 = 4,266 INTER + 500 DOM)');
console.log('ค่าชม.บิน NT:     ', result.income.interBlockNt.toFixed(2),                                        '(expect  23,589.65)');
console.log('เงินได้พิเศษ:     ', result.income.otherIncome.toFixed(2),                                         '(expect     500.00)');
console.log('─────────────────────────────────────────');
console.log('รวมรายได้:        ', result.income.totalIncome.toFixed(2),                                         '(expect 406,561.00)');
console.log('ค่าฝึกอบรม:       ', result.deductions.simDeduction.toFixed(2),                                    '(expect  20,000.00)');
console.log('ประกันสังคม:       ', result.deductions.socialSecurity.toFixed(2),                                  '(expect     875.00)');
