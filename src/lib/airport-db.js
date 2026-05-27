const STORAGE_KEY = 'flight-deck:learned-airports';

const SEED_DOM = new Set([
  'BKK','DMK','CNX','HKT','CEI','UTH','KBV','HDY','NST','URT',
  'UBP','HGN','KKC','PHS','TDX','NAW','SNO','MAQ','THS','PRH',
  'PYY','BAO','CJM','TST',
]);

const SEED_INTER = new Set([
  'ICN','NRT','KIX','NGO','HND','OKA','FUK','CTS','TPE','HKG',
  'MFM','PVG','PEK','CAN','SIN','KUL','CGK','HAN','SGN','DAD',
  'CXR','PQC','VCA','VII','HPH','UIH','BMV','DLI','REP','PNH',
  'VTE','LPQ','RGN','CMB','DEL','BOM','DXB','DOH','MCT','KWI',
  'BAH','PKX','NKG','AMD',
]);

function loadLearned() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

// Returns 'DOM' | 'INTER' | 'UNKNOWN'
export function getAirportType(iata) {
  if (!iata) return 'UNKNOWN';
  const code = iata.toUpperCase();
  const learned = loadLearned();
  if (learned[code]) return learned[code];
  if (SEED_DOM.has(code))   return 'DOM';
  if (SEED_INTER.has(code)) return 'INTER';
  return 'UNKNOWN';
}

export function learnAirport(iata, type) {
  const learned = loadLearned();
  learned[iata.toUpperCase()] = type;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(learned));
}

// Given an array of route strings (e.g. ["BKK-ICN", "BKK-SGN-BKK"]),
// return the unique IATA codes that are not in the DB.
export function getUnknownAirports(routes) {
  const unknown = new Set();
  for (const route of routes) {
    if (!route) continue;
    for (const iata of route.split('-')) {
      const code = iata.trim().toUpperCase();
      if (code.length === 3 && getAirportType(code) === 'UNKNOWN') {
        unknown.add(code);
      }
    }
  }
  return [...unknown];
}
