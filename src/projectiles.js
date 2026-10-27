/**
 * Player and enemy bullets. Both kinds keep their previous position (px, py) so collisions
 * can sweep the whole path travelled during a step.
 */

import { HEIGHT, STEP, WIDTH } from './constants.js';
import { acquire, forEachActive, release } from './pool.js';
import { spawnSparks } from './effects.js';

/** Radius of every enemy bullet. */
export const ENEMY_BULLET_RADIUS = 4;

const CULL_MARGIN = 16;

/**
 * Creates an inactive bullet (pool factory).
 * @returns {object}
 */
export function createBullet() {
  return { active: false, slot: 0, kind: 'pellet', x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, r: 0, damage: 0 };
}

/**
 * Fires a player bullet.
 * @param {object} state game state
 * @param {{kind: string, x: number, y: number, vx: number, vy: number, r: number, damage: number}} spec
 * @returns {object|null} the bullet, or null when the pool is full
 */
export function spawnPlayerBullet(state, spec) {
  const bullet = acquire(state.bullets);
  if (!bullet) return null;
  Object.assign(bullet, spec, { px: spec.x, py: spec.y });
  return bullet;
}

/**
 * Fires an enemy bullet.
 * @param {object} state game state
 * @param {number} x
 * @param {number} y
 * @param {number} angle direction in radians (PI / 2 = straight down)
 * @param {number} speed units per second
 * @param {string} [kind='pellet'] look of the bullet: 'pellet', 'needle' or 'orb'
 * @returns {object|null} the bullet, or null when the pool is full
 */
export function spawnEnemyBullet(state, x, y, angle, speed, kind = 'pellet') {
  const bullet = acquire(state.enemyBullets);
  if (!bullet) return null;
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;
  Object.assign(bullet, { kind, x, y, px: x, py: y, vx, vy, r: ENEMY_BULLET_RADIUS, damage: 0 });
  return bullet;
}

/**
 * Moves every bullet of a pool by one step, remembering where it came from.
 * @param {object} pool
 */
export function moveBullets(pool) {
  forEachActive(pool, (bullet) => {
    bullet.px = bullet.x;
    bullet.py = bullet.y;
    bullet.x += bullet.vx * STEP;
    bullet.y += bullet.vy * STEP;
  });
}

/**
 * Releases bullets that left the playfield. Runs after collisions, so a bullet that hits
 * something at the very edge still counts.
 * @param {object} pool
 */
export function cullBullets(pool) {
  forEachActive(pool, (bullet) => {
    const outside = bullet.x < -CULL_MARGIN || bullet.x > WIDTH + CULL_MARGIN
      || bullet.y < -CULL_MARGIN || bullet.y > HEIGHT + CULL_MARGIN;
    if (outside) release(pool, bullet);
  });
}

/**
 * Turns every enemy bullet into a spark (boss phase changes and the boss's death).
 * @param {object} state
 */
export function clearEnemyBullets(state) {
  forEachActive(state.enemyBullets, (bullet) => {
    spawnSparks(state, bullet.x, bullet.y, 1, 'cyan');
    release(state.enemyBullets, bullet);
  });
}
