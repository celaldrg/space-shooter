/**
 * Parallax starfield: three layers of stars that drift down at different speeds and slide
 * sideways against the ship. Purely cosmetic, with its own seeded RNG, so it never touches
 * the game state and the simulation stays deterministic.
 */

import { HEIGHT, WIDTH } from './constants.js';
import { TAU } from './math.js';
import { createRng, randomRange } from './rng.js';

/** Layers from far to near: star count, drift speed (units/s), sideways parallax, size and brightness ranges. */
export const STAR_LAYERS = Object.freeze([
  Object.freeze({ count: 70, speed: 9, parallax: 0.03, size: [0.5, 1], alpha: [0.25, 0.55] }),
  Object.freeze({ count: 40, speed: 24, parallax: 0.07, size: [0.8, 1.4], alpha: [0.45, 0.8] }),
  Object.freeze({ count: 16, speed: 62, parallax: 0.14, size: [1.2, 2], alpha: [0.75, 1] }),
]);

/** Stars are spread this far past the side edges so the parallax slide never shows an empty strip. */
export const SIDE_MARGIN = 30;

/**
 * Scatters the stars.
 * @param {number} seed
 * @returns {{layer: number, x: number, y: number, size: number, alpha: number, twinkle: number}[]}
 */
export function createStarfield(seed) {
  const rng = createRng(seed);
  const stars = [];
  STAR_LAYERS.forEach((layer, index) => {
    for (let i = 0; i < layer.count; i += 1) {
      stars.push({
        layer: index,
        x: randomRange(rng, -SIDE_MARGIN, WIDTH + SIDE_MARGIN),
        y: randomRange(rng, 0, HEIGHT),
        size: randomRange(rng, layer.size[0], layer.size[1]),
        alpha: randomRange(rng, layer.alpha[0], layer.alpha[1]),
        twinkle: randomRange(rng, 0, TAU),
      });
    }
  });
  return stars;
}

/**
 * Where a star is at a moment: it drifts down, wrapping from the bottom back to the top, and
 * slides against the ship's sideways offset (nearer layers slide further).
 * @param {{layer: number, x: number, y: number}} star
 * @param {number} time seconds since the field started
 * @param {number} shift ship offset from the field centre, in world units
 * @returns {{x: number, y: number}}
 */
export function starPosition(star, time, shift) {
  const layer = STAR_LAYERS[star.layer];
  const y = (star.y + layer.speed * Math.max(0, time)) % HEIGHT;
  return { x: star.x - shift * layer.parallax, y };
}
