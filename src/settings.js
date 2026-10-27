/**
 * Player preferences (language, sound, auto-fire), kept through the guarded storage helper.
 */

import { readString, writeString } from './storage.js';
import { normalizeLanguage } from './i18n.js';

/** Storage keys of the preferences. */
export const SETTING_KEYS = Object.freeze({
  language: 'space-shooter:language',
  muted: 'space-shooter:muted',
  autoFire: 'space-shooter:auto-fire',
});

/**
 * Loads the preferences. Missing or unreadable values give the defaults: English, sound on, auto-fire off.
 * @param {{getItem(key: string): string|null}|null} [store] storage to use instead of localStorage
 * @returns {{language: 'en'|'tr', muted: boolean, autoFire: boolean}}
 */
export function loadSettings(store = undefined) {
  return {
    language: normalizeLanguage(readString(SETTING_KEYS.language, null, store)),
    muted: readString(SETTING_KEYS.muted, null, store) === '1',
    autoFire: readString(SETTING_KEYS.autoFire, null, store) === '1',
  };
}

/**
 * Stores one preference.
 * @param {'language'|'muted'|'autoFire'} name
 * @param {string|boolean} value
 * @param {{setItem(key: string, value: string): void}|null} [store]
 * @returns {boolean} true when the value was stored
 */
export function saveSetting(name, value, store = undefined) {
  if (!Object.hasOwn(SETTING_KEYS, name)) return false;
  const text = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
  return writeString(SETTING_KEYS[name], text, store);
}
