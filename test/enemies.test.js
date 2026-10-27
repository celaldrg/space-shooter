import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY_TYPES, SPAWN_Y, spawnEnemy, updateEnemies } from '../src/enemies.js';
import { killEnemy } from '../src/combat.js';
import { angleTo } from '../src/math.js';
import { STEP, WIDTH } from '../src/constants.js';
import { createGame, startGame } from '../src/game.js';

/** A running game whose director never starts a wave, so tests place enemies by hand. */
function sandbox(seed = 9) {
  const state = startGame(createGame({ seed }));
  state.director.timer = 1e9;
  return state;
}

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} vs ${expected}`);

test('spawned enemies get their type stats, a unique id and the scripted position', () => {
  const state = sandbox();
  const a = spawnEnemy(state, { type: 'turret', x: 90 });
  const b = spawnEnemy(state, { type: 'splitter', x: 200, y: 50, params: { hp: 9 }, drop: 'beam' });
  assert.deepEqual([a.type, a.r, a.hp, a.y, a.source, a.drop], ['turret', ENEMY_TYPES.turret.radius, ENEMY_TYPES.turret.hp, SPAWN_Y, 'wave', null]);
  assert.deepEqual([b.hp, b.maxHp, b.y, b.drop], [9, 9, 50, 'beam']);
  assert.notEqual(a.id, b.id);
});

test('weavers sink steadily while weaving a sine wave around their column', () => {
  const state = sandbox();
  const weaver = spawnEnemy(state, { type: 'weaver', x: 180, params: { amp: 50, freq: 0.5, vy: 80 } });
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < 120; i += 1) {
    updateEnemies(state);
    minX = Math.min(minX, weaver.x);
    maxX = Math.max(maxX, weaver.x);
  }
  near(weaver.y, SPAWN_Y + 120 * 80 * STEP, 'y');
  assert.ok(maxX > 229.9 && maxX <= 230 + 1e-9, `max x ${maxX}`);
  assert.ok(minX < 130.1 && minX >= 130 - 1e-9, `min x ${minX}`);
});

test('divers glide to their hover height, wait, then dive straight at the ship', () => {
  const state = sandbox();
  const diver = spawnEnemy(state, { type: 'diver', x: 90, params: { hoverY: 150, hold: 0.5, speed: 330 } });
  for (let i = 0; i < 600 && diver.mode === 'enter'; i += 1) updateEnemies(state);
  assert.deepEqual([diver.mode, diver.y], ['hover', 150]);
  for (let i = 0; i < 29; i += 1) updateEnemies(state);
  assert.equal(diver.mode, 'hover');
  updateEnemies(state);
  assert.equal(diver.mode, 'dive');
  near(Math.hypot(diver.vx, diver.vy), 330, 'dive speed');
  near(Math.atan2(diver.vy, diver.vx), angleTo(diver.x, diver.y, state.player.x, state.player.y), 'dive heading');
});

test('turrets settle, swing their barrel to the ship, fire bursts, then leave', () => {
  const state = sandbox();
  const params = { stopY: 110, stay: 3, fireEvery: 1, burst: 3, bulletSpeed: 170 };
  const turret = spawnEnemy(state, { type: 'turret', x: 90, params });
  for (let i = 0; i < 600 && turret.mode === 'enter'; i += 1) updateEnemies(state);
  assert.deepEqual([turret.mode, turret.y], ['aim', 110]);
  for (let i = 0; i < 180; i += 1) updateEnemies(state);
  assert.equal(turret.mode, 'leave');
  assert.equal(state.enemyBullets.active, 9, 'three bursts of three needles');
  assert.ok(state.enemyBullets.items.filter((bullet) => bullet.active).every((bullet) => bullet.kind === 'needle'));
  near(turret.angle, angleTo(turret.x, turret.y, state.player.x, state.player.y), 'barrel aim');
  const y = turret.y;
  updateEnemies(state);
  assert.ok(turret.y > y);
});

test('splitters bounce off the side walls and break into two shards', () => {
  const state = sandbox();
  const rock = spawnEnemy(state, { type: 'splitter', x: WIDTH - 20, y: 100, params: { vx: 120, vy: 30 } });
  for (let i = 0; i < 3; i += 1) updateEnemies(state);
  assert.equal(rock.x <= WIDTH - rock.r, true);
  assert.ok(rock.vx < 0, 'bounced off the right wall');
  killEnemy(state, rock);
  const shards = state.enemies.items.filter((enemy) => enemy.active);
  assert.deepEqual(shards.map((shard) => [shard.type, shard.source, shard.vx, shard.vy]), [
    ['shard', 'split', -70, 45],
    ['shard', 'split', 70, 45],
  ]);
});

test('enemies that leave the field are recycled', () => {
  const state = sandbox();
  spawnEnemy(state, { type: 'weaver', x: 180, y: 600, params: { vy: 300 } });
  spawnEnemy(state, { type: 'shard', x: WIDTH / 2, y: 650, params: { vx: 0, vy: 50 } });
  for (let i = 0; i < 30; i += 1) updateEnemies(state);
  assert.equal(state.enemies.active, 0);
});
