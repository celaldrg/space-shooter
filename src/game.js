/**
 * Game facade: creates the state, runs the fixed-step simulation and exposes HUD data.
 *
 * The whole game is one plain, JSON-serialisable state object. The UI drives it like this:
 *
 *   const game = createGame({ seed, highScore });
 *   startGame(game);
 *   // every animation frame:
 *   advance(game, elapsedSeconds, input);   // runs 0..5 fixed 60 Hz steps
 *   for (const event of drainEvents(game)) playSound(event);
 *   render(game);
 *
 * Events: shoot, hit, kill, spawn, pickup, shieldHit, playerHit, respawn, waveStart, waveClear,
 * bossPhase, bossDefeated, gameover, victory.
 * Same seed + same inputs => the same game, step for step.
 */

import { MAX_CATCH_UP_STEPS, POOL_SIZES, STEP } from './constants.js';
import { createRng } from './rng.js';
import { createPool, resetPool } from './pool.js';
import { createScore, multiplierFor, tickCombo } from './score.js';
import { PLAYER, createPlayer, movePlayer, normalizeInput, respawnPlayer } from './player.js';
import { createBeam, updateWeapon } from './weapons.js';
import { createEnemy, updateEnemies } from './enemies.js';
import { BOSS, createBoss, updateBoss } from './boss.js';
import { createBullet, cullBullets, moveBullets } from './projectiles.js';
import { createPickup, updatePickups } from './pickups.js';
import { createParticle, decayShake, updateParticles } from './effects.js';
import { createDirector, tickDirector } from './director.js';
import { WAVES } from './waves.js';
import { resolveCollisions } from './combat.js';
import { tickEnding } from './ending.js';
import { emit } from './events.js';

/**
 * @typedef {object} Input
 * @property {number} [x] horizontal stick, -1 (left) .. 1 (right)
 * @property {number} [y] vertical stick, -1 (up) .. 1 (down)
 * @property {boolean} [fire] trigger held (or auto-fire on)
 * @property {{x: number, y: number}|null} [target] world point to steer towards (touch drag)
 */

const ACCUMULATOR_EPSILON = 1e-9;

/**
 * Creates a game on the title screen.
 * @param {{seed?: number, highScore?: number, lives?: number}} [options]
 *   seed for the RNG (default 1), best score so far (default 0), lives per game (default 3)
 * @returns {object} game state
 */
export function createGame(options = {}) {
  const state = {
    seed: 0,
    rng: null,
    status: 'title',
    paused: false,
    tick: 0,
    accumulator: 0,
    startLives: options.lives ?? PLAYER.lives,
    player: null,
    beam: null,
    bullets: createPool(POOL_SIZES.bullets, createBullet),
    enemyBullets: createPool(POOL_SIZES.enemyBullets, createBullet),
    enemies: createPool(POOL_SIZES.enemies, createEnemy),
    pickups: createPool(POOL_SIZES.pickups, createPickup),
    particles: createPool(POOL_SIZES.particles, createParticle),
    boss: null,
    director: null,
    score: createScore(options.highScore ?? 0),
    stats: null,
    shake: 0,
    ending: null,
    endTimer: 0,
    nextId: 1,
    events: [],
  };
  return resetGame(state, options.seed ?? 1);
}

/**
 * Puts the game back on the title screen: every pool is emptied, the high score is kept.
 * @param {object} state
 * @param {number} [seed] new RNG seed (defaults to the current one)
 * @returns {object} the same state
 */
export function resetGame(state, seed = state.seed) {
  state.seed = seed;
  state.rng = createRng(seed);
  state.status = 'title';
  state.paused = false;
  state.tick = 0;
  state.accumulator = 0;
  state.player = createPlayer(state.startLives);
  state.beam = createBeam();
  for (const pool of [state.bullets, state.enemyBullets, state.enemies, state.pickups, state.particles]) {
    resetPool(pool);
  }
  state.boss = createBoss();
  state.director = createDirector();
  state.score = createScore(state.score.highScore);
  state.stats = { kills: 0 };
  state.shake = 0;
  state.ending = null;
  state.endTimer = 0;
  state.nextId = 1;
  state.events = [];
  return state;
}

/**
 * Starts a fresh game (New game / Restart).
 * @param {object} state
 * @param {number} [seed] new RNG seed (defaults to the current one)
 * @returns {object} the same state
 */
export function startGame(state, seed = state.seed) {
  resetGame(state, seed);
  state.status = 'playing';
  return state;
}

/**
 * Runs exactly one fixed simulation step. Does nothing while paused or on the title screen;
 * after the game has ended only the particles keep moving.
 * @param {object} state
 * @param {Input} [input]
 * @returns {object} the same state
 */
export function step(state, input) {
  if (state.paused || state.status === 'title') return state;
  if (state.status === 'playing') {
    stepPlaying(state, normalizeInput(input));
  } else {
    updateParticles(state);
    decayShake(state);
  }
  return state;
}

/**
 * Feeds real elapsed time into the fixed-step simulation (at most MAX_CATCH_UP_STEPS steps per call).
 * @param {object} state
 * @param {number} seconds time since the previous call
 * @param {Input} [input] input held during that time
 * @returns {number} number of steps run
 */
export function advance(state, seconds, input) {
  if (state.paused) return 0;
  const elapsed = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  state.accumulator = Math.min(state.accumulator + elapsed, STEP * MAX_CATCH_UP_STEPS);
  let steps = 0;
  while (state.accumulator >= STEP - ACCUMULATOR_EPSILON) {
    state.accumulator = Math.max(0, state.accumulator - STEP);
    step(state, input);
    steps += 1;
  }
  return steps;
}

/**
 * Pauses or resumes a running game (P key, hidden tab). Only a game in play can be paused.
 * @param {object} state
 * @param {boolean} paused
 * @returns {boolean} the resulting paused flag
 */
export function setPaused(state, paused) {
  state.paused = Boolean(paused) && state.status === 'playing';
  state.accumulator = 0;
  return state.paused;
}

/**
 * Flips the paused flag.
 * @param {object} state
 * @returns {boolean} the resulting paused flag
 */
export function togglePause(state) {
  return setPaused(state, !state.paused);
}

/**
 * Returns the queued events and empties the queue.
 * @param {object} state
 * @returns {{type: string}[]}
 */
export function drainEvents(state) {
  const { events } = state;
  state.events = [];
  return events;
}

/**
 * Numbers for the HUD and the end screens.
 * @param {object} state
 * @returns {{status: string, paused: boolean, score: number, highScore: number, multiplier: number,
 *   lives: number, shield: number, weapon: string, weaponLevel: number, wave: number, waveCount: number,
 *   bossStage: boolean, bossHealth: number, bossPhase: number, kills: number}}
 */
export function hudInfo(state) {
  const { player, score, director, boss } = state;
  return {
    status: state.status,
    paused: state.paused,
    score: score.points,
    highScore: Math.max(score.highScore, score.points),
    multiplier: multiplierFor(score.combo),
    lives: player.lives,
    shield: player.shield,
    weapon: player.weapon.type,
    weaponLevel: player.weapon.level,
    wave: Math.min(director.wave + 1, WAVES.length),
    waveCount: WAVES.length,
    bossStage: director.wave >= WAVES.length,
    bossHealth: boss.active ? boss.hp / BOSS.maxHp : 0,
    bossPhase: boss.phase,
    kills: state.stats.kills,
  };
}

function stepPlaying(state, input) {
  state.tick += 1;
  tickDirector(state);
  stepPlayer(state, input);
  updateEnemies(state);
  updateBoss(state);
  moveBullets(state.bullets);
  moveBullets(state.enemyBullets);
  updatePickups(state);
  resolveCollisions(state);
  cullBullets(state.bullets);
  cullBullets(state.enemyBullets);
  updateParticles(state);
  tickCombo(state.score);
  decayShake(state);
  tickEnding(state);
}

function stepPlayer(state, input) {
  const { player } = state;
  if (player.invuln > 0) player.invuln -= 1;
  if (!player.alive) tickRespawn(state, player);
  movePlayer(player, input);
  updateWeapon(state, input.fire);
}

function tickRespawn(state, player) {
  if (player.lives <= 0) return;
  player.respawnTimer -= 1;
  if (player.respawnTimer > 0) return;
  respawnPlayer(player);
  emit(state, 'respawn', { x: player.x, y: player.y });
}
