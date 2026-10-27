/**
 * Score and combo multiplier.
 * Every kill adds one to the combo and restarts the combo window. Kill points are
 * base points times the multiplier of the combo after that kill: kills 1-4 score x1,
 * kills 5-9 score x2 and so on, up to MAX_MULTIPLIER. The combo resets when the window
 * runs out or the player is hit.
 */

/** Steps after a kill before the combo resets (2 seconds). */
export const COMBO_WINDOW = 120;

/** Kills needed per multiplier level. */
export const KILLS_PER_LEVEL = 5;

/** Highest multiplier. */
export const MAX_MULTIPLIER = 8;

/**
 * Creates the score record.
 * @param {number} [highScore=0] best score so far (loaded by the UI through the storage helper)
 * @returns {{points: number, combo: number, comboTimer: number, highScore: number, newHighScore: boolean}}
 */
export function createScore(highScore = 0) {
  return { points: 0, combo: 0, comboTimer: 0, highScore, newHighScore: false };
}

/**
 * Multiplier for a combo count.
 * @param {number} combo
 * @returns {number}
 */
export function multiplierFor(combo) {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / KILLS_PER_LEVEL));
}

/**
 * Registers a kill and returns the points it was worth.
 * @param {ReturnType<typeof createScore>} score
 * @param {number} basePoints
 * @returns {number}
 */
export function addKill(score, basePoints) {
  score.combo += 1;
  score.comboTimer = COMBO_WINDOW;
  const points = basePoints * multiplierFor(score.combo);
  score.points += points;
  return points;
}

/**
 * Adds flat bonus points (pickups, boss phase breaks); bonuses do not touch the combo.
 * @param {ReturnType<typeof createScore>} score
 * @param {number} points
 */
export function addBonus(score, points) {
  score.points += points;
}

/**
 * Advances the combo window by one step.
 * @param {ReturnType<typeof createScore>} score
 */
export function tickCombo(score) {
  if (score.comboTimer === 0) return;
  score.comboTimer -= 1;
  if (score.comboTimer === 0) score.combo = 0;
}

/**
 * Drops the combo immediately (the player was hit).
 * @param {ReturnType<typeof createScore>} score
 */
export function breakCombo(score) {
  score.combo = 0;
  score.comboTimer = 0;
}

/**
 * Updates the high score at the end of a game.
 * @param {ReturnType<typeof createScore>} score
 * @returns {number} the high score after the update
 */
export function finalizeHighScore(score) {
  if (score.points > score.highScore) {
    score.highScore = score.points;
    score.newHighScore = true;
  }
  return score.highScore;
}
