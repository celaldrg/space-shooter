/**
 * Collision resolution and its consequences: damage, kills, drops, splits, pickups and
 * player hits. Runs once per step after everything has moved.
 *
 * Player bullets are swept against enemies (circle/circle) and the boss hull (circle/AABB)
 * over the whole path of the step, and each bullet hits the earliest target on that path,
 * so no bullet tunnels through a target at any speed.
 */

import { STEP } from './constants.js';
import { boxesOverlap, circleBoxOverlap, circlesOverlap, sweepCircleBox, sweepCircles } from './collision.js';
import { forEachActive, release } from './pool.js';
import { chance, pick } from './rng.js';
import { addBonus, addKill, breakCombo, multiplierFor } from './score.js';
import { addShake, spawnExplosion, spawnSparks } from './effects.js';
import { ENEMY_TYPES, spawnEnemy } from './enemies.js';
import { damageBoss } from './boss.js';
import { PICKUP_KINDS, spawnPickup } from './pickups.js';
import { PLAYER } from './player.js';
import { downgradeWeapon, upgradeWeapon } from './weapons.js';
import { scheduleEnding } from './ending.js';
import { emit } from './events.js';

/** Damage an enemy takes when it rams the ship. */
export const CONTACT_DAMAGE = 4;

/** Chance that a kill without a scripted drop releases a random pickup. */
export const RANDOM_DROP_CHANCE = 0.04;

/** Flat points for collecting a pickup. */
export const PICKUP_BONUS = 250;

const SHARD_SPEED = 70;
const SHARD_EXTRA_FALL = 15;
const BEAM_SPARK_EVERY = 4;

/**
 * Resolves every collision of the step.
 * @param {object} state game state
 */
export function resolveCollisions(state) {
  resolvePlayerBullets(state);
  resolveBeam(state);
  resolveEnemyBullets(state);
  resolveRamming(state);
  collectPickups(state);
}

/**
 * Applies damage to an enemy and destroys it at 0 hp.
 * @param {object} state
 * @param {object} enemy
 * @param {number} amount
 * @returns {boolean} true when the enemy was destroyed
 */
export function damageEnemy(state, enemy, amount) {
  enemy.hp -= amount;
  enemy.flash = 4;
  if (enemy.hp > 0) return false;
  killEnemy(state, enemy);
  return true;
}

/**
 * Destroys an enemy: explosion, score with combo, drop, and the split of a splitter.
 * @param {object} state
 * @param {object} enemy
 */
export function killEnemy(state, enemy) {
  const { x, y, r, vy, type, drop } = enemy;
  release(state.enemies, enemy);
  spawnExplosion(state, x, y, r / 12, 'ember');
  const points = addKill(state.score, ENEMY_TYPES[type].score);
  state.stats.kills += 1;
  emit(state, 'kill', { enemy: type, x, y, points, multiplier: multiplierFor(state.score.combo) });
  const reward = drop ?? randomDrop(state);
  if (reward) spawnPickup(state, reward, x, y);
  if (type === 'splitter') split(state, x, y, vy);
}

/**
 * Hits the ship: a shield charge absorbs the hit, otherwise a life is lost.
 * Ignored while the ship is invulnerable or destroyed.
 * @param {object} state
 * @returns {boolean} true when the hit landed
 */
export function hitPlayer(state) {
  const { player } = state;
  if (!isVulnerable(player)) return false;
  if (player.shield > 0) absorbHit(state, player);
  else loseLife(state, player);
  return true;
}

/**
 * Applies a collected pickup.
 * @param {object} state
 * @param {string} kind 'spread' | 'rapid' | 'beam' | 'shield'
 */
export function applyPickup(state, kind) {
  const { player } = state;
  if (kind === 'shield') player.shield = Math.min(PLAYER.maxShield, player.shield + 1);
  else upgradeWeapon(player.weapon, kind);
  addBonus(state.score, PICKUP_BONUS);
  emit(state, 'pickup', { kind, x: player.x, y: player.y });
}

function resolvePlayerBullets(state) {
  const bossTarget = bossSweepTarget(state.boss);
  forEachActive(state.bullets, (bullet) => {
    const hit = firstHit(state, bullet, bossTarget);
    if (hit) applyBulletHit(state, bullet, hit);
  });
}

/** The boss hull at its previous position plus its motion, so bullets sweep in the boss's frame. */
function bossSweepTarget(boss) {
  if (!boss.active) return null;
  const dx = boss.x - boss.px;
  const dy = boss.y - boss.py;
  const { box } = boss;
  return { dx, dy, box: { minX: box.minX - dx, minY: box.minY - dy, maxX: box.maxX - dx, maxY: box.maxY - dy } };
}

function firstHit(state, bullet, bossTarget) {
  let target = null;
  let time = Infinity;
  forEachActive(state.enemies, (enemy) => {
    const t = sweepCircles(bullet, enemy);
    if (t >= 0 && t < time) {
      time = t;
      target = enemy;
    }
  });
  if (bossTarget) {
    const dx = bullet.x - bullet.px - bossTarget.dx;
    const dy = bullet.y - bullet.py - bossTarget.dy;
    const t = sweepCircleBox(bullet.px, bullet.py, dx, dy, bullet.r, bossTarget.box);
    if (t >= 0 && t < time) {
      time = t;
      target = state.boss;
    }
  }
  return target ? { target, time } : null;
}

function applyBulletHit(state, bullet, hit) {
  const x = bullet.px + (bullet.x - bullet.px) * hit.time;
  const y = bullet.py + (bullet.y - bullet.py) * hit.time;
  release(state.bullets, bullet);
  if (hit.target === state.boss) {
    damageBoss(state, bullet.damage);
    spawnSparks(state, x, y, 2, 'cyan');
    emit(state, 'hit', { x, y, boss: true });
  } else if (!damageEnemy(state, hit.target, bullet.damage)) {
    spawnSparks(state, x, y, 2, 'spark');
    emit(state, 'hit', { x, y, boss: false });
  }
}

/** The beam stops at the lowest target in its column (closest to the ship) and burns only that one. */
function resolveBeam(state) {
  const { beam, boss } = state;
  if (!beam.on) return;
  const column = { minX: beam.x - beam.width / 2, maxX: beam.x + beam.width / 2, minY: 0, maxY: beam.bottom };
  let target = null;
  let contact = 0;
  forEachActive(state.enemies, (enemy) => {
    const edge = Math.min(enemy.y + enemy.r, beam.bottom);
    if (edge > contact && circleBoxOverlap(enemy.x, enemy.y, enemy.r, column)) {
      contact = edge;
      target = enemy;
    }
  });
  if (boss.active && boss.box.maxY > contact && boxesOverlap(column, boss.box)) {
    contact = Math.min(boss.box.maxY, beam.bottom);
    target = boss;
  }
  beam.top = contact;
  if (target) burn(state, target, beam.dps * STEP, beam.x, contact);
}

function burn(state, target, amount, x, y) {
  if (state.tick % BEAM_SPARK_EVERY === 0) spawnSparks(state, x, y, 1, 'violet');
  if (target === state.boss) damageBoss(state, amount);
  else damageEnemy(state, target, amount);
}

function resolveEnemyBullets(state) {
  const { player } = state;
  forEachActive(state.enemyBullets, (bullet) => {
    if (!isVulnerable(player) || sweepCircles(bullet, player) < 0) return;
    release(state.enemyBullets, bullet);
    hitPlayer(state);
  });
}

function resolveRamming(state) {
  const { player, boss } = state;
  forEachActive(state.enemies, (enemy) => {
    if (!isVulnerable(player)) return;
    if (!circlesOverlap(player.x, player.y, player.r, enemy.x, enemy.y, enemy.r)) return;
    damageEnemy(state, enemy, CONTACT_DAMAGE);
    hitPlayer(state);
  });
  const bossSolid = boss.active && boss.mode !== 'dying';
  if (bossSolid && isVulnerable(player) && circleBoxOverlap(player.x, player.y, player.r, boss.box)) {
    hitPlayer(state);
  }
}

function collectPickups(state) {
  const { player } = state;
  if (!player.alive) return;
  forEachActive(state.pickups, (pickup) => {
    if (!circlesOverlap(player.x, player.y, PLAYER.pickupRadius, pickup.x, pickup.y, pickup.r)) return;
    const { kind } = pickup;
    release(state.pickups, pickup);
    applyPickup(state, kind);
  });
}

function isVulnerable(player) {
  return player.alive && player.invuln === 0;
}

function absorbHit(state, player) {
  player.shield -= 1;
  player.invuln = PLAYER.shieldInvulnSteps;
  spawnSparks(state, player.x, player.y, 10, 'cyan');
  addShake(state, 0.3);
  emit(state, 'shieldHit', { x: player.x, y: player.y, shield: player.shield });
}

function loseLife(state, player) {
  player.lives -= 1;
  player.alive = false;
  player.respawnTimer = PLAYER.respawnSteps;
  downgradeWeapon(player.weapon);
  breakCombo(state.score);
  spawnExplosion(state, player.x, player.y, 1.6, 'violet');
  addShake(state, 0.7);
  emit(state, 'playerHit', { x: player.x, y: player.y, lives: player.lives });
  if (player.lives <= 0) scheduleEnding(state, 'gameover');
}

function randomDrop(state) {
  return chance(state.rng, RANDOM_DROP_CHANCE) ? pick(state.rng, PICKUP_KINDS) : null;
}

function split(state, x, y, vy) {
  for (const side of [-1, 1]) {
    spawnEnemy(state, {
      type: 'shard',
      x: x + side * 8,
      y,
      params: { vx: side * SHARD_SPEED, vy: vy + SHARD_EXTRA_FALL },
      source: 'split',
    });
  }
}
