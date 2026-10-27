/**
 * End of a game. Losing the last life or destroying the boss schedules an ending; after a short
 * delay (so the final explosion can play) the status becomes 'gameover' or 'victory', the high
 * score is updated and an event with the same name is emitted.
 */

import { finalizeHighScore } from './score.js';
import { emit } from './events.js';

/** Steps between the deciding moment and the end screen. */
export const ENDING_DELAY = 90;

/**
 * Schedules the end of the game. The first outcome wins; later requests are ignored.
 * @param {object} state game state
 * @param {'gameover'|'victory'} outcome
 */
export function scheduleEnding(state, outcome) {
  if (state.ending) return;
  state.ending = outcome;
  state.endTimer = ENDING_DELAY;
}

/**
 * Counts a scheduled ending down by one step and finishes the game when it expires.
 * @param {object} state
 */
export function tickEnding(state) {
  if (!state.ending) return;
  state.endTimer -= 1;
  if (state.endTimer > 0) return;
  const { score } = state;
  finalizeHighScore(score);
  state.status = state.ending;
  emit(state, state.ending, { score: score.points, highScore: score.highScore, newHighScore: score.newHighScore });
}
