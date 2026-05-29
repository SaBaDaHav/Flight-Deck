// Export/Import all Flight Deck localStorage data as a single JSON file

const STORAGE_KEYS_PREFIX = 'flight-deck:';

// Collect all flight-deck keys from localStorage
function getAllKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_KEYS_PREFIX)) keys.push(key);
  }
  return keys;
}

// Export all data to a downloadable JSON file
export function exportBackup() {
  const data = {};
  const keys = getAllKeys();
  for (const key of keys) {
    try {
      data[key] = JSON.parse(localStorage.getItem(key));
    } catch {
      data[key] = localStorage.getItem(key);
    }
  }

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    keyCount: keys.length,
    data,
  };

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `flight-deck-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);

  return keys.length;
}

// Import data from a backup JSON file — restores all keys to localStorage
export function importBackup(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(reader.result);
        if (!backup.data || backup.version !== 1) {
          reject(new Error('Invalid backup file format.'));
          return;
        }
        let count = 0;
        for (const [key, value] of Object.entries(backup.data)) {
          if (!key.startsWith(STORAGE_KEYS_PREFIX)) continue;
          localStorage.setItem(key, JSON.stringify(value));
          count++;
        }
        resolve({
          count,
          exportedAt: backup.exportedAt,
          keyCount: backup.keyCount,
        });
      } catch (err) {
        reject(new Error('Failed to parse backup file: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

// Get backup stats — how many keys and estimated size
export function getBackupStats() {
  const keys = getAllKeys();
  let totalBytes = 0;
  for (const key of keys) {
    const val = localStorage.getItem(key) || '';
    totalBytes += key.length + val.length;
  }
  const kb = (totalBytes / 1024).toFixed(1);
  return { keyCount: keys.length, kb };
}
