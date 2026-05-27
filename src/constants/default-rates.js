// All pay rates — pilot-confirmed and payslip-verified (March 2026)
export const DEFAULT_RATES = {
  // Variable (flight-dependent)
  transportRate:           840,    // THB/qualifying day — non-taxable
  sectorRate:              840,    // THB/landing — taxable

  // Block pay — total 35 THB/min (= 2,100/hr)
  domBlockPerMin:           35,    // THB/min — 100% taxable
  interBlockTaxPerMin:   26.53,    // THB/min — taxable portion (75.8%)
  interBlockNtPerMin:     8.47,    // THB/min — non-taxable portion (24.2%)
  // interBlockTaxRatio = 0.758, interBlockNtRatio = 0.242

  // Per diem (INTER only confirmed; DOM 500/night placement TBC — use otherIncome)
  perDiemInterUsd:          60,    // USD/INTER overnight — taxable
  usdThb:                35.55,    // edit monthly (March 2026 = 35.55)

  // Fixed (Captain rank, every month)
  baseSalary:           112910,    // THB — taxable
  performanceAllow:      48390,    // THB — taxable

  // Instruction (GROUND TRAINING INST days only — NOT SIM days)
  instructionRatePerHr:   1440,    // THB/hr
  instructionHoursPerDay:    7,    // teaching hours per GROUND TRAINING day
  // → instructionPerDay = 1,440 × 7 = 10,080 THB

  // Pilot-edited each month (special income, DOM per diem when confirmed, carryover)
  otherIncome:               0,    // THB — taxable, set to 500 for Mar 2026

  // Deductions
  socialSecurity:          875,    // THB — every month
  simTrainingDeduction:  20000,    // THB/FFS session
  trainingDeductionEnds: '2026-11', // YYYY-MM — last payment month with SIM deduction
};

export const DOM_BLOCK_PER_MIN       = DEFAULT_RATES.domBlockPerMin;
export const INTER_BLOCK_TAX_PER_MIN = DEFAULT_RATES.interBlockTaxPerMin;
export const INTER_BLOCK_NT_PER_MIN  = DEFAULT_RATES.interBlockNtPerMin;
