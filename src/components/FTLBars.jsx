// Reusable FTL compliance progress bars — used by RosterAnalyser

function fmtMin(mins) {
  if (mins === null || mins === undefined) return '—';
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function FtlBar({ label, usedMin, limitMin, status, note }) {
  const pct   = limitMin ? Math.min(1, usedMin / limitMin) : 0;
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
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      {note && <p className="text-xs text-slate-500 italic">{note}</p>}
    </div>
  );
}
