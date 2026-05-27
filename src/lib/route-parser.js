import { getAirportType } from './airport-db.js';

// Parse "BKK-SGN-BKK" or "BKK-CNX-BKK-CEI-BKK" style route strings.
// A single airport code (no hyphens) means 0 legs (e.g. "OFF", "BKK").

export function parseAirports(route) {
  if (!route || typeof route !== 'string') return [];
  const clean = route.trim().toUpperCase();
  if (!clean || clean === 'OFF' || clean === '--') return [];
  return clean.split('-').filter(Boolean);
}

export function countLegs(route) {
  const airports = parseAirports(route);
  return Math.max(0, airports.length - 1);
}

// Returns true if any airport in the route is international.
// A single inter leg makes the entire day INTER (TVJ policy).
export function isInterRoute(route) {
  const airports = parseAirports(route);
  return airports.some(code => code !== '' && getAirportType(code) !== 'DOM');
}

// Classify a single day's route into DOM | INTER | OFF | SIM | GROUND | UNKNOWN
export function classifyRoute(route) {
  if (!route || route.trim() === '' || route.trim().toUpperCase() === 'OFF') return 'OFF';

  const upper = route.trim().toUpperCase();

  if (upper.includes('INST SIM') || upper.includes('FFS')) return 'SIM';
  if (upper.includes('GROUND TRAINING') || upper.startsWith('INST')) return 'GROUND';

  const airports = parseAirports(route);
  if (airports.length === 0) return 'OFF';
  if (airports.length === 1) return 'OFF'; // single station, no legs flown

  return isInterRoute(route) ? 'INTER' : 'DOM';
}

// Split a route into individual legs: [{from, to}, ...]
export function getLegs(route) {
  const airports = parseAirports(route);
  if (airports.length < 2) return [];
  const legs = [];
  for (let i = 0; i < airports.length - 1; i++) {
    legs.push({ from: airports[i], to: airports[i + 1] });
  }
  return legs;
}

// Derive DOM and INTER minutes given a route and total block minutes.
// If route is INTER the entire block is INTER; if DOM, all DOM.
// Mixed-type splits (same day, different duties) are not handled here —
// the HR sheet already provides separate DOM/INTER columns.
export function splitBlockByType(route, totalBlockMins) {
  const type = classifyRoute(route);
  if (type === 'INTER') return { domMins: 0, interMins: totalBlockMins };
  if (type === 'DOM')   return { domMins: totalBlockMins, interMins: 0 };
  return { domMins: 0, interMins: 0 };
}
