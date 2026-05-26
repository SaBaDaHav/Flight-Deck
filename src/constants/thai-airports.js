// Thai domestic IATA codes — every other code is classified INTER
export const DOM_AIRPORTS = new Set([
  'BKK', 'DMK', 'CNX', 'HKT', 'CEI', 'UTH', 'KBV', 'HDY',
  'NST', 'URT', 'UBP', 'HGN', 'KKC', 'PHS', 'TDX', 'NAW',
  'SNO', 'MAQ', 'THS', 'PRH', 'PYY', 'BAO',
]);

// Known INTER codes for reference / validation (not exhaustive — anything not in DOM is INTER)
export const INTER_AIRPORTS = new Set([
  'ICN', 'NRT', 'KIX', 'TPE', 'CTS', 'FUK', 'OKA', 'HND', 'NGO',
  'PVG', 'PEK', 'CAN', 'HKG', 'MFM', 'SIN', 'KUL', 'CGK',
  'HAN', 'SGN', 'DAD', 'CXR', 'PQC', 'VCA', 'VII', 'HPH', 'UIH', 'BMV', 'DLI',
  'REP', 'PNH', 'VTE', 'LPQ', 'RGN', 'CMB',
  'DEL', 'BOM', 'DXB', 'DOH', 'MCT', 'KWI', 'BAH', 'AMD',
]);

export function isDomestic(iata) {
  return DOM_AIRPORTS.has(iata.toUpperCase());
}

export function isInternational(iata) {
  return !DOM_AIRPORTS.has(iata.toUpperCase());
}
