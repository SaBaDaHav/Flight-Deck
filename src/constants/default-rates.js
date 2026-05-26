// All pay rates — pilot-confirmed and payslip-verified (March 2026)
export const DEFAULT_RATES = {
  // Variable (flight-dependent)
  transportPerDay:       840,    // THB/attended duty day — non-taxable
  sectorPerLeg:          840,    // THB/landing — taxable
  domBlockPerMin:        11.34,  // THB/min — non-taxable (payslip-confirmed)
  interBlockPerMin:      52.67,  // THB/min — taxable (payslip-confirmed)
  perDiemDom:            500,    // THB/domestic overnight
  perDiemInterUsd:       60,     // USD/international overnight
  usdThb:                35.55,  // editable monthly exchange rate

  // Fixed (Captain rank, every month)
  baseSalary:            112910, // THB — taxable
  performanceAllow:      48390,  // THB — taxable
  specialIncome:         500,    // THB — taxable
  socialSecurity:        875,    // THB — deduction

  // Special events
  instructionPerSession: 6720,   // THB/session — income (ค่าสอน)
  simTrainingDeduction:  20000,  // THB/FFS session — deduction (ค่าฝึกอบรม)
};

export const DOM_BLOCK_PER_MIN   = DEFAULT_RATES.domBlockPerMin;
export const INTER_BLOCK_PER_MIN = DEFAULT_RATES.interBlockPerMin;
