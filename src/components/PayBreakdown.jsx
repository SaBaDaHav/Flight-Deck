import { buildPayslipLines, fmtThb, fmtMinutes } from '../lib/pay-calculator.js';

function LineRow({ line, isDeduction = false }) {
  if (line.amount === 0) return null;
  return (
    <tr className="border-b border-slate-700/50">
      <td className="py-1.5 pr-2">
        <span className="text-sm text-white">{line.label}</span>
        {line.labelEn && (
          <span className="ml-2 text-xs text-slate-400">{line.labelEn}</span>
        )}
        {line.taxable === false && (
          <span className="ml-1 text-xs text-amber-500/70">NT</span>
        )}
      </td>
      <td className={`py-1.5 text-right text-sm font-mono tabular-nums ${
        isDeduction ? 'text-red-400' : 'text-white'
      }`}>
        {isDeduction ? '−' : ''}{fmtThb(line.amount)}
      </td>
    </tr>
  );
}

export default function PayBreakdown({ monthlyResult, rates, stats }) {
  if (!monthlyResult) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-slate-500 text-sm">
        Enter allowance data above to see pay breakdown.
      </div>
    );
  }

  const payslip = buildPayslipLines(monthlyResult, rates);
  const { incomeLines, deductionLines, totalIncome, totalDeductions, netPay } = payslip;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-sky-400 uppercase tracking-wider mb-3">
        Pay Breakdown
      </h3>

      {/* Stats summary */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 pb-4 border-b border-slate-700">
          <Stat label="DOM block"   value={fmtMinutes(stats.totalDomMins)}   sub={`${(stats.totalDomMins / 60).toFixed(1)} hr`} />
          <Stat label="INTER block" value={fmtMinutes(stats.totalInterMins)} sub={`${(stats.totalInterMins / 60).toFixed(1)} hr`} />
          <Stat label="Legs"        value={stats.totalLegs}                   sub="landings" />
          <Stat label="Duty days"   value={stats.totalDutyDays}               sub={`+${stats.simDays} SIM`} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Income */}
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
            รายการได้ — Income
          </p>
          <table className="w-full">
            <tbody>
              {incomeLines.map(line => <LineRow key={line.label} line={line} />)}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-600">
                <td className="pt-2 text-sm font-semibold text-slate-200">รวมรายได้ทั้งหมด</td>
                <td className="pt-2 text-right text-sm font-bold font-mono tabular-nums text-sky-400">
                  {fmtThb(totalIncome)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Deductions */}
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
            รายการหัก — Deductions
          </p>
          <table className="w-full">
            <tbody>
              {deductionLines.map(line => <LineRow key={line.label} line={line} isDeduction />)}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-600">
                <td className="pt-2 text-sm font-semibold text-slate-200">รายหักทั้งหมด</td>
                <td className="pt-2 text-right text-sm font-bold font-mono tabular-nums text-red-400">
                  −{fmtThb(totalDeductions)}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Net pay */}
          <div className="mt-4 pt-3 border-t-2 border-slate-500 flex justify-between items-baseline">
            <span className="text-base font-bold text-white">รายได้สุทธิ — Net Pay</span>
            <span className="text-xl font-bold font-mono tabular-nums text-emerald-400">
              {fmtThb(netPay)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="bg-slate-700/50 rounded p-2 text-center">
      <div className="text-xs text-slate-400 mb-0.5">{label}</div>
      <div className="text-base font-bold text-white font-mono">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}
