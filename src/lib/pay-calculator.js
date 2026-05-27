import { DEFAULT_RATES } from '../constants/default-rates.js';

// Safe rate accessor — falls back to DEFAULT_RATES when key missing (handles old stored rates)
function r(rates, key) {
  return rates[key] ?? DEFAULT_RATES[key];
}

// ─── Per-day pay ─────────────────────────────────────────────────────────────
// day shape:
//   domMins   — DOM block minutes (effective)
//   interMins — INTER block minutes (effective)
//   legs      — landing count
//   perDiem   — 'DOM' | 'INTER' | null  ('INTER' = international departure day)
//   isSim     — FFS simulator session (transport YES, ค่าสอน NO, deduction applies)
//   isGround  — GROUND TRAINING INST day (transport YES, ค่าสอน YES, no block)
export function calcDayPay(day, rates = DEFAULT_RATES) {
  const domMins   = day.domMins   || 0;
  const interMins = day.interMins || 0;
  const legs      = day.legs      || 0;
  const perDiem   = day.perDiem   || null;
  const isSim     = day.isSim     || false;
  const isGround  = day.isGround  || false;

  // Transport: all activity types qualify; INTER departure days are excluded
  // (pilot receives per diem instead on those days)
  const hasActivity = domMins > 0 || interMins > 0 || isSim || isGround;
  const isInterDep  = perDiem === 'INTER';
  const transport   = (hasActivity && !isInterDep) ? r(rates, 'transportRate') : 0;

  // Sector pay
  const sector = legs * r(rates, 'sectorRate');

  // Block pay — DOM all taxable; INTER split 75.8% tax / 24.2% NT
  const domBlockTax   = domMins   * r(rates, 'domBlockPerMin');
  const interBlockTax = interMins * r(rates, 'interBlockTaxPerMin');
  const interBlockNt  = interMins * r(rates, 'interBlockNtPerMin');

  // Per diem — INTER overnight only (DOM placement TBC, pilot uses otherIncome)
  const perdiem = isInterDep
    ? r(rates, 'perDiemInterUsd') * r(rates, 'usdThb')
    : 0;

  // Instruction (ค่าสอน) — GROUND TRAINING days only, NOT SIM days
  const instructionPerDay = r(rates, 'instructionRatePerHr') * r(rates, 'instructionHoursPerDay');
  const kaonPay = isGround ? instructionPerDay : 0;

  return {
    transport,      // non-taxable
    sector,         // taxable
    domBlockTax,    // taxable (DOM block, 100%)
    interBlockTax,  // taxable (INTER block taxable portion)
    interBlockNt,   // non-taxable (INTER block NT portion)
    perdiem,        // taxable
    kaonPay,        // taxable (ค่าสอน, ground training only)
    total: transport + sector + domBlockTax + interBlockTax + interBlockNt + perdiem + kaonPay,
  };
}

// ─── Monthly pay ─────────────────────────────────────────────────────────────
// days     — array of day objects (shape as above)
// rates    — rate object (defaults to DEFAULT_RATES)
// simCount — total FFS sessions in month (for SIM deduction)
export function calcMonthlyPay(days = [], rates = DEFAULT_RATES, simCount = 0) {
  let totalDomMins   = 0;
  let totalInterMins = 0;
  let totalLegs      = 0;
  let flightDays     = 0;   // days with any block time
  let gndTrgDays     = 0;   // GROUND TRAINING INST days
  let interDepDays   = 0;   // INTER departure days (perDiem === 'INTER')
  let interNights    = 0;   // same count as interDepDays
  const simDays      = simCount;

  for (const day of days) {
    const domMins   = day.domMins   || 0;
    const interMins = day.interMins || 0;
    totalDomMins   += domMins;
    totalInterMins += interMins;
    totalLegs      += day.legs || 0;
    if (domMins > 0 || interMins > 0) flightDays++;
    if (day.isGround) gndTrgDays++;
    if (day.perDiem === 'INTER') { interDepDays++; interNights++; }
  }

  // Transport: (flightDays + gndTrgDays + simDays − interDepDays) × rate
  const transportDays = Math.max(0, flightDays + gndTrgDays + simDays - interDepDays);
  const transport     = transportDays * r(rates, 'transportRate');

  // Sector
  const sector = totalLegs * r(rates, 'sectorRate');

  // Block pay (DOM all taxable; INTER split)
  const domBlockTax   = totalDomMins   * r(rates, 'domBlockPerMin');
  const interBlockTax = totalInterMins * r(rates, 'interBlockTaxPerMin');
  const interBlockNt  = totalInterMins * r(rates, 'interBlockNtPerMin');

  // Per diem — INTER nights only (DOM 500/night TBC: pilot adds to otherIncome)
  const perDiem = interNights * r(rates, 'perDiemInterUsd') * r(rates, 'usdThb');

  // Instruction (ค่าสอน): GROUND TRAINING days × 10,080 (1,440/hr × 7hr)
  const instructionPerDay = r(rates, 'instructionRatePerHr') * r(rates, 'instructionHoursPerDay');
  const kaonPay           = gndTrgDays * instructionPerDay;

  // Fixed
  const baseSalary       = r(rates, 'baseSalary');
  const performanceAllow = r(rates, 'performanceAllow');
  const otherIncome      = r(rates, 'otherIncome');

  const totalIncome =
    baseSalary + performanceAllow + sector + kaonPay + transport +
    domBlockTax + interBlockTax + interBlockNt + perDiem + otherIncome;

  // Deductions
  const socialSecurity = r(rates, 'socialSecurity');

  // Auto-disable SIM deduction after trainingDeductionEnds (Nov 2026 payment)
  const now = new Date();
  const currentMonth  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const deductionEnds = r(rates, 'trainingDeductionEnds');
  const simActive     = typeof deductionEnds === 'string' && currentMonth <= deductionEnds;
  const simDeduction  = simActive ? simDays * r(rates, 'simTrainingDeduction') : 0;

  const incomeTax       = 0; // TVJ withholds; shown from payslip — left as placeholder
  const totalDeductions = socialSecurity + simDeduction + incomeTax;

  return {
    income: {
      baseSalary,
      performanceAllow,
      sector,
      kaonPay,
      transport,
      domBlockTax,
      interBlockTax,
      interBlockNt,
      perDiem,
      otherIncome,
      totalIncome,
    },
    deductions: {
      socialSecurity,
      simDeduction,
      incomeTax,
      totalDeductions,
    },
    netPay: totalIncome - totalDeductions,
  };
}

// ─── Payslip summary helpers ──────────────────────────────────────────────────

export function fmtMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function fmtThb(amount) {
  return amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Build payslip lines matching TVJ e-Payslip layout (Section 8.7)
// ค่าชม.บิน Tax  = DOM block (100% taxable) + INTER block taxable portion
// ค่าชม.บิน NT   = INTER block non-taxable portion only
export function buildPayslipLines(monthlyResult) {
  const { income: i, deductions: d, netPay } = monthlyResult;

  return {
    incomeLines: [
      { label: 'เงินเดือน',         labelEn: 'Base salary',           amount: i.baseSalary,                    taxable: true  },
      { label: 'ค่าเซกเตอร์',       labelEn: 'Sector pay',            amount: i.sector,                        taxable: true  },
      { label: 'ค่าสอน',            labelEn: 'Instruction pay',        amount: i.kaonPay,                       taxable: true  },
      { label: 'ค่าผลงาน',          labelEn: 'Performance allowance',  amount: i.performanceAllow,              taxable: true  },
      { label: 'ค่ายานพาหนะ NT',    labelEn: 'Transport (non-tax)',    amount: i.transport,                     taxable: false },
      { label: 'ค่าชม.บิน Tax',     labelEn: 'Block hrs Tax (DOM+INTER)',amount: i.domBlockTax + i.interBlockTax, taxable: true  },
      { label: 'ค่าพักข้ามคืน Tax', labelEn: 'Per diem INTER (taxable)',amount: i.perDiem,                      taxable: true  },
      { label: 'ค่าชม.บิน NT',      labelEn: 'Block hrs NT (INTER)',   amount: i.interBlockNt,                  taxable: false },
      { label: 'เงินได้พิเศษ',      labelEn: 'Other/special income',   amount: i.otherIncome,                   taxable: true  },
    ],
    deductionLines: [
      { label: 'ภาษี',              labelEn: 'Income tax',             amount: d.incomeTax },
      { label: 'ประกันสังคม',       labelEn: 'Social security',        amount: d.socialSecurity },
      { label: 'ค่าฝึกอบรม',        labelEn: 'SIM training fee',       amount: d.simDeduction },
    ],
    totalIncome:     i.totalIncome,
    totalDeductions: d.totalDeductions,
    netPay,
  };
}

// ─── Discrepancy helpers ──────────────────────────────────────────────────────

export function calcDelta(scheduled, actual) {
  if (actual === null || actual === undefined) return 0;
  return actual - scheduled;
}

// Delta THB uses full 35/min rate for both DOM and INTER (tax + NT combined)
export function deltaToThb(domDeltaMin, interDeltaMin, rates = DEFAULT_RATES) {
  const domRate   = r(rates, 'domBlockPerMin');
  const interRate = r(rates, 'interBlockTaxPerMin') + r(rates, 'interBlockNtPerMin');
  const dom   = (domDeltaMin   || 0) * domRate;
  const inter = (interDeltaMin || 0) * interRate;
  return { dom, inter, total: dom + inter };
}
