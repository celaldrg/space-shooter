/**
 * Cosmetic simulation: particle explosions, hit sparks and screen-shake trauma.
 * Particles live in a pool inside the game state and use the game RNG, so they are deterministic too.
 * Particle kinds: 'spark' (a dot that flies and shrinks) and 'ring' (an expanding shock ring).
 * Tones are colour tokens the UI maps to colours: 'ember', 'violet', 'cyan', 'spark'.
 */

import { STEP } from './constants.js';
import { TAU } from './math.js';
import { acquire, forEachActive, release } from './pool.js';
import { randomInt, randomRange } from './rng.js';

const DRAG = 0.93;
const SHAKE_DECAY = 0.9;
const SHAKE_FLOOR = 0.001;

/**
 * Creates an inactive particle (pool factory).
 * @returns {object}
 */
export function createParticle() {
  return {
    active: false,
    slot: 0,
    kind: 'spark',
    tone: 'ember',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    size: 0,
    grow: 0,
  };
}

/**
 * Bursts sparks and a shock ring at a point and adds screen shake.
 * @param {object} state game state
 * @param {number} x
 * @param {number} y
 * @param {number} scale 1 = small enemy; bigger is louder
 * @param {string} tone colour token
 */
export function spawnExplosion(state, x, y, scale, tone) {
  const count = Math.round(8 + 12 * scale);
  for (let i = 0; i < count; i += 1) {
    if (!addSpark(state, x, y, randomRange(state.rng, 40, 190) * Math.sqrt(scale), tone)) break;
  }
  addParticle(state, { kind: 'ring', tone, x, y, vx: 0, vy: 0, life: 24, maxLife: 24, size: 4 * scale, grow: 1.6 * scale });
  addShake(state, 0.1 * scale);
}

/**
 * A few small sparks (bullet impacts, shield flashes) without a ring or shake.
 * @param {object} state
 * @param {number} x
 * @param {number} y
 * @param {number} count
 * @param {string} tone
 */
export function spawnSparks(state, x, y, count, tone) {
  for (let i = 0; i < count; i += 1) {
    if (!addSpark(state, x, y, randomRange(state.rng, 30, 120), tone)) return;
  }
}

/**
 * Moves particles one step and retires the expired ones.
 * @param {object} state
 */
export function updateParticles(state) {
  forEachActive(state.particles, (particle) => {
    particle.life -= 1;
    if (particle.life <= 0) {
      release(state.particles, particle);
      return;
    }
    particle.x += particle.vx * STEP;
    particle.y += particle.vy * STEP;
    particle.vx *= DRAG;
    particle.vy *= DRAG;
    particle.size += particle.grow;
  });
}

/**
 * Adds screen-shake trauma (capped at 1). The UI decides whether to show it (reduced motion).
 * @param {{shake: number}} state
 * @param {number} amount
 */
export function addShake(state, amount) {
  state.shake = Math.min(1, state.shake + amount);
}

/**
 * Lets the shake fade out by one step.
 * @param {{shake: number}} state
 */
export function decayShake(state) {
  state.shake = state.shake < SHAKE_FLOOR ? 0 : state.shake * SHAKE_DECAY;
}

function addSpark(state, x, y, speed, tone) {
  const angle = randomRange(state.rng, 0, TAU);
  const life = randomInt(state.rng, 16, 38);
  const size = randomRange(state.rng, 1.2, 2.8);
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;
  return addParticle(state, { kind: 'spark', tone, x, y, vx, vy, life, maxLife: life, size, grow: -size / life });
}

function addParticle(state, props) {
  const particle = acquire(state.particles);
  if (!particle) return false;
  Object.assign(particle, props);
  return true;
}
