// LocalStorage persistence utilities with versioned keys

import { STORAGE_PREFIX } from './defaults';

const key = (name) => `${STORAGE_PREFIX}-${name}`;

export function saveToStorage(name, value) {
  try {
    localStorage.setItem(key(name), JSON.stringify(value));
  } catch (e) {
    console.warn('Failed to save to localStorage:', e);
  }
}

export function loadFromStorage(name, fallback = null) {
  try {
    const raw = localStorage.getItem(key(name));
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to load from localStorage:', e);
    return fallback;
  }
}

export function removeFromStorage(name) {
  try {
    localStorage.removeItem(key(name));
  } catch (e) {
    console.warn('Failed to remove from localStorage:', e);
  }
}

export function clearAllStorage() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    console.warn('Failed to clear localStorage:', e);
  }
}

export function exportAllSettings() {
  const data = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) {
        data[k] = JSON.parse(localStorage.getItem(k));
      }
    }
  } catch (e) {
    console.warn('Failed to export settings:', e);
  }
  return data;
}

export function importSettings(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid settings data: expected an object');
  }
  
  // Validate that keys match our storage prefix
  const validKeys = Object.keys(data).filter((k) => k.startsWith(STORAGE_PREFIX));
  if (validKeys.length === 0) {
    throw new Error('No valid settings found in the imported data');
  }

  // Validate each value is JSON-serializable
  for (const k of validKeys) {
    try {
      JSON.stringify(data[k]);
    } catch {
      throw new Error(`Invalid value for key "${k}"`);
    }
  }

  // Apply
  for (const k of validKeys) {
    localStorage.setItem(k, JSON.stringify(data[k]));
  }

  return validKeys.length;
}
