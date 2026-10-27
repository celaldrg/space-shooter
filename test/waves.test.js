import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTERLUDE_STEPS, INTRO_STEPS, SCHEDULE, WAVES, expandWave } from '../src/waves.js';
import { ENEMY_TYPES } from '../src/enemies.js';
import { PICKUP_KINDS } from '../src/pickups.js';
import { WIDTH } from '../src/constants.js';
import { createGame, drainEvents, startGame, step } from '../src/game.js';

test('expandWave turns spawn groups into single spawns ordered by step', () => {
  const wave = {
    spawns: [
      { at: 1, type: 'diver', x: 0.25, count: 3, every: 0.5, dx: 0.25, drop: 'shield' },
      { at: 0.5, type: 'turret', x: 0.5, params: { stopY: 90 } },
    ],
  };
  assert.deepEqual(expandWave(wave), [
    { step: 30, type: 'turret', x: 180, params: { stopY: 90 }, drop: null },
    { step: 60, type: 'diver', x: 90, params: {}, drop: null },
    { step: 90, type: 'diver', x: 180, params: {}, drop: null },
    { step: 120, type: 'diver', x: 270, params: {}, drop: 'shield' },
  ]);
});

test('there are ten waves of known enemies, each on screen, in order, with one guaranteed drop', () => {
  assert.equal(WAVES.length, 10);
  assert.equal(SCHEDULE.length, 10);
  for (const schedule of SCHEDULE) {
    assert.ok(schedule.length >= 10);
    schedule.forEach((entry, i) => {
      assert.ok(ENEMY_TYPES[entry.type], entry.type);
      assert.ok(entry.x >= 0.1 * WIDTH - 1e-9 && entry.x <= 0.9 * WIDTH + 1e-9, `x ${entry.x}`);
      if (i > 0) assert.ok(entry.step >= schedule[i - 1].step);
    });
    const drops = schedule.filter((entry) => entry.drop);
    assert.equal(drops.length, 1);
    assert.ok(PICKUP_KINDS.includes(drops[0].drop));
  }
});

test('wave 1 opens with five weavers 0.45 s apart in the left third', () => {
  const opening = SCHEDULE[0].slice(0, 5);
  assert.deepEqual(opening.map((entry) => entry.step), [30, 57, 84, 111, 138]);
  assert.ok(opening.every((entry) => entry.type === 'weaver' && Math.abs(entry.x - 108) < 1e-9));
});

test('wave 3 script: turrets, weaver line, divers, a shielded burst turret, then two weaver columns', () => {
  const summary = SCHEDULE[2].map((entry) => `${entry.step}:${entry.type}`);
  assert.deepEqual(summary, [
    '30:turret', '30:turret',
    '120:weaver', '141:weaver', '162:weaver', '183:weaver', '204:weaver', '225:weaver',
    '330:diver', '360:diver', '390:diver', '420:diver',
    '510:turret',
    '600:weaver', '600:weaver', '624:weaver', '624:weaver', '648:weaver', '648:weaver', '672:weaver', '672:weaver',
  ]);
  assert.deepEqual(SCHEDULE[2].slice(0, 2).map((entry) => entry.x), [90, 270]);
  const shielded = SCHEDULE[2][12];
  assert.deepEqual([shielded.drop, shielded.params.burst], ['shield', 3]);
});

test('the director spawns every scripted enemy at its scripted step, through all ten waves', () => {
  const state = startGame(createGame({ seed: 4, lives: 1e6 }));
  const starts = [];
  const clears = [];
  const spawned = WAVES.map(() => []);
  for (let i = 0; i < 40000 && state.director.phase !== 'boss'; i += 1) {
    step(state, {});
    for (const event of drainEvents(state)) {
      if (event.type === 'waveStart') starts.push(state.tick);
      if (event.type === 'waveClear') clears.push(state.tick);
      if (event.type === 'spawn') {
        spawned[event.wave - 1].push([state.tick - starts[event.wave - 1], event.enemy, event.x]);
      }
    }
  }
  assert.equal(state.director.phase, 'boss', 'the boss stage was reached');
  assert.equal(starts.length, WAVES.length + 1);
  assert.equal(clears.length, WAVES.length);
  assert.equal(starts[0], INTRO_STEPS);
  for (let wave = 1; wave <= WAVES.length; wave += 1) {
    assert.equal(starts[wave], clears[wave - 1] + INTERLUDE_STEPS, `pause before stage ${wave + 1}`);
  }
  spawned.forEach((log, wave) => {
    const expected = SCHEDULE[wave].map((entry) => [entry.step, entry.type, entry.x]);
    assert.deepEqual(log, expected, `wave ${wave + 1}`);
  });
});

test('a wave ends only after its last spawn and once the field is clear', () => {
  const state = startGame(createGame({ seed: 8, lives: 1e6 }));
  let cleared = false;
  for (let i = 0; i < 20000 && !cleared; i += 1) {
    step(state, {});
    cleared = drainEvents(state).some((event) => event.type === 'waveClear');
    if (cleared) {
      assert.equal(state.enemies.active, 0);
      assert.ok(state.tick - INTRO_STEPS > SCHEDULE[0].at(-1).step);
    }
  }
  assert.ok(cleared);
  assert.deepEqual([state.director.phase, state.director.wave], ['interlude', 1]);
});
