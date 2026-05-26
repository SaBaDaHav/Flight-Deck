import { DEFAULT_RATES } from '../constants/default-rates.js';

// ─── Per-day pay ─────────────────────────────────────────────────────────────
// day shape (from HR allowance sheet or roster):
//   domMins      — DOM block minutes
//   interMins    — INTER block minutes
//   legs         — number of landing legs (takeoff→landing count)
//   perDiem      — 'DOM' | 'INTER' | null
//   isSim        — true if FFS simulator session
//   isGround     — true if ground training (no block, no transport)
//   simCount     — number of FFS sessions (usually 0 or 1)
//   instSessions — number of instruction sessions for ค่าสอน income

export function calcDayPay(day, rates = DEFAULT_RATES) {
  const {
    transportPerDay,
    sectorPerLeg,
    perDiemDom,
    perDiemInterUsd,
    usdThb,
  } = rates;

  // Use per-minute rates directly; fall back to hourly÷60 for old stored rates
  const domRate   = rates.domBlockPerMin   ?? (rates.domBlockPerHr   / 60);
  const interRate = rates.interBlockPerMin ?? (rates.interBlockPerHr / 60);

  const domMins    = day.domMins    || 0;
  const interMins  = day.interMins  || 0;
  const legs       = day.legs       || 0;
  const isSim      = day.isSim      || false;
  const isGround   = day.isGround   || false;
  const perDiem    = day.perDiem    || null;

  // Transport: applies to flight days and SIM days — NOT ground training
  const hasFlightOrSim = domMins > 0 || interMins > 0 || isSim;
  const transport = (!isGround && hasFlightOrSim) ? transportPerDay : 0;

  // Sector pay
  const sector = legs * sectorPerLeg;

  // Block pay (per minute using confirmed rates)
  const domBlock   = domMins   * domRate;
  const interBlock = interMins * interRate;

  // Per diem
  let perdiem = 0;
  if (perDiem === 'DOM')   perdiem = perDiemDom;
  if (perDiem === 'INTER') perdiem = perDiemInterUsd * usdThb;

  // Instruction income (ค่าสอน) — optional
  const instIncome = (day.instSessions || 0) * (rates.instructionPerSession || 0);

  return {
    transport,   // non-taxable
    sector,      // taxable
    domBlock,    // non-taxable
    interBlock,  // taxable
    perdiem,     // taxable
    instIncome,  // taxable
    total: transport + sector + domBlock + interBlock + perdiem + instIncome,
  };
}

// ─── Monthly pay ─────────────────────────────────────────────────────────────
// days: array of day objects (one per calendar day worked/attended)
// rates: rate object (defaults to DEFAULT_RATES)
// simCount: total FFS sessions in the month (for deduction)
export function calcMonthlyPay(days = [], rates = DEFAULT_RATES, simCount = 0) {
  const totals = {
    transport:   0,
    sector:      0,
    domBlock:    0,
    interBlock:  0,
    perdiem:     0,
    instIncome:  0,
  };

  for (const day of days) {
    const d = calcDayPay(day, rates);
    totals.transport  += d.transport;
    totals.sector     += d.sector;
    totals.domBlock   += d.domBlock;
    totals.interBlock += d.interBlock;
    totals.perdiem    += d.perdiem;
    totals.instIncome += d.instIncome;
  }

  // Fixed monthly income (Captain)
  const fixed = {
    baseSalary:       rates.baseSalary       || DEFAULT_RATES.baseSalary,
    performanceAllow: rates.performanceAllow || DEFAULT_RATES.performanceAllow,
    specialIncome:    rates.specialIncome    || DEFAULT_RATES.specialIncome,
  };

  const totalIncome =
    fixed.baseSalary +
    fixed.performanceAllow +
    fixed.specialIncome +
    totals.transport +
    totals.sector +
    totals.domBlock +
    totals.interBlock +
    totals.perdiem +
    totals.instIncome;

  // Deductions
  const deductions = {
    socialSecurity:    rates.socialSecurity    || DEFAULT_RATES.socialSecurity,
    simDeduction:      simCount * (rates.simTrainingDeduction || DEFAULT_RATES.simTrainingDeduction),
    incomeTax:         0, // computed externally — TVJ withholds; left as 0 placeholder
  };

  const totalDeductions =
    deductions.socialSecurity +
    deductions.simDeduction +
    deductions.incomeTax;

  return {
    income: {
      ...fixed,
      ...totals,
      totalIncome,
    },
    deductions: {
      ...deductions,
      totalDeductions,
    },
    netPay: totalIncome - totalDeductions,
  };
}

// ─── Payslip summary helpers ──────────────────────────────────────────────────

// Format minutes as "H:MM" for display
export function fmtMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

// Format THB amount with commas and 2 decimal places
export function fmtThb(amount) {
  return amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Build a line-by-line payslip array matching the TVJ payslip layout
export function buildPayslipLines(monthlyResult, rates = DEFAULT_RATES) {
  const { income, deductions, netPay } = monthlyResult;
  const inc = income;
  const ded = deductions;

  return {
    incomeLines: [
      { label: 'เงินเดือน',        labelEn: 'Base salary',           amount: inc.baseSalary,       taxable: true },
      { label: 'ค่าเซกเตอร์',      labelEn: 'Sector pay',            amount: inc.sector,           taxable: true },
      { label: 'ค่าสอน',           labelEn: 'Instruction pay',        amount: inc.instIncome,       taxable: true },
      { label: 'ค่าผลงาน',         labelEn: 'Performance allowance',  amount: inc.performanceAllow, taxable: true },
      { label: 'ค่ายานพาหนะ NT',   labelEn: 'Transport (non-tax)',    amount: inc.transport,        taxable: false },
      { label: 'ค่าชม.บิน Tax',    labelEn: 'INTER block (taxable)',  amount: inc.interBlock,       taxable: true },
      { label: 'ค่าพักข้ามคืน Tax', labelEn: 'Per diem (taxable)',   amount: inc.perdiem,          taxable: true },
      { label: 'ค่าชม.บิน NT',     labelEn: 'DOM block (non-tax)',    amount: inc.domBlock,         taxable: false },
      { label: 'เงินได้พิเศษ',     labelEn: 'Special income',         amount: inc.specialIncome,    taxable: true },
    ],
    deductionLines: [
      { label: 'ภาษี',             labelEn: 'Income tax',             amount: ded.incomeTax },
      { label: 'ประกันสังคม',      labelEn: 'Social security',        amount: ded.socialSecurity },
      { label: 'ค่าฝึกอบรม',       labelEn: 'SIM training fee',       amount: ded.simDeduction },
    ],
    totalIncome:     inc.totalIncome,
    totalDeductions: ded.totalDeductions,
    netPay,
  };
}

// ─── Discrepancy helpers for AllowanceChecker ────────────────────────────────

// domScheduled/interScheduled = HR values; domActual/interActual = pilot values (minutes)
export function calcDelta(scheduled, actual) {
  if (actual === null || actual === undefined) return 0;
  return actual - scheduled;
}

export function deltaToThb(domDeltaMin, interDeltaMin, rates = DEFAULT_RATES) {
  const domRate   = rates.domBlockPerMin   ?? ((rates.domBlockPerHr   ?? 681)  / 60);
  const interRate = rates.interBlockPerMin ?? ((rates.interBlockPerHr ?? 3160) / 60);
  const dom   = (domDeltaMin   || 0) * domRate;
  const inter = (interDeltaMin || 0) * interRate;
  return { dom, inter, total: dom + inter };
}
