/**
 * The director plays the wave script: a short intro, waves 1-10 with interludes between them,
 * then the boss stage. Phases: 'intro' -> 'wave' -> 'interlude' -> ... -> 'boss' -> 'done'.
 */

import { INTERLUDE_STEPS, INTRO_STEPS, SCHEDULE, WAVES } from './waves.js';
import { spawnEnemy } from './enemies.js';
import { spawnBoss } from './boss.js';
import { resetPool } from './pool.js';
import { scheduleEnding } from './ending.js';
import { emit } from './events.js';

/**
 * Creates the director at the start of a game.
 * `wave` is the 0-based index of the current or upcoming stage (WAVES.length = boss stage);
 * `waveStep` counts steps since the current wave began.
 * @returns {{phase: string, wave: number, waveStep: number, cursor: number, timer: number}}
 */
export function createDirector() {
  return { phase: 'intro', wave: 0, waveStep: 0, cursor: 0, timer: INTRO_STEPS };
}

/**
 * Advances the script by one step: starts waves, spawns scripted enemies on time,
 * notices cleared waves and the end of the boss.
 * @param {object} state game state
 */
export function tickDirector(state) {
  const { director } = state;
  if (director.phase === 'intro' || director.phase === 'interlude') {
    director.timer -= 1;
    if (director.timer <= 0) beginStage(state, director.wave);
  } else if (director.phase === 'wave') {
    runWave(state);
  } else if (director.phase === 'boss' && !state.boss.active) {
    director.phase = 'done';
    scheduleEnding(state, 'victory');
  }
}

/**
 * Starts a stage immediately, removing enemies and enemy bullets on screen
 * (used by the demo state and by tests).
 * @param {object} state
 * @param {number} index 0-based wave index; WAVES.length starts the boss stage
 */
export function jumpToWave(state, index) {
  resetPool(state.enemies);
  resetPool(state.enemyBullets);
  state.boss.active = false;
  beginStage(state, index);
}

function beginStage(state, index) {
  const { director } = state;
  const bossStage = index >= WAVES.length;
  director.wave = index;
  director.waveStep = 0;
  director.cursor = 0;
  director.timer = 0;
  director.phase = bossStage ? 'boss' : 'wave';
  emit(state, 'waveStart', { wave: index + 1, boss: bossStage });
  if (bossStage) spawnBoss(state);
  else runWave(state);
}

function runWave(state) {
  const { director } = state;
  const schedule = SCHEDULE[director.wave];
  while (director.cursor < schedule.length && schedule[director.cursor].step <= director.waveStep) {
    spawnScripted(state, schedule[director.cursor]);
    director.cursor += 1;
  }
  director.waveStep += 1;
  if (director.cursor === schedule.length && state.enemies.active === 0) clearWave(state);
}

function spawnScripted(state, entry) {
  const spec = { type: entry.type, x: entry.x, params: entry.params, drop: entry.drop, source: 'wave' };
  if (spawnEnemy(state, spec)) {
    emit(state, 'spawn', { enemy: entry.type, x: entry.x, wave: state.director.wave + 1 });
  }
}

function clearWave(state) {
  const { director } = state;
  emit(state, 'waveClear', { wave: director.wave + 1 });
  director.phase = 'interlude';
  director.timer = INTERLUDE_STEPS;
  director.wave += 1;
}
