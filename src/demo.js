/**
 * The "?demo" state: a fixed, busy moment of wave 3 - turrets, weavers and divers on screen,
 * a spread volley in flight, enemy fire and fresh explosions. Built by simulation from a fixed
 * seed, so it is identical on every load.
 */

import { createGame, drainEvents, startGame, step } from './game.js';
import { jumpToWave } from './director.js';
import { PLAYER } from './player.js';
import { COMBO_WINDOW } from './score.js';

/** Seed of the demo game. */
export const DEMO_SEED = 20261027;

const DEMO_WAVE_INDEX = 2;
const DEMO_STEPS = 430;
const FIRE_STEPS = 32;
const SWAY = 70;
const SWAY_STEPS = 70;
const DEMO_COMBO = 13;

/**
 * Builds the demo state: wave 3 in full swing with a level 2 spread weapon, one shield charge,
 * a x3 combo running and two explosions that have just gone off.
 * @returns {object} game state (status 'playing')
 */
export function createDemoGame() {
  const state = startGame(createGame({ seed: DEMO_SEED, highScore: 48250 }));
  jumpToWave(state, DEMO_WAVE_INDEX);
  const { player, score } = state;
  Object.assign(player.weapon, { type: 'spread', level: 2 });
  player.lives = 2;
  player.shield = 1;
  player.invuln = DEMO_STEPS + 1;
  score.points = 12650;
  for (let i = 0; i < DEMO_STEPS; i += 1) step(state, demoInput(i));
  player.invuln = 0;
  score.combo = DEMO_COMBO;
  score.comboTimer = COMBO_WINDOW;
  drainEvents(state);
  return state;
}

/** Sways the ship gently and holds fire until the last moments, so the field stays crowded. */
function demoInput(i) {
  return {
    target: { x: PLAYER.startX + SWAY * Math.sin(i / SWAY_STEPS), y: PLAYER.startY },
    fire: i >= DEMO_STEPS - FIRE_STEPS,
  };
}
