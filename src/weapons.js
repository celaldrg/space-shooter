/**
 * Player weapons.
 * The ship starts with the blaster. A weapon pickup switches to that weapon and raises the
 * level by one (max 3; the first pickup after the blaster gives level 1). Losing a life drops
 * one level, and level 1 falls back to the blaster.
 * The beam is a continuous ray (an AABB column) that hurts the first target above the ship.
 */

import { DEG } from './math.js';
import { spawnPlayerBullet } from './projectiles.js';
import { emit } from './events.js';

/** Highest weapon level. */
export const MAX_WEAPON_LEVEL = 3;

/** Distance from the ship centre to the muzzle. */
export const MUZZLE_OFFSET = 14;

/**
 * Weapon table. Bullet weapons fire one volley per `cooldown` steps; each volley lists
 * shots as a sideways muzzle offset and an angle from straight up. Speeds are units/second.
 */
export const WEAPONS = Object.freeze({
  blaster: Object.freeze({ cooldown: 9, speed: 720, damage: 1, radius: 3, volleys: [[shot(0, 0)]] }),
  spread: Object.freeze({ cooldown: 14, speed: 640, damage: 1, radius: 3, volleys: [fan(3, 12), fan(5, 11), fan(7, 10)] }),
  rapid: Object.freeze({
    cooldown: 5,
    speed: 900,
    damage: 0.6,
    radius: 2.5,
    volleys: [[shot(0, 0)], [shot(-5, 0), shot(5, 0)], [shot(-9, -2), shot(0, 0), shot(9, 2)]],
  }),
  beam: Object.freeze({ widths: [8, 12, 16], dps: [10, 15, 21] }),
});

/** Fastest bullet any weapon fires, in units per second (the tunnelling worst case). */
export const MAX_BULLET_SPEED = Math.max(...Object.values(WEAPONS).map((weapon) => weapon.speed ?? 0));

/**
 * The starting weapon.
 * @returns {{type: string, level: number, cooldown: number}}
 */
export function createWeapon() {
  return { type: 'blaster', level: 1, cooldown: 0 };
}

/**
 * The beam ray as last aimed (the UI draws it from `bottom` up to `top`).
 * @returns {{on: boolean, x: number, top: number, bottom: number, width: number, dps: number}}
 */
export function createBeam() {
  return { on: false, x: 0, top: 0, bottom: 0, width: 0, dps: 0 };
}

/**
 * Applies a weapon pickup.
 * @param {{type: string, level: number}} weapon
 * @param {string} kind 'spread' | 'rapid' | 'beam'
 */
export function upgradeWeapon(weapon, kind) {
  weapon.level = weapon.type === 'blaster' ? 1 : Math.min(MAX_WEAPON_LEVEL, weapon.level + 1);
  weapon.type = kind;
}

/**
 * Applies the penalty for losing a life.
 * @param {{type: string, level: number}} weapon
 */
export function downgradeWeapon(weapon) {
  if (weapon.level > 1) weapon.level -= 1;
  else weapon.type = 'blaster';
}

/**
 * Runs the weapon for one step: counts the cooldown down, fires a volley or aims the beam.
 * @param {object} state game state
 * @param {boolean} firing trigger held (or auto-fire)
 */
export function updateWeapon(state, firing) {
  const { player, beam } = state;
  const weapon = player.weapon;
  beam.on = false;
  if (weapon.cooldown > 0) weapon.cooldown -= 1;
  if (!firing || !player.alive) return;
  if (weapon.type === 'beam') aimBeam(player, beam);
  else if (weapon.cooldown === 0) fireVolley(state, player);
}

function aimBeam(player, beam) {
  const index = player.weapon.level - 1;
  beam.on = true;
  beam.x = player.x;
  beam.top = 0;
  beam.bottom = player.y - MUZZLE_OFFSET;
  beam.width = WEAPONS.beam.widths[index];
  beam.dps = WEAPONS.beam.dps[index];
}

function fireVolley(state, player) {
  const weapon = player.weapon;
  const spec = WEAPONS[weapon.type];
  const volley = spec.volleys[Math.min(weapon.level, spec.volleys.length) - 1];
  for (const { dx, angle } of volley) {
    spawnPlayerBullet(state, {
      kind: weapon.type,
      x: player.x + dx,
      y: player.y - MUZZLE_OFFSET,
      vx: Math.sin(angle) * spec.speed,
      vy: -Math.cos(angle) * spec.speed,
      r: spec.radius,
      damage: spec.damage,
    });
  }
  weapon.cooldown = spec.cooldown;
  emit(state, 'shoot', { weapon: weapon.type });
}

function shot(dx, degrees) {
  return Object.freeze({ dx, angle: degrees * DEG });
}

function fan(count, stepDegrees) {
  return Array.from({ length: count }, (_, i) => shot(0, (i - (count - 1) / 2) * stepDegrees));
}
