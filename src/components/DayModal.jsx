import { useEffect, useMemo } from 'react';
import { analyzeEntry, durationMin, getMinRest } from '../lib/ftl-rules.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

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

const DOW_FULL = { Mon:'Monday',Tue:'Tuesday',Wed:'Wednesday',Thu:'Thursday',Fri:'Friday',Sat:'Saturday',Sun:'Sunday' };

function DetailRow({ label, value, sub }) {
  return (
    <div>
      <span className="text-xs text-slate-400">{label}</span>
      <div className="text-sm font-mono text-white">{value || '—'}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function FtlBar({ label, usedMin, limitMin, status }) {
  const pct = limitMin ? Math.min(1, usedMin / limitMin) : 0;
  const color = status === 'violation' ? 'bg-red-500' :
                status === 'warning'   ? 'bg-amber-400' : 'bg-emerald-500';
  const icon  = status === 'violation' ? '⛔' :
                status === 'warning'   ? '⚠' : '✅';
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-slate-300">{label}</span>
        <span className="font-mono text-slate-200">
          {fmtMin(usedMin)} / {fmtMin(limitMin)} {icon}
        </span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}

function FlagRow({ label, active, icon }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-400">{label}</span>
      <span className={active ? 'text-orange-400 font-semibold' : 'text-slate-500'}>
        {active ? `${icon} Yes` : 'No'}
      </span>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function DayModal({ entry, prevEntry, nextEntry, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const ftl = useMemo(() => analyzeEntry(entry, prevEntry), [entry, prevEntry]);

  // Use pre-computed date-aware rest from enrichEntries when available; fall back to durationMin
  const restBefore = useMemo(() => {
    if (entry?._restBeforeMin !== undefined) return entry._restBeforeMin;
    if (!prevEntry?.release || !entry?.report) return null;
    return durationMin(prevEntry.release, entry.report, !prevEntry.releaseNextDay && entry.report < prevEntry.release);
  }, [entry, prevEntry]);

  const restAfter = useMemo(() => {
    if (!entry?.release || !nextEntry?.report) return null;
    // Date-aware: compute from actual dates
    try {
      const relDate = new Date(`${entry.date}T${entry.release}:00`);
      if (entry.releaseNextDay) relDate.setDate(relDate.getDate() + 1);
      const repDate = new Date(`${nextEntry.date}T${nextEntry.report}:00`);
      const diff = Math.round((repDate - relDate) / 60000);
      return diff >= 0 ? diff : null;
    } catch {
      return durationMin(entry.release, nextEntry.report, entry.releaseNextDay);
    }
  }, [entry, nextEntry]);

  const minRestBefore = useMemo(() => {
    if (entry?._minRestRequired !== undefined) return entry._minRestRequired;
    if (!prevEntry) return null;
    const prevDutyMin = parseHhmm(prevEntry.dutyTime);
    const isHome = !prevEntry.layover;
    return getMinRest(prevDutyMin, isHome);
  }, [entry, prevEntry]);

  if (!entry) return null;

  const {
    date, dow, type, dutyCode, from, to, report, release, releaseNextDay,
    scheduledBlock, flightTime, dutyTime, tafb, restTime,
    sectors = [], numLegs = 0, layover,
    nightDuty, earlyStart, lateFinish, woclEncroached,
    comments = [],
  } = entry;

  const dateObj  = new Date(date);
  const dayNum   = dateObj.getDate();
  const monthStr = dateObj.toLocaleString('en', { month: 'short' });
  const fullDow  = DOW_FULL[dow] || dow || '';

  const routeSummary = sectors.length > 0
    ? [sectors[0].origin, ...sectors.map(s => s.dest)].join(' → ')
    : (from && to ? `${from} → ${to}` : '');

  const isFlight = type === 'FLIGHT';
  const typeLabel = {
    FLIGHT: dutyCode || 'FLIGHT',
    RERRP36: 'RERRP36',
    RERRP2LD: 'RERRP2LD',
    STANDBY: 'STANDBY',
    OFF: 'OFF',
    CONTINUATION: 'CONTINUATION →',
  }[type] || type;

  const restBeforeStatus = restBefore !== null && minRestBefore !== null
    ? (restBefore >= minRestBefore ? 'ok' : 'violation')
    : 'ok';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-700 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-400">{fullDow} {String(dayNum).padStart(2,'0')}-{monthStr}</span>
              <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                type === 'RERRP36'  ? 'bg-emerald-700/60 text-emerald-200' :
                type === 'RERRP2LD' ? 'bg-teal-700/60 text-teal-200' :
                type === 'STANDBY'  ? 'bg-amber-700/60 text-amber-200' :
                type === 'OFF'      ? 'bg-slate-700 text-slate-400' :
                'bg-sky-700/60 text-sky-200'
              }`}>{typeLabel}</span>
              {nightDuty    && <span title="Night duty / WOCL" className="text-orange-400 text-sm">🌙</span>}
              {earlyStart   && <span title="Early start 05:00-05:59" className="text-yellow-400 text-sm">⚡</span>}
              {lateFinish   && <span title="Late finish 23:00-01:59" className="text-purple-400 text-sm">🌅</span>}
              {ftl.fdpStatus === 'violation' && <span className="text-sm">⛔</span>}
              {ftl.fdpStatus === 'warning'   && <span className="text-sm">⚠</span>}
            </div>
            {routeSummary && (
              <p className="mt-0.5 text-base font-semibold text-white">{routeSummary}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl leading-none mt-0.5 shrink-0"
            aria-label="Close"
          >×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* ── Times ──────────────────────────────────────────────────── */}
          {isFlight && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <DetailRow label="Report"  value={report  ? `${report}L`  : null} />
              <DetailRow label="Release" value={release ? `${release}${releaseNextDay ? ' +1' : ''}L` : null} />
              <DetailRow label="Block"   value={scheduledBlock} />
              <DetailRow label="Flight"  value={flightTime} />
              <DetailRow label="Duty"    value={dutyTime} />
              <DetailRow label="TAFB"    value={tafb || '—'} />
              {restBefore !== null && (
                <DetailRow
                  label="Rest before"
                  value={fmtMin(restBefore)}
                  sub={minRestBefore ? `min ${fmtMin(minRestBefore)}` : null}
                />
              )}
              {restAfter !== null && (
                <DetailRow label="Rest after" value={fmtMin(restAfter)} />
              )}
            </div>
          )}

          {(type === 'RERRP36' || type === 'RERRP2LD') && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <DetailRow label="Rest period" value={restTime || '—'} />
              <DetailRow label="Type" value={type === 'RERRP2LD' ? '2 full local days (≥48h)' : '36h + 2 local nights'} />
            </div>
          )}

          {/* ── Sectors ───────────────────────────────────────────────── */}
          {sectors.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Sectors</p>
              <div className="space-y-1">
                {sectors.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm font-mono bg-slate-700/40 rounded px-2 py-1">
                    <span className="text-slate-400 w-8 text-right">{s.flight}</span>
                    <span className="text-white">{s.origin}</span>
                    <span className="text-slate-400 text-xs">{s.depTime}L</span>
                    <span className="text-slate-500">→</span>
                    <span className="text-white">{s.dest}</span>
                    <span className="text-slate-400 text-xs">{s.arrTime}L</span>
                    {layover && i === sectors.length - 1 && (
                      <span className="ml-auto text-xs text-amber-400">overnight</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── FTL Compliance ────────────────────────────────────────── */}
          {isFlight && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">TVJ FTL Compliance</p>
              <div className="space-y-2.5">
                {ftl.fdpLimitMin !== null && (
                  <>
                    <FtlBar
                      label={`FDP used — ${numLegs} leg${numLegs !== 1 ? 's' : ''} (OMA Table 7.1.2)`}
                      usedMin={ftl.fdpUsedMin}
                      limitMin={ftl.fdpLimitMin}
                      status={ftl.fdpStatus}
                    />
                    {ftl.fdpStatus === 'warning' && ftl.fdpUsedMin != null && ftl.fdpLimitMin != null && (
                      <div className="text-xs bg-amber-900/20 border border-amber-700/40 rounded px-2 py-1.5 text-amber-300 space-y-0.5">
                        <p className="font-semibold">⚠ FDP Warning</p>
                        <p>Used {fmtMin(ftl.fdpUsedMin)} of {fmtMin(ftl.fdpLimitMin)} limit ({Math.round(ftl.fdpUsedMin/ftl.fdpLimitMin*100)}%). Any delay of {fmtMin(ftl.fdpLimitMin - ftl.fdpUsedMin)} or more would exceed the basic FDP limit.</p>
                        {ftl.fdpLimitExtMin && (
                          <p>Commander's discretion available up to {fmtMin(ftl.fdpLimitExtMin)} if needed (OMA Table 7.1.3). Post-flight rest must be increased by 4h.</p>
                        )}
                      </div>
                    )}
                    {ftl.fdpStatus === 'violation' && ftl.fdpUsedMin != null && ftl.fdpLimitMin != null && (
                      <div className="text-xs bg-red-900/20 border border-red-700/40 rounded px-2 py-1.5 text-red-300 space-y-0.5">
                        <p className="font-semibold">⛔ FDP Violation</p>
                        <p>Used {fmtMin(ftl.fdpUsedMin)} exceeds basic limit of {fmtMin(ftl.fdpLimitMin)} by {fmtMin(ftl.fdpUsedMin - ftl.fdpLimitMin)}.</p>
                        {ftl.fdpLimitExtMin && ftl.fdpUsedMin <= ftl.fdpLimitExtMin && (
                          <p>Within commander's discretion limit of {fmtMin(ftl.fdpLimitExtMin)} — discretion must be declared and logged (OMA §7.2.1).</p>
                        )}
                        {ftl.fdpLimitExtMin && ftl.fdpUsedMin > ftl.fdpLimitExtMin && (
                          <p>Also exceeds commander's discretion limit of {fmtMin(ftl.fdpLimitExtMin)}. Reportable to CAAT within 28 days.</p>
                        )}
                      </div>
                    )}
                  </>
                )}
                {restBefore !== null && minRestBefore !== null && (
                  <FtlBar
                    label="Rest before (ORO.FTL.235)"
                    usedMin={restBefore}
                    limitMin={minRestBefore}
                    status={restBeforeStatus}
                  />
                )}

                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-1 border-t border-slate-700/50">
                  <FlagRow label="Night duty"  active={nightDuty}    icon="🌙" />
                  <FlagRow label="WOCL"        active={woclEncroached} icon="⚠" />
                  <FlagRow label="Early start" active={earlyStart}   icon="⚡" />
                  <FlagRow label="Late finish" active={lateFinish}   icon="🌅" />
                </div>

                {ftl.pswmRequired && (
                  <div className="text-xs bg-amber-900/30 border border-amber-700/50 rounded px-2 py-1.5 text-amber-300 space-y-0.5">
                    <p className="font-semibold">📋 PSWM Form Required (OMA §7.1.12)</p>
                    <p>
                      {nightDuty    && 'Night duty — FDP encroaches 02:00–04:59 (WOCL). '}
                      {earlyStart   && 'Early start — report time 05:00–05:59. '}
                      {lateFinish   && 'Late finish — duty ends 23:00–01:59. '}
                      Prior Sleep Wake Model form must be completed before operating.
                      {nightDuty && ' Maximum 4 sectors on night duty.'}
                    </p>
                  </div>
                )}

                {ftl.extensionAllowed && ftl.fdpLimitExtMin && (
                  <div className="text-xs text-slate-400">
                    Extension possible to {fmtMin(ftl.fdpLimitExtMin)} — commander's discretion (OMA Table 7.1.3)
                  </div>
                )}

                {ftl.fdpStatus === 'violation' && ftl.notes?.filter(n => n.includes('exceeds') || n.includes('sector')).map((note, i) => (
                  <div key={i} className="text-xs bg-red-900/30 border border-red-700/50 rounded px-2 py-1.5 text-red-300">
                    ⛔ {note}
                  </div>
                ))}

                {entry._restViolation && (
                  <div className="text-xs bg-red-900/30 border border-red-700/50 rounded px-2 py-1.5 text-red-300 space-y-0.5">
                    <p className="font-semibold">⛔ Minimum Rest Violation (ORO.FTL.235)</p>
                    <p>Rest before this duty was {fmtMin(restBefore)}, required minimum is {fmtMin(minRestBefore)}. Short by {fmtMin(minRestBefore - restBefore)}.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Comments ─────────────────────────────────────────────── */}
          {comments.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Notes</p>
              <div className="space-y-1">
                {comments.map((c, i) => (
                  <p key={i} className="text-xs text-slate-300 bg-slate-700/30 rounded px-2 py-1">{c}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
