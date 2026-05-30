// TVJ FTL rules — OMA Chapter 7, Iss.03/Rev.01, 01 May 2026
// Regulatory basis: TCAR OPS (mirrors EASA ORO.FTL), approved by CAAT

// ─── helpers ────────────────────────────────────────────────────────────────

// "HH:MM" → total minutes from midnight
export function timeToMin(timeStr) {
  if (!timeStr || !timeStr.includes(':')) return null;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// Decimal hours (e.g. 12.75) → minutes
function dhToMin(dh) {
  return Math.round(dh * 60);
}

// Duration in minutes between two HH:MM times; if end < start assumes next-day
export function durationMin(startStr, endStr, endNextDay = false) {
  const s = timeToMin(startStr);
  const e = timeToMin(endStr);
  if (s === null || e === null) return null;
  let diff = e - s;
  if (endNextDay || diff < 0) diff += 1440;
  return diff;
}

// ─── FDP limit table (Table 7.1.2, acclimatized) ────────────────────────────
// Rows keyed by report-time band; columns = [1-2, 3, 4, 5, 6, 7, 8, 9, 10+ sectors]
const FDP_TABLE = {
  '0600-1329': [13.00, 12.50, 12.00, 11.50, 11.00, 10.50, 10.00,  9.50, 9.00],
  '1330-1359': [12.75, 12.25, 11.75, 11.25, 10.75, 10.25,  9.75,  9.25, 9.00],
  '1400-1429': [12.50, 12.00, 11.50, 11.00, 10.50, 10.00,  9.50,  9.00, 9.00],
  '1430-1459': [12.25, 11.75, 11.25, 10.75, 10.25,  9.75,  9.25,  9.00, 9.00],
  '1500-1529': [12.00, 11.50, 11.00, 10.50, 10.00,  9.50,  9.00,  9.00, 9.00],
  '1530-1559': [11.75, 11.25, 10.75, 10.25,  9.75,  9.25,  9.00,  9.00, 9.00],
  '1600-1629': [11.50, 11.00, 10.50, 10.00,  9.50,  9.00,  9.00,  9.00, 9.00],
  '1630-1659': [11.25, 10.75, 10.25,  9.75,  9.25,  9.00,  9.00,  9.00, 9.00],
  '1700-0459': [11.00, 10.50, 10.00,  9.50,  9.00,  9.00,  9.00,  9.00, 9.00],
  '0500-0514': [12.00, 11.50, 11.00, 10.50, 10.00,  9.50,  9.00,  9.00, 9.00],
  '0515-0529': [12.25, 11.75, 11.25, 10.75, 10.25,  9.75,  9.25,  9.00, 9.00],
  '0530-0544': [12.50, 12.00, 11.50, 11.00, 10.50, 10.00,  9.50,  9.00, 9.00],
  '0545-0559': [12.75, 12.25, 11.75, 11.25, 10.75, 10.25,  9.75,  9.25, 9.00],
};

// Unknown acclimatization limits (Table 7.1.2 Table 2), in decimal hours
const UNKNOWN_ACCL_TABLE = [11.00, 10.50, 10.00, 9.50, 9.00, 9.00, 9.00, 9.00, 9.00];

function getTableIndex(numSectors) {
  if (numSectors <= 2) return 0;
  return Math.min(8, numSectors - 2);
}

// Returns the time-band key for a given report time (minutes from midnight)
function getTimeBand(reportMin) {
  if (reportMin >= 360  && reportMin <= 809)  return '0600-1329';
  if (reportMin >= 810  && reportMin <= 839)  return '1330-1359';
  if (reportMin >= 840  && reportMin <= 869)  return '1400-1429';
  if (reportMin >= 870  && reportMin <= 899)  return '1430-1459';
  if (reportMin >= 900  && reportMin <= 929)  return '1500-1529';
  if (reportMin >= 930  && reportMin <= 959)  return '1530-1559';
  if (reportMin >= 960  && reportMin <= 989)  return '1600-1629';
  if (reportMin >= 990  && reportMin <= 1019) return '1630-1659';
  if (reportMin >= 1020 || reportMin <= 299)  return '1700-0459';
  if (reportMin >= 300  && reportMin <= 314)  return '0500-0514';
  if (reportMin >= 315  && reportMin <= 329)  return '0515-0529';
  if (reportMin >= 330  && reportMin <= 344)  return '0530-0544';
  if (reportMin >= 345  && reportMin <= 359)  return '0545-0559';
  return null;
}

// Maximum basic FDP in minutes for acclimatized crew
// reportTime: "HH:MM", numSectors: integer
export function getFdpLimit(reportTime, numSectors, unknownAccl = false) {
  const reportMin = timeToMin(reportTime);
  if (reportMin === null) return null;

  const idx = getTableIndex(numSectors);

  if (unknownAccl) {
    return dhToMin(UNKNOWN_ACCL_TABLE[idx]);
  }

  const band = getTimeBand(reportMin);
  if (!band) return null;
  return dhToMin(FDP_TABLE[band][idx]);
}

// ─── FDP extension without in-flight rest (Table 7.1.3) ─────────────────────
// Returns absolute max FDP ceiling in minutes, or null if extension not permitted.
// Extension is permitted max twice in any 7 consecutive days.
// Only covers 1–5 sectors; 6+ sectors: WOCL not encroached needed but limit is same 9:00 floor.

const EXT_TABLE = {
  // [1-2 sec, 3 sec, 4 sec, 5 sec] absolute ceilings in decimal hours
  '0615-0629': [13.25, 12.75, 12.25, 11.75],
  '0700-1329': [14.00, 13.50, 13.00, 12.50],
  // 1330-1859 get standard +1h on top of base FDP (handled below)
};

function getExtBand(reportMin) {
  // NOT ALLOWED bands
  if (reportMin >= 360  && reportMin <= 374)  return 'NOT_ALLOWED'; // 0600-0614
  if (reportMin >= 1140 || reportMin <= 359)  return 'NOT_ALLOWED'; // 1900-0559

  if (reportMin >= 375  && reportMin <= 389)  return '0615-0629';
  if (reportMin >= 420  && reportMin <= 809)  return '0700-1329';
  // 1330-1859 → standard +1h applies
  if (reportMin >= 810  && reportMin <= 1139) return 'STANDARD_PLUS1';
  return null;
}

function getExtIndex(numSectors) {
  if (numSectors <= 2) return 0;
  if (numSectors === 3) return 1;
  if (numSectors === 4) return 2;
  return 3; // 5+ treated as 5-sector limit
}

export function getFdpExtensionLimit(reportTime, numSectors) {
  const reportMin = timeToMin(reportTime);
  if (reportMin === null) return null;

  const band = getExtBand(reportMin);
  if (!band || band === 'NOT_ALLOWED') return null;

  if (band === 'STANDARD_PLUS1') {
    const base = getFdpLimit(reportTime, numSectors);
    return base !== null ? base + 60 : null;
  }

  const extIdx = getExtIndex(numSectors);
  return dhToMin(EXT_TABLE[band][extIdx]);
}

// ─── Duty type checks ────────────────────────────────────────────────────────
// WOCL = 02:00–05:59 (120–359 min)
// Night duty: encroaches 02:00–04:59 (WOCL core)
// Early start: report 05:00–05:59
// Late finish: duty ends 23:00–01:59
// WOCL encroached: any portion of 02:00–05:59

function rangeOverlaps(startMin, endMin, rangeStart, rangeEnd) {
  // All values in minutes from midnight; handles overnight duties (endMin < startMin)
  const s = startMin;
  const e = endMin < startMin ? endMin + 1440 : endMin;
  const rs = rangeStart;
  const re = rangeEnd < rangeStart ? rangeEnd + 1440 : rangeEnd;

  // Also check next-day wrap of range
  return (s <= re && e >= rs) || (s <= re + 1440 && e >= rs + 1440);
}

export function isNightDuty(reportTime, releaseTime, releaseNextDay = false) {
  const r = timeToMin(reportTime);
  const e = timeToMin(releaseTime);
  if (r === null || e === null) return false;
  const end = releaseNextDay || e <= r ? e + 1440 : e;
  // Night duty: duty period encroaches 02:00–04:59 (120–299)
  return rangeOverlaps(r, end < r ? end + 1440 : end, 120, 299);
}

export function isEarlyStart(reportTime) {
  const r = timeToMin(reportTime);
  if (r === null) return false;
  return r >= 300 && r <= 359; // 05:00–05:59
}

export function isLateFinish(releaseTime, releaseNextDay = false) {
  const e = timeToMin(releaseTime);
  if (e === null) return false;
  // Late finish: ends 23:00–01:59 (1380–1439 same day, or 0–119 next day)
  if (releaseNextDay) return e >= 0 && e <= 119; // next day 00:00–01:59
  return e >= 1380; // 23:00–23:59
}

export function isWoclEncroached(reportTime, releaseTime, releaseNextDay = false) {
  const r = timeToMin(reportTime);
  const e = timeToMin(releaseTime);
  if (r === null || e === null) return false;
  const end = (releaseNextDay || e < r) ? e + 1440 : e;
  // WOCL: 02:00–05:59 (120–359)
  return rangeOverlaps(r, end, 120, 359);
}

export function isDisruptiveDuty(entry) {
  const { report, release, releaseNextDay } = entry;
  return (
    isNightDuty(report, release, releaseNextDay) ||
    isEarlyStart(report) ||
    isLateFinish(release, releaseNextDay)
  );
}

// ─── Rest requirements (ORO.FTL.235) ────────────────────────────────────────

export function getMinRest(dutyMinutes, isHomeBase = true, afterExtension = false) {
  if (afterExtension) return 600; // never less than 10h after commander's discretion
  const base = isHomeBase ? 720 : 600; // 12h home / 10h away
  return Math.max(base, dutyMinutes);
}

// Travel time rule: if travel > 30 min, add 2× excess
export function adjustRestForTravel(minRestMin, travelMin) {
  if (travelMin <= 30) return minRestMin;
  return minRestMin + 2 * (travelMin - 30);
}

// ─── Cumulative limits (ORO.FTL.210 / ORO.FTL.235) ──────────────────────────
export const CUMULATIVE_LIMITS = {
  duty7days:   60 * 60,    //  60h in minutes
  duty14days: 110 * 60,    // 110h
  duty28days: 190 * 60,    // 190h
  flight28days: 100 * 60,  // 100h
  flight12months: 1000 * 60, // 1000h
  duty12months:   2000 * 60, // 2000h
};

// Sums dutyMinutes for entries within the last N calendar days from refDate (ISO string)
export function sumDuty(entries, refDate, days) {
  const ref = new Date(refDate);
  const cutoff = new Date(ref);
  cutoff.setDate(cutoff.getDate() - days + 1);
  return entries
    .filter(e => {
      const d = new Date(e.date);
      return d >= cutoff && d <= ref;
    })
    .reduce((sum, e) => sum + (e.dutyMinutes || 0), 0);
}

export function sumFlight(entries, refDate, days) {
  const ref = new Date(refDate);
  const cutoff = new Date(ref);
  cutoff.setDate(cutoff.getDate() - days + 1);
  return entries
    .filter(e => {
      const d = new Date(e.date);
      return d >= cutoff && d <= ref;
    })
    .reduce((sum, e) => sum + (e.flightMinutes || 0), 0);
}

// ─── RERRP checks (Section 6.9) ──────────────────────────────────────────────
export const LOCAL_NIGHT_START = 22 * 60; // 22:00
export const LOCAL_NIGHT_END   =  8 * 60; //  8:00 next day

// Count how many RERRP2LD entries exist in a given calendar month
export function countRerrp2LD(entries, year, month) {
  return entries.filter(e => {
    const d = new Date(e.date);
    return (
      e.type === 'RERRP2LD' &&
      d.getFullYear() === year &&
      d.getMonth() + 1 === month
    );
  }).length;
}

// Gap between two RERRP start dates in hours; must be ≤168h
export function rerrpGapHours(date1, date2) {
  const ms = Math.abs(new Date(date2) - new Date(date1));
  return ms / 3_600_000;
}

// ─── Disruptive schedule rule (7.1.13A) ──────────────────────────────────────
// If ≥4 disruptive duties between two RERRPs, second RERRP must be ≥60h
export function countDisruptiveBetween(entries, fromDate, toDate) {
  return entries.filter(e => {
    const d = new Date(e.date);
    return d > new Date(fromDate) && d < new Date(toDate) && isDisruptiveDuty(e);
  }).length;
}

// ─── Single-entry FTL compliance analysis ────────────────────────────────────
// entry fields expected (from Merlot JSON schema):
//   date, report, release, releaseNextDay, dutyTime (e.g. "6:20"), numLegs, type
// prevEntry: previous roster entry (for rest check); may be null
// Returns a compliance object for display in DayModal / FTLBars
export function analyzeEntry(entry, prevEntry = null) {
  const result = {
    fdpLimitMin:      null,
    fdpLimitExtMin:   null,
    fdpUsedMin:       null,
    fdpPct:           null,
    fdpStatus:        'ok',
    restBeforeMin:    null,
    restRequiredMin:  null,
    restStatus:       'ok',
    nightDuty:        false,
    earlyStart:       false,
    lateFinish:       false,
    woclEncroached:   false,
    pswmRequired:     false,
    extensionAllowed: false,
    notes:            [],
  };

  if (!entry || entry.type !== 'FLIGHT') return result;

  const { report, release, releaseNextDay, numLegs = 1, dutyTime } = entry;

  // Duty flags
  result.nightDuty      = isNightDuty(report, release, releaseNextDay);
  result.earlyStart     = isEarlyStart(report);
  result.lateFinish     = isLateFinish(release, releaseNextDay);
  result.woclEncroached = isWoclEncroached(report, release, releaseNextDay);
  result.pswmRequired   = result.nightDuty || result.earlyStart || result.lateFinish;

  // FDP used — prefer duration calculation over dutyTime
  // dutyTime from Merlot can be TAFB on layover flights (e.g. 40:25 for BKK-NRT)
  // Only use dutyTime if it's plausible (≤ 20h) and release is not available
  const durationFromTimes = durationMin(report, release, releaseNextDay);
  if (durationFromTimes != null) {
    result.fdpUsedMin = durationFromTimes;
  } else if (dutyTime) {
    const [h, m] = dutyTime.split(':').map(Number);
    const dutyMins = h * 60 + (m || 0);
    // Cap at 20h — anything higher is likely TAFB not FDP
    result.fdpUsedMin = dutyMins <= 1200 ? dutyMins : null;
  }

  // FDP limit
  result.fdpLimitMin    = getFdpLimit(report, numLegs);
  result.fdpLimitExtMin = getFdpExtensionLimit(report, numLegs);
  result.extensionAllowed = result.fdpLimitExtMin !== null;

  if (result.fdpLimitMin && result.fdpUsedMin !== null) {
    result.fdpPct = result.fdpUsedMin / result.fdpLimitMin;
    if (result.fdpUsedMin > result.fdpLimitMin) {
      result.fdpStatus = 'violation';
      result.notes.push('FDP exceeds basic limit (OMA Table 7.1.2)');
    } else if (result.fdpPct >= 0.90) {
      result.fdpStatus = 'warning';
      result.notes.push('FDP ≥90% of table limit (OMA Table 7.1.2)');
    }
  }

  // Night duty sector limit (7.1.12): max 4 sectors
  if (result.nightDuty && numLegs > 4) {
    result.fdpStatus = 'violation';
    result.notes.push('Night duty: max 4 sectors exceeded (OMA §7.1.12)');
  }

  // Rest before
  if (prevEntry && prevEntry.release) {
    const isHome = !prevEntry.layover; // simplified; caller can override
    result.restBeforeMin   = durationMin(prevEntry.release, report, result.reportNextDay);
    result.restRequiredMin = getMinRest(
      prevEntry.fdpUsedMin || 0,
      isHome,
    );
    if (result.restBeforeMin !== null && result.restBeforeMin < result.restRequiredMin) {
      result.restStatus = 'violation';
    }
  }

  return result;
}
