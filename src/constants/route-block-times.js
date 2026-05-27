export const ROUTE_BLOCK_MINUTES = {
  'BKK-BOM': 255, 'BKK-CAN': 185, 'BKK-CEI': 85,
  'BKK-CNX': 85,  'BKK-CSX': 200, 'BKK-CXR': 110,
  'BKK-DAD': 105, 'BKK-FUK': 305, 'BKK-HDY': 90,
  'BKK-HFE': 235, 'BKK-HGH': 260, 'BKK-HKT': 95,
  'BKK-ICN': 325, 'BKK-KBV': 85,  'BKK-KHN': 215,
  'BKK-KIX': 330, 'BKK-KKC': 65,  'BKK-KTI': 75,
  'BKK-MFM': 165, 'BKK-NRT': 355, 'BKK-PKX': 290,
  'BKK-PNH': 75,  'BKK-PQC': 80,  'BKK-PVG': 275,
  'BKK-SGN': 100, 'BKK-TFU': 185, 'BKK-TPE': 220,
  'BKK-UBP': 75,  'BKK-URT': 75,  'BKK-UTH': 75,
  'BKK-WUX': 255, 'BKK-XUZ': 260, 'BOM-BKK': 265,
  'CAN-BKK': 180, 'CEI-BKK': 85,  'CEI-HKT': 130,
  'CNX-BKK': 80,  'CNX-HKT': 125, 'CNX-KIX': 320,
  'CSX-BKK': 200, 'CTS-TPE': 265, 'CXR-BKK': 120,
  'DAD-BKK': 105, 'FUK-BKK': 360, 'HDY-BKK': 90,
  'HFE-BKK': 245, 'HGH-BKK': 255, 'HKT-BKK': 90,
  'HKT-CEI': 130, 'HKT-CNX': 125, 'ICN-BKK': 370,
  'KBV-BKK': 85,  'KHN-BKK': 225, 'KIX-BKK': 395,
  'KIX-CNX': 350, 'KIX-TPE': 180, 'KKC-BKK': 65,
  'KTI-BKK': 80,  'MFM-BKK': 170, 'NRT-BKK': 455,
  'OKA-TPE': 95,  'PKX-BKK': 285, 'PNH-BKK': 75,
  'PQC-BKK': 80,  'PVG-BKK': 270, 'SGN-BKK': 100,
  'TFU-BKK': 185, 'TPE-BKK': 240, 'TPE-CTS': 225,
  'TPE-KIX': 160, 'TPE-OKA': 85,  'UBP-BKK': 70,
  'URT-BKK': 75,  'UTH-BKK': 70,  'WUX-BKK': 280,
  'XUZ-BKK': 275,
};

export function getRouteBlockMins(origin, dest) {
  const key = `${origin}-${dest}`;
  return ROUTE_BLOCK_MINUTES[key] || null;
}

export function calcTotalBlockMins(route) {
  // route = "BKK-SGN-BKK" or "BKK-ICN"
  // splits into legs and sums block times
  const airports = route.split('-').filter(a => a.length === 3);
  if (airports.length < 2) return null;
  let total = 0;
  let allFound = true;
  for (let i = 0; i < airports.length - 1; i++) {
    const mins = getRouteBlockMins(airports[i], airports[i+1]);
    if (!mins) { allFound = false; break; }
    total += mins;
  }
  return allFound ? total : null;
}

// Like calcTotalBlockMins but also checks user-learned routes from localStorage.
export function calcTotalBlockMinsWithLearned(route, learnedRoutes = {}) {
  const airports = route.split('-').filter(a => a.length === 3);
  if (airports.length < 2) return null;
  let total = 0;
  for (let i = 0; i < airports.length - 1; i++) {
    const k = `${airports[i]}-${airports[i+1]}`;
    const mins = ROUTE_BLOCK_MINUTES[k] || Number(learnedRoutes[k]) || 0;
    if (!mins) return null;
    total += mins;
  }
  return total;
}

// Returns the leg keys (e.g. ['PKX-BKK']) that are missing from both DBs.
export function findMissingLegs(route, learnedRoutes = {}) {
  const airports = route.split('-').filter(a => a.length === 3);
  if (airports.length < 2) return [];
  const missing = [];
  for (let i = 0; i < airports.length - 1; i++) {
    const k = `${airports[i]}-${airports[i+1]}`;
    if (!ROUTE_BLOCK_MINUTES[k] && !learnedRoutes[k]) missing.push(k);
  }
  return missing;
}
