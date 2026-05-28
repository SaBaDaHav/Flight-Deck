import { useMemo } from 'react';

const DOW_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─── color scheme (from CLAUDE.md §10.1) ─────────────────────────────────────
function getCellColor(entry) {
  if (!entry || entry.type === 'OFF') {
    return { bg: 'bg-slate-800/40', text: 'text-slate-600', border: 'border-slate-800', hover: 'hover:bg-slate-700/40' };
  }
  if (entry.type === 'RERRP36') {
    return { bg: 'bg-emerald-900/60', text: 'text-emerald-200', border: 'border-emerald-700', hover: 'hover:bg-emerald-800/70' };
  }
  if (entry.type === 'RERRP2LD') {
    return { bg: 'bg-teal-900/60', text: 'text-teal-200', border: 'border-teal-700', hover: 'hover:bg-teal-800/70' };
  }
  if (entry.type === 'STANDBY') {
    return { bg: 'bg-amber-900/50', text: 'text-amber-200', border: 'border-amber-700', hover: 'hover:bg-amber-800/60' };
  }
  if (entry.type === 'CONTINUATION') {
    return { bg: 'bg-indigo-900/50', text: 'text-indigo-200', border: 'border-indigo-700 border-dashed', hover: 'hover:bg-indigo-800/60' };
  }
  // FLIGHT
  if (entry._ftlViolation) {
    return { bg: 'bg-red-900/60', text: 'text-red-100', border: 'border-red-600', hover: 'hover:bg-red-800/70' };
  }
  if (entry.nightDuty || entry.woclEncroached) {
    return { bg: 'bg-orange-900/60', text: 'text-orange-100', border: 'border-orange-600', hover: 'hover:bg-orange-800/70' };
  }
  return { bg: 'bg-sky-900/60', text: 'text-sky-100', border: 'border-sky-700', hover: 'hover:bg-sky-800/70' };
}

function routeSummary(entry) {
  if (!entry) return '';
  const { sectors = [], from, to } = entry;
  if (sectors.length > 0) {
    return [sectors[0].origin, ...sectors.map(s => s.dest)].join('→');
  }
  if (from && to) return `${from}→${to}`;
  return '';
}

// ─── individual cell ──────────────────────────────────────────────────────────
function CalendarCell({ day, entry, today, onClick }) {
  const { bg, text, border, hover } = getCellColor(entry);
  const hasContent  = entry && entry.type !== 'OFF';
  const isEdited    = entry?.editedManually;
  const route       = routeSummary(entry);

  // Yellow border overrides type color for manually edited cells
  const borderClass = isEdited ? 'border-yellow-500/70' : border;

  const badges = [];
  if (entry?.nightDuty)        badges.push({ icon: '🌙', title: 'Night duty' });
  if (entry?.earlyStart)       badges.push({ icon: '⚡', title: 'Early start' });
  if (entry?.lateFinish)       badges.push({ icon: '🌅', title: 'Late finish' });
  if (entry?._ftlViolation)    badges.push({ icon: '⛔', title: 'FTL violation' });
  else if (entry?._ftlWarning) badges.push({ icon: '⚠', title: 'FTL warning' });

  return (
    <div
      className={`
        relative min-h-20 rounded border p-1.5 select-none cursor-pointer
        ${bg} ${borderClass} ${hover}
        ${today ? 'ring-1 ring-sky-400' : ''}
        transition-colors
      `}
      onClick={onClick}
      title={hasContent ? `${entry.dutyCode || entry.type} — click to edit` : 'Click to add duty'}
    >
      {/* Day number row */}
      <div className={`flex items-start justify-between ${text}`}>
        <span className={`text-xs font-semibold leading-none ${today ? 'text-sky-400' : ''}`}>
          {day}
        </span>
        <span className="text-xs leading-none flex items-center gap-0.5">
          {isEdited && <span title="Manually edited" className="text-yellow-400">✏</span>}
          {badges.map((b, i) => (
            <span key={i} title={b.title}>{b.icon}</span>
          ))}
        </span>
      </div>

      {/* Entry content */}
      {hasContent && (
        <div className={`mt-0.5 space-y-0.5 ${text}`}>
          {(entry.dutyCode || entry.type !== 'FLIGHT') && (
            <div className="text-xs font-semibold truncate leading-tight">
              {entry.type === 'CONTINUATION' ? '→ cont.' :
               entry.type === 'RERRP36'  ? 'RERRP 36h' :
               entry.type === 'RERRP2LD' ? 'RERRP 2LD' :
               entry.type === 'STANDBY'  ? 'Standby' :
               entry.dutyCode || ''}
            </div>
          )}
          {entry.report && (
            <div className="text-xs opacity-80 leading-tight font-mono">{entry.report}</div>
          )}
          {route && (
            <div className="text-xs opacity-90 truncate leading-tight hidden sm:block">{route}</div>
          )}
          {(entry.flightTime || entry.restTime || entry.dutyTime) && (
            <div className="text-xs opacity-70 leading-tight font-mono">
              {entry.flightTime || entry.restTime || entry.dutyTime}
            </div>
          )}
        </div>
      )}

      {/* Empty day hint on hover */}
      {!hasContent && (
        <div className="absolute inset-x-0 bottom-1 flex justify-center opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
          <span className="text-slate-600 text-xs">+</span>
        </div>
      )}
    </div>
  );
}

// ─── blank filler cell ────────────────────────────────────────────────────────
function BlankCell() {
  return <div className="min-h-20 rounded border border-slate-800/30 bg-slate-900/20" />;
}

// ─── main component ───────────────────────────────────────────────────────────
export default function CalendarGrid({ entries = [], year, month, onDayClick }) {
  const today = new Date();

  // Map date-day-number → entry (only the primary FLIGHT / RERRP / etc., skip COMMENT)
  const entryByDay = useMemo(() => {
    const map = {};
    for (const e of entries) {
      if (!e.date) continue;
      // Use only significant types for the cell
      if (e.type === 'COMMENT' || e.type === 'PROFILE') continue;
      const day = parseInt(e.date.split('-')[2], 10);
      // Prefer FLIGHT over CONTINUATION if both exist for same date
      if (!map[day] || map[day].type === 'CONTINUATION') map[day] = e;
    }
    return map;
  }, [entries]);

  // Build calendar grid cells
  const cells = useMemo(() => {
    const numDays  = new Date(year, month, 0).getDate();
    const firstDow = new Date(year, month - 1, 1).getDay(); // 0=Sun
    const startPad = firstDow === 0 ? 6 : firstDow - 1;    // Mon=0 grid

    const result = [];
    for (let i = 0; i < startPad; i++) result.push({ blank: true, key: `b-${i}` });
    for (let d = 1; d <= numDays; d++)  result.push({ blank: false, day: d, key: `d-${d}` });
    while (result.length % 7 !== 0)     result.push({ blank: true, key: `be-${result.length}` });
    return result;
  }, [year, month]);

  const isToday = (d) =>
    today.getFullYear() === year &&
    today.getMonth() + 1 === month &&
    today.getDate() === d;

  return (
    <div>
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DOW_HEADERS.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-slate-400 py-1 uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map(cell =>
          cell.blank ? (
            <BlankCell key={cell.key} />
          ) : (
            <CalendarCell
              key={cell.key}
              day={cell.day}
              entry={entryByDay[cell.day] ?? null}
              today={isToday(cell.day)}
              onClick={() => onDayClick(entryByDay[cell.day] ?? null, cell.day)}
            />
          )
        )}
      </div>
    </div>
  );
}
