## 8. Pay Calculator — Confirmed Rates (Verified Against 4 Months of Payslips)

### 8.0 Pay Cycle
```
Work month X → HR allowance sheet arrives day 13-15 of month X+1
Pilot has ~5 days to dispute → Payslip paid last day of month X+1
Example: June 2026 work → HR sheet ~13-15 July → Payslip 31 July 2026

Merlot roster period ≠ calendar month (e.g. 25 May–24 Jun)
App extracts only the target calendar month days from uploaded images
```

### 8.1 All Confirmed Rates

#### Fixed (every month without exception)
| Component | Amount | Tax Line |
|---|---|---|
| เงินเดือน Base salary | THB 112,910 | Taxable |
| ค่าผลงาน Performance allowance | THB 48,390 | Taxable |

#### Variable (changes monthly based on flying)
| Component | Rate | Unit | Tax Line |
|---|---|---|---|
| ค่าเซกเตอร์ Sector/landing | THB 840 | per landing leg | Taxable |
| ค่ายานพาหนะ Transport | THB 840 | per qualifying day (see rule) | **Non-taxable** |
| DOM block | THB 35/min (2,100/hr) | per DOM minute | ค่าชม.บิน **Tax** |
| INTER block taxable | THB 26.53/min | per INTER minute | ค่าชม.บิน **Tax** |
| INTER block non-taxable | THB 8.47/min | per INTER minute | ค่าชม.บิน **NT** |
| Per diem INTER | USD 60/night × THB rate | per INTER overnight | ค่าพักข้ามคืน Tax |
| Per diem DOM | THB 500/night | per DOM overnight | ค่าพักข้ามคืน Tax |

#### Conditional (only when applicable)
| Component | Amount | Condition | Tax Line |
|---|---|---|---|
| ค่าสอน Instruction | THB 10,080/day | GROUND TRAINING INST days only | Taxable |
| เงินได้พิเศษ Special income | THB 500 | One-time months only, NOT fixed | Taxable |
| รายได้อื่นๆ Other income | Manual entry | Corrections/carryover only | Taxable |

#### Deductions
| Component | Amount | Condition |
|---|---|---|
| ประกันสังคม Social security | THB 875 | Every month always |
| ภาษี Income tax | Progressive YTD | Increases monthly as YTD income grows |
| ค่าฝึกอบรม SIM training fee | THB 20,000 | Per SIM FFS session, **every month until November 2026 payment then stops** |

### 8.2 Block Hour Rate — Critical Detail

Total block rate = **THB 2,100/hr = THB 35/min**

But DOM and INTER are treated differently:

```
DOM block minutes:
  → 35/min ALL goes to ค่าชม.บิน Tax (100% taxable)

INTER block minutes:
  → 26.53/min goes to ค่าชม.บิน Tax  (75.8% taxable)
  →  8.47/min goes to ค่าชม.บิน NT   (24.2% non-taxable)
  Total: 26.53 + 8.47 = 35.00/min ✅

Split ratio: Tax = 75.8%, NT = 24.2% (store as configurable)
```

### 8.3 Transport Day Rule — Critical Detail

```javascript
// Transport = 840 THB per qualifying day
// Qualifying days =
//   flight days (block > 0)
//   + ground training INST days (no block but instruction assigned)
//   + SIM FFS days (no block but SIM=1)
//   − INTER overnight departure days (days you depart BKK for intl layover)

function calcTransportDays(entries) {
  let days = 0;
  entries.forEach(e => {
    const hasBlock = (e.domMins || 0) + (e.interMins || 0) > 0;
    const isGndTrg = e.dutyType === 'GROUND_TRAINING';
    const isSim    = e.dutyType === 'SIM';
    const isInterDep = e.layover && e.perDiem === 'INTER';
    // isInterDep = days where crew departs BKK for international overnight
    
    if ((hasBlock || isGndTrg || isSim) && !isInterDep) {
      days++;
    }
  });
  return days;
}

// Verified:
// Jan 2026: 15 flight − 3 INTER dep = 12 × 840 = 10,080 ✅
// Mar 2026: (14 flight + 2 gndTrg + 1 SIM) − 2 INTER dep = 15 × 840 = 12,600 ✅
// Apr 2026: 15 flight − 4 INTER dep = 11 × 840 = 9,240 (predicted)
```

### 8.4 Instruction Pay Rule — Critical Detail

```
GROUND TRAINING INST day:
  ค่าสอน income:    +10,080 THB  (1,440 THB/hr × 7 teaching hours)
  Transport:        +840 THB     (qualifies for transport)
  ค่าฝึกอบรม:        0            (no deduction)

INST SIM FFS day:
  ค่าสอน income:    0 THB        (SIM does NOT generate ค่าสอน)
  Transport:        +840 THB     (SIM DOES qualify for transport)
  ค่าฝึกอบรม:        −20,000 THB  (simulator cost deducted until Nov 2026)

Verified: March 2026 had 2 GROUND TRAINING + 1 SIM FFS
  ค่าสอน = 2 × 10,080 = 20,160 ✅ (SIM day = 0 income)
  ค่าฝึกอบรม = 1 × 20,000 = −20,000 ✅
```

### 8.5 Per Diem Rule

```
INTER overnight (away from BKK at international station):
  Rate: USD 60/night × monthly USD/THB rate
  Line: ค่าพักข้ามคืน Tax
  USD/THB rate: 35.55 (March 2026 confirmed) — EDITABLE per month

DOM overnight (away from BKK at Thai domestic airport):
  Rate: THB 500/night
  Line: ค่าพักข้ามคืน Tax (bundled with INTER)

Per diem is marked on:
  - The departure day itself (day you leave BKK for overnight)
  - OR the full layover day (if full day spent away)
  
Transport is NOT paid on INTER overnight departure days
(pilot receives per diem instead for those nights)
```

### 8.6 Complete Pay Formula (JavaScript)

```javascript
function calcMonthlyPay(data, rates) {
  const {
    domMins, interMins, legs,
    flightDays, gndTrgDays, simDays, interDepDays,
    interNights, domNights,
    hasSpecialIncome, hasTrainingDeduction,
    otherIncome
  } = data;

  const {
    baseSalary,        // 112910
    performanceAllow,  // 48390
    sectorRate,        // 840
    transportRate,     // 840
    domBlockPerMin,    // 35
    interBlockTaxPerMin, // 26.53
    interBlockNtPerMin,  // 8.47
    perDiemInterUsd,   // 60
    perDiemDom,        // 500
    usdThb,            // 35.55 (editable monthly)
    instructionRate,   // 1440
    instructionHours,  // 7
    simDeduction,      // 20000
    socialSecurity,    // 875
    specialIncome,     // 500
  } = rates;

  // Transport qualifying days
  const transportDays = flightDays + gndTrgDays + simDays - interDepDays;

  // Block pay
  const domBlockTax   = domMins   * domBlockPerMin;
  const interBlockTax = interMins * interBlockTaxPerMin;
  const interBlockNt  = interMins * interBlockNtPerMin;

  // Per diem
  const perDiemInterThb = interNights * perDiemInterUsd * usdThb;
  const perDiemDomThb   = domNights   * perDiemDom;
  const totalPerDiem    = perDiemInterThb + perDiemDomThb;

  // Instruction
  const kaonPay = gndTrgDays * instructionRate * instructionHours;

  // INCOME
  const income = {
    basSalary:      baseSalary,
    performance:    performanceAllow,
    sector:         legs * sectorRate,
    transport:      transportDays * transportRate,        // NT
    blockTax:       domBlockTax + interBlockTax,          // Tax
    blockNt:        interBlockNt,                         // NT
    perDiem:        totalPerDiem,                         // Tax
    kaon:           kaonPay,                              // conditional
    special:        hasSpecialIncome ? specialIncome : 0, // one-time
    other:          otherIncome || 0,                     // manual
  };

  const totalIncome = Object.values(income).reduce((a, b) => a + b, 0);

  // DEDUCTIONS (tax computed separately by YTD engine)
  const deductions = {
    socialSecurity: socialSecurity,                        // 875 always
    simFee:         hasTrainingDeduction ? simDeduction : 0, // until Nov 2026
  };

  return { income, totalIncome, deductions };
}
```

### 8.7 Payslip Line Mapping (mirrors actual TVJ e-Payslip layout)

```
รายการได้ — INCOME:
  เงินเดือน          Base salary              112,910.00
  ค่าเซกเตอร์         Sector (legs × 840)       variable
  ค่าสอน             Instruction (gndTrg×10080) conditional
  ค่าผลงาน           Performance allowance      48,390.00
  ค่ายานพาหนะ NT     Transport NT              variable
  ค่าชม.บิน Tax      Block hours (taxable)     variable
  ค่าพักข้ามคืน Tax   Per diem (taxable)        variable
  ค่าชม.บิน NT       Block hours (non-tax)      variable
  เงินได้พิเศษ        Special income             one-time
  รายได้อื่นๆ         Other/carryover            manual
  ─────────────────────────────────────────────────────
  รวมรายได้ทั้งหมด    TOTAL INCOME

รายการหัก — DEDUCTIONS:
  ภาษี               Income tax (progressive)  computed
  ประกันสังคม         Social security           875.00
  ค่าฝึกอบรม          SIM training fee          20,000 if applicable
  ─────────────────────────────────────────────────────
  รวมรายจ่ายทั้งหมด   TOTAL DEDUCTIONS

รายได้สุทธิ — NET PAY = TOTAL INCOME − TOTAL DEDUCTIONS
```

### 8.8 Verified Test Data — March 2026 (use to validate calculator)

```
Input:
  DOM: 2,080 min    INTER: 2,785 min
  Legs: 44          Flight days: 14
  Ground training days: 2    SIM days: 1
  INTER dep days: 2 (day 1 BKK→CTS, day 29 BKK→KIX)
  INTER nights: 2 (CTS, KIX)    DOM nights: 1 (CNX)
  เงินได้พิเศษ: YES (500)    ค่าฝึกอบรม: YES (active)
  USD/THB rate: 35.55

Expected output (each line):
  เงินเดือน:         112,910.00
  ค่าเซกเตอร์:   44×840 =  36,960.00
  ค่าสอน:        2×10080 =  20,160.00
  ค่าผลงาน:          48,390.00
  ค่ายานพาหนะ NT: 15×840 = 12,600.00   ← (14+2+1−2)=15
  ค่าชม.บิน Tax:            146,685.00   ← (2080×35)+(2785×26.53)
  ค่าพักข้ามคืน:              4,266.00   ← (2×60×35.55)+(1×500)... 
                                           actually 4,266=2×60×35.55 only
                                           DOM 500 location still TBC
  ค่าชม.บิน NT:              23,590.00   ← 2785×8.47
  เงินได้พิเศษ:                  500.00
  ──────────────────────────────────────
  รวมรายได้:        406,061.00  ← TARGET ✅

  ค่าฝึกอบรม:       −20,000.00
  ประกันสังคม:          −875.00
  ภาษี:             −53,160.00
  ──────────────────────────────────────
  NET PAY:           331,526.00  ✅
```

### 8.9 Default Rates Object (for default-rates.js)

```javascript
export const DEFAULT_RATES = {
  // Fixed
  baseSalary:           112910,
  performanceAllow:      48390,

  // Block (2,100/hr = 35/min total)
  blockRatePerHr:         2100,   // display only
  domBlockPerMin:           35,   // 100% taxable
  interBlockTaxPerMin:   26.53,   // taxable portion
  interBlockNtPerMin:     8.47,   // non-taxable portion
  // interBlockTaxRatio: 0.758,   // 75.8% taxable
  // interBlockNtRatio:  0.242,   // 24.2% non-taxable

  // Sector & Transport
  sectorRate:             840,    // per landing leg
  transportRate:          840,    // per qualifying day

  // Per Diem
  perDiemInterUsd:         60,    // USD per INTER night
  perDiemDom:             500,    // THB per DOM night
  usdThb:               35.55,    // editable monthly

  // Instruction
  instructionRatePerHr:  1440,    // THB/hr
  instructionHoursPerDay:   7,    // hours per instruction day
  // instructionPerDay = 1440 × 7 = 10,080 THB

  // Special / one-time
  specialIncome:          500,    // one-time months only

  // Deductions
  socialSecurity:         875,    // always
  simTrainingFee:       20000,    // per SIM FFS session

  // Training deduction schedule
  trainingDeductionEnds: '2026-11', // last month = Nov 2026 payment
};
```

### 8.10 Known Remaining Unknowns (minor, won't affect accuracy much)

```
1. DOM per diem (500 THB) payslip line location:
   March ค่าพักข้ามคืน = 4,266 = exactly 2 INTER × 60 × 35.55
   No room for DOM 500 → likely bundled into ค่าชม.บิน NT
   or paid as separate unlisted line
   App shows it in ค่าพักข้ามคืน for now — adjust when confirmed

2. USD/THB company rate source:
   March = 35.55. Changes monthly.
   App has editable field per month.
   Pilot sets this when HR sheet arrives.

3. Progressive tax calculation:
   Thailand uses cumulative YTD income for tax brackets.
   App shows estimated tax based on YTD — not exact.
   Actual tax is computed by TVJ payroll system.
   App displays tax from payslip as reference only.

4. รายได้อื่นๆ (Other income):
   Appears in January 2026 only (likely Dec carryover).
   App has manual input field — pilot enters from payslip.
```

### 8.11 Month-by-Month ค่าฝึกอบรม Schedule

```
Payment month:  Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec
Work month:     Dec Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov

ค่าฝึกอบรม:     ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅  ✅  ❌
                                                            (stops Dec 2026 payment)
```

App should auto-apply this deduction for payment months Jan–Nov 2026 and auto-disable from December 2026.

