/**
 * The boss: a wide gunship with a box-shaped hull (AABB) and three phases.
 *
 * Phase 1 (hp > 400)        - slow sway, aimed triple shots from both cannons and a fan downwards
 * Phase 2 (400 >= hp > 200) - faster sway, a rotating two-arm spiral and weaver escorts
 * Phase 3 (hp <= 200)       - restless sway with dips, bullet rings and fast aimed shots
 *
 * Each phase change clears the enemy bullets on screen and pays a bonus. At 0 hp the boss
 * plays a short chain of explosions and disappears; the director then ends the game in victory.
 */

import { STEP, WIDTH } from './constants.js';
import { DEG, TAU, angleTo } from './math.js';
import { randomRange } from './rng.js';
import { clearEnemyBullets, spawnEnemyBullet } from './projectiles.js';
import { clearEnemies, spawnEnemy } from './enemies.js';
import { addShake, spawnExplosion } from './effects.js';
import { addBonus, addKill } from './score.js';
import { emit } from './events.js';

/**
 * Boss tuning. `phaseHp` lists the hit points at or below which phases 2 and 3 begin.
 * `fightY` keeps the hull, even at the top of its phase 3 dips, below the HUD and the boss bar.
 */
export const BOSS = Object.freeze({
  maxHp: 600,
  phaseHp: Object.freeze([400, 200]),
  halfWidth: 76,
  halfHeight: 28,
  startY: -60,
  fightY: 168,
  enterSpeed: 76,
  follow: 0.05,
  score: 5000,
  phaseBonus: 1000,
  dyingSteps: 120,
});

const CANNON_OFFSET = 48;
const PHASES = [
  { sway: 70, period: 6, bob: 6, fire: firePhaseOne },
  { sway: 100, period: 4.5, bob: 10, fire: firePhaseTwo },
  { sway: 115, period: 3.2, bob: 24, fire: firePhaseThree },
];

/**
 * Phase for a hit-point value.
 * @param {number} hp
 * @returns {number} 1, 2 or 3
 */
export function bossPhaseFor(hp) {
  let phase = 1;
  for (const threshold of BOSS.phaseHp) {
    if (hp <= threshold) phase += 1;
  }
  return phase;
}

/**
 * Creates the (inactive) boss record.
 * mode: 'idle' -> 'enter' -> 'fight' -> 'dying' -> 'dead'
 * @returns {object}
 */
export function createBoss() {
  const boss = {
    active: false,
    mode: 'idle',
    x: WIDTH / 2,
    y: BOSS.startY,
    px: WIDTH / 2,
    py: BOSS.startY,
    hp: BOSS.maxHp,
    phase: 1,
    t: 0,
    spin: 0,
    flash: 0,
    dyingTimer: 0,
    box: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  };
  syncBox(boss);
  return boss;
}

/**
 * Brings the boss in from above the screen.
 * @param {object} state game state
 */
export function spawnBoss(state) {
  Object.assign(state.boss, createBoss(), { active: true, mode: 'enter' });
}

/**
 * Runs the boss for one step: entry, fight pattern or death throes.
 * @param {object} state
 */
export function updateBoss(state) {
  const { boss } = state;
  if (!boss.active) return;
  boss.px = boss.x;
  boss.py = boss.y;
  boss.t += 1;
  if (boss.flash > 0) boss.flash -= 1;
  if (boss.mode === 'enter') enter(boss);
  else if (boss.mode === 'fight') fight(state, boss);
  else dyingStep(state, boss);
  syncBox(boss);
}

/**
 * Damages the boss. Only the fighting boss takes damage. Each threshold the hit crosses changes
 * the phase in turn, so even a single huge hit runs every phase change and pays every bonus;
 * reaching 0 then starts the death sequence.
 * @param {object} state
 * @param {number} amount
 * @returns {boolean} true when the damage was applied
 */
export function damageBoss(state, amount) {
  const { boss } = state;
  if (!boss.active || boss.mode !== 'fight') return false;
  boss.hp = Math.max(0, boss.hp - amount);
  boss.flash = 3;
  const phase = bossPhaseFor(boss.hp);
  while (boss.phase < phase) enterPhase(state, boss, boss.phase + 1);
  if (boss.hp === 0) startDying(state, boss);
  return true;
}

function syncBox(boss) {
  boss.box.minX = boss.x - BOSS.halfWidth;
  boss.box.maxX = boss.x + BOSS.halfWidth;
  boss.box.minY = boss.y - BOSS.halfHeight;
  boss.box.maxY = boss.y + BOSS.halfHeight;
}

function enter(boss) {
  boss.y = Math.min(BOSS.fightY, boss.y + BOSS.enterSpeed * STEP);
  if (boss.y < BOSS.fightY) return;
  boss.mode = 'fight';
  boss.t = 0;
}

function fight(state, boss) {
  const pattern = PHASES[boss.phase - 1];
  const seconds = boss.t * STEP;
  const targetX = WIDTH / 2 + pattern.sway * Math.sin((TAU * seconds) / pattern.period);
  const targetY = BOSS.fightY + pattern.bob * Math.sin((2 * TAU * seconds) / pattern.period);
  boss.x += (targetX - boss.x) * BOSS.follow;
  boss.y += (targetY - boss.y) * BOSS.follow;
  pattern.fire(state, boss);
}

function firePhaseOne(state, boss) {
  if (boss.t % 64 === 32) {
    aimedFan(state, boss.x - CANNON_OFFSET, boss.y + 18, 3, 12 * DEG, 170);
    aimedFan(state, boss.x + CANNON_OFFSET, boss.y + 18, 3, 12 * DEG, 170);
  }
  if (boss.t % 150 === 0) fan(state, boss.x, boss.y + BOSS.halfHeight, Math.PI / 2, 7, 15 * DEG, 140);
}

function firePhaseTwo(state, boss) {
  if (boss.t % 5 === 0) {
    boss.spin += 0.24;
    spawnEnemyBullet(state, boss.x, boss.y, boss.spin, 135, 'orb');
    spawnEnemyBullet(state, boss.x, boss.y, boss.spin + Math.PI, 135, 'orb');
  }
  if (boss.t % 360 === 180) {
    spawnEnemy(state, { type: 'weaver', x: WIDTH * 0.2, params: { amp: 40, vy: 90 }, source: 'boss' });
    spawnEnemy(state, { type: 'weaver', x: WIDTH * 0.8, params: { amp: 40, vy: 90, phase: Math.PI }, source: 'boss' });
  }
}

function firePhaseThree(state, boss) {
  if (boss.t % 50 === 0) {
    const offset = (boss.t / 50) % 2 === 0 ? 0 : TAU / 32;
    fan(state, boss.x, boss.y, offset, 16, TAU / 16, 125);
  }
  if (boss.t % 28 === 14) aimedFan(state, boss.x, boss.y + BOSS.halfHeight, 1, 0, 230);
}

function aimedFan(state, x, y, count, spread, speed) {
  const { player } = state;
  fan(state, x, y, angleTo(x, y, player.x, player.y), count, spread, speed);
}

function fan(state, x, y, centre, count, spread, speed) {
  for (let i = 0; i < count; i += 1) {
    spawnEnemyBullet(state, x, y, centre + (i - (count - 1) / 2) * spread, speed, 'orb');
  }
}

function enterPhase(state, boss, phase) {
  boss.phase = phase;
  clearEnemyBullets(state);
  addBonus(state.score, BOSS.phaseBonus);
  spawnExplosion(state, boss.x, boss.y, 2.2, 'cyan');
  addShake(state, 0.5);
  emit(state, 'bossPhase', { phase });
}

function startDying(state, boss) {
  boss.mode = 'dying';
  boss.dyingTimer = BOSS.dyingSteps;
  clearEnemyBullets(state);
  clearEnemies(state);
  const points = addKill(state.score, BOSS.score);
  emit(state, 'bossDefeated', { x: boss.x, y: boss.y, points });
}

function dyingStep(state, boss) {
  boss.dyingTimer -= 1;
  if (boss.dyingTimer % 8 === 0) {
    const x = randomRange(state.rng, boss.box.minX, boss.box.maxX);
    const y = randomRange(state.rng, boss.box.minY, boss.box.maxY);
    spawnExplosion(state, x, y, 1.2, boss.dyingTimer % 16 === 0 ? 'cyan' : 'ember');
  }
  if (boss.dyingTimer > 0) return;
  spawnExplosion(state, boss.x, boss.y, 3.2, 'cyan');
  addShake(state, 1);
  boss.active = false;
  boss.mode = 'dead';
}
