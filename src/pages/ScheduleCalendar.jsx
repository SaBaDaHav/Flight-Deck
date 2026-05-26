import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { analyzeRosterImage, mergeRosterResults } from '../lib/anthropic.js';
import { analyzeEntry, getMinRest } from '../lib/ftl-rules.js';
import { loadRoster, saveRoster, loadCrewProfile, saveCrewProfile } from '../lib/storage.js';
import CalendarGrid from '../components/CalendarGrid.jsx';
import DayModal from '../components/DayModal.jsx';

// ─── helpers ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function parseHhmm(str) {
  if (!str) return 0;
  const [h, m] = str.split(':').map(Number);
  return h * 60 + (m || 0);
}

function fmtMin(mins) {
  if (!mins) return '0:00';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Date-aware rest calculation between two entries (handles multi-day layovers correctly)
function computeRestMin(prevEntry, currEntry) {
  if (!prevEntry?.release || !currEntry?.report || !prevEntry?.date || !currEntry?.date) return null;
  try {
    const prevTime = new Date(`${prevEntry.date}T${prevEntry.release}:00`);
    if (prevEntry.releaseNextDay) prevTime.setDate(prevTime.getDate() + 1);
    const currTime = new Date(`${currEntry.date}T${currEntry.report}:00`);
    const diff = Math.round((currTime - prevTime) / 60000);
    return diff >= 0 ? diff : null;
  } catch {
    return null;
  }
}

// Enrich entries with computed FTL flags (overrides AI flags with calculated values)
function enrichEntries(entries) {
  if (!entries || entries.length === 0) return entries;
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  return sorted.map((entry, idx) => {
    if (entry.type !== 'FLIGHT' && entry.type !== 'STANDBY') return entry;

    const prev = sorted.slice(0, idx).reverse().find(
      e => (e.type === 'FLIGHT' || e.type === 'STANDBY') && e.release
    );

    const ftl = analyzeEntry(entry, prev || null);

    // Use date-aware rest calculation instead of time-only durationMin
    const restBeforeMin    = computeRestMin(prev || null, entry);
    const minRestRequired  = prev ? getMinRest(parseHhmm(prev.dutyTime), !prev.layover) : null;
    const restViolation    = restBeforeMin !== null && minRestRequired !== null && restBeforeMin < minRestRequired;

    return {
      ...entry,
      nightDuty:        ftl.nightDuty,
      earlyStart:       ftl.earlyStart,
      lateFinish:       ftl.lateFinish,
      woclEncroached:   ftl.woclEncroached,
      _ftlViolation:    ftl.fdpStatus === 'violation' || restViolation,
      _ftlWarning:      ftl.fdpStatus === 'warning',
      _restBeforeMin:   restBeforeMin,
      _minRestRequired: minRestRequired,
      _restViolation:   restViolation,
      _ftlAnalysis:     ftl,
      _prevEntry:       prev || null,
    };
  });
}

// ─── stat badge ───────────────────────────────────────────────────────────────
function StatBadge({ label, value, accent = false }) {
  return (
    <div className={`text-center px-3 py-1.5 rounded-lg border ${
      accent ? 'bg-sky-900/40 border-sky-700 text-sky-200' : 'bg-slate-700/40 border-slate-700 text-slate-200'
    }`}>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="font-mono font-semibold text-sm">{value}</div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export default function ScheduleCalendar() {
  const now = new Date();
  const [year,   setYear]   = useState(now.getFullYear());
  const [month,  setMonth]  = useState(now.getMonth() + 1);
  const [entries, setEntries] = useState([]);
  const [totals,  setTotals]  = useState(null);
  const [crewProfile, setCrewProfile] = useState(() => loadCrewProfile());
  const [selectedDay, setSelectedDay] = useState(null); // { entry, prevEntry, nextEntry }
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Load stored roster when month/year changes
  useEffect(() => {
    const stored = loadRoster(year, month);
    if (stored) {
      setEntries(enrichEntries(stored.entries || []));
      setTotals(stored.totals || null);
    } else {
      setEntries([]);
      setTotals(null);
    }
    setLoadError(null);
  }, [year, month]);

  const navigateMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m > 12) { m = 1;  y++; }
    if (m <  1) { m = 12; y--; }
    setMonth(m);
    setYear(y);
  };

  // ─── image processing ─────────────────────────────────────────────────────

  const processFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setLoadError('Please upload image files (PNG, JPG, JPEG, WEBP).');
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const base64s  = await Promise.all(imageFiles.map(fileToBase64));
      const results  = await Promise.all(base64s.map(b64 => analyzeRosterImage(b64)));
      const merged   = results.length === 1 ? results[0] : mergeRosterResults(results);

      if (!merged || !merged.entries) throw new Error('No entries found in roster image.');

      const enriched = enrichEntries(merged.entries);

      // Auto-set month/year from parsed period
      if (merged.crew?.period) {
        const d = new Date(merged.crew.period.split(' to ')[0]);
        if (!isNaN(d)) {
          setYear(d.getFullYear());
          setMonth(d.getMonth() + 1);
        }
      }

      setEntries(enriched);
      setTotals(merged.totals || null);

      // Save crew profile
      if (merged.crew) {
        setCrewProfile(merged.crew);
        saveCrewProfile(merged.crew);
      }

      // Save to storage (raw entries without computed _ftl fields)
      const rawEntries = merged.entries;
      const saveYear   = merged.crew?.period ? new Date(merged.crew.period.split(' to ')[0]).getFullYear() : year;
      const saveMonth  = merged.crew?.period ? new Date(merged.crew.period.split(' to ')[0]).getMonth() + 1 : month;
      saveRoster(saveYear, saveMonth, { entries: rawEntries, totals: merged.totals, crew: merged.crew });

    } catch (err) {
      setLoadError(err.message || 'Failed to analyze roster image.');
    } finally {
      setIsLoading(false);
    }
  }, [year, month]);

  // ─── drag-and-drop ────────────────────────────────────────────────────────

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  // ─── day click → modal ────────────────────────────────────────────────────

  const handleDayClick = useCallback((entry, day) => {
    if (!entry) return;
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const idx = sorted.findIndex(e => e.date === entry.date);
    const prevFlight = idx > 0
      ? sorted.slice(0, idx).reverse().find(e => e.type === 'FLIGHT' && e.release)
      : null;
    const nextFlight = idx < sorted.length - 1
      ? sorted.slice(idx + 1).find(e => e.type === 'FLIGHT' && e.report)
      : null;
    setSelectedDay({ entry, prevEntry: prevFlight || null, nextEntry: nextFlight || null });
  }, [entries]);

  // ─── computed stats ───────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const flights   = entries.filter(e => e.type === 'FLIGHT');
    const rerrp2ld  = entries.filter(e => e.type === 'RERRP2LD').length;
    const rerrp36   = entries.filter(e => e.type === 'RERRP36').length;
    const violations = flights.filter(e => e._ftlViolation).length;
    const warnings   = flights.filter(e => e._ftlWarning).length;
    const nightDuties = flights.filter(e => e.nightDuty).length;

    let flightMins = 0, dutyMins = 0, tafbMins = 0;
    for (const e of flights) {
      flightMins += parseHhmm(e.flightTime);
      dutyMins   += parseHhmm(e.dutyTime);
      tafbMins   += parseHhmm(e.tafb);
    }

    // Use roster totals if available (more accurate — comes from Merlot footer)
    const totalFlightMins = totals ? parseHhmm(totals.flightTime) : flightMins;
    const totalDutyMins   = totals ? parseHhmm(totals.dutyTime)   : dutyMins;

    return {
      flights: flights.length,
      rerrp2ld, rerrp36, violations, warnings, nightDuties,
      totalFlightMins, totalDutyMins, tafbMins,
    };
  }, [entries, totals]);

  const hasRoster = entries.length > 0;
  const hasViolations = stats.violations > 0;
  const overallStatus = hasViolations ? 'VIOLATION' : stats.warnings > 0 ? 'WARNING' : hasRoster ? 'COMPLIANT' : 'NO DATA';

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-900 text-white">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="sticky top-11 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-700/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Crew info */}
          <div className="flex-1 min-w-0">
            {crewProfile ? (
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-semibold text-white text-sm truncate">{crewProfile.name}</span>
                <span className="text-xs text-slate-400">{crewProfile.rank} · {crewProfile.employeeCode} · {crewProfile.base}</span>
              </div>
            ) : (
              <span className="text-sm font-bold text-white">Schedule Calendar</span>
            )}
            <p className="text-xs text-slate-500">Merlot roster · FTL compliance</p>
          </div>

          {/* Month navigator */}
          <div className="flex items-center gap-2">
            <button onClick={() => navigateMonth(-1)} className="w-7 h-7 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">‹</button>
            <span className="text-sm font-semibold text-white min-w-32 text-center">{MONTH_NAMES[month - 1]} {year}</span>
            <button onClick={() => navigateMonth(1)}  className="w-7 h-7 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">›</button>
          </div>

          {/* Upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="text-sm px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
          >
            {isLoading ? 'Analyzing…' : 'Upload Merlot'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => processFiles(e.target.files)}
          />
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* ── Loading state ─────────────────────────────────────────────── */}
        {isLoading && (
          <div className="flex items-center gap-3 bg-sky-900/30 border border-sky-700/50 rounded-lg p-4">
            <div className="w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-sky-300">Analyzing roster image…</p>
              <p className="text-xs text-slate-400">Claude is reading the Merlot roster. This takes ~10–20 seconds.</p>
            </div>
          </div>
        )}

        {/* ── Error state ───────────────────────────────────────────────── */}
        {loadError && (
          <div className="flex items-start gap-3 bg-red-900/30 border border-red-700/50 rounded-lg p-4">
            <span className="text-red-400 text-lg flex-shrink-0">⚠</span>
            <div>
              <p className="text-sm font-semibold text-red-300">Analysis failed</p>
              <p className="text-xs text-slate-300 mt-0.5">{loadError}</p>
              {!import.meta.env.VITE_ANTHROPIC_API_KEY && (
                <p className="text-xs text-amber-300 mt-1">Set VITE_ANTHROPIC_API_KEY in .env.local to enable AI parsing.</p>
              )}
            </div>
          </div>
        )}

        {/* ── Drop zone (shown when no roster loaded) ───────────────────── */}
        {!hasRoster && !isLoading && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`
              flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer
              transition-colors py-12
              ${isDragging
                ? 'border-sky-400 bg-sky-900/20'
                : 'border-slate-600 hover:border-slate-500 bg-slate-800/30 hover:bg-slate-800/50'
              }
            `}
          >
            <div className="text-4xl">📋</div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-200">
                {isDragging ? 'Drop roster image here' : 'Upload Merlot roster image'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Drag & drop or click · PNG, JPG, JPEG · Multiple images supported (split months)
              </p>
            </div>
          </div>
        )}

        {/* ── Calendar grid ─────────────────────────────────────────────── */}
        {hasRoster && (
          <>
            {/* Drop zone overlay for re-upload */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`transition-all rounded-xl ${isDragging ? 'ring-2 ring-sky-400 ring-offset-2 ring-offset-slate-900' : ''}`}
            >
              <CalendarGrid
                entries={entries}
                year={year}
                month={month}
                onDayClick={handleDayClick}
              />
            </div>

            {/* ── Monthly summary bar ──────────────────────────────────── */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 justify-between">
                {/* Time totals */}
                <div className="flex flex-wrap gap-2">
                  <StatBadge label="Flight"    value={fmtMin(stats.totalFlightMins)} accent />
                  <StatBadge label="Duty"      value={fmtMin(stats.totalDutyMins)} />
                  <StatBadge label="TAFB"      value={fmtMin(stats.tafbMins)} />
                  <StatBadge label="Sectors"   value={entries.filter(e=>e.type==='FLIGHT').reduce((s,e)=>s+(e.numLegs||0),0)} />
                </div>

                {/* FTL indicators */}
                <div className="flex flex-wrap gap-2">
                  <StatBadge label="RERRP2LD" value={`${stats.rerrp2ld}/2 ${stats.rerrp2ld >= 2 ? '✅' : '⚠'}`} />
                  <StatBadge label="RERRP36"  value={stats.rerrp36} />
                  {stats.nightDuties > 0 && <StatBadge label="Night"  value={`${stats.nightDuties} 🌙`} />}
                  {stats.violations  > 0 && <StatBadge label="Violations" value={`${stats.violations} ⛔`} />}
                  {stats.warnings    > 0 && <StatBadge label="Warnings"   value={`${stats.warnings} ⚠`} />}
                </div>

                {/* Overall status */}
                <div className={`px-3 py-1.5 rounded-lg font-bold text-sm border ${
                  overallStatus === 'COMPLIANT' ? 'bg-emerald-900/40 border-emerald-700 text-emerald-300' :
                  overallStatus === 'WARNING'   ? 'bg-amber-900/40 border-amber-700 text-amber-300' :
                  overallStatus === 'VIOLATION' ? 'bg-red-900/40 border-red-700 text-red-300' :
                  'bg-slate-700/40 border-slate-600 text-slate-400'
                }`}>
                  {overallStatus === 'COMPLIANT' ? '✅ COMPLIANT' :
                   overallStatus === 'WARNING'   ? '⚠ WARNING' :
                   overallStatus === 'VIOLATION' ? '⛔ VIOLATION' :
                   'NO DATA'}
                </div>
              </div>

              {/* 28-day block bar */}
              {stats.totalFlightMins > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-700/50">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Monthly block time</span>
                    <span className="font-mono">
                      {fmtMin(stats.totalFlightMins)} / 100:00 limit
                    </span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        stats.totalFlightMins > 5400 ? 'bg-red-500' :
                        stats.totalFlightMins > 4800 ? 'bg-amber-400' : 'bg-sky-500'
                      }`}
                      style={{ width: `${Math.min(100, stats.totalFlightMins / 60)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Re-upload hint */}
            <p className="text-center text-xs text-slate-600">
              Drop a new Merlot image anywhere to update · multiple images merge automatically
            </p>
          </>
        )}
      </div>

      {/* ── Day modal ────────────────────────────────────────────────────── */}
      {selectedDay && (
        <DayModal
          entry={selectedDay.entry}
          prevEntry={selectedDay.prevEntry}
          nextEntry={selectedDay.nextEntry}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}
