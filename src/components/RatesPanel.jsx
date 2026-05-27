import { useState, useCallback } from 'react';
import { DEFAULT_RATES } from '../constants/default-rates.js';
import { saveRates } from '../lib/storage.js';

const GROUPS = [
  {
    title: 'Variable Pay (flight-dependent)',
    fields: [
      { key: 'transportRate',        label: 'Transport / qualifying day',   unit: 'THB',     hint: 'Non-tax · flight + SIM + gndTrg − INTER dep days' },
      { key: 'sectorRate',           label: 'Sector pay / landing',         unit: 'THB',     hint: 'Taxable' },
      { key: 'domBlockPerMin',       label: 'DOM block / min',              unit: 'THB/min', hint: 'Taxable 100% (confirmed 35.00)' },
      { key: 'interBlockTaxPerMin',  label: 'INTER block Tax / min',        unit: 'THB/min', hint: 'Taxable 75.8% (confirmed 26.53)' },
      { key: 'interBlockNtPerMin',   label: 'INTER block NT / min',         unit: 'THB/min', hint: 'Non-tax 24.2% (confirmed 8.47) · tax+NT = 35.00' },
      { key: 'perDiemInterUsd',      label: 'Per diem INTER / night',       unit: 'USD',     hint: 'Taxable · converted at rate below' },
      { key: 'usdThb',               label: 'USD / THB rate',               unit: 'THB/USD', hint: 'Edit monthly (Mar 2026 = 35.55)' },
    ],
  },
  {
    title: 'Fixed Monthly (Captain)',
    fields: [
      { key: 'baseSalary',         label: 'Base salary',              unit: 'THB',   hint: 'Taxable — every month' },
      { key: 'performanceAllow',   label: 'Performance allowance',    unit: 'THB',   hint: 'Taxable — every month' },
      { key: 'otherIncome',        label: 'Other / special income',   unit: 'THB',   hint: 'Taxable · set each month: special income, DOM per diem, carryover' },
      { key: 'socialSecurity',     label: 'Social security',          unit: 'THB',   hint: 'Deduction — always 875' },
    ],
  },
  {
    title: 'Special Events',
    fields: [
      { key: 'instructionRatePerHr',   label: 'Instruction rate / hr',        unit: 'THB/hr', hint: 'ค่าสอน · GROUND TRAINING days only (1,440 × 7hr = 10,080/day)' },
      { key: 'instructionHoursPerDay', label: 'Instruction hours / day',      unit: 'hours',  hint: 'Teaching hours per GROUND TRAINING day (default 7)' },
      { key: 'simTrainingDeduction',   label: 'SIM FFS deduction / session',  unit: 'THB',    hint: 'ค่าฝึกอบรม · auto-stops after Nov 2026 payment month' },
    ],
  },
];

export default function RatesPanel({ rates, onRatesChange }) {
  const [saved, setSaved] = useState(false);

  const handleChange = useCallback((key, raw) => {
    const val = parseFloat(raw);
    if (isNaN(val)) return;
    const updated = { ...rates, [key]: val };
    onRatesChange(updated);
    saveRates(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, [rates, onRatesChange]);

  const resetDefaults = () => {
    onRatesChange({ ...DEFAULT_RATES });
    saveRates({ ...DEFAULT_RATES });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-sky-400 uppercase tracking-wider">Pay Rates</h3>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-xs text-emerald-400">Saved</span>
          )}
          <button
            onClick={resetDefaults}
            className="text-xs text-slate-400 hover:text-slate-200 border border-slate-600 hover:border-slate-500 rounded px-2 py-1 transition-colors"
          >
            Reset defaults
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {GROUPS.map(group => (
          <div key={group.title}>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
              {group.title}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {group.fields.map(({ key, label, unit, hint }) => (
                <div key={key} className="flex flex-col gap-0.5">
                  <label className="text-xs text-slate-400">{label}</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="any"
                      defaultValue={rates[key] ?? DEFAULT_RATES[key]}
                      key={`${key}-${rates[key]}`}
                      onBlur={e => handleChange(key, e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleChange(key, e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-sky-500"
                    />
                    <span className="text-xs text-slate-500 whitespace-nowrap">{unit}</span>
                  </div>
                  {hint && <span className="text-xs text-slate-500">{hint}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Note: DOM per diem (THB 500/night) placement is TBC — include in "Other/special income" until confirmed.
        SIM deduction auto-disables after Nov 2026 payment regardless of this setting.
      </p>
    </div>
  );
}
