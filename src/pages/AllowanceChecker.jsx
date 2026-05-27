import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  calcDayPay, calcMonthlyPay, fmtThb, deltaToThb,
} from '../lib/pay-calculator.js';
import { loadAllowance, saveAllowance, loadRates, saveRates, loadRoster } from '../lib/storage.js';
import { DEFAULT_RATES } from '../constants/default-rates.js';
import { isDomestic } from '../constants/thai-airports.js';
import PayBreakdown from '../components/PayBreakdown.jsx';
import RatesPanel from '../components/RatesPanel.jsx';

// ─── helpers ────────────────────────────────────────────────────────────────

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function makeEmptyRow(date) {
  return {
    date,
    route: '',
    domScheduled: '',
    interScheduled: '',
    domActual: '',
    interActual: '',
    legs: '',
    perDiem: '',
    code: '',
    simCount: '0',
    instSessions: '0',
  };
}

function toInt(str) {
  const n = parseInt(str, 10);
  return isNaN(n) ? 0 : n;
}

function routeFlags(route) {
  const u = (route || '').trim().toUpperCase();
  const isSim    = u.includes('FFS') || (u.includes('INST') && u.includes('SIM'));
  const isGround = !isSim && (u.includes('GROUND TRAINING') || (u.startsWith('INST') && u.length < 20));
  const isOff    = !u || u === 'OFF';
  return { isSim, isGround, isOff };
}

function rowEffective(row) {
  const domSched  = toInt(row.domScheduled);
  const interSched = toInt(row.interScheduled);
  const domEff    = row.domActual  !== '' ? toInt(row.domActual)  : domSched;
  const interEff  = row.interActual !== '' ? toInt(row.interActual) : interSched;
  const domDelta  = row.domActual  !== '' ? domEff  - domSched  : 0;
  const interDelta = row.interActual !== '' ? interEff - interSched : 0;
  return { domSched, interSched, domEff, interEff, domDelta, interDelta };
}

function rowDiscrepancy(row) {
  const { domDelta, interDelta } = rowEffective(row);
  const totalAbsDelta = Math.abs(domDelta) + Math.abs(interDelta);
  if (totalAbsDelta === 0) return null;
  return totalAbsDelta <= 15 ? 'minor' : 'major';
}

// ─── calendar sync helpers ───────────────────────────────────────────────────

function parseHhmmToMin(str) {
  if (!str) return 0;
  const [h, m] = str.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function buildRouteFromCalEntry(entry) {
  if (entry.sectors && entry.sectors.length > 0) {
    const airports = [entry.sectors[0].origin, ...entry.sectors.map(s => s.dest)];
    return airports.join('→');
  }
  if (entry.from && entry.to) return `${entry.from}→${entry.to}`;
  return entry.dutyCode || '';
}

function getPerDiemFromCalEntry(entry) {
  if (!entry.layover) return '';
  const lastDest = entry.sectors?.length > 0
    ? entry.sectors[entry.sectors.length - 1].dest
    : entry.to;
  if (!lastDest) return '';
  return isDomestic(lastDest) ? 'DOM' : 'INTER';
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const PER_DIEM_OPTIONS = [
  { value: '',      label: '—' },
  { value: 'DOM',   label: 'DOM' },
  { value: 'INTER', label: 'INTER' },
];

// ─── sub-components ──────────────────────────────────────────────────────────

function TableInput({ value, onChange, placeholder = '', className = '', type = 'text', min, step }) {
  return (
    <input
      type={type}
      min={min}
      step={step}
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className={`bg-transparent border-0 border-b border-slate-600 focus:border-sky-500 focus:outline-none text-sm px-1 py-0.5 w-full placeholder:text-slate-700 ${className}`}
    />
  );
}

function RowHighlight({ disc }) {
  if (!disc) return null;
  return (
    <span className={`absolute inset-0 pointer-events-none rounded-sm ${
      disc === 'major' ? 'bg-red-500/10' : 'bg-amber-500/10'
    }`} />
  );
}

function AllowanceRow({ row, idx, onUpdate, rates }) {
  const { isSim, isGround, isOff } = routeFlags(row.route);
  const { domSched, interSched, domEff, interEff, domDelta, interDelta } = rowEffective(row);
  const disc = rowDiscrepancy(row);

  const legs      = toInt(row.legs);
  const perDiem   = row.perDiem || null;
  const simCount  = toInt(row.simCount);
  const instSess  = toInt(row.instSessions);

  const dayPay = useMemo(() => calcDayPay({
    domMins: domEff,
    interMins: interEff,
    legs,
    perDiem,
    isSim,
    isGround,
    instSessions: instSess,
  }, rates), [domEff, interEff, legs, perDiem, isSim, isGround, instSess, rates]);

  const set = useCallback(field => val => onUpdate(row.date, field, val), [row.date, onUpdate]);

  const deltaThb = deltaToThb(domDelta, interDelta, rates).total;

  return (
    <tr className={`relative border-b border-slate-700/40 ${
      disc === 'major'  ? 'bg-red-500/5' :
      disc === 'minor'  ? 'bg-amber-500/5' :
      idx % 2 === 0     ? 'bg-slate-900/40' : ''
    }`}>
      {/* Date */}
      <td className="px-2 py-1 text-center text-sm text-slate-400 font-mono select-none w-8">
        {row.date}
      </td>

      {/* Route */}
      <td className="px-1 py-0.5 min-w-36">
        <TableInput
          value={row.route}
          onChange={val => {
            const flags = routeFlags(val);
            onUpdate(row.date, 'route', val);
            // auto-set simCount when FFS detected
            if (flags.isSim && row.simCount === '0') onUpdate(row.date, 'simCount', '1');
            if (!flags.isSim && row.simCount === '1') onUpdate(row.date, 'simCount', '0');
          }}
          placeholder=""
          className="text-white placeholder-slate-600"
        />
      </td>

      {/* DOM scheduled */}
      <td className="px-1 py-0.5 w-16">
        <TableInput
          type="number" min="0" step="1"
          value={row.domScheduled}
          onChange={set('domScheduled')}
          placeholder="0"
          className="text-slate-400 text-right"
        />
      </td>

      {/* DOM actual */}
      <td className="px-1 py-0.5 w-16">
        <TableInput
          type="number" min="0" step="1"
          value={row.domActual}
          onChange={set('domActual')}
          placeholder="—"
          className={`text-right ${row.domActual !== '' ? 'text-white' : 'text-slate-600'}`}
        />
      </td>

      {/* INTER scheduled */}
      <td className="px-1 py-0.5 w-16">
        <TableInput
          type="number" min="0" step="1"
          value={row.interScheduled}
          onChange={set('interScheduled')}
          placeholder="0"
          className="text-slate-400 text-right"
        />
      </td>

      {/* INTER actual */}
      <td className="px-1 py-0.5 w-16">
        <TableInput
          type="number" min="0" step="1"
          value={row.interActual}
          onChange={set('interActual')}
          placeholder="—"
          className={`text-right ${row.interActual !== '' ? 'text-white' : 'text-slate-600'}`}
        />
      </td>

      {/* Legs */}
      <td className="px-1 py-0.5 w-12">
        <TableInput
          type="number" min="0" step="1"
          value={row.legs}
          onChange={set('legs')}
          placeholder="0"
          className="text-white text-right"
        />
      </td>

      {/* Per diem */}
      <td className="px-1 py-0.5 w-20">
        <select
          value={row.perDiem}
          onChange={e => set('perDiem')(e.target.value)}
          className="bg-transparent border-b border-slate-600 focus:border-sky-500 focus:outline-none text-sm text-white w-full py-0.5"
        >
          {PER_DIEM_OPTIONS.map(o => (
            <option key={o.value} value={o.value} className="bg-slate-800">{o.label}</option>
          ))}
        </select>
      </td>

      {/* Code */}
      <td className="px-1 py-0.5 w-16">
        <TableInput
          value={row.code}
          onChange={set('code')}
          placeholder=""
          className="text-slate-300 text-center"
        />
      </td>

      {/* SIM */}
      <td className="px-1 py-0.5 w-10 text-center">
        {isSim ? (
          <span className="text-xs text-amber-400">FFS</span>
        ) : instSess > 0 ? (
          <span className="text-xs text-sky-400">{instSess}×</span>
        ) : (
          <span className="text-xs text-slate-700">—</span>
        )}
      </td>

      {/* Day pay */}
      <td className="px-2 py-1 text-right w-24">
        {!isOff && (domEff > 0 || interEff > 0 || isSim) ? (
          <span className="text-xs text-slate-400 font-mono">{fmtThb(dayPay.total)}</span>
        ) : (
          <span className="text-xs text-slate-700">—</span>
        )}
      </td>

      {/* Delta */}
      <td className="px-2 py-1 text-right w-24">
        {deltaThb !== 0 ? (
          <span className={`text-xs font-mono font-semibold ${deltaThb > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {deltaThb > 0 ? '+' : ''}{fmtThb(deltaThb)}
          </span>
        ) : (
          <span className="text-xs text-slate-700">—</span>
        )}
      </td>
    </tr>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function AllowanceChecker({ calEntries = [], calYear, calMonth }) {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows,  setRows]  = useState(() => {
    const n = daysInMonth(now.getFullYear(), now.getMonth() + 1);
    return Array.from({ length: n }, (_, i) => makeEmptyRow(i + 1));
  });
  const [rates, setRates] = useState(() => loadRates() || { ...DEFAULT_RATES });
  const [showRates,    setShowRates]    = useState(false);
  const [isDirty,      setIsDirty]      = useState(false);
  const [syncSummary,  setSyncSummary]  = useState('');

  // Reload from storage when month/year changes
  useEffect(() => {
    const stored = loadAllowance(year, month);
    const n = daysInMonth(year, month);
    if (stored && stored.rows) {
      // Merge stored rows with full-month scaffold (handles partial saves)
      const byDate = Object.fromEntries(stored.rows.map(r => [r.date, r]));
      setRows(Array.from({ length: n }, (_, i) => byDate[i + 1] || makeEmptyRow(i + 1)));
    } else {
      setRows(Array.from({ length: n }, (_, i) => makeEmptyRow(i + 1)));
    }
    setIsDirty(false);
  }, [year, month]);

  const navigateMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1)  { m = 12; y--; }
    setMonth(m);
    setYear(y);
  };

  const updateRow = useCallback((date, field, value) => {
    setRows(prev => prev.map(r => r.date === date ? { ...r, [field]: value } : r));
    setIsDirty(true);
  }, []);

  const save = () => {
    saveAllowance(year, month, { rows });
    setIsDirty(false);
  };

  // True when there is roster data available for the currently selected month
  const hasRosterData = useMemo(() => {
    const stored = loadRoster(year, month);
    if (stored?.entries?.length > 0) return true;
    if (calYear === year && calMonth === month && calEntries.length > 0) return true;
    return false;
  }, [year, month, calYear, calMonth, calEntries]);

  const syncFromCalendar = useCallback(() => {
    // Read from storage first; fall back to calEntries prop if same month
    const storageKey = `flight-deck:roster:${year}-${String(month).padStart(2, '0')}`;
    const stored = loadRoster(year, month);
    console.log(`[Sync] Storage key "${storageKey}":`, stored ? `${stored.entries?.length ?? 0} entries` : 'null');

    let entries = stored?.entries;
    let source = 'storage';
    if ((!entries || entries.length === 0) && calYear === year && calMonth === month) {
      entries = calEntries;
      source = 'calEntries';
      console.log('[Sync] Falling back to calEntries:', calEntries.length, 'entries');
    }
    if (!entries || entries.length === 0) {
      setSyncSummary(
        `No roster data for ${MONTH_NAMES[month - 1]} ${year} — ` +
        `upload the Merlot roster in the Calendar tab and navigate to this month.`
      );
      return;
    }
    console.log(`[Sync] Using ${entries.length} entries from ${source}. Types:`,
      [...new Set(entries.map(e => e.type))],
      '| Sample dates:', entries.slice(0, 3).map(e => e.date)
    );

    // Build date → entry lookup; skip continuation/comment rows
    const byDate = {};
    for (const e of entries) {
      if (!e.date) continue;
      if (['CONTINUATION', 'COMMENT', 'PROFILE'].includes(e.type)) continue;
      if (!byDate[e.date]) byDate[e.date] = e;
    }
    console.log(`[Sync] byDate has ${Object.keys(byDate).length} unique dates. Looking for ${year}-${String(month).padStart(2,'0')}-XX`);

    let flightCount = 0, groundCount = 0, simCount = 0;
    const monthStr = String(month).padStart(2, '0');

    setRows(prev => prev.map(row => {
      const fullDate = `${year}-${monthStr}-${String(row.date).padStart(2, '0')}`;
      const entry = byDate[fullDate];
      if (!entry) return row;

      const type      = entry.type || 'FLIGHT';
      const codeUpper = (entry.dutyCode || '').toUpperCase();

      // Detect SIM / GROUND_TRAINING from type or dutyCode keywords
      const isSim    = type === 'SIM' || codeUpper.includes('SIM') || codeUpper.includes('FFS');
      const isGround = !isSim && (
        type === 'GROUND_TRAINING' ||
        codeUpper.includes('GNDTNG') || codeUpper.includes('TRAINING') || codeUpper.includes('GND')
      );
      const isOff    = type === 'OFF' || type === 'RERRP36' || type === 'RERRP2LD' || type === 'STANDBY';

      // Route string must match routeFlags() keyword patterns for correct pay calc
      let route;
      if (isSim)        route = 'INST SIM FFS';
      else if (isGround) route = 'GROUND TRAINING INST';
      else if (isOff)    route = entry.dutyCode || '';
      else               route = buildRouteFromCalEntry(entry);

      // Per diem from last overnight station
      const perDiem = getPerDiemFromCalEntry(entry);

      // CODE: auto-set only if not already filled by user
      const code = row.code || (isSim ? 'INST-SIM' : isGround ? 'SCH-INST' : '');

      if (isSim)          simCount++;
      else if (isGround)  groundCount++;
      else if (!isOff)    flightCount++;

      return {
        ...row,
        route,
        legs:         (!isOff && entry.numLegs != null) ? String(entry.numLegs) : row.legs,
        perDiem:      perDiem !== '' ? perDiem : row.perDiem,
        simCount:     isSim    ? '1' : '0',
        instSessions: isGround ? '1' : '0',
        code,
        // domScheduled / interScheduled / domActual / interActual intentionally untouched
        // — those columns are filled manually from the HR email
      };
    }));

    console.log(`[Sync] Done — flights: ${flightCount}, ground: ${groundCount}, SIM: ${simCount}`);
    setSyncSummary(
      `Synced from ${source} (${MONTH_NAMES[month - 1]} ${year}): ` +
      `${flightCount} flight${flightCount !== 1 ? 's' : ''}, ` +
      `${groundCount} ground training, ${simCount} SIM`
    );
    setIsDirty(true);
  }, [calEntries, calYear, calMonth, year, month]);

  // ─── derived totals ───────────────────────────────────────────────────────

  const { totals, days, discrepancies, monthlyResult, stats } = useMemo(() => {
    let totalDomSched = 0, totalInterSched = 0;
    let totalDomEff   = 0, totalInterEff   = 0;
    let totalLegs     = 0, totalDutyDays   = 0, simDays = 0;
    let pdDom = 0, pdInter = 0;
    const discs = [];
    const dayObjs = [];

    for (const row of rows) {
      const { isSim, isGround, isOff } = routeFlags(row.route);
      const { domSched, interSched, domEff, interEff, domDelta, interDelta } = rowEffective(row);
      const legs     = toInt(row.legs);
      const perDiem  = row.perDiem || null;
      const instSess = toInt(row.instSessions);

      totalDomSched  += domSched;
      totalInterSched += interSched;
      totalDomEff    += domEff;
      totalInterEff  += interEff;
      totalLegs      += legs;
      if (!isOff && (domEff > 0 || interEff > 0 || isSim)) totalDutyDays++;
      if (isSim) simDays++;
      if (perDiem === 'DOM')   pdDom++;
      if (perDiem === 'INTER') pdInter++;

      const disc = rowDiscrepancy(row);
      if (disc) {
        const delta     = deltaToThb(domDelta, interDelta, rates);
        const colType   = interDelta !== 0 ? 'INTER' : 'DOM';
        const scheduled = interDelta !== 0 ? interSched : domSched;
        const actual    = interDelta !== 0 ? interEff   : domEff;
        discs.push({
          date: row.date,
          route: row.route || '—',
          colType,
          scheduled,
          actual,
          domDelta,
          interDelta,
          deltaThb: delta.total,
          severity: disc,
        });
      }

      dayObjs.push({
        domMins:      domEff,
        interMins:    interEff,
        legs,
        perDiem,
        isSim,
        isGround,
        instSessions: instSess,
      });
    }

    const simCountTotal = rows.filter(r => routeFlags(r.route).isSim).length;
    const result = calcMonthlyPay(dayObjs, rates, simCountTotal);

    return {
      totals: { totalDomSched, totalInterSched, totalDomEff, totalInterEff, totalLegs, pdDom, pdInter },
      days: dayObjs,
      discrepancies: discs,
      monthlyResult: result,
      stats: {
        totalDomMins:   totalDomEff,
        totalInterMins: totalInterEff,
        totalLegs,
        totalDutyDays,
        simDays,
      },
    };
  }, [rows, rates]);

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-bold text-white">Allowance Checker</h1>
          <p className="text-xs text-slate-400">HR sheet verification · Pay calculator</p>
        </div>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {/* Month navigator */}
          <button
            onClick={() => navigateMonth(-1)}
            className="w-7 h-7 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >‹</button>
          <span className="text-sm font-semibold text-white min-w-32 text-center">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button
            onClick={() => navigateMonth(1)}
            className="w-7 h-7 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >›</button>

          {/* Save */}
          <button
            onClick={save}
            className={`text-sm px-3 py-1.5 rounded transition-colors ${
              isDirty
                ? 'bg-sky-600 hover:bg-sky-500 text-white'
                : 'bg-slate-700 text-slate-400 cursor-default'
            }`}
          >
            {isDirty ? 'Save' : 'Saved'}
          </button>

          {/* Sync from calendar */}
          {hasRosterData && (
            <button
              onClick={syncFromCalendar}
              className="text-sm px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
              title="Fill route / legs / per diem from saved Merlot roster. HR block minutes are entered separately from the HR email."
            >
              Sync from Calendar
            </button>
          )}

          {/* Toggle rates */}
          <button
            onClick={() => setShowRates(v => !v)}
            className="text-sm px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >
            {showRates ? 'Hide rates' : 'Rates'}
          </button>
        </div>
      </div>

      {/* Sync summary */}
      {syncSummary && (
        <div className="px-3 py-2 bg-emerald-900/30 border border-emerald-700/40 rounded-lg text-xs text-emerald-300">
          {syncSummary}
        </div>
      )}

      {/* Rates panel */}
      {showRates && (
        <RatesPanel rates={rates} onRatesChange={r => { setRates(r); saveRates(r); }} />
      )}

      {/* Editable table */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-700/60 text-xs text-slate-400 uppercase tracking-wide">
                <th className="px-2 py-2 text-center w-8">#</th>
                <th className="px-1 py-2 text-left min-w-36">Route / Duty</th>
                <th className="px-1 py-2 text-center w-16" title="DOM block minutes from HR sheet">DOM HR</th>
                <th className="px-1 py-2 text-center w-16" title="Your actual DOM block minutes">DOM Act</th>
                <th className="px-1 py-2 text-center w-16" title="INTER block minutes from HR sheet">INT HR</th>
                <th className="px-1 py-2 text-center w-16" title="Your actual INTER block minutes">INT Act</th>
                <th className="px-1 py-2 text-center w-12">Legs</th>
                <th className="px-1 py-2 text-center w-20">Per Diem</th>
                <th className="px-1 py-2 text-center w-16">Code</th>
                <th className="px-1 py-2 text-center w-10">SIM</th>
                <th className="px-2 py-2 text-right w-24">Day Pay</th>
                <th className="px-2 py-2 text-right w-24">Δ THB</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <AllowanceRow
                  key={row.date}
                  row={row}
                  idx={idx}
                  onUpdate={updateRow}
                  rates={rates}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-700/40 border-t-2 border-slate-600 text-xs font-semibold">
                <td className="px-2 py-2 text-slate-400 text-center" colSpan={2}>
                  Totals
                </td>
                <td className="px-1 py-2 text-right text-slate-300 font-mono">
                  {totals.totalDomSched || '—'}
                </td>
                <td className="px-1 py-2 text-right text-sky-300 font-mono">
                  {totals.totalDomEff !== totals.totalDomSched ? totals.totalDomEff : '—'}
                </td>
                <td className="px-1 py-2 text-right text-slate-300 font-mono">
                  {totals.totalInterSched || '—'}
                </td>
                <td className="px-1 py-2 text-right text-sky-300 font-mono">
                  {totals.totalInterEff !== totals.totalInterSched ? totals.totalInterEff : '—'}
                </td>
                <td className="px-1 py-2 text-right text-white font-mono">
                  {totals.totalLegs || '—'}
                </td>
                <td className="px-1 py-2 text-center text-slate-400">
                  {totals.pdDom > 0 && <span className="mr-1 text-emerald-400">{totals.pdDom}D</span>}
                  {totals.pdInter > 0 && <span className="text-sky-400">{totals.pdInter}I</span>}
                </td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Discrepancy panel */}
      {discrepancies.length > 0 && (
        <div className="bg-slate-800 border border-amber-500/40 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-amber-400 font-bold">
              {discrepancies.some(d => d.severity === 'major') ? '⚠' : 'ℹ'}
            </span>
            <h3 className="text-sm font-semibold text-amber-300">
              DISCREPANCIES — {discrepancies.length} {discrepancies.length === 1 ? 'day differs' : 'days differ'} from HR sheet
            </h3>
          </div>
          <div className="space-y-1 font-mono text-xs mb-3">
            {discrepancies.map(d => (
              <div
                key={d.date}
                className={`flex items-center gap-2 py-1 border-b border-slate-700/50 ${
                  d.severity === 'major' ? 'text-red-300' : 'text-amber-300'
                }`}
              >
                <span className="w-6 text-right text-slate-400">D{d.date}</span>
                <span className="w-36 truncate text-slate-300">{d.route}</span>
                <span className={`w-10 ${d.colType === 'INTER' ? 'text-sky-400' : 'text-emerald-400'}`}>
                  {d.colType}
                </span>
                <span className="text-slate-400">{d.scheduled}</span>
                <span className="text-slate-500">→</span>
                <span>{d.actual}</span>
                <span className={d.deltaThb > 0 ? 'text-emerald-400' : 'text-red-400'}>
                  ({d.deltaThb > 0 ? '+' : ''}{fmtThb(d.deltaThb)})
                </span>
              </div>
            ))}
          </div>

          {/* Totals line */}
          <div className="text-xs font-mono text-slate-300 border-t border-slate-600 pt-2 mb-3">
            {(() => {
              const totalDomDelta   = discrepancies.reduce((s, d) => s + d.domDelta,   0);
              const totalInterDelta = discrepancies.reduce((s, d) => s + d.interDelta, 0);
              const totalThb        = discrepancies.reduce((s, d) => s + d.deltaThb,   0);
              return (
                <span>
                  Total:&nbsp;
                  {totalDomDelta !== 0 && (
                    <span className={totalDomDelta > 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {totalDomDelta > 0 ? '+' : ''}{totalDomDelta} min DOM&nbsp;
                    </span>
                  )}
                  {totalInterDelta !== 0 && (
                    <span className={totalInterDelta > 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {totalInterDelta > 0 ? '+' : ''}{totalInterDelta} min INTER&nbsp;
                    </span>
                  )}
                  =&nbsp;
                  <span className={`font-bold ${totalThb > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {totalThb > 0 ? '+' : ''}{fmtThb(totalThb)} gross
                  </span>
                </span>
              );
            })()}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                const lines = discrepancies.map(d =>
                  `Day ${d.date}: ${d.route.padEnd(12)} ${d.colType.padEnd(6)} ${d.scheduled} → ${d.actual} (${d.deltaThb > 0 ? '+' : ''}${fmtThb(d.deltaThb)})`
                );
                const total = discrepancies.reduce((s, d) => s + d.deltaThb, 0);
                lines.push(`Total impact: ${total > 0 ? '+' : ''}${fmtThb(total)} THB`);
                navigator.clipboard?.writeText(lines.join('\n'));
              }}
              className="text-xs px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            >
              Copy for HR
            </button>
            <button
              onClick={() => {
                const json = JSON.stringify({ month: `${year}-${String(month).padStart(2,'0')}`, discrepancies }, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href = url;
                a.download = `discrepancies-${year}-${String(month).padStart(2,'0')}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="text-xs px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            >
              Export JSON
            </button>
          </div>
        </div>
      )}

      {/* Pay breakdown */}
      <PayBreakdown monthlyResult={monthlyResult} rates={rates} stats={stats} />
    </div>
  );
}
