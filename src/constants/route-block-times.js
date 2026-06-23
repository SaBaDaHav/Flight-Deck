// Single-leg block times in minutes.
// Source: TVJ HR allowance sheets (Jan/Mar/Apr/May 2026) + Winter reference table.
export const ROUTE_BLOCK_MINUTES = {
  'BKK-BOM': 255, 'BKK-CAN': 185, 'BKK-CEI': 85,
  'BKK-CNX': 85,  'BKK-CSX': 200, 'BKK-CXR': 110,
  'BKK-DAD': 105, 'BKK-FUK': 325, 'BKK-HDY': 90,
  'BKK-HFE': 235, 'BKK-HGH': 260, 'BKK-HKT': 95,
  'BKK-ICN': 335, 'BKK-KBV': 85,  'BKK-KHN': 215,
  'BKK-KIX': 330, 'BKK-KKC': 65,  'BKK-KTI': 75,
  'BKK-MFM': 165, 'BKK-NRT': 380, 'BKK-NST': 70,  'BKK-PKX': 290,
  'BKK-PNH': 75,  'BKK-PQC': 80,  'BKK-PVG': 275,
  'BKK-SGN': 100, 'BKK-TFU': 185, 'BKK-TPE': 220,
  'BKK-UBP': 75,  'BKK-URT': 75,  'BKK-UTH': 75,
  'BKK-WUX': 255, 'BKK-XUZ': 260, 'BOM-BKK': 265,
  'CAN-BKK': 180, 'CEI-BKK': 85,  'CEI-HKT': 130,
  'CNX-BKK': 80,  'CNX-HKT': 125, 'CNX-KIX': 320,
  'CSX-BKK': 200, 'CTS-TPE': 265, 'CXR-BKK': 120,
  'DAD-BKK': 105, 'FUK-BKK': 335, 'HDY-BKK': 90,
  'HFE-BKK': 245, 'HGH-BKK': 255, 'HKT-BKK': 90,
  'HKT-CEI': 130, 'HKT-CNX': 125, 'ICN-BKK': 350,
  'KBV-BKK': 85,  'KHN-BKK': 225, 'KIX-BKK': 360,
  'KIX-CNX': 350, 'KIX-TPE': 180, 'KKC-BKK': 65,
  'KTI-BKK': 80,  'MFM-BKK': 170, 'NRT-BKK': 410,
  'NST-BKK': 80,  'OKA-TPE': 95,  'PKX-BKK': 285, 'PNH-BKK': 75,
  'PQC-BKK': 80,  'PVG-BKK': 270, 'SGN-BKK': 100,
  'TFU-BKK': 185, 'TPE-BKK': 240, 'TPE-CTS': 225,
  'TPE-KIX': 160, 'TPE-OKA': 85,  'UBP-BKK': 70,
  'URT-BKK': 75,  'UTH-BKK': 70,  'WUX-BKK': 280,
  'XUZ-BKK': 275,
};

// Routes confirmed to differ between IATA Winter and Summer schedules.
// Values override ROUTE_BLOCK_MINUTES for that leg during the matching season.
// TVJ season boundary: Summer 28-Mar to 27-Oct, Winter 28-Oct to 27-Mar.
export const ROUTE_BLOCK_MINUTES_BY_SEASON = {
  'BKK-NRT': { winter: 355, summer: 380 },
  'NRT-BKK': { winter: 455, summer: 410 },
  'KIX-BKK': { winter: 395, summer: 360 },
};

// Multi-stop pairings where HR reports ONE total block time for the whole day.
// Use the exact key rather than summing individual legs — HR's number is pay-authoritative.
// Source: HR monthly allowance sheets for Jan/Mar/Apr/May 2026.
export const MULTI_LEG_EXACT_MINUTES = {
  'BKK-CEI-BKK-DAD-BKK':    375,
  'BKK-CEI-BKK-HKT-BKK':    355,
  'BKK-CNX-BKK-CEI-BKK':    335,
  'BKK-CNX-BKK-HDY-BKK':    345,
  'BKK-CNX-KIX':            405,
  'BKK-CXR-BKK':            230,
  'BKK-CXR-BKK-KBV-BKK':    400,
  'BKK-DAD-BKK-UTH-BKK':    345,
  'BKK-HDY-BKK':            180,
  'BKK-HKT-BKK':            185,
  'BKK-HKT-BKK-CNX-BKK':    350,
  'BKK-KBV-BKK':            170,
  'BKK-KBV-BKK-HDY-BKK':    350,
  'BKK-KBV-BKK-KBV-BKK':    340,
  'BKK-MFM-BKK':            335,
  'BKK-PQC-BKK':            160,
  'BKK-PQC-BKK-KBV-BKK':    330,
  'BKK-TPE-CTS':            440,
  'BKK-TPE-KIX':            390,
  'BKK-URT-BKK':            150,
  'BKK-URT-BKK-CNX-BKK':    315,
  'BKK-UTH-BKK-HKT-BKK':    330,
  'CNX-BKK-CEI-BKK':        250,
  'CNX-BKK-CNX-BKK':        245,
  'CNX-BKK-UTH-BKK':        220,
  'CTS-TPE-BKK':            540,
  'KIX-TPE-BKK':            405,
};

// Multi-stop pairings confirmed to differ by season.
export const MULTI_LEG_EXACT_MINUTES_BY_SEASON = {
  'BKK-DAD-BKK-CNX': { winter: 290, summer: 295 },
};

export function getSeason(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const summerStart = new Date(`${year}-03-28`);
  const summerEnd   = new Date(`${year}-10-28`);
  return (d >= summerStart && d < summerEnd) ? 'summer' : 'winter';
}

function lookupExactRoute(route, dateStr) {
  const season = getSeason(dateStr);
  const seasonal = MULTI_LEG_EXACT_MINUTES_BY_SEASON[route];
  if (seasonal && season) return seasonal[season];
  if (MULTI_LEG_EXACT_MINUTES[route] != null) return MULTI_LEG_EXACT_MINUTES[route];
  return null;
}

export function getRouteBlockMins(origin, dest, dateStr = null) {
  const key = `${origin}-${dest}`;
  const season = getSeason(dateStr);
  const seasonal = ROUTE_BLOCK_MINUTES_BY_SEASON[key];
  if (seasonal && season) return seasonal[season];
  return ROUTE_BLOCK_MINUTES[key] || null;
}

export function calcTotalBlockMins(route, dateStr = null) {
  const exact = lookupExactRoute(route, dateStr);
  if (exact != null) return exact;

  const airports = route.split('-').filter(a => a.length === 3);
  if (airports.length < 2) return null;
  let total = 0;
  let allFound = true;
  for (let i = 0; i < airports.length - 1; i++) {
    const mins = getRouteBlockMins(airports[i], airports[i+1], dateStr);
    if (!mins) { allFound = false; break; }
    total += mins;
  }
  return allFound ? total : null;
}

export function calcTotalBlockMinsWithLearned(route, learnedRoutes = {}, dateStr = null) {
  const exact = lookupExactRoute(route, dateStr);
  if (exact != null) return exact;

  const airports = route.split('-').filter(a => a.length === 3);
  if (airports.length < 2) return null;
  let total = 0;
  const season = getSeason(dateStr);
  for (let i = 0; i < airports.length - 1; i++) {
    const k = `${airports[i]}-${airports[i+1]}`;
    const seasonal = ROUTE_BLOCK_MINUTES_BY_SEASON[k];
    let mins = (seasonal && season) ? seasonal[season] : null;
    if (mins == null) mins = ROUTE_BLOCK_MINUTES[k] || Number(learnedRoutes[k]) || 0;
    if (!mins) return null;
    total += mins;
  }
  return total;
}

export function findMissingLegs(route, learnedRoutes = {}) {
  if (MULTI_LEG_EXACT_MINUTES[route] != null) return [];
  if (MULTI_LEG_EXACT_MINUTES_BY_SEASON[route]) return [];

  const airports = route.split('-').filter(a => a.length === 3);
  if (airports.length < 2) return [];
  const missing = [];
  for (let i = 0; i < airports.length - 1; i++) {
    const k = `${airports[i]}-${airports[i+1]}`;
    if (!ROUTE_BLOCK_MINUTES[k] && !ROUTE_BLOCK_MINUTES_BY_SEASON[k] && !learnedRoutes[k]) missing.push(k);
  }
  return missing;
}
