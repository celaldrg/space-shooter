/**
 * Seeded pseudo random numbers (mulberry32).
 * The generator is a plain object ({s}) so it lives inside the serialisable game state:
 * the same seed and the same inputs always replay the same game.
 */

/**
 * Creates a generator.
 * @param {number} seed any number; its low 32 bits are used
 * @returns {{s: number}}
 */
export function createRng(seed) {
  return { s: Number.isFinite(seed) ? seed >>> 0 : 0 };
}

/**
 * Next float in [0, 1).
 * @param {{s: number}} rng
 * @returns {number}
 */
export function random(rng) {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Float in [min, max).
 * @param {{s: number}} rng
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randomRange(rng, min, max) {
  return min + (max - min) * random(rng);
}

/**
 * Integer in [min, max] (both inclusive).
 * @param {{s: number}} rng
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randomInt(rng, min, max) {
  return min + Math.floor(random(rng) * (max - min + 1));
}

/**
 * True with the given probability.
 * @param {{s: number}} rng
 * @param {number} probability 0..1
 * @returns {boolean}
 */
export function chance(rng, probability) {
  return random(rng) < probability;
}

/**
 * Uniformly picks one element of a non-empty array.
 * @template T
 * @param {{s: number}} rng
 * @param {readonly T[]} items
 * @returns {T}
 */
export function pick(rng, items) {
  return items[Math.floor(random(rng) * items.length)];
}
