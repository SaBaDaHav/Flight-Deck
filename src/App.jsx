import { useState } from 'react';
import RosterAnalyser   from './pages/RosterAnalyser.jsx';
import ScheduleCalendar from './pages/ScheduleCalendar.jsx';
import AllowanceChecker from './pages/AllowanceChecker.jsx';
import { loadCrewProfile } from './lib/storage.js';

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
    </div>
  );
}
