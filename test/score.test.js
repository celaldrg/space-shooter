import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMBO_WINDOW,
  MAX_MULTIPLIER,
  addBonus,
  addKill,
  breakCombo,
  createScore,
  finalizeHighScore,
  multiplierFor,
  tickCombo,
} from '../src/score.js';
import { createGame, drainEvents, hudInfo, startGame } from '../src/game.js';
import { spawnEnemy } from '../src/enemies.js';
import { hitPlayer, killEnemy } from '../src/combat.js';

test('the multiplier rises by one every 5 combo kills, capped at x8', () => {
  const table = [0, 1, 4, 5, 9, 10, 14, 15, 34, 35, 100].map(multiplierFor);
  assert.deepEqual(table, [1, 1, 1, 2, 2, 3, 3, 4, 7, MAX_MULTIPLIER, MAX_MULTIPLIER]);
});

test('kill points use the multiplier reached by that kill', () => {
  const score = createScore();
  const points = Array.from({ length: 12 }, () => addKill(score, 100));
  assert.deepEqual(points, [100, 100, 100, 100, 200, 200, 200, 200, 200, 300, 300, 300]);
  assert.equal(score.points, 2300);
  assert.equal(score.combo, 12);
});

test('every kill restarts the combo window; the combo ends when the window runs out', () => {
  const score = createScore();
  addKill(score, 10);
  for (let i = 0; i < COMBO_WINDOW - 1; i += 1) tickCombo(score);
  assert.equal(score.combo, 1);
  addKill(score, 10);
  assert.equal(score.comboTimer, COMBO_WINDOW);
  for (let i = 0; i < COMBO_WINDOW - 1; i += 1) tickCombo(score);
  assert.equal(score.combo, 2);
  tickCombo(score);
  assert.deepEqual([score.combo, score.comboTimer], [0, 0]);
  tickCombo(score);
  assert.deepEqual([score.combo, score.comboTimer], [0, 0]);
});

test('bonuses add flat points without touching the combo; a hit breaks the combo', () => {
  const score = createScore();
  for (let i = 0; i < 6; i += 1) addKill(score, 50);
  addBonus(score, 250);
  assert.equal(score.points, 4 * 50 + 2 * 100 + 250);
  assert.equal(score.combo, 6);
  breakCombo(score);
  assert.deepEqual([score.combo, score.comboTimer, multiplierFor(score.combo)], [0, 0, 1]);
});

test('finalizeHighScore keeps the best score and flags a new record', () => {
  const score = createScore(1000);
  score.points = 900;
  assert.equal(finalizeHighScore(score), 1000);
  assert.equal(score.newHighScore, false);
  score.points = 1500;
  assert.equal(finalizeHighScore(score), 1500);
  assert.equal(score.newHighScore, true);
});

test('in a game, kills report their points and multiplier, and losing a life resets the combo', () => {
  const state = startGame(createGame({ seed: 3 }));
  const divers = Array.from({ length: 6 }, (_, i) => spawnEnemy(state, { type: 'diver', x: 40 + i * 50, y: 100 }));
  for (const diver of divers) killEnemy(state, diver);
  const kills = drainEvents(state).filter((event) => event.type === 'kill');
  assert.deepEqual(kills.map((event) => event.points), [150, 150, 150, 150, 300, 300]);
  assert.deepEqual(kills.map((event) => event.multiplier), [1, 1, 1, 1, 2, 2]);
  assert.equal(hudInfo(state).score, 1200);
  assert.equal(hudInfo(state).kills, 6);
  assert.equal(hudInfo(state).multiplier, 2);
  hitPlayer(state);
  assert.equal(hudInfo(state).multiplier, 1);
  assert.equal(state.score.combo, 0);
});
