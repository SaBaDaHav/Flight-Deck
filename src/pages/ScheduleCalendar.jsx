import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { analyzeRosterImage, mergeRosterResults, analyzeMobileRoster } from '../lib/anthropic.js';
import { analyzeEntry, getMinRest } from '../lib/ftl-rules.js';
import { loadRoster, saveRoster, saveCrewProfile, loadCrewProfile, loadLearnedRoutes, saveLearnedRoute } from '../lib/storage.js';
import { getUnknownAirports, learnAirport } from '../lib/airport-db.js';
import { calcTotalBlockMinsWithLearned, findMissingLegs } from '../constants/route-block-times.js';
import CalendarGrid from '../components/CalendarGrid.jsx';
import DayModal from '../components/DayModal.jsx';
import EditEntryModal from '../components/EditEntryModal.jsx';

// ─── helpers ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// Reject totals rows / malformed AI output — every real entry must have YYYY-MM-DD
function isValidDate(d) {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(d);
}

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

// Parse a period date string in multiple formats (ISO, "DD/Mon/YYYY", "DD Mon YYYY")
function parsePeriodDate(str) {
  if (!str) return null;
  const t = str.trim();
  // ISO 8601: "2026-03-24" — always try first
  let d = new Date(t);
  if (!isNaN(d.getTime())) return d;
  // Merlot native: "24/Mar/2026" or "24 Mar 2026" or "24-Mar-2026"
  const m = t.match(/^(\d{1,2})[/\s-]([A-Za-z]{3})[/\s-](\d{4})$/u);
  if (m) {
    d = new Date(`${m[2]} ${m[1]}, ${m[3]}`);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

// Find the calendar month that contains the most entries — most reliable way
// to determine which month a Merlot roster belongs to, regardless of period dates.
function dominantMonth(entries) {
  const counts = {};
  for (const e of entries) {
    if (!e.date || typeof e.date !== 'string' || e.date.length < 7) continue;
    const ym = e.date.slice(0, 7); // "YYYY-MM"
    counts[ym] = (counts[ym] || 0) + 1;
  }
  let best = null, bestCount = 0;
  for (const [ym, n] of Object.entries(counts)) {
    if (n > bestCount) { bestCount = n; best = ym; }
  }
  return best; // "YYYY-MM" or null
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── mobile format post-processing ───────────────────────────────────────────

const DOW_MAP = { Mo:'Mon',Tu:'Tue',We:'Wed',Th:'Thu',Fr:'Fri',Sa:'Sat',Su:'Sun',
                  Mon:'Mon',Tue:'Tue',Wed:'Wed',Thu:'Thu',Fri:'Fri',Sat:'Sat',Sun:'Sun' };

function mobileEntryType(dutyCode) {
  const u = (dutyCode || '').toUpperCase();
  if (u.includes('RERRP2LD')) return 'RERRP2LD';
  if (u.includes('RERRP36'))  return 'RERRP36';
  if (u.startsWith('B-SB') || u.startsWith('SBA_') || u.startsWith('SBM_')) return 'STANDBY';
  if (u.includes('DEMO'))     return 'DEMO';
  if (u === 'ASI' || u.includes('GRT') || u.includes('GNDTNG')) return 'GROUND_TRAINING';
  if (u.includes('SIM') || u.includes('FFS') || u.includes('RT3') ||
      u.includes('LPC') || u.includes('CAE')) return 'SIM';
  return 'FLIGHT';
}


function minsToHhmm(m) {
  if (m < 0) m += 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

function routeToSectors(route) {
  const parts = (route || '').split('-').filter(p => p.length === 3);
  if (parts.length < 2) return [];
  return parts.slice(0, -1).map((o, i) => ({ origin: o, dest: parts[i + 1] }));
}

// Convert AI mobile entries into the same schema used by desktop roster entries.
// selectedYear: force all parsed dates to this year (fixes AI defaulting to wrong year).
function postProcessMobileEntries(rawEntries, selectedYear, learnedRoutes = {}) {
  const yearToUse = selectedYear || new Date().getFullYear();
  return rawEntries.map(e => {
    // Correct year if AI returned wrong year (e.g. 2025 or 2020 instead of 2026)
    let date = e.date;
    if (date) {
      const parsedYear = parseInt(date.slice(0, 4), 10);
      if (!isNaN(parsedYear) && parsedYear !== yearToUse) {
        date = `${yearToUse}${date.slice(4)}`;
      }
    }

    const type  = mobileEntryType(e.dutyCode);
    const route = (e.route || '').trim();
    const parts = route.split('-').filter(Boolean);
    const from  = parts[0] || null;
    const to    = parts[parts.length - 1] || null;
    const numLegs = Math.max(0, parts.length - 1);
    const sectors = routeToSectors(route);

    // Block time — look up from TVJ route DB (static) or user-learned routes
    let flightTime = null;
    let blockMins  = null;
    if (type === 'FLIGHT') {
      const dbMins = calcTotalBlockMinsWithLearned(route, learnedRoutes);
      if (dbMins != null) {
        blockMins  = dbMins;
        flightTime = minsToHhmm(dbMins);
      }
    }

    return {
      date:           date,
      dow:            DOW_MAP[e.dow] || e.dow,
      type,
      dutyCode:       e.dutyCode || null,
      property:       (type === 'RERRP36' || type === 'RERRP2LD') ? 'R' : null,
      from,
      to,
      report:         e.report || null,
      release:        e.release || null,
      releaseNextDay: e.releaseNextDay || false,
      scheduledBlock: flightTime,
      flightTime,
      blockMins,
      dutyTime:       null,
      tafb:           null,
      restTime:       null,
      sectors,
      numLegs,
      layover:        e.releaseNextDay || false,
      nightDuty:      false,
      earlyStart:     false,
      lateFinish:     false,
      woclEncroached: false,
      comments:       [],
      allowances:     '',
    };
  });
}

// ─── Date-aware rest calculation between two entries (handles multi-day layovers correctly)
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
export default function ScheduleCalendar({
  year, setYear, month, setMonth,
  entries, setEntries, totals, setTotals,
  crewProfile, setCrewProfile,
}) {
  const [selectedDay,    setSelectedDay]    = useState(null); // DayModal (FTL details view)
  const [editingDay,     setEditingDay]     = useState(null); // EditEntryModal { entry, date }
  const [isLoading,      setIsLoading]      = useState(false);
  const [loadError,      setLoadError]      = useState(null);
  const [isDragging,     setIsDragging]     = useState(false);
  const [savedInfo,      setSavedInfo]      = useState(null);
  // Pending save — held until unknown airports are classified
  const [pendingSave,    setPendingSave]    = useState(null); // { entries, totals, crew, targetYear, targetMonth }
  const [unknownCodes,     setUnknownCodes]     = useState([]); // airports needing DOM/INTER classification
  const [unknownRouteLegs, setUnknownRouteLegs] = useState([]); // route legs needing block-time input
  const [pendingRouteSave, setPendingRouteSave] = useState(null); // { allRaw, year, targetYear, targetMonth }
  const [routeInputs,      setRouteInputs]      = useState({}); // { 'PKX-BKK': '285' }
  const fileInputRef     = useRef(null);
  const mobileInputRef   = useRef(null);

  // Load stored roster when month/year changes — backfill blockMins from route DB for any entry missing it
  useEffect(() => {
    const stored = loadRoster(year, month);
    if (stored) {
      const learnedRoutes = loadLearnedRoutes();
      const rawStored = (stored.entries || []).filter(e => isValidDate(e.date));
      const backfilled = rawStored.map(e => {
        if (e.type !== 'FLIGHT' || e.blockMins != null) return e;
        let route = null;
        if (e.sectors?.length > 0) {
          route = [e.sectors[0].origin, ...e.sectors.map(s => s.dest)].join('-');
        } else if (e.from && e.to) {
          route = `${e.from}-${e.to}`;
        }
        const mins = route ? calcTotalBlockMinsWithLearned(route, learnedRoutes) : null;
        return mins != null ? { ...e, blockMins: mins } : e;
      });
      setEntries(enrichEntries(backfilled));
      setTotals(stored.totals || null);
    } else {
      setEntries([]);
      setTotals(null);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const navigateMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m > 12) { m = 1;  y++; }
    if (m <  1) { m = 12; y--; }
    setMonth(m);
    setYear(y);
  };

  const commitSave = useCallback((rawEntries, totals, crew, targetYear, targetMonth) => {
    // Reject placeholder crew names (e.g. AI returning literal "string" from schema).
    // Fall back to the saved crew profile; if none exists, leave crew null.
    let finalCrew = crew;
    if (!finalCrew || !finalCrew.name || finalCrew.name === 'string') {
      finalCrew = loadCrewProfile() || null;
    }

    const enriched = enrichEntries(rawEntries);
    setYear(targetYear);
    setMonth(targetMonth);
    setEntries(enriched);
    setTotals(totals || null);
    if (finalCrew) { setCrewProfile(finalCrew); saveCrewProfile(finalCrew); }
    saveRoster(targetYear, targetMonth, { entries: rawEntries, totals, crew: finalCrew });
    setSavedInfo({ count: rawEntries.length, year: targetYear, month: targetMonth });
    setPendingSave(null);
    setUnknownCodes([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── finalizeRoster — check unknowns, then save ────────────────────────────

  const finalizeRoster = useCallback((rawEntries, totals, crew, targetYear, targetMonth) => {
    const routes   = rawEntries.map(e => e.from && e.to ? [e.from, e.to].join('-') : '').filter(Boolean);
    const unknowns = getUnknownAirports(routes);

    if (unknowns.length > 0) {
      // Hold everything until the user classifies the unknown airports
      setPendingSave({ rawEntries, totals, crew, targetYear, targetMonth });
      setUnknownCodes(unknowns);
      return;
    }
    commitSave(rawEntries, totals, crew, targetYear, targetMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── mobile list view processor (supports multiple screenshots) ───────────

  const processMobileFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    setIsLoading(true);
    setLoadError(null);
    setSavedInfo(null);
    try {
      const base64s   = await Promise.all(imageFiles.map(fileToBase64));
      const rawArrays = await Promise.all(base64s.map(b64 => analyzeMobileRoster(b64, year)));
      const allRaw    = rawArrays.flat();
      if (!allRaw || allRaw.length === 0) throw new Error('No entries found in mobile roster image.');
      // Deduplicate by date — keep first occurrence (screenshots may overlap at boundaries)
      const seenDates = new Set();
      const dedupedRaw = allRaw.filter(e => {
        if (!e.date) return true; // keep undated entries
        if (seenDates.has(e.date)) return false;
        seenDates.add(e.date);
        return true;
      });
      const allRawDeduped = dedupedRaw;
      const learnedRoutes = loadLearnedRoutes();
      const entries   = postProcessMobileEntries(allRawDeduped, year, learnedRoutes);

      const dominant    = dominantMonth(entries);
      const targetYear  = dominant ? parseInt(dominant.slice(0, 4), 10) : year;
      const targetMonth = dominant ? parseInt(dominant.slice(5, 7),  10) : month;

      // Collect FLIGHT legs missing from both route DB and learned routes
      // entries have no .route field — reconstruct from sectors or from/to
      const missingLegs = new Set();
      for (const e of entries) {
        if (e.type === 'FLIGHT' && e.blockMins === null) {
          let routeStr = '';
          if (e.sectors?.length > 0) {
            routeStr = [e.sectors[0].origin, ...e.sectors.map(s => s.dest)].join('-');
          } else if (e.from && e.to) {
            routeStr = `${e.from}-${e.to}`;
          }
          if (routeStr) {
            for (const leg of findMissingLegs(routeStr, learnedRoutes)) missingLegs.add(leg);
          }
        }
      }
      if (missingLegs.size > 0) {
        setPendingRouteSave({ allRaw: allRawDeduped, year, targetYear, targetMonth });
        setUnknownRouteLegs([...missingLegs]);
        setRouteInputs({});
        return;
      }

      finalizeRoster(entries, null, null, targetYear, targetMonth);
    } catch (err) {
      setLoadError(err.message || 'Failed to analyze mobile roster image.');
    } finally {
      setIsLoading(false);
      if (mobileInputRef.current) mobileInputRef.current.value = '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

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
    setSavedInfo(null);

    try {
      const base64s  = await Promise.all(imageFiles.map(fileToBase64));
      const results  = await Promise.all(base64s.map(b64 => analyzeRosterImage(b64)));
      const merged   = results.length === 1 ? results[0] : mergeRosterResults(results);

      if (!merged || !merged.entries) throw new Error('No entries found in roster image.');

      // Determine target year/month.
      // Strategy 1 (most reliable): dominant month by entry count.
      // Strategy 2 (fallback): period END date.
      let targetYear  = year;
      let targetMonth = month;

      const dominant = dominantMonth(merged.entries);
      if (dominant) {
        targetYear  = parseInt(dominant.slice(0, 4), 10);
        targetMonth = parseInt(dominant.slice(5, 7), 10);
      } else if (merged.crew?.period) {
        const parts = merged.crew.period.split(' to ');
        const d = parsePeriodDate((parts[1] || '').trim()) ||
                  parsePeriodDate((parts[0] || '').trim());
        if (d) {
          targetYear  = d.getFullYear();
          targetMonth = d.getMonth() + 1;
        }
      }

      // Strip totals/summary rows (no valid date) then backfill blockMins from route DB.
      // Desktop AI sometimes includes the Merlot footer totals row as an entry with
      // flightTime="100:10" (full-period total) — the date filter removes it.
      const learnedRoutes = loadLearnedRoutes();
      const rawEntries = merged.entries.filter(e => isValidDate(e.date)).map(e => {
        let blockMins = e.blockMins ?? null;
        if (!blockMins && e.type === 'FLIGHT') {
          let route = null;
          if (e.sectors?.length > 0) {
            route = [e.sectors[0].origin, ...e.sectors.map(s => s.dest)].join('-');
          } else if (e.from && e.to) {
            route = `${e.from}-${e.to}`;
          }
          if (route) blockMins = calcTotalBlockMinsWithLearned(route, learnedRoutes);
        }
        return {
          ...e,
          blockMins,
          flightTime: e.flightTime ?? e.scheduledBlock ?? null,
        };
      });
      finalizeRoster(rawEntries, merged.totals, merged.crew, targetYear, targetMonth);

    } catch (err) {
      setLoadError(err.message || 'Failed to analyze roster image.');
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const handleClassifyAirport = useCallback((iata, type) => {
    learnAirport(iata, type);
    setUnknownCodes(prev => {
      const remaining = prev.filter(c => c !== iata);
      if (remaining.length === 0 && pendingSave) {
        // All classified — commit the deferred save
        commitSave(
          pendingSave.rawEntries, pendingSave.totals, pendingSave.crew,
          pendingSave.targetYear, pendingSave.targetMonth
        );
      }
      return remaining;
    });
  }, [pendingSave, commitSave]);

  const handleSaveLearnedRoutes = useCallback(() => {
    for (const [legKey, mins] of Object.entries(routeInputs)) {
      if (mins) saveLearnedRoute(legKey, Number(mins));
    }
    if (pendingRouteSave) {
      const learned   = loadLearnedRoutes();
      const processed = postProcessMobileEntries(pendingRouteSave.allRaw, pendingRouteSave.year, learned);
      finalizeRoster(processed, null, null, pendingRouteSave.targetYear, pendingRouteSave.targetMonth);
      setPendingRouteSave(null);
    }
    setUnknownRouteLegs([]);
    setRouteInputs({});
  }, [pendingRouteSave, routeInputs, finalizeRoster]);

  // ─── drag-and-drop ────────────────────────────────────────────────────────

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  // ─── day click → edit modal ───────────────────────────────────────────────

  const handleDayClick = useCallback((entry, day) => {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    setEditingDay({ entry: entry ?? null, date: dateStr });
  }, [year, month]);

  // Open FTL details modal (DayModal) — called from EditEntryModal "FTL Details" button
  const handleViewFtl = useCallback((entry) => {
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

  // Strip enrichment-computed props before persisting
  function stripComputed(e) {
    const raw = { ...e };
    delete raw._ftlViolation;
    delete raw._ftlWarning;
    delete raw._ftlAnalysis;
    delete raw._prevEntry;
    delete raw._restBeforeMin;
    delete raw._minRestRequired;
    delete raw._restViolation;
    return raw;
  }

  // Save a manually edited (or newly added) entry
  const handleEditSave = useCallback((updatedEntry) => {
    setEditingDay(null);

    // Update display state
    setEntries(prev => {
      const kept = prev.filter(e =>
        e.date !== updatedEntry.date ||
        e.type === 'COMMENT' ||
        e.type === 'PROFILE',
      );
      const newList = updatedEntry.type !== 'OFF'
        ? [...kept, updatedEntry]
        : kept;
      newList.sort((a, b) => a.date.localeCompare(b.date));
      return enrichEntries(newList);
    });

    // Persist to storage using fresh stored data to avoid stale-closure issues
    const stored = loadRoster(year, month);
    const prevRaw = (stored?.entries || []);
    const keptRaw = prevRaw.filter(e =>
      e.date !== updatedEntry.date ||
      e.type === 'COMMENT' ||
      e.type === 'PROFILE',
    );
    const rawEntry = stripComputed(updatedEntry);
    const newRaw   = rawEntry.type !== 'OFF' ? [...keptRaw, rawEntry] : keptRaw;
    newRaw.sort((a, b) => a.date.localeCompare(b.date));
    saveRoster(year, month, {
      entries: newRaw,
      totals:  stored?.totals  || null,
      crew:    stored?.crew    || null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  // Delete an entry (revert day to OFF)
  const handleEditDelete = useCallback((date) => {
    setEditingDay(null);

    setEntries(prev => {
      const kept = prev.filter(e =>
        e.date !== date || e.type === 'COMMENT' || e.type === 'PROFILE',
      );
      kept.sort((a, b) => a.date.localeCompare(b.date));
      return enrichEntries(kept);
    });

    const stored = loadRoster(year, month);
    const keptRaw = (stored?.entries || []).filter(e =>
      e.date !== date || e.type === 'COMMENT' || e.type === 'PROFILE',
    );
    keptRaw.sort((a, b) => a.date.localeCompare(b.date));
    saveRoster(year, month, {
      entries: keptRaw,
      totals:  stored?.totals || null,
      crew:    stored?.crew   || null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  // ─── computed stats ───────────────────────────────────────────────────────

  const stats = useMemo(() => {
    // Only count entries that belong to the currently displayed calendar month.
    // Merlot periods span ~4 weeks and may include days from the prior month;
    // without this filter the totals reflect the full roster period, not the month.
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    const flights   = entries.filter(e => e.type === 'FLIGHT' && e.date?.startsWith(monthPrefix));
    const rerrp2ld  = entries.filter(e => e.type === 'RERRP2LD' && e.date?.startsWith(monthPrefix)).length;
    const rerrp36   = entries.filter(e => e.type === 'RERRP36' && e.date?.startsWith(monthPrefix)).length;
    const violations = flights.filter(e => e._ftlViolation).length;
    const warnings   = flights.filter(e => e._ftlWarning).length;
    const nightDuties = flights.filter(e => e.nightDuty).length;

    let flightMins = 0, dutyMins = 0, tafbMins = 0;
    for (const e of flights) {
      // blockMins (route DB) is authoritative off-block→on-block time.
      // flightTime from Merlot column is also block time.
      // Never use (release - report) which is FDP and ~2h longer per duty day.
      const route = (e.route || (e.sectors?.length
        ? [e.sectors[0].origin, ...e.sectors.map(s => s.dest)].join('-')
        : e.from && e.to ? `${e.from}-${e.to}` : ''));
      const entryBlock = e.blockMins != null
        ? e.blockMins
        : calcTotalBlockMinsWithLearned(route, loadLearnedRoutes())
        || parseHhmm(e.flightTime)
        || 0;
      flightMins += entryBlock;
      dutyMins   += parseHhmm(e.dutyTime);
      tafbMins   += parseHhmm(e.tafb);
    }

    // Use per-entry sum exclusively. Never fall back to totals.flightTime:
    // the Merlot footer covers the full roster period (may span multiple calendar months)
    // and mergeRosterResults sums both images — making it unreliable for a single calendar month.
    const totalFlightMins = flightMins;
    const totalDutyMins = dutyMins > 0
      ? dutyMins
      : (totals ? parseHhmm(totals.dutyTime) : 0);

    const violatedEntries = flights
      .filter(e => e._ftlViolation)
      .map(e => {
        const reasons = [];
        if (e._ftlAnalysis?.fdpStatus === 'violation') {
          const sectorNote = e._ftlAnalysis?.notes?.find(n => n.includes('sector'));
          reasons.push(sectorNote ?? 'FDP exceeds basic limit (OMA Table 7.1.2)');
        }
        if (e._restViolation) {
          reasons.push('Minimum rest not met (ORO.FTL.235)');
        }
        return { date: e.date, dutyCode: e.dutyCode, from: e.from, to: e.to, reasons };
      });

    return {
      flights: flights.length,
      rerrp2ld, rerrp36, violations, warnings, nightDuties,
      totalFlightMins, totalDutyMins, tafbMins,
      violatedEntries,
    };
  }, [entries, totals, year, month]);

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

          {/* Upload buttons */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="text-sm px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
            title="Upload Merlot desktop roster report image(s)"
          >
            {isLoading ? 'Analyzing…' : 'Desktop Roster'}
          </button>
          <button
            onClick={() => mobileInputRef.current?.click()}
            disabled={isLoading}
            className="text-sm px-3 py-1.5 rounded bg-violet-700 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
            title="Upload Merlot mobile app Duties List screenshot"
          >
            {isLoading ? 'Analyzing…' : 'Mobile List'}
          </button>
          <input ref={fileInputRef}   type="file" accept="image/*" multiple className="hidden" onChange={e => processFiles(e.target.files)} />
          <input ref={mobileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => processMobileFiles(e.target.files)} />
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* ── Loading state ─────────────────────────────────────────────── */}
        {isLoading && (
          <div className="flex items-center gap-3 bg-sky-900/30 border border-sky-700/50 rounded-lg p-4">
            <div className="w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <div>
              <p className="text-sm font-semibold text-sky-300">Analyzing roster image…</p>
              <p className="text-xs text-slate-400">Claude is reading the Merlot roster. This takes ~10–20 seconds.</p>
            </div>
          </div>
        )}

        {/* ── Error state ───────────────────────────────────────────────── */}
        {loadError && (
          <div className="flex items-start gap-3 bg-red-900/30 border border-red-700/50 rounded-lg p-4">
            <span className="text-red-400 text-lg shrink-0">⚠</span>
            <div>
              <p className="text-sm font-semibold text-red-300">Analysis failed</p>
              <p className="text-xs text-slate-300 mt-0.5">{loadError}</p>
              {!import.meta.env.VITE_ANTHROPIC_API_KEY && (
                <p className="text-xs text-amber-300 mt-1">Set VITE_ANTHROPIC_API_KEY in .env.local to enable AI parsing.</p>
              )}
            </div>
          </div>
        )}

        {/* ── Unknown route block times ─────────────────────────────────── */}
        {unknownRouteLegs.length > 0 && (
          <div className="bg-amber-900/30 border border-amber-600/50 rounded-lg p-4 space-y-3">
            <p className="text-sm font-semibold text-amber-300">
              Unknown routes — enter block minutes for each leg:
            </p>
            <div className="flex flex-wrap gap-3">
              {unknownRouteLegs.map(legKey => (
                <div key={legKey} className="flex items-center gap-2 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2">
                  <span className="font-mono font-bold text-white text-sm">{legKey}</span>
                  <input
                    type="number"
                    min="1"
                    value={routeInputs[legKey] || ''}
                    onChange={e => setRouteInputs(prev => ({ ...prev, [legKey]: e.target.value }))}
                    placeholder="e.g. 285"
                    className="w-20 bg-slate-700 border border-slate-500 focus:border-sky-400 focus:outline-none rounded px-2 py-1 text-sm text-white font-mono"
                  />
                  <span className="text-xs text-slate-400">min</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveLearnedRoutes}
                disabled={!unknownRouteLegs.every(k => routeInputs[k])}
                className="text-sm px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
              >
                Save &amp; Continue
              </button>
              <p className="text-xs text-slate-400">Block times saved for future uploads.</p>
            </div>
          </div>
        )}

        {/* ── Unknown airports classification ───────────────────────────── */}
        {unknownCodes.length > 0 && (
          <div className="bg-amber-900/30 border border-amber-600/50 rounded-lg p-4 space-y-3">
            <p className="text-sm font-semibold text-amber-300">
              New airports found — classify each as domestic or international:
            </p>
            <div className="flex flex-wrap gap-3">
              {unknownCodes.map(iata => (
                <div key={iata} className="flex items-center gap-2 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2">
                  <span className="font-mono font-bold text-white">{iata}</span>
                  <button
                    onClick={() => handleClassifyAirport(iata, 'DOM')}
                    className="text-xs px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
                  >
                    DOM
                  </button>
                  <button
                    onClick={() => handleClassifyAirport(iata, 'INTER')}
                    className="text-xs px-2 py-1 rounded bg-sky-700 hover:bg-sky-600 text-white transition-colors"
                  >
                    INTER
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400">Roster will be saved after all airports are classified. Choices are remembered for future uploads.</p>
          </div>
        )}

        {/* ── Drop zone (shown when no roster loaded) ───────────────────── */}
        {!hasRoster && !isLoading && unknownCodes.length === 0 && (
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
                        stats.totalFlightMins > 6000 ? 'bg-red-500' :
                        stats.totalFlightMins > 5400 ? 'bg-amber-400' : 'bg-sky-500'
                      }`}
                      style={{ width: `${Math.min(100, stats.totalFlightMins / 60)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Violations detail */}
            {stats.violatedEntries?.length > 0 && (
              <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-3 space-y-1">
                <p className="text-xs font-bold text-red-400 uppercase tracking-wide mb-2">FTL Violations</p>
                {stats.violatedEntries.map(v => (
                  <div key={v.date} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="font-mono text-slate-400">{v.date}</span>
                    {v.dutyCode && <span className="text-slate-500">({v.dutyCode})</span>}
                    {v.from && v.to && <span className="text-slate-400">{v.from}→{v.to}</span>}
                    <span className="text-red-300">— {v.reasons.join(' · ')}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Saved info / debug indicator */}
            {savedInfo && savedInfo.year === year && savedInfo.month === month ? (
              <p className="text-center text-xs text-emerald-500">
                {savedInfo.count} entries saved · storage key: roster:{savedInfo.year}-{String(savedInfo.month).padStart(2, '0')}
              </p>
            ) : (
              <p className="text-center text-xs text-slate-600">
                Drop a new Merlot image anywhere to update · multiple images merge automatically
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Edit entry modal (z-40, all cell clicks) ─────────────────────── */}
      {editingDay && (
        <EditEntryModal
          entry={editingDay.entry}
          date={editingDay.date}
          onSave={handleEditSave}
          onDelete={() => handleEditDelete(editingDay.date)}
          onClose={() => setEditingDay(null)}
          onViewFtl={
            editingDay.entry?.type === 'FLIGHT'
              ? () => handleViewFtl(editingDay.entry)
              : null
          }
        />
      )}

      {/* ── Day modal — FTL details view (z-50, on top of edit modal) ──── */}
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
