/**
 * Guarded localStorage helper: the only place the game touches browser storage.
 * Every access is wrapped in try/catch because storage may be missing or throw
 * (private browsing, blocked cookies, sandboxed frames, full quota); failures fall back quietly.
 * Each function takes an optional `store` (anything with getItem/setItem) used instead of
 * localStorage, which keeps the helper testable outside a browser.
 */

/** Key of the best score. */
export const HIGH_SCORE_KEY = 'space-shooter:high-score';

/**
 * Reads a string.
 * @param {string} key
 * @param {string|null} [fallback=null] returned when the key is missing or storage fails
 * @param {{getItem(key: string): string|null}|null} [store] storage to use instead of localStorage
 * @returns {string|null}
 */
export function readString(key, fallback = null, store = undefined) {
  try {
    const value = resolveStore(store)?.getItem(key);
    return typeof value === 'string' ? value : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Writes a string.
 * @param {string} key
 * @param {string} value
 * @param {{setItem(key: string, value: string): void}|null} [store] storage to use instead of localStorage
 * @returns {boolean} true when the value was stored
 */
export function writeString(key, value, store = undefined) {
  try {
    const target = resolveStore(store);
    if (!target) return false;
    target.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads a finite number.
 * @param {string} key
 * @param {number} [fallback=0] returned when the key is missing, not a number or storage fails
 * @param {{getItem(key: string): string|null}|null} [store]
 * @returns {number}
 */
export function readNumber(key, fallback = 0, store = undefined) {
  const raw = readString(key, null, store);
  const value = raw === null || raw.trim() === '' ? NaN : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Writes a finite number.
 * @param {string} key
 * @param {number} value
 * @param {{setItem(key: string, value: string): void}|null} [store]
 * @returns {boolean} true when the value was stored
 */
export function writeNumber(key, value, store = undefined) {
  return Number.isFinite(value) && writeString(key, String(value), store);
}

/**
 * Loads the best score (0 when none is stored).
 * @param {{getItem(key: string): string|null}|null} [store]
 * @returns {number}
 */
export function loadHighScore(store = undefined) {
  return Math.max(0, Math.floor(readNumber(HIGH_SCORE_KEY, 0, store)));
}

/**
 * Stores a score if it beats the stored best.
 * @param {number} score
 * @param {{getItem(key: string): string|null, setItem(key: string, value: string): void}|null} [store]
 * @returns {number} the best score after the update
 */
export function saveHighScore(score, store = undefined) {
  const previous = loadHighScore(store);
  const candidate = Number.isFinite(score) ? Math.floor(score) : 0;
  if (candidate <= previous) return previous;
  writeNumber(HIGH_SCORE_KEY, candidate, store);
  return candidate;
}

function resolveStore(store) {
  return store === undefined ? globalThis.localStorage : store;
}
