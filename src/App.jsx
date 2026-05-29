import { useState, useRef } from 'react';
import RosterAnalyser   from './pages/RosterAnalyser.jsx';
import ScheduleCalendar from './pages/ScheduleCalendar.jsx';
import AllowanceChecker from './pages/AllowanceChecker.jsx';
import { loadCrewProfile } from './lib/storage.js';
import { exportBackup, importBackup, getBackupStats } from './lib/backup.js';

const TABS = [
  { id: 'calendar',  label: 'Calendar'  },
  { id: 'roster',    label: 'Roster'    },
  { id: 'allowance', label: 'Allowance' },
];

export default function App() {
  const [tab, setTab] = useState('calendar');

  // Roster state lifted here so it persists across tab switches
  const now = new Date();
  const [calYear,    setCalYear]    = useState(now.getFullYear());
  const [calMonth,   setCalMonth]   = useState(now.getMonth() + 1);
  const [calEntries, setCalEntries] = useState([]);
  const [calTotals,  setCalTotals]  = useState(null);
  const [calCrew,    setCalCrew]    = useState(() => loadCrewProfile());
  const importRef = useRef(null);
  const [backupMsg, setBackupMsg] = useState(null);

  function handleExport() {
    const count = exportBackup();
    const stats = getBackupStats();
    setBackupMsg({ type: 'ok', text: `Exported ${count} items (${stats.kb} KB) — save to Google Drive` });
    setTimeout(() => setBackupMsg(null), 5000);
  }

  async function handleImport(files) {
    if (!files || files.length === 0) return;
    try {
      const result = await importBackup(files[0]);
      setBackupMsg({ type: 'ok', text: `Restored ${result.count} items from backup (${result.exportedAt?.slice(0,10)}) — please refresh` });
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      setBackupMsg({ type: 'err', text: err.message });
      setTimeout(() => setBackupMsg(null), 5000);
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="sticky top-0 z-20 bg-slate-900 border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 h-11 flex items-center gap-4">
          <span className="text-sm font-bold text-white tracking-tight whitespace-nowrap">
            ✈ Flight Deck
          </span>
          <nav className="flex gap-1 ml-auto">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 h-8 text-xs rounded-lg transition-colors ${
                  tab === t.id
                    ? 'bg-slate-700 text-white font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main>
        {tab === 'calendar' && (
          <ScheduleCalendar
            year={calYear}        setYear={setCalYear}
            month={calMonth}      setMonth={setCalMonth}
            entries={calEntries}  setEntries={setCalEntries}
            totals={calTotals}    setTotals={setCalTotals}
            crewProfile={calCrew} setCrewProfile={setCalCrew}
          />
        )}
        {tab === 'roster'    && <RosterAnalyser   />}
        {tab === 'allowance' && (
          <AllowanceChecker
            calEntries={calEntries}
            calYear={calYear}
            calMonth={calMonth}
          />
        )}
      </main>

      {/* ── Backup bar ─────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-slate-900/95 backdrop-blur border-t border-slate-800 px-4 py-1.5 flex items-center gap-3">
        <span className="text-xs text-slate-600 hidden sm:block">Flight Deck · localStorage</span>
        <div className="ml-auto flex items-center gap-2">
          {backupMsg && (
            <span className={`text-xs ${backupMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
              {backupMsg.text}
            </span>
          )}
          <button
            onClick={handleExport}
            className="text-xs px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            title="Export all data to JSON file — save to Google Drive"
          >
            ↓ Export
          </button>
          <button
            onClick={() => importRef.current?.click()}
            className="text-xs px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            title="Import data from backup JSON file"
          >
            ↑ Import
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={e => handleImport(e.target.files)}
          />
        </div>
      </div>
    </div>
  );
}
