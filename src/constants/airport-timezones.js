// Airport UTC offsets (hours) for TVJ route network
// Used for FDP calculation — release time converted to departure station local time
export const AIRPORT_UTC_OFFSET = {
  // Thailand (GMT+7)
  'BKK': 7, 'DMK': 7, 'HKT': 7, 'CNX': 7, 'HDY': 7, 'NST': 7,
  'URT': 7, 'KBV': 7, 'CEI': 7, 'UTH': 7, 'UBP': 7, 'HGN': 7,
  'KKC': 7, 'PHS': 7, 'TDX': 7, 'NAW': 7, 'SNO': 7, 'MAQ': 7,
  'THS': 7, 'PRH': 7, 'PYY': 7, 'BAO': 7, 'CJM': 7, 'TST': 7,

  // Vietnam (GMT+7)
  'SGN': 7, 'HAN': 7, 'DAD': 7, 'CXR': 7, 'PQC': 7, 'VCA': 7,
  'VII': 7, 'HPH': 7, 'UIH': 7, 'BMV': 7, 'DLI': 7,

  // Cambodia, Laos, Myanmar
  'REP': 7, 'PNH': 7, 'KTI': 7, 'VTE': 7, 'LPQ': 7, 'RGN': 6.5,

  // China (GMT+8)
  'PEK': 8, 'PKX': 8, 'PVG': 8, 'CAN': 8, 'NKG': 8, 'HGH': 8,
  'HFE': 8, 'KHN': 8, 'CSX': 8, 'XUZ': 8, 'WUX': 8, 'TFU': 8, 'XNN': 8,

  // Taiwan (GMT+8)
  'TPE': 8, 'KHH': 8,

  // Hong Kong, Macau (GMT+8)
  'HKG': 8, 'MFM': 8,

  // Japan (GMT+9)
  'NRT': 9, 'HND': 9, 'KIX': 9, 'NGO': 9, 'FUK': 9, 'CTS': 9, 'OKA': 9,

  // Korea (GMT+9)
  'ICN': 9, 'GMP': 9,

  // Singapore, Malaysia, Indonesia (GMT+8/7)
  'SIN': 8, 'KUL': 8, 'CGK': 7,

  // India, Sri Lanka (GMT+5.5)
  'DEL': 5.5, 'BOM': 5.5, 'AMD': 5.5, 'CMB': 5.5, 'CCU': 5.5,

  // Middle East (GMT+3/4)
  'DXB': 4, 'DOH': 3, 'MCT': 4, 'KWI': 3, 'BAH': 3,
};

// Get UTC offset for an airport (default to 7 = BKK if unknown)
export function getUtcOffset(iata) {
  return AIRPORT_UTC_OFFSET[(iata || '').toUpperCase()] ?? 7;
}

// Calculate FDP in minutes using departure-station local time
// reportTime: HH:MM local at depAirport
// releaseTime: HH:MM local at arrAirport
// releaseNextDay: whether release is next calendar day
// depAirport: IATA of departure (report station)
// arrAirport: IATA of arrival (release station)
export function calcFdpMins(reportTime, releaseTime, releaseNextDay, depAirport, arrAirport) {
  if (!reportTime || !releaseTime) return null;
  try {
    const depOffset = getUtcOffset(depAirport || 'BKK');
    const arrOffset = getUtcOffset(arrAirport || depAirport || 'BKK');

    // Convert report to UTC minutes
    const [rh, rm] = reportTime.split(':').map(Number);
    const reportUtc = (rh * 60 + rm) - depOffset * 60;

    // Convert release to UTC minutes
    const [eh, em] = releaseTime.split(':').map(Number);
    let releaseUtc = (eh * 60 + em) - arrOffset * 60;
    if (releaseNextDay) releaseUtc += 1440;

    // Calculate difference — handle day boundary
    let diff = releaseUtc - reportUtc;
    if (diff < 0) diff += 1440;
    return diff > 0 ? diff : null;
  } catch { return null; }
}
