import { useState, useEffect, useMemo } from 'react';
import { calcTotalBlockMinsWithLearned } from '../constants/route-block-times.js';
import { loadLearnedRoutes } from '../lib/storage.js';

const ENTRY_TYPES = [
  'FLIGHT', 'RERRP36', 'RERRP2LD', 'STANDBY', 'OFF',
  'SIM', 'GROUND_TRAINING', 'DEMO', 'CONTINUATION',
];

function minsToHhmm(m) {
  if (m == null || m <= 0) return null;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

function routeToSectors(routeUpper) {
  const parts = routeUpper.split('-').filter(p => /^[A-Z]{3}$/.test(p));
  if (parts.length < 2) return [];
  return parts.slice(0, -1).map((o, i) => ({ origin: o, dest: parts[i + 1] }));
}

function entryToRoute(entry) {
  if (!entry?.from) return '';
  if (entry.sectors?.length > 0) {
    const airports = [entry.sectors[0].origin, ...entry.sectors.map(s => s.dest)];
    return airports.join('-');
  }
  if (entry.to) return `${entry.from}-${entry.to}`;
  return entry.from;
}

export default function EditEntryModal({ entry, date, onSave, onDelete, onClose, onViewFtl }) {
  const isNew = !entry || entry.type === 'OFF';

  const [type,           setType]           = useState(isNew ? 'FLIGHT' : (entry.type || 'FLIGHT'));
  const [dutyCode,       setDutyCode]       = useState(isNew ? '' : (entry.dutyCode || ''));
  const [route,          setRoute]          = useState(isNew ? '' : entryToRoute(entry));
  const [report,         setReport]         = useState(isNew ? '' : (entry.report  || ''));
  const [release,        setRelease]        = useState(isNew ? '' : (entry.release || ''));
  const [releaseNextDay, setReleaseNextDay] = useState(isNew ? false : (entry.releaseNextDay || false));
  const [perDiem,        setPerDiem]        = useState(() => {
    if (isNew) return 'NONE';
    if (entry._perDiem) return entry._perDiem;
    return entry.layover ? 'INTER' : 'NONE';
  });
  const [notes, setNotes] = useState(isNew ? '' : (entry._manualNotes || ''));
  const [actualLegs, setActualLegs] = useState(() => {
    if (isNew) return [];
    // Load from existing entry if available
    if (entry?.actualLegs?.length) return entry.actualLegs;
    // Build empty legs from sectors
    const sectorList = entry?.sectors?.length ? entry.sectors : [];
    if (sectorList.length > 0) {
      return sectorList.map(s => ({
        origin: s.origin,
        dest: s.dest,
        offBlock: '',
        onBlock: '',
      }));
    }
    // Single leg fallback
    if (entry?.from && entry?.to) {
      return [{ origin: entry.from, dest: entry.to, offBlock: entry?.actualOffBlock || '', onBlock: entry?.actualOnBlock || '' }];
    }
    return [];
  });

  // Live block-time preview from route DB
  const blockPreview = useMemo(() => {
    if (type !== 'FLIGHT' || route.length < 7) return null;
    try {
      const learned = loadLearnedRoutes();
      const mins = calcTotalBlockMinsWithLearned(route, learned, date);
      return mins ? minsToHhmm(mins) : null;
    } catch {
      return null;
    }
  }, [type, route, date]);

  function parseTimeToMins(str) {
    if (!str) return null;
    const digits = str.replace(/\D/g, '');
    if (digits.length === 4) {
      const h = parseInt(digits.slice(0, 2), 10);
      const m = parseInt(digits.slice(2, 4), 10);
      if (h > 23 || m > 59) return null;
      return h * 60 + m;
    }
    if (str.includes(':')) {
      const [h, m] = str.split(':').map(Number);
      if (isNaN(h) || isNaN(m)) return null;
      return h * 60 + m;
    }
    return null;
  }

  const actualBlockMins = useMemo(() => {
    if (!actualLegs.length) return null;
    let total = 0;
    for (const leg of actualLegs) {
      const offMins = parseTimeToMins(leg.offBlock);
      const onMins  = parseTimeToMins(leg.onBlock);
      if (offMins === null || onMins === null) continue;
      let diff = onMins - offMins;
      if (diff < 0) diff += 1440;
      total += diff;
    }
    return total > 0 ? total : null;
  }, [actualLegs]);

  function formatTimeInput(value) {
    // Allow raw digits only while typing, format on completion
    const digits = value.replace(/\D/g, '').slice(0, 4);
    if (digits.length === 4) {
      return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
    }
    // Return raw digits while still typing (don't add colon mid-input)
    return digits;
  }

  function updateLeg(idx, field, value) {
    const formatted = formatTimeInput(value);
    setActualLegs(prev => prev.map((leg, i) => i === idx ? { ...leg, [field]: formatted } : leg));
  }

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSave = () => {
    const routeUpper = route.toUpperCase().trim();
    const airports   = routeUpper.split('-').filter(p => /^[A-Z]{3}$/.test(p));
    const from       = airports[0] || null;
    const to         = airports[airports.length - 1] || null;
    const sectors    = routeToSectors(routeUpper);
    const numLegs    = Math.max(0, airports.length - 1);

    let blockMins   = null;
    let flightTime  = entry?.flightTime  || null;
    let scheduledBlock = entry?.scheduledBlock || null;

    if (type === 'FLIGHT' && routeUpper) {
      try {
        const learned = loadLearnedRoutes();
        const dbMins = calcTotalBlockMinsWithLearned(routeUpper, learned, date);
        if (dbMins) {
          blockMins      = dbMins;
          flightTime     = minsToHhmm(dbMins);
          scheduledBlock = flightTime;
        }
      } catch { /* keep original flightTime */ }
    }

    const prevNonManual = (entry?.comments || []).filter(c => !c.startsWith('[Manual]'));
    const manualLine    = notes.trim() ? [`[Manual] ${notes.trim()}`] : [];

    const updatedEntry = {
      ...(isNew ? {} : entry),
      date,
      dow:           entry?.dow || null,
      type,
      dutyCode:      dutyCode.trim() || null,
      property:      (type === 'RERRP36' || type === 'RERRP2LD') ? 'R' : (entry?.property || null),
      from,
      to,
      report:        report.trim()  || null,
      release:       release.trim() || null,
      releaseNextDay,
      scheduledBlock,
      flightTime,
      blockMins,
      dutyTime:      entry?.dutyTime  || null,
      tafb:          entry?.tafb      || null,
      restTime:      entry?.restTime  || null,
      sectors,
      numLegs,
      layover:       perDiem !== 'NONE',
      nightDuty:     false,   // re-computed by enrichEntries on save
      earlyStart:    false,
      lateFinish:    false,
      woclEncroached: false,
      comments:      [...prevNonManual, ...manualLine],
      allowances:    entry?.allowances || '',
      actualLegs:      actualLegs.length ? actualLegs : null,
      actualBlockMins: actualBlockMins ?? (entry?.actualBlockMins ?? null),
      editedManually: true,
      _manualNotes:  notes.trim() || undefined,
      _perDiem:      perDiem,
    };

    onSave(updatedEntry);
  };

  const dateObj     = new Date(date + 'T12:00:00');
  const dateDisplay = dateObj.toLocaleDateString('en', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });

  const showRoute   = type === 'FLIGHT';
  const showTimings = type === 'FLIGHT' || type === 'STANDBY';
  const showPerDiem = type === 'FLIGHT';

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-700 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-400">{dateDisplay}</span>
              {!isNew && entry.editedManually && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-700/50 border border-yellow-600/50 text-yellow-300">
                  ✏ Previously edited
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold text-white mt-0.5">
              {isNew ? 'Add duty' : 'Edit duty'}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-0.5">
            {onViewFtl && !isNew && entry.type === 'FLIGHT' && (
              <button
                type="button"
                onClick={onViewFtl}
                className="text-xs px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
              >
                FTL Details
              </button>
            )}
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">
              ×
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* Type */}
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full bg-slate-700 border border-slate-500 focus:border-sky-400 focus:outline-none rounded px-3 py-2 text-sm text-white"
            >
              {ENTRY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Duty code */}
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Duty code</label>
            <input
              type="text"
              value={dutyCode}
              onChange={e => setDutyCode(e.target.value)}
              placeholder="e.g. ICN2-1, RERRP36-1, B-SBM-1"
              className="w-full bg-slate-700 border border-slate-500 focus:border-sky-400 focus:outline-none rounded px-3 py-2 text-sm text-white font-mono placeholder-slate-500"
            />
          </div>

          {/* Route (FLIGHT only) */}
          {showRoute && (
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Route</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={route}
                  onChange={e => {
                    const val = e.target.value.toUpperCase().replace(/[^A-Z-]/g, '');
                    setRoute(val);
                    // Rebuild legs when route changes
                    const parts = val.split('-').filter(p => /^[A-Z]{3}$/.test(p));
                    if (parts.length >= 2) {
                      const newLegs = parts.slice(0, -1).map((o, i) => ({
                        origin: o,
                        dest: parts[i + 1],
                        offBlock: actualLegs[i]?.offBlock || '',
                        onBlock:  actualLegs[i]?.onBlock  || '',
                      }));
                      setActualLegs(newLegs);
                    }
                  }}
                  placeholder="BKK-ICN or BKK-SGN-BKK"
                  className="flex-1 bg-slate-700 border border-slate-500 focus:border-sky-400 focus:outline-none rounded px-3 py-2 text-sm text-white font-mono placeholder-slate-500"
                />
                {blockPreview && (
                  <span className="text-xs text-sky-300 font-mono bg-sky-900/30 border border-sky-700/50 rounded px-2 py-1 whitespace-nowrap">
                    {blockPreview}
                  </span>
                )}
              </div>
              {route.length >= 7 && !blockPreview && (
                <p className="text-xs text-amber-400 mt-1">Route not in DB — block time unchanged</p>
              )}
            </div>
          )}

          {/* Actual block time (FTL tracking only — does not affect pay) */}
          {showRoute && actualLegs.length > 0 && (
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">
                Actual block time
                <span className="text-slate-600 ml-1">(FTL tracking only · not used for pay)</span>
              </label>
              <div className="space-y-2">
                {actualLegs.map((leg, idx) => (
                  <div key={idx} className="bg-slate-700/50 rounded-lg px-3 py-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-sky-300 shrink-0">
                        {leg.origin}→{leg.dest}
                      </span>
                      {leg.offBlock && leg.onBlock && (() => {
                        try {
                          const [oh, om] = leg.offBlock.split(':').map(Number);
                          const [nh, nm] = leg.onBlock.split(':').map(Number);
                          let diff = (nh * 60 + nm) - (oh * 60 + om);
                          if (diff < 0) diff += 1440;
                          return (
                            <span className="text-xs text-amber-300 font-mono ml-auto">
                              {Math.floor(diff/60)}:{String(diff%60).padStart(2,'0')}
                            </span>
                          );
                        } catch { return null; }
                      })()}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">Off-block</label>
                        <input
                          type="text"
                          value={leg.offBlock}
                          onChange={e => updateLeg(idx, 'offBlock', e.target.value)}
                          placeholder="02:25"
                          maxLength={5}
                          className="w-full bg-slate-700 border border-slate-600 focus:border-amber-400 focus:outline-none rounded px-2 py-1.5 text-sm text-white font-mono placeholder-slate-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">On-block</label>
                        <input
                          type="text"
                          value={leg.onBlock}
                          onChange={e => updateLeg(idx, 'onBlock', e.target.value)}
                          placeholder="03:55"
                          maxLength={5}
                          className="w-full bg-slate-700 border border-slate-600 focus:border-amber-400 focus:outline-none rounded px-2 py-1.5 text-sm text-white font-mono placeholder-slate-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {actualBlockMins && (
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs text-slate-400">Total actual block</span>
                    <span className="text-xs font-mono font-bold text-amber-300">
                      {Math.floor(actualBlockMins/60)}:{String(actualBlockMins%60).padStart(2,'0')}
                      {entry?.blockMins && actualBlockMins !== entry.blockMins && (
                        <span className="text-slate-500 font-normal ml-2">
                          vs scheduled {Math.floor(entry.blockMins/60)}:{String(entry.blockMins%60).padStart(2,'0')}
                          {actualBlockMins > entry.blockMins ? ' ▲' : ' ▼'}
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Report / Release */}
          {showTimings && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Report (HH:MM)</label>
                <input
                  type="text"
                  value={report}
                  onChange={e => setReport(formatTimeInput(e.target.value))}
                  placeholder="00:55"
                  maxLength={5}
                  className="w-full bg-slate-700 border border-slate-500 focus:border-sky-400 focus:outline-none rounded px-3 py-2 text-sm text-white font-mono placeholder-slate-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Release (HH:MM)</label>
                <input
                  type="text"
                  value={release}
                  onChange={e => setRelease(formatTimeInput(e.target.value))}
                  placeholder="10:30"
                  maxLength={5}
                  className="w-full bg-slate-700 border border-slate-500 focus:border-sky-400 focus:outline-none rounded px-3 py-2 text-sm text-white font-mono placeholder-slate-500"
                />
              </div>
            </div>
          )}

          {/* Release next day toggle */}
          {showTimings && (
            <button
              type="button"
              onClick={() => setReleaseNextDay(v => !v)}
              className="flex items-center gap-2 text-sm text-slate-300 select-none"
            >
              <div className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${releaseNextDay ? 'bg-sky-600' : 'bg-slate-600'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${releaseNextDay ? 'left-4.5' : 'left-0.5'}`} />
              </div>
              Release next day (+1)
            </button>
          )}

          {/* Per diem */}
          {showPerDiem && (
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Per diem / overnight stay</label>
              <div className="flex gap-2">
                {[
                  { key: 'NONE',  label: 'None' },
                  { key: 'DOM',   label: 'DOM ฿500' },
                  { key: 'INTER', label: 'INTER $60' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPerDiem(key)}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded border transition-colors ${
                      perDiem === key
                        ? key === 'INTER' ? 'bg-sky-700 border-sky-500 text-white'
                        : key === 'DOM'   ? 'bg-emerald-700 border-emerald-500 text-white'
                        : 'bg-slate-600 border-slate-400 text-white'
                        : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Swapped with John TVJ2xxx, standby → actual flight"
              rows={2}
              className="w-full bg-slate-700 border border-slate-500 focus:border-sky-400 focus:outline-none rounded px-3 py-2 text-sm text-white placeholder-slate-500 resize-none"
            />
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="px-5 py-3 border-t border-slate-700 flex items-center justify-between gap-3">
          {!isNew ? (
            <button
              type="button"
              onClick={onDelete}
              className="text-xs px-3 py-1.5 rounded border border-red-700/50 text-red-400 hover:bg-red-900/30 transition-colors"
            >
              Delete duty
            </button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="text-xs px-4 py-1.5 rounded bg-sky-700 hover:bg-sky-600 text-white font-semibold transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
