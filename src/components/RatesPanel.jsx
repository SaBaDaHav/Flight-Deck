import { useState, useCallback } from 'react';
import { DEFAULT_RATES } from '../constants/default-rates.js';
import { saveRates } from '../lib/storage.js';

const GROUPS = [
  {
    title: 'Variable Pay (flight-dependent)',
    fields: [
      { key: 'transportPerDay',    label: 'Transport / duty day',   unit: 'THB',      hint: 'Non-taxable' },
      { key: 'sectorPerLeg',       label: 'Sector pay / landing',   unit: 'THB',      hint: 'Taxable' },
      { key: 'domBlockPerHr',      label: 'DOM block / hr',         unit: 'THB/hr',   hint: '÷60 = 11.34/min · Non-taxable' },
      { key: 'interBlockPerHr',    label: 'INTER block / hr',       unit: 'THB/hr',   hint: '÷60 = 52.67/min · Taxable' },
      { key: 'perDiemDom',         label: 'Per diem DOM / night',   unit: 'THB',      hint: 'Taxable' },
      { key: 'perDiemInterUsd',    label: 'Per diem INTER / night', unit: 'USD',      hint: 'Taxable · converted at exchange rate' },
      { key: 'usdThb',             label: 'USD / THB rate',         unit: 'THB/USD',  hint: 'Edit monthly' },
    ],
  },
  {
    title: 'Fixed Monthly (Captain)',
    fields: [
      { key: 'baseSalary',         label: 'Base salary',            unit: 'THB',      hint: 'Taxable' },
      { key: 'performanceAllow',   label: 'Performance allowance',  unit: 'THB',      hint: 'Taxable' },
      { key: 'specialIncome',      label: 'Special income',         unit: 'THB',      hint: 'Taxable' },
      { key: 'socialSecurity',     label: 'Social security',        unit: 'THB',      hint: 'Deduction' },
    ],
  },
  {
    title: 'Special Events',
    fields: [
      { key: 'instructionPerSession', label: 'Instruction / session', unit: 'THB', hint: 'Income (ค่าสอน)' },
      { key: 'simTrainingDeduction',  label: 'SIM FFS / session',     unit: 'THB', hint: 'Deduction (ค่าฝึกอบรม)' },
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
    </div>
  );
}
