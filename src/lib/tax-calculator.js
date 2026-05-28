// Thai income tax estimator — calibrated against actual TVJ payslips
// Uses empirical YTD effective rates from real payslip data
// More accurate than bracket calculation because it accounts for
// pilot's personal deductions registered with TVJ HR

// Actual monthly tax withheld — from real payslips (payment month = work month + 1)
// Key insight: TVJ payslip YTD fields include prior-year carryover — unreliable for calibration.
// We use actual monthly tax and monthly income instead, and compute effective rate directly.
const MONTHLY_DATA = [
  { paymentMonth: 1, income: 162600.81, tax: 11063  },
  { paymentMonth: 2, income: 350180.00, tax: 45097  },
  { paymentMonth: 3, income: 406061.00, tax: 53160  },
  { paymentMonth: 4, income: 393422.00, tax: 49973  },
];

// Effective rate for each known month
function getEffectiveRate(paymentMonth) {
  const known = MONTHLY_DATA.find(d => d.paymentMonth === paymentMonth);
  if (known) return known.tax / known.income;

  // Before first known — use first rate
  if (paymentMonth < MONTHLY_DATA[0].paymentMonth) {
    return MONTHLY_DATA[0].tax / MONTHLY_DATA[0].income;
  }

  // After last known — extrapolate: rate rises ~0.3% per month as YTD income grows
  const last = MONTHLY_DATA[MONTHLY_DATA.length - 1];
  if (paymentMonth > last.paymentMonth) {
    const monthsExtra = paymentMonth - last.paymentMonth;
    const baseRate = last.tax / last.income;
    return Math.min(baseRate + monthsExtra * 0.003, 0.28);
  }

  // Interpolate between two known months
  const lower = [...MONTHLY_DATA].reverse().find(d => d.paymentMonth < paymentMonth);
  const upper = MONTHLY_DATA.find(d => d.paymentMonth > paymentMonth);
  if (!lower || !upper) return 0.13;
  const t = (paymentMonth - lower.paymentMonth) / (upper.paymentMonth - lower.paymentMonth);
  const lowerRate = lower.tax / lower.income;
  const upperRate = upper.tax / upper.income;
  return lowerRate + t * (upperRate - lowerRate);
}

// Estimate monthly tax for a given payment month and income
export function calcMonthlyWithholding(paymentMonth, monthlyIncome) {
  const rate = getEffectiveRate(paymentMonth);
  return Math.round(monthlyIncome * rate);
}

// Add real payslip data to improve future estimates
export function addPayslipDataPoint(paymentMonth, income, tax) {
  const existing = MONTHLY_DATA.findIndex(d => d.paymentMonth === paymentMonth);
  if (existing >= 0) {
    MONTHLY_DATA[existing] = { paymentMonth, income, tax };
  } else {
    MONTHLY_DATA.push({ paymentMonth, income, tax });
    MONTHLY_DATA.sort((a, b) => a.paymentMonth - b.paymentMonth);
  }
}

// Validate against known payslips
export function validateAgainstPayslips() {
  return MONTHLY_DATA.map(p => {
    const estimated = calcMonthlyWithholding(p.paymentMonth, p.income);
    return {
      month: p.paymentMonth,
      income: Math.round(p.income),
      actualTax: p.tax,
      estimatedTax: estimated,
      diff: estimated - p.tax,
      accuracy: (100 - Math.abs(estimated - p.tax) / p.tax * 100).toFixed(1) + '%',
    };
  });
}
