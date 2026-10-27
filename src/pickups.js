/**
 * Power-up pickups. They drift down with a gentle sway until the player collects them
 * or they leave the screen.
 */

import { HEIGHT, STEP, WIDTH } from './constants.js';
import { clamp } from './math.js';
import { acquire, forEachActive, release } from './pool.js';

/** Every pickup kind: three weapons and a shield charge. */
export const PICKUP_KINDS = Object.freeze(['spread', 'rapid', 'beam', 'shield']);

/** Collision radius of a pickup. */
export const PICKUP_RADIUS = 9;

const FALL_SPEED = 55;
const SWAY = 14;
const SWAY_RATE = 0.05;

/**
 * Creates an inactive pickup (pool factory).
 * @returns {object}
 */
export function createPickup() {
  return { active: false, slot: 0, kind: 'shield', x: 0, y: 0, baseX: 0, t: 0, r: PICKUP_RADIUS };
}

/**
 * Drops a pickup at a point.
 * @param {object} state game state
 * @param {string} kind one of PICKUP_KINDS
 * @param {number} x
 * @param {number} y
 * @returns {object|null} the pickup, or null when the pool is full
 */
export function spawnPickup(state, kind, x, y) {
  const pickup = acquire(state.pickups);
  if (!pickup) return null;
  const baseX = clamp(x, SWAY + PICKUP_RADIUS, WIDTH - SWAY - PICKUP_RADIUS);
  Object.assign(pickup, { kind, x, y, baseX, t: 0, r: PICKUP_RADIUS });
  return pickup;
}

/**
 * Moves pickups one step and drops the ones that fell off the screen.
 * @param {object} state
 */
export function updatePickups(state) {
  forEachActive(state.pickups, (pickup) => {
    pickup.t += 1;
    pickup.y += FALL_SPEED * STEP;
    pickup.x = pickup.baseX + Math.sin(pickup.t * SWAY_RATE) * SWAY;
    if (pickup.y - pickup.r > HEIGHT) release(state.pickups, pickup);
  });
}
