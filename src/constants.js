/**
 * World constants shared by the logic modules.
 * The playfield is a fixed 360 x 640 (9:16) logical area with y pointing down;
 * the UI scales it to the screen.
 */

/** Logical playfield width. */
export const WIDTH = 360;

/** Logical playfield height. */
export const HEIGHT = 640;

/** Simulation steps per second. */
export const TICK_RATE = 60;

/** Length of one fixed simulation step in seconds. */
export const STEP = 1 / TICK_RATE;

/** advance() runs at most this many steps per call, so a stalled tab cannot cause a spiral of death. */
export const MAX_CATCH_UP_STEPS = 5;

/** Fixed capacities of the object pools; nothing is allocated for entities while the game runs. */
export const POOL_SIZES = Object.freeze({
  bullets: 160,
  enemyBullets: 320,
  enemies: 96,
  pickups: 16,
  particles: 700,
});

/**
 * Converts seconds to a whole number of simulation steps.
 * @param {number} seconds
 * @returns {number}
 */
export function secondsToSteps(seconds) {
  return Math.round(seconds * TICK_RATE);
}
