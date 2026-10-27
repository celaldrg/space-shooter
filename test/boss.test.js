import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOSS, bossPhaseFor, damageBoss } from '../src/boss.js';
import { jumpToWave } from '../src/director.js';
import { ENDING_DELAY } from '../src/ending.js';
import { spawnEnemyBullet } from '../src/projectiles.js';
import { PLAYER } from '../src/player.js';
import { WAVES } from '../src/waves.js';
import { createGame, drainEvents, hudInfo, startGame, step } from '../src/game.js';

const UNTOUCHABLE = 1e9;

/** World units at the top of the field covered by the HUD and the boss bar (about 117 on a 375 px phone). */
const HUD_BAND = 120;

/** A game at the boss stage, with the boss in position and ready to take damage. */
function bossFight(seed = 11) {
  const state = startGame(createGame({ seed }));
  jumpToWave(state, WAVES.length);
  state.player.invuln = UNTOUCHABLE;
  while (state.boss.mode !== 'fight') step(state, {});
  drainEvents(state);
  return state;
}

const phaseEvents = (events) => events.filter((event) => event.type === 'bossPhase').map((event) => event.phase);

test('bossPhaseFor: phase 2 from 400 hp down, phase 3 from 200 hp down', () => {
  const hp = [600, 400.5, 400, 200.5, 200, 1, 0];
  assert.deepEqual(hp.map(bossPhaseFor), [1, 1, 2, 2, 3, 3, 3]);
  assert.deepEqual(BOSS.phaseHp, [400, 200]);
});

test('the boss flies in and cannot be hurt before the fight starts', () => {
  const state = startGame(createGame({ seed: 2 }));
  jumpToWave(state, WAVES.length);
  assert.deepEqual([state.boss.active, state.boss.mode, state.boss.y], [true, 'enter', BOSS.startY]);
  assert.equal(damageBoss(state, 50), false);
  assert.equal(state.boss.hp, BOSS.maxHp);
  let steps = 0;
  while (state.boss.mode === 'enter') {
    step(state, {});
    steps += 1;
  }
  assert.equal(state.boss.mode, 'fight');
  assert.equal(state.boss.y, BOSS.fightY);
  assert.ok(steps > 100 && steps < 240, `entry took ${steps} steps`);
});

test('the boss changes phase exactly at its health thresholds', () => {
  const state = bossFight();
  const startScore = state.score.points;
  damageBoss(state, 199);
  assert.deepEqual([state.boss.hp, state.boss.phase, phaseEvents(drainEvents(state))], [401, 1, []]);
  for (let i = 0; i < 12; i += 1) spawnEnemyBullet(state, 100 + i * 10, 300, Math.PI / 2, 100);
  damageBoss(state, 1);
  assert.deepEqual([state.boss.hp, state.boss.phase, phaseEvents(drainEvents(state))], [400, 2, [2]]);
  assert.equal(state.enemyBullets.active, 0, 'a phase change clears the enemy bullets');
  assert.equal(state.score.points, startScore + BOSS.phaseBonus);
  damageBoss(state, 199.5);
  assert.deepEqual([state.boss.hp, state.boss.phase, phaseEvents(drainEvents(state))], [200.5, 2, []]);
  damageBoss(state, 0.5);
  assert.deepEqual([state.boss.hp, state.boss.phase, phaseEvents(drainEvents(state))], [200, 3, [3]]);
  assert.equal(state.score.points, startScore + 2 * BOSS.phaseBonus);
  assert.equal(hudInfo(state).bossPhase, 3);
  assert.equal(hudInfo(state).bossHealth, 200 / BOSS.maxHp);
});

test('one hit that crosses both thresholds still runs phase 2 and then phase 3', () => {
  const state = bossFight();
  const startScore = state.score.points;
  for (let i = 0; i < 12; i += 1) spawnEnemyBullet(state, 100 + i * 10, 300, Math.PI / 2, 100);
  damageBoss(state, 450);
  assert.deepEqual([state.boss.hp, state.boss.phase, phaseEvents(drainEvents(state))], [150, 3, [2, 3]]);
  assert.equal(state.enemyBullets.active, 0);
  assert.equal(state.score.points, startScore + 2 * BOSS.phaseBonus);
});

test('the boss pays the same total however its damage is split', () => {
  for (const chunk of [1, 37, 199.5, 250, 450, BOSS.maxHp]) {
    const state = bossFight();
    const startScore = state.score.points;
    while (state.boss.mode === 'fight') damageBoss(state, chunk);
    const events = drainEvents(state);
    assert.deepEqual(phaseEvents(events), [2, 3], `chunks of ${chunk}`);
    assert.equal(events.filter((event) => event.type === 'bossDefeated').length, 1, `chunks of ${chunk}`);
    assert.equal(state.score.points - startScore, 2 * BOSS.phaseBonus + BOSS.score, `chunks of ${chunk}`);
  }
});

test('the fighting boss keeps its hull below the HUD band in every phase', () => {
  const state = bossFight();
  let highest = Infinity;
  for (const nextHp of [...BOSS.phaseHp, null]) {
    for (let i = 0; i < 900; i += 1) {
      step(state, {});
      highest = Math.min(highest, state.boss.box.minY);
    }
    if (nextHp !== null) damageBoss(state, state.boss.hp - nextHp);
  }
  assert.equal(state.boss.phase, 3);
  assert.ok(highest >= HUD_BAND, `the hull rose to y = ${highest.toFixed(1)}`);
});

test('destroying the boss plays its death, pays its score and ends the game in victory', () => {
  const state = bossFight();
  damageBoss(state, BOSS.maxHp);
  const defeated = drainEvents(state).find((event) => event.type === 'bossDefeated');
  assert.ok(defeated);
  assert.equal(defeated.points, BOSS.score);
  assert.equal(state.boss.mode, 'dying');
  assert.equal(damageBoss(state, 10), false, 'no damage while dying');
  for (let i = 0; i < BOSS.dyingSteps; i += 1) step(state, {});
  assert.deepEqual([state.boss.active, state.boss.mode], [false, 'dead']);
  const events = [];
  for (let i = 0; i < ENDING_DELAY + 1; i += 1) {
    step(state, {});
    events.push(...drainEvents(state));
  }
  assert.equal(state.status, 'victory');
  const victory = events.find((event) => event.type === 'victory');
  assert.deepEqual(victory, { type: 'victory', score: state.score.points, highScore: state.score.points, newHighScore: true });
});

test('a real fight: bullets wear the boss down and every phase change lands on its threshold', () => {
  const state = bossFight(21);
  Object.assign(state.player.weapon, { type: 'rapid', level: 3 });
  const phases = [];
  let defeated = 0;
  for (let i = 0; i < 20000 && state.status === 'playing'; i += 1) {
    const before = state.boss.hp;
    step(state, { target: { x: state.boss.x, y: PLAYER.startY }, fire: true });
    const after = state.boss.hp;
    assert.equal(state.boss.phase, bossPhaseFor(after));
    for (const event of drainEvents(state)) {
      if (event.type === 'bossDefeated') defeated += 1;
      if (event.type !== 'bossPhase') continue;
      const threshold = BOSS.phaseHp[event.phase - 2];
      assert.ok(before > threshold && after <= threshold, `phase ${event.phase}: ${before} -> ${after}`);
      phases.push(event.phase);
    }
  }
  assert.deepEqual(phases, [2, 3]);
  assert.equal(defeated, 1);
  assert.equal(state.status, 'victory');
  assert.equal(state.boss.hp, 0);
});
