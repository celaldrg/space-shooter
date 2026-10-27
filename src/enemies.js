/**
 * Enemy types and their movement patterns.
 *
 * weaver   - drifts down on a sine wave, optionally dropping slow pellets
 * diver    - glides in, hovers, then locks on to the ship and dives through its position
 * turret   - descends to a station, swivels its barrel towards the ship and fires bursts, then leaves
 * splitter - a tumbling rock that bounces off the side walls and breaks into two shards
 * shard    - the small half of a splitter (same movement)
 *
 * Spawn parameters (all optional) come from the wave script; times are in seconds.
 */

import { HEIGHT, STEP, WIDTH, secondsToSteps } from './constants.js';
import { DEG, TAU, angleTo, turnTowards } from './math.js';
import { acquire, forEachActive, release } from './pool.js';
import { spawnEnemyBullet } from './projectiles.js';
import { spawnExplosion } from './effects.js';

/** Base stats per enemy type: collision radius, hit points and score. */
export const ENEMY_TYPES = Object.freeze({
  weaver: Object.freeze({ radius: 12, hp: 2, score: 100 }),
  diver: Object.freeze({ radius: 11, hp: 1, score: 150 }),
  turret: Object.freeze({ radius: 15, hp: 7, score: 300 }),
  splitter: Object.freeze({ radius: 18, hp: 5, score: 200 }),
  shard: Object.freeze({ radius: 10, hp: 2, score: 60 }),
});

/** Radius of the smallest enemy: the worst case for bullet tunnelling. */
export const MIN_ENEMY_RADIUS = Math.min(...Object.values(ENEMY_TYPES).map((type) => type.radius));

/** Height at which scripted enemies appear, just above the visible field. */
export const SPAWN_Y = -24;

const SETTLE_SPEED = 1.5;
const SETTLE_EASE = 0.06;
const DIVE_MIN_DROP = 60;
const TURRET_TURN_RATE = 2.4 * DEG;
const TURRET_LEAVE_SPEED = 100;
const MUZZLE = 16;
const BURST_SPREAD = 14 * DEG;
const PELLET_SPEED = 150;
const OFFSCREEN_SIDE = 60;

const SETUP = { weaver: setupWeaver, diver: setupDiver, turret: setupTurret, splitter: setupDrifter, shard: setupDrifter };
const MOVES = { weaver: moveWeaver, diver: moveDiver, turret: moveTurret, splitter: moveDrifter, shard: moveDrifter };

/**
 * Creates an inactive enemy record with every field any type uses (pool factory).
 * @returns {object}
 */
export function createEnemy() {
  return {
    active: false,
    slot: 0,
    id: 0,
    type: 'weaver',
    source: 'wave',
    drop: null,
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    r: 0,
    hp: 0,
    maxHp: 0,
    t: 0,
    flash: 0,
    mode: '',
    timer: 0,
    baseX: 0,
    amp: 0,
    omega: 0,
    phase: 0,
    hoverY: 0,
    stopY: 0,
    speed: 0,
    fireEvery: 0,
    fireTimer: 0,
    burst: 1,
    bulletSpeed: 0,
    angle: Math.PI / 2,
    spin: 0,
  };
}

/**
 * Spawns an enemy.
 * @param {object} state game state
 * @param {{type: string, x: number, y?: number, params?: object, drop?: string|null, source?: string}} spec
 *   `params` tunes the pattern (see the setup functions), `drop` is a guaranteed pickup,
 *   `source` tells who spawned it: 'wave', 'split' or 'boss'
 * @returns {object|null} the enemy, or null when the pool is full
 */
export function spawnEnemy(state, spec) {
  const enemy = acquire(state.enemies);
  if (!enemy) return null;
  const base = ENEMY_TYPES[spec.type];
  const params = spec.params ?? {};
  Object.assign(enemy, createEnemy(), { active: true, slot: enemy.slot });
  enemy.id = state.nextId;
  state.nextId += 1;
  enemy.type = spec.type;
  enemy.source = spec.source ?? 'wave';
  enemy.drop = spec.drop ?? null;
  enemy.x = spec.x;
  enemy.y = spec.y ?? SPAWN_Y;
  enemy.r = base.radius;
  enemy.hp = params.hp ?? base.hp;
  enemy.maxHp = enemy.hp;
  SETUP[spec.type](enemy, params);
  enemy.px = enemy.x;
  enemy.py = enemy.y;
  return enemy;
}

/**
 * Moves every enemy one step (their patterns may fire) and drops the ones that left the field.
 * @param {object} state
 */
export function updateEnemies(state) {
  forEachActive(state.enemies, (enemy) => {
    enemy.px = enemy.x;
    enemy.py = enemy.y;
    enemy.t += 1;
    if (enemy.flash > 0) enemy.flash -= 1;
    MOVES[enemy.type](state, enemy);
    if (isOffscreen(enemy)) release(state.enemies, enemy);
  });
}

/**
 * Blows up every enemy without scoring (used when the boss is destroyed).
 * @param {object} state
 */
export function clearEnemies(state) {
  forEachActive(state.enemies, (enemy) => {
    spawnExplosion(state, enemy.x, enemy.y, enemy.r / 12, 'ember');
    release(state.enemies, enemy);
  });
}

/** Params: amp (px), freq (Hz), phase (rad), vy (px/s), fireEvery (s, 0 = never). */
function setupWeaver(enemy, params) {
  enemy.vy = params.vy ?? 80;
  enemy.amp = params.amp ?? 50;
  enemy.omega = TAU * (params.freq ?? 0.5) * STEP;
  enemy.phase = params.phase ?? 0;
  enemy.fireEvery = secondsToSteps(params.fireEvery ?? 0);
  enemy.baseX = enemy.x;
  enemy.x = enemy.baseX + enemy.amp * Math.sin(enemy.phase);
}

/** Params: hoverY (px), hold (s), speed (dive px/s). */
function setupDiver(enemy, params) {
  enemy.mode = 'enter';
  enemy.hoverY = params.hoverY ?? 150;
  enemy.timer = secondsToSteps(params.hold ?? 0.5);
  enemy.speed = params.speed ?? 330;
}

/** Params: stopY (px), stay (s), fireEvery (s), burst (bullets per shot), bulletSpeed (px/s). */
function setupTurret(enemy, params) {
  enemy.mode = 'enter';
  enemy.stopY = params.stopY ?? 120;
  enemy.timer = secondsToSteps(params.stay ?? 5);
  enemy.fireEvery = secondsToSteps(params.fireEvery ?? 1.2);
  enemy.burst = params.burst ?? 1;
  enemy.bulletSpeed = params.bulletSpeed ?? 170;
}

/** Params: vx, vy (px/s), spin (rad/step). */
function setupDrifter(enemy, params) {
  enemy.vx = params.vx ?? (enemy.x < WIDTH / 2 ? 45 : -45);
  enemy.vy = params.vy ?? 55;
  enemy.spin = params.spin ?? 0.03;
}

function moveWeaver(state, enemy) {
  enemy.y += enemy.vy * STEP;
  enemy.x = enemy.baseX + enemy.amp * Math.sin(enemy.phase + enemy.omega * enemy.t);
  const readyToFire = enemy.fireEvery > 0 && (enemy.t + enemy.id * 17) % enemy.fireEvery === 0;
  if (readyToFire && enemy.y > 24 && enemy.y < HEIGHT * 0.6) {
    spawnEnemyBullet(state, enemy.x, enemy.y + enemy.r, Math.PI / 2, PELLET_SPEED);
  }
}

function moveDiver(state, enemy) {
  if (enemy.mode === 'enter') {
    if (settleAt(enemy, enemy.hoverY)) enemy.mode = 'hover';
  } else if (enemy.mode === 'hover') {
    enemy.timer -= 1;
    if (enemy.timer <= 0) startDive(state, enemy);
  } else {
    enemy.x += enemy.vx * STEP;
    enemy.y += enemy.vy * STEP;
  }
}

function startDive(state, enemy) {
  const { player } = state;
  const dx = player.x - enemy.x;
  const dy = Math.max(player.y - enemy.y, DIVE_MIN_DROP);
  const length = Math.hypot(dx, dy);
  enemy.vx = (dx / length) * enemy.speed;
  enemy.vy = (dy / length) * enemy.speed;
  enemy.angle = Math.atan2(enemy.vy, enemy.vx);
  enemy.mode = 'dive';
}

function moveTurret(state, enemy) {
  if (enemy.mode === 'enter') {
    if (settleAt(enemy, enemy.stopY)) {
      enemy.mode = 'aim';
      enemy.fireTimer = Math.ceil(enemy.fireEvery / 2);
    }
  } else if (enemy.mode === 'aim') {
    aimAndFire(state, enemy);
  } else {
    enemy.y += TURRET_LEAVE_SPEED * STEP;
  }
}

function aimAndFire(state, enemy) {
  const { player } = state;
  enemy.angle = turnTowards(enemy.angle, angleTo(enemy.x, enemy.y, player.x, player.y), TURRET_TURN_RATE);
  enemy.fireTimer -= 1;
  if (enemy.fireTimer <= 0) {
    fireBurst(state, enemy);
    enemy.fireTimer = enemy.fireEvery;
  }
  enemy.timer -= 1;
  if (enemy.timer <= 0) enemy.mode = 'leave';
}

function fireBurst(state, enemy) {
  const muzzleX = enemy.x + Math.cos(enemy.angle) * MUZZLE;
  const muzzleY = enemy.y + Math.sin(enemy.angle) * MUZZLE;
  for (let i = 0; i < enemy.burst; i += 1) {
    const angle = enemy.angle + (i - (enemy.burst - 1) / 2) * BURST_SPREAD;
    spawnEnemyBullet(state, muzzleX, muzzleY, angle, enemy.bulletSpeed, 'needle');
  }
}

function moveDrifter(state, enemy) {
  enemy.x += enemy.vx * STEP;
  enemy.y += enemy.vy * STEP;
  enemy.angle += enemy.spin;
  if (enemy.x < enemy.r) {
    enemy.x = enemy.r;
    enemy.vx = Math.abs(enemy.vx);
  } else if (enemy.x > WIDTH - enemy.r) {
    enemy.x = WIDTH - enemy.r;
    enemy.vx = -Math.abs(enemy.vx);
  }
}

/** Eases an enemy down to `targetY`; returns true once it has arrived. */
function settleAt(enemy, targetY) {
  const remaining = targetY - enemy.y;
  if (remaining <= SETTLE_SPEED) {
    enemy.y = targetY;
    return true;
  }
  enemy.y += Math.max(SETTLE_SPEED, remaining * SETTLE_EASE);
  return false;
}

function isOffscreen(enemy) {
  return enemy.y - enemy.r > HEIGHT + 8
    || enemy.x + enemy.r < -OFFSCREEN_SIDE
    || enemy.x - enemy.r > WIDTH + OFFSCREEN_SIDE;
}
