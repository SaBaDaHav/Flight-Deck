import { useState, useMemo, useRef } from 'react';
import { loadRoster, loadLearnedRoutes } from '../lib/storage.js';
import {
  analyzeEntry,
  getMinRest,
  CUMULATIVE_LIMITS,
  rerrpGapHours,
  countDisruptiveBetween,
  getFdpLimit,
} from '../lib/ftl-rules.js';
import { analyzeSwapFlight } from '../lib/anthropic.js';
import { calcTotalBlockMinsWithLearned } from '../constants/route-block-times.js';
import { isInternational } from '../lib/airport-db.js';
import { FtlBar } from '../components/FTLBars.jsx';

// ─── helpers ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
];

function parseHhmm(str) {
  if (!str) return 0;
  const [h, m] = str.split(':').map(Number);
  return h * 60 + (m || 0);
}

function fmtMin(mins) {
  if (mins === null || mins === undefined) return '—';
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function computeRestMin(prevEntry, currEntry) {
  if (!prevEntry?.release || !currEntry?.report) return null;
  try {
    const rel = new Date(`${prevEntry.date}T${prevEntry.release}:00`);
    if (prevEntry.releaseNextDay) rel.setDate(rel.getDate() + 1);
    const rep = new Date(`${currEntry.date}T${currEntry.report}:00`);
    const diff = Math.round((rep - rel) / 60000);
    return diff >= 0 ? diff : null;
  } catch {
    return null;
  }
}

function enrichEntries(entries) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const active = sorted.filter(e => e.type === 'FLIGHT' || e.type === 'STANDBY');

  return sorted.map(entry => {
    if (entry.type !== 'FLIGHT' && entry.type !== 'STANDBY') return entry;
    const idx = active.indexOf(entry);
    const prev = idx > 0 ? active[idx - 1] : null;

    const ftl = analyzeEntry(entry, prev);
    const restBeforeMin = computeRestMin(prev, entry);
    const isHome = prev ? !prev.layover : true;
    const minRestRequired = prev ? getMinRest(parseHhmm(prev.dutyTime), isHome) : null;
    const restViolation =
      restBeforeMin !== null && minRestRequired !== null && restBeforeMin < minRestRequired;

    return {
      ...entry,
      _ftlAnalysis:     ftl,
      _restBeforeMin:   restBeforeMin,
      _minRestRequired: minRestRequired,
      _restViolation:   restViolation,
      _ftlViolation:    ftl.fdpStatus === 'violation' || restViolation,
      _ftlWarning:      ftl.fdpStatus === 'warning',
      // dutyTime null for mobile entries — fall back to FDP used from FTL analysis
      _dutyMin:         parseHhmm(entry.dutyTime) || ftl.fdpUsedMin || 0,
      // flightTime null for mobile — use blockMins (route DB lookup) or scheduledBlock
      _flightMin:       entry.blockMins != null
                          ? entry.blockMins
                          : parseHhmm(entry.flightTime || entry.scheduledBlock || ''),
      _prevEntry:       prev,
    };
  });
}

function routeSummary(entry) {
  if (entry.sectors?.length > 0) {
    return [entry.sectors[0].origin, ...entry.sectors.map(s => s.dest)].join('→');
  }
  return entry.from && entry.to ? `${entry.from}→${entry.to}` : '—';
}

// ─── sub-components ──────────────────────────────────────────────────────────

function FlightRow({ entry }) {
  const ftl = entry._ftlAnalysis || {};
  const restBefore = entry._restBeforeMin;
  const minRest    = entry._minRestRequired;
  const restStatus = entry._restViolation ? 'violation' : 'ok';
  const overall    = entry._ftlViolation ? 'violation' : entry._ftlWarning ? 'warning' : 'ok';

  return (
    <div className={`rounded-lg px-3 py-2.5 space-y-2 ${
      overall === 'violation' ? 'bg-red-950/40 border border-red-800/50' :
      overall === 'warning'   ? 'bg-amber-950/40 border border-amber-800/50' :
      'bg-slate-800/60 border border-slate-700/40'
    }`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-mono text-slate-400 w-14 shrink-0">
          {entry.date.slice(5)}
        </span>
        <span className="text-xs font-semibold text-sky-300">{entry.dutyCode || '—'}</span>
        <span className="text-xs text-slate-300 font-mono">{routeSummary(entry)}</span>
        <span className="text-xs text-slate-500 ml-auto">{entry.report ? `${entry.report}L` : '—'}</span>
        <div className="flex gap-1 text-xs">
          {entry.nightDuty  && <span title="Night duty">🌙</span>}
          {entry.earlyStart && <span title="Early start">⚡</span>}
          {entry.lateFinish && <span title="Late finish">🌅</span>}
          {entry._ftlViolation && <span>⛔</span>}
          {!entry._ftlViolation && entry._ftlWarning && <span>⚠</span>}
        </div>
      </div>

      {ftl.fdpLimitMin != null && ftl.fdpUsedMin != null && (
        <FtlBar
          label={`FDP (${entry.numLegs || 1} leg${(entry.numLegs || 1) !== 1 ? 's' : ''})`}
          usedMin={ftl.fdpUsedMin}
          limitMin={ftl.fdpLimitMin}
          status={ftl.fdpStatus}
        />
      )}

      {restBefore !== null && minRest !== null && (
        <FtlBar
          label="Rest before"
          usedMin={restBefore}
          limitMin={minRest}
          status={restStatus}
        />
      )}
    </div>
  );
}

function RerrpRow({ curr, prev, allEntries }) {
  const gapHours = prev ? rerrpGapHours(prev.date, curr.date) : null;
  const gapOk    = gapHours !== null ? gapHours <= 168 : true;

  const disruptiveCount = prev
    ? countDisruptiveBetween(allEntries, prev.date, curr.date)
    : 0;
  const needsExtended = disruptiveCount >= 4;
  const minRequired   = curr.type === 'RERRP2LD' ? 2880 : needsExtended ? 3600 : 2160;
  const restMin       = curr.restTime ? parseHhmm(curr.restTime) : null;
  const restOk        = restMin !== null ? restMin >= minRequired : true;

  const labelColor = curr.type === 'RERRP2LD'
    ? 'bg-teal-700/50 text-teal-200'
    : 'bg-emerald-700/50 text-emerald-200';

  return (
    <div className="bg-slate-800/60 border border-slate-700/40 rounded-lg px-3 py-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${labelColor}`}>
          {curr.type}
        </span>
        <span className="text-xs text-slate-400">{curr.date}</span>
        {curr.dutyCode && <span className="text-xs text-slate-500">{curr.dutyCode}</span>}
        <span className="text-xs font-mono ml-auto">
          {restMin !== null ? fmtMin(restMin) : '—'} {restOk ? '✅' : '⛔'}
        </span>
      </div>

      {gapHours !== null && (
        <div className="flex items-center text-xs gap-2">
          <span className="text-slate-500">Gap from prev RERRP:</span>
          <span className={`font-mono ${gapOk ? 'text-emerald-400' : 'text-red-400'}`}>
            {Math.round(gapHours)}h {gapOk ? '✅' : '⛔ >168h'}
          </span>
        </div>
      )}

      {needsExtended && (
        <div className={`text-xs rounded px-2 py-1 ${
          restMin !== null && restMin >= 3600
            ? 'bg-slate-700/50 text-slate-400'
            : 'bg-amber-900/40 border border-amber-700/40 text-amber-300'
        }`}>
          {disruptiveCount} disruptive duties before → must be ≥60h
          {restMin !== null && restMin >= 3600 ? ' ✅' : ' ⛔'}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function RosterAnalyser() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [swapFlights,  setSwapFlights]  = useState([]);
  const [swapLoading,  setSwapLoading]  = useState(false);
  const [swapError,    setSwapError]    = useState(null);
  const swapInputRef = useRef(null);

  const rosterData = useMemo(() => loadRoster(year, month), [year, month]);

  const enriched = useMemo(() => {
    if (!rosterData?.entries?.length) return [];
    return enrichEntries(rosterData.entries);
  }, [rosterData]);

  const flightEntries = useMemo(
    () => enriched.filter(e => e.type === 'FLIGHT'),
    [enriched],
  );

  const rerrpEntries = useMemo(
    () => enriched.filter(e => e.type === 'RERRP36' || e.type === 'RERRP2LD'),
    [enriched],
  );

  const rerrp2ldCount = rerrpEntries.filter(e => e.type === 'RERRP2LD').length;
  const violations    = flightEntries.filter(e => e._ftlViolation).length;
  const warnings      = flightEntries.filter(e => e._ftlWarning).length;
  const pswmDuties    = flightEntries.filter(e => e._ftlAnalysis?.pswmRequired);
  const overallStatus = violations > 0 ? 'violation' : warnings > 0 ? 'warning' : 'ok';

  const cumul = useMemo(() => {
    if (!enriched.length) return null;
    const ref    = enriched[enriched.length - 1].date;
    const refD   = new Date(ref);
    const sumFor = (days, field) => {
      const cut = new Date(refD);
      cut.setDate(cut.getDate() - days + 1);
      return enriched
        .filter(e => { const d = new Date(e.date); return d >= cut && d <= refD; })
        .reduce((acc, e) => acc + (e[field] || 0), 0);
    };
    return {
      duty7:        sumFor(7,  '_dutyMin'),
      duty14:       sumFor(14, '_dutyMin'),
      duty28:       sumFor(28, '_dutyMin'),
      flight28:     sumFor(28, '_flightMin'),
      monthDuty:    enriched.reduce((a, e) => a + (e._dutyMin   || 0), 0),
      monthFlight:  enriched.reduce((a, e) => a + (e._flightMin || 0), 0),
    };
  }, [enriched]);

  function calcFlightPay(route, numLegs) {
    const learnedRoutes = loadLearnedRoutes();
    const blockMins = calcTotalBlockMinsWithLearned(route, learnedRoutes) || 0;
    const inter = isInternational(route);
    const sectorPay = numLegs * 840;
    const blockPay = inter
      ? blockMins * 26.53 + blockMins * 8.47
      : blockMins * 35;
    return { blockMins, inter, sectorPay, blockPay, total: sectorPay + blockPay };
  }

  async function handleSwapUpload(files) {
    if (!files || files.length === 0) return;
    const file = files[0];
    setSwapLoading(true);
    setSwapError(null);
    setSwapFlights([]);
    try {
      const reader = new FileReader();
      const base64 = await new Promise((res, rej) => {
        reader.onload = () => res(reader.result);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const flights = await analyzeSwapFlight(base64, year);
      setSwapFlights(flights);
    } catch (err) {
      setSwapError(err.message || 'Failed to analyze swap image.');
    } finally {
      setSwapLoading(false);
      if (swapInputRef.current) swapInputRef.current.value = '';
    }
  }

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  function cumulStatus(used, limit) {
    if (used > limit) return 'violation';
    if (used > limit * 0.9) return 'warning';
    return 'ok';
  }

  const crew = rosterData?.crew;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Month nav */}
      <div className="sticky top-11 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button onClick={prevMonth} className="text-slate-400 hover:text-white px-2 py-1 text-lg leading-none">‹</button>
          <div className="text-center flex-1">
            <div className="text-sm font-semibold text-white">
              {MONTH_NAMES[month - 1]} {year}
            </div>
            {crew && (
              <div className="text-xs text-slate-500">
                {crew.name} · {crew.rank} · {crew.base}
              </div>
            )}
          </div>
          <button onClick={nextMonth} className="text-slate-400 hover:text-white px-2 py-1 text-lg leading-none">›</button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {!flightEntries.length ? (
          <div className="text-center py-20 text-slate-500">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-sm">No roster data for {MONTH_NAMES[month - 1]} {year}.</p>
            <p className="text-xs mt-1 text-slate-600">
              Upload a Merlot roster image in the Calendar tab.
            </p>
          </div>
        ) : (
          <>
            {/* ── Overall status ────────────────────────────────────────── */}
            <div className={`rounded-xl px-4 py-3 border flex items-center gap-3 ${
              overallStatus === 'violation' ? 'bg-red-950/50 border-red-700' :
              overallStatus === 'warning'   ? 'bg-amber-950/50 border-amber-700' :
              'bg-emerald-950/50 border-emerald-700'
            }`}>
              <span className="text-2xl">
                {overallStatus === 'violation' ? '⛔' : overallStatus === 'warning' ? '⚠' : '✅'}
              </span>
              <div className="min-w-0">
                <div className="font-semibold text-sm">
                  {overallStatus === 'violation' ? 'FTL VIOLATIONS DETECTED' :
                   overallStatus === 'warning'   ? 'FTL WARNINGS' :
                   'TVJ FTL COMPLIANT'}
                </div>
                <div className="text-xs text-slate-300 mt-0.5 flex flex-wrap gap-2">
                  {violations > 0 && (
                    <span className="text-red-400">{violations} violation{violations !== 1 ? 's' : ''}</span>
                  )}
                  {warnings > 0 && (
                    <span className="text-amber-400">{warnings} warning{warnings !== 1 ? 's' : ''}</span>
                  )}
                  <span className={rerrp2ldCount >= 2 ? 'text-emerald-400' : 'text-amber-400'}>
                    RERRP2LD {rerrp2ldCount}/2 {rerrp2ldCount >= 2 ? '✅' : '⚠'}
                  </span>
                  {violations === 0 && warnings === 0 && rerrp2ldCount >= 2 && (
                    <span className="text-emerald-400">All limits within bounds</span>
                  )}
                </div>
              </div>
            </div>

            {/* ── Per-flight duties ─────────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                Flight Duties — {flightEntries.length}
              </p>
              <div className="space-y-2">
                {flightEntries.map(e => (
                  <FlightRow key={`${e.date}-${e.dutyCode}`} entry={e} />
                ))}
              </div>
            </div>

            {/* ── Cumulative limits ─────────────────────────────────────── */}
            {cumul && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                  Cumulative Limits{' '}
                  <span className="normal-case font-normal text-slate-600">
                    (from last duty date)
                  </span>
                </p>
                <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl px-4 py-4 space-y-2.5">
                  <FtlBar
                    label="Duty — last 7 days"
                    usedMin={cumul.duty7}
                    limitMin={CUMULATIVE_LIMITS.duty7days}
                    status={cumulStatus(cumul.duty7, CUMULATIVE_LIMITS.duty7days)}
                  />
                  <FtlBar
                    label="Duty — last 14 days"
                    usedMin={cumul.duty14}
                    limitMin={CUMULATIVE_LIMITS.duty14days}
                    status={cumulStatus(cumul.duty14, CUMULATIVE_LIMITS.duty14days)}
                  />
                  <FtlBar
                    label="Duty — last 28 days"
                    usedMin={cumul.duty28}
                    limitMin={CUMULATIVE_LIMITS.duty28days}
                    status={cumulStatus(cumul.duty28, CUMULATIVE_LIMITS.duty28days)}
                  />
                  <FtlBar
                    label="Flight time — last 28 days"
                    usedMin={cumul.flight28}
                    limitMin={CUMULATIVE_LIMITS.flight28days}
                    status={cumulStatus(cumul.flight28, CUMULATIVE_LIMITS.flight28days)}
                  />
                  <div className="pt-2 border-t border-slate-700/50 text-xs text-slate-500 flex gap-4">
                    <span>Month total: {fmtMin(cumul.monthFlight)} flight</span>
                    <span>{fmtMin(cumul.monthDuty)} duty</span>
                    <span className="text-slate-600">(12-month needs cross-month data)</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── RERRP analysis ────────────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                RERRP Analysis{' '}
                <span className={`normal-case font-normal ${rerrp2ldCount >= 2 ? 'text-emerald-500' : 'text-amber-500'}`}>
                  — RERRP2LD {rerrp2ldCount}/2 {rerrp2ldCount >= 2 ? '✅' : '⚠ required'}
                </span>
              </p>
              {rerrpEntries.length === 0 ? (
                <p className="text-xs text-slate-500 bg-amber-900/20 border border-amber-800/40 rounded-lg px-3 py-2">
                  No RERRP entries found. Check roster upload.
                </p>
              ) : (
                <div className="space-y-2">
                  {rerrpEntries.map((e, i) => (
                    <RerrpRow
                      key={e.date}
                      curr={e}
                      prev={i > 0 ? rerrpEntries[i - 1] : null}
                      allEntries={enriched}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── PSWM duties ───────────────────────────────────────────── */}
            {pswmDuties.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                  PSWM Required — {pswmDuties.length} {pswmDuties.length === 1 ? 'duty' : 'duties'}
                </p>
                <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl px-4 py-3 space-y-1.5">
                  {pswmDuties.map(e => (
                    <div key={e.date} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-slate-400 w-14 shrink-0">
                        {e.date.slice(5)}
                      </span>
                      <span className="text-sky-300 font-semibold">{e.dutyCode}</span>
                      <span className="text-slate-500 text-xs">{routeSummary(e)}</span>
                      <div className="flex gap-1 ml-auto">
                        {e.nightDuty  && <span title="Night duty">🌙</span>}
                        {e.earlyStart && <span title="Early start">⚡</span>}
                        {e.lateFinish && <span title="Late finish">🌅</span>}
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-amber-400 pt-1.5 border-t border-amber-800/30">
                    Prior Sleep Wake Model form required for all night / early start / late finish duties.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
        {/* ── Swap / Giveaway FTL Checker ──────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            Swap / Giveaway FTL Checker
          </p>

          {/* Upload button */}
          <div
            onClick={() => swapInputRef.current?.click()}
            className="flex items-center gap-3 bg-slate-800/60 border border-slate-700/40 border-dashed rounded-xl px-4 py-4 cursor-pointer hover:border-sky-600 transition-colors"
          >
            <span className="text-2xl">📸</span>
            <div>
              <p className="text-sm text-slate-200 font-semibold">Upload friend's flight screenshot</p>
              <p className="text-xs text-slate-500">Merlot mobile screenshot — checks FTL + pay difference</p>
            </div>
            {swapLoading && (
              <div className="ml-auto w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          <input
            ref={swapInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => handleSwapUpload(e.target.files)}
          />

          {swapError && (
            <p className="text-xs text-red-400 mt-2">{swapError}</p>
          )}

          {/* Results */}
          {swapFlights.length > 0 && (
            <div className="mt-3 space-y-3">
              {swapFlights.map((flight, idx) => {
                // FTL check — find prev and next entries around this flight date
                const sorted = [...enriched].sort((a, b) => a.date.localeCompare(b.date));
                const prevEntry = [...sorted].reverse().find(e =>
                  e.date < flight.date && (e.type === 'FLIGHT' || e.type === 'STANDBY') && e.release
                );
                const nextEntry = sorted.find(e =>
                  e.date > flight.date && (e.type === 'FLIGHT' || e.type === 'STANDBY') && e.report
                );

                // Rest before check
                let restBefore = null;
                if (prevEntry) {
                  try {
                    const rel = new Date(`${prevEntry.date}T${prevEntry.release}:00`);
                    if (prevEntry.releaseNextDay) rel.setDate(rel.getDate() + 1);
                    const rep = new Date(`${flight.date}T${flight.report}:00`);
                    restBefore = Math.round((rep - rel) / 60000);
                  } catch { restBefore = null; }
                }

                // Rest after check
                let restAfter = null;
                if (nextEntry) {
                  try {
                    const rel = new Date(`${flight.date}T${flight.release}:00`);
                    if (flight.releaseNextDay) rel.setDate(rel.getDate() + 1);
                    const rep = new Date(`${nextEntry.date}T${nextEntry.report}:00`);
                    restAfter = Math.round((rep - rel) / 60000);
                  } catch { restAfter = null; }
                }

                // FDP check
                const fdpLimit = getFdpLimit(flight.report, flight.numLegs || 1);
                const fdpUsed  = (() => {
                  try {
                    const rep = new Date(`${flight.date}T${flight.report}:00`);
                    const rel = new Date(`${flight.date}T${flight.release}:00`);
                    if (flight.releaseNextDay) rel.setDate(rel.getDate() + 1);
                    return Math.round((rel - rep) / 60000);
                  } catch { return null; }
                })();

                const minRestBefore = prevEntry ? Math.max(prevEntry.layover ? 600 : 720, 0) : 720;
                const minRestAfter  = 720; // home base minimum

                const restBeforeOk = restBefore === null || restBefore >= minRestBefore;
                const restAfterOk  = restAfter  === null || restAfter  >= minRestAfter;
                const fdpOk        = !fdpLimit  || !fdpUsed || fdpUsed <= fdpLimit;
                const overall      = restBeforeOk && restAfterOk && fdpOk ? 'ok' : 'violation';

                // Pay comparison
                const theirPay = calcFlightPay(flight.route, flight.numLegs || 1);

                // Find MY flight on same date if it exists (swap scenario)
                const myFlight = enriched.find(e => e.date === flight.date && e.type === 'FLIGHT');
                const myRoute  = myFlight
                  ? (myFlight.sectors?.length > 0
                      ? [myFlight.sectors[0].origin, ...myFlight.sectors.map(s => s.dest)].join('-')
                      : `${myFlight.from}-${myFlight.to}`)
                  : null;
                const myPay = myRoute ? calcFlightPay(myRoute, myFlight.numLegs || 1) : null;
                const payDelta = myPay ? theirPay.total - myPay.total : null;

                const fmtThb = n => Math.round(n).toLocaleString('th-TH');

                return (
                  <div key={idx} className={`rounded-xl border p-4 space-y-3 ${
                    overall === 'ok' ? 'bg-emerald-950/30 border-emerald-700/50' : 'bg-red-950/30 border-red-700/50'
                  }`}>
                    {/* Header */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg">{overall === 'ok' ? '✅' : '⛔'}</span>
                      <span className="font-semibold text-white text-sm">{flight.dutyCode}</span>
                      <span className="text-sky-300 font-mono text-sm">{flight.route}</span>
                      <span className="text-slate-400 text-xs ml-auto">{flight.date} {flight.report}L</span>
                    </div>

                    {/* FTL bars */}
                    <div className="space-y-2">
                      {fdpUsed && fdpLimit && (
                        <FtlBar
                          label={`FDP (${flight.numLegs || 1} leg${(flight.numLegs||1)!==1?'s':''})`}
                          usedMin={fdpUsed}
                          limitMin={fdpLimit}
                          status={fdpOk ? 'ok' : 'violation'}
                        />
                      )}
                      {restBefore !== null && (
                        <FtlBar
                          label={`Rest before (prev: ${prevEntry?.date || '—'})`}
                          usedMin={restBefore}
                          limitMin={minRestBefore}
                          status={restBeforeOk ? 'ok' : 'violation'}
                        />
                      )}
                      {restAfter !== null && (
                        <FtlBar
                          label={`Rest after (next: ${nextEntry?.date || '—'})`}
                          usedMin={restAfter}
                          limitMin={minRestAfter}
                          status={restAfterOk ? 'ok' : 'violation'}
                        />
                      )}
                    </div>

                    {/* Pay comparison */}
                    <div className="bg-slate-800/60 rounded-lg px-3 py-2 space-y-1.5 text-xs font-mono">
                      <p className="text-slate-400 font-sans font-semibold text-xs uppercase tracking-wide">Pay comparison</p>
                      {myPay && (
                        <div className="flex justify-between text-slate-400">
                          <span>My flight ({myRoute})</span>
                          <span>{fmtThb(myPay.total)} THB</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-200">
                        <span>Their flight ({flight.route}) {theirPay.blockMins}min {theirPay.inter ? 'INTER' : 'DOM'}</span>
                        <span>{fmtThb(theirPay.total)} THB</span>
                      </div>
                      {payDelta !== null && (
                        <div className={`flex justify-between font-bold border-t border-slate-700 pt-1.5 ${payDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          <span>{payDelta >= 0 ? '▲ You gain' : '▼ You lose'}</span>
                          <span>{payDelta >= 0 ? '+' : ''}{fmtThb(payDelta)} THB</span>
                        </div>
                      )}
                      {!myPay && (
                        <div className="flex justify-between text-emerald-300 border-t border-slate-700 pt-1.5">
                          <span>Giveaway — you earn</span>
                          <span>+{fmtThb(theirPay.total)} THB</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
