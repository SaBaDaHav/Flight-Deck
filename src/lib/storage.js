// Phase 1 — localStorage storage layer.
// Phase 2 migration: replace only this file with NAS API calls.
// All keys are namespaced under "flight-deck:".

const NS = 'flight-deck';

function key(...parts) {
  return [NS, ...parts].join(':');
}

function load(k) {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save(k, value) {
  try {
    localStorage.setItem(k, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(k) {
  try {
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

// ─── Pay rates ────────────────────────────────────────────────────────────────
export function loadRates() {
  return load(key('rates'));
}

export function saveRates(rates) {
  return save(key('rates'), rates);
}

// ─── Monthly allowance data ───────────────────────────────────────────────────
// year: number, month: 1–12
export function loadAllowance(year, month) {
  return load(key('allowance', `${year}-${String(month).padStart(2, '0')}`));
}

export function saveAllowance(year, month, data) {
  return save(key('allowance', `${year}-${String(month).padStart(2, '0')}`), data);
}

export function deleteAllowance(year, month) {
  return remove(key('allowance', `${year}-${String(month).padStart(2, '0')}`));
}

// ─── Monthly roster (parsed Merlot entries) ───────────────────────────────────
export function loadRoster(year, month) {
  return load(key('roster', `${year}-${String(month).padStart(2, '0')}`));
}

export function saveRoster(year, month, data) {
  const firstFlight = data.entries?.find(e => e.type === 'FLIGHT');
  console.log('[saveRoster] first FLIGHT flightTime:', firstFlight?.flightTime,
    '| scheduledBlock:', firstFlight?.scheduledBlock);
  return save(key('roster', `${year}-${String(month).padStart(2, '0')}`), data);
}

export function deleteRoster(year, month) {
  return remove(key('roster', `${year}-${String(month).padStart(2, '0')}`));
}

// ─── Crew profile ─────────────────────────────────────────────────────────────
export function loadCrewProfile() {
  return load(key('crew-profile'));
}

export function saveCrewProfile(profile) {
  return save(key('crew-profile'), profile);
}

// ─── Export / import (for Phase 1→2 migration) ────────────────────────────────
export function exportAll() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(NS + ':')) {
      try {
        data[k] = JSON.parse(localStorage.getItem(k));
      } catch {
        data[k] = localStorage.getItem(k);
      }
    }
  }
  return data;
}

export function importAll(data) {
  if (!data || typeof data !== 'object') return false;
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith(NS + ':')) {
      save(k, v);
    }
  }
  return true;
}

export function clearAll() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(NS + ':')) keys.push(k);
  }
  keys.forEach(k => localStorage.removeItem(k));
}
