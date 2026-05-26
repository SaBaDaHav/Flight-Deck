import { useState } from 'react';
import RosterAnalyser   from './pages/RosterAnalyser.jsx';
import ScheduleCalendar from './pages/ScheduleCalendar.jsx';
import AllowanceChecker from './pages/AllowanceChecker.jsx';

const TABS = [
  { id: 'calendar',  label: 'Calendar'  },
  { id: 'roster',    label: 'Roster'    },
  { id: 'allowance', label: 'Allowance' },
];

export default function App() {
  const [tab, setTab] = useState('calendar');

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
        {tab === 'calendar'  && <ScheduleCalendar />}
        {tab === 'roster'    && <RosterAnalyser   />}
        {tab === 'allowance' && <AllowanceChecker />}
      </main>
    </div>
  );
}
