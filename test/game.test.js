import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEIGHT, MAX_CATCH_UP_STEPS, POOL_SIZES, STEP, WIDTH } from '../src/constants.js';
import { circlesOverlap } from '../src/collision.js';
import { ENEMY_TYPES, MIN_ENEMY_RADIUS, spawnEnemy } from '../src/enemies.js';
import { MAX_BULLET_SPEED, WEAPONS, createWeapon, downgradeWeapon, upgradeWeapon } from '../src/weapons.js';
import { spawnEnemyBullet, spawnPlayerBullet } from '../src/projectiles.js';
import { PICKUP_BONUS, hitPlayer } from '../src/combat.js';
import { spawnPickup } from '../src/pickups.js';
import { PLAYER, dragTarget, normalizeInput } from '../src/player.js';
import { ENDING_DELAY } from '../src/ending.js';
import { MAX_EVENTS, emit } from '../src/events.js';
import { jumpToWave } from '../src/director.js';
import { WAVES } from '../src/waves.js';
import { createDemoGame } from '../src/demo.js';
import { loadHighScore, saveHighScore } from '../src/storage.js';
import {
  advance,
  createGame,
  drainEvents,
  hudInfo,
  resetGame,
  setPaused,
  startGame,
  step,
  togglePause,
} from '../src/game.js';

const POOLS = ['bullets', 'enemyBullets', 'enemies', 'pickups', 'particles'];

/** A running game whose director never starts a wave, so tests place everything by hand. */
function sandbox(seed = 1, options = {}) {
  const state = startGame(createGame({ seed, ...options }));
  state.director.timer = 1e9;
  return state;
}

/** Varied but fully scripted input: stick steering, touch-style targets and fire patterns. */
function scriptedInput(i) {
  switch (Math.floor(i / 240) % 4) {
    case 0:
      return { x: Math.sin(i / 37), y: Math.cos(i / 53) * 0.5, fire: true };
    case 1:
      return { target: { x: 180 + 120 * Math.sin(i / 45), y: 520 + 60 * Math.cos(i / 70) }, fire: i % 90 < 70 };
    case 2:
      return { x: -1, y: 0.3, fire: true };
    default:
      return { x: 1, y: -1, fire: i % 2 === 0 };
  }
}

function play(seed, steps, visit) {
  const state = startGame(createGame({ seed, lives: 99 }));
  for (let i = 0; i < steps; i += 1) {
    step(state, scriptedInput(i));
    if (i % 5 === 0) drainEvents(state);
    visit?.(state, i);
  }
  return state;
}

/** JSON of the state without the stale data that inactive pool items keep. */
function liveJson(state) {
  return JSON.stringify(state, (key, value) => (value?.active === false && 'slot' in value ? undefined : value));
}

function countShots(state, steps) {
  const shotTicks = [];
  for (let i = 0; i < steps; i += 1) {
    step(state, { fire: true });
    if (drainEvents(state).some((event) => event.type === 'shoot')) shotTicks.push(state.tick);
  }
  return shotTicks;
}

test('determinism: the same seed and inputs give an identical state after 10,000 steps', () => {
  const a = play(2026, 10000);
  const b = play(2026, 10000);
  assert.equal(a.tick, 10000);
  assert.equal(a.status, 'playing');
  assert.ok(a.stats.kills > 30, `kills ${a.stats.kills}`);
  assert.ok(a.director.wave >= 4, `wave ${a.director.wave}`);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const other = play(2027, 10000);
  assert.notEqual(JSON.stringify(other), JSON.stringify(a), 'another seed plays out differently');
});

test('determinism: the frame rate does not change the simulation', () => {
  const runs = [30, 60, 144, 240].map((hz) => {
    const state = startGame(createGame({ seed: 5 }));
    for (let frame = 0; frame < hz * 3; frame += 1) advance(state, 1 / hz, { x: 0.5, fire: true });
    return state;
  });
  assert.equal(runs[0].tick, 180);
  for (const run of runs) assert.equal(JSON.stringify(run), JSON.stringify(runs[0]));
});

test('bullets never tunnel: every bullet fired at the smallest enemy at maximum speed hits it', () => {
  const bulletRadius = WEAPONS.rapid.radius;
  const reach = MIN_ENEMY_RADIUS + bulletRadius;
  const perStep = MAX_BULLET_SPEED * STEP;
  assert.equal(MIN_ENEMY_RADIUS, ENEMY_TYPES.shard.radius);
  let trials = 0;
  let discreteMisses = 0;
  let misses = 0;
  for (let offset = 0; offset < reach; offset += 0.25) {
    for (let gap = 40; gap < 40 + perStep; gap += 1) {
      trials += 1;
      if (!discreteHit(offset, gap, perStep, bulletRadius)) discreteMisses += 1;
      if (!shootAt({ offset, gap, speed: MAX_BULLET_SPEED, radius: bulletRadius })) misses += 1;
    }
  }
  assert.ok(discreteMisses > 0, 'checking only end-of-step positions would let some bullets through');
  assert.equal(misses, 0, `${misses} of ${trials} bullets tunnelled`);
});

test('bullets never tunnel: faster bullets and enemies rushing at them still connect', () => {
  const radius = WEAPONS.rapid.radius;
  const reach = MIN_ENEMY_RADIUS + radius;
  let misses = 0;
  for (let offset = 0; offset < reach; offset += 0.5) {
    for (let gap = 40; gap < 100; gap += 3) {
      if (!shootAt({ offset, gap, speed: MAX_BULLET_SPEED * 4, radius })) misses += 1;
      if (!shootAt({ offset, gap, speed: MAX_BULLET_SPEED, radius, enemyVy: 900 })) misses += 1;
    }
  }
  assert.equal(misses, 0);
});

test('a bullet hits the first enemy on its path, even when it crosses two in one step', () => {
  const state = sandbox();
  const far = spawnEnemy(state, { type: 'shard', x: 180, y: 270, params: { vx: 0, vy: 0, hp: 5 } });
  const near = spawnEnemy(state, { type: 'shard', x: 180, y: 300, params: { vx: 0, vy: 0, hp: 5 } });
  spawnPlayerBullet(state, { kind: 'rapid', x: 180, y: 380, vx: 0, vy: -6000, r: 2.5, damage: 1 });
  step(state, {});
  assert.deepEqual([near.hp, far.hp, state.bullets.active], [4, 5, 0]);
});

test('a bullet at four times the top speed cannot skip the boss hull', () => {
  const state = sandbox();
  jumpToWave(state, WAVES.length);
  state.player.invuln = 1e9;
  while (state.boss.mode !== 'fight') step(state, {});
  drainEvents(state);
  const { boss } = state;
  spawnPlayerBullet(state, { kind: 'rapid', x: boss.x, y: boss.box.maxY + 90, vx: 0, vy: -MAX_BULLET_SPEED * 4, r: 2.5, damage: 1 });
  step(state, {});
  step(state, {});
  assert.equal(boss.hp, 599);
  assert.ok(drainEvents(state).some((event) => event.type === 'hit' && event.boss));
});

test('pools never leak: counts stay consistent in play and a reset returns every pool to 0', () => {
  const state = play(77, 3000, (current, i) => {
    if (i % 50 !== 0) return;
    for (const name of POOLS) {
      const pool = current[name];
      assert.equal(pool.active, pool.items.filter((item) => item.active).length, name);
      assert.equal(pool.free.length + pool.active, POOL_SIZES[name], name);
    }
  });
  assert.ok(state.bullets.active > 0 && state.particles.active > 0 && state.enemies.active > 0);
  resetGame(state, 77);
  for (const name of POOLS) {
    assert.equal(state[name].active, 0, name);
    assert.ok(state[name].items.every((item) => !item.active), name);
  }
  assert.equal(liveJson(state), liveJson(createGame({ seed: 77, lives: 99 })), 'a reset game equals a fresh one');
});

test('pools never leak: starting a new game after a game over empties every pool', () => {
  const state = startGame(createGame({ seed: 12, lives: 1 }));
  for (let i = 0; i < 20000 && state.status === 'playing'; i += 1) step(state, scriptedInput(i));
  assert.equal(state.status, 'gameover');
  startGame(state);
  for (const name of POOLS) assert.equal(state[name].active, 0, name);
  assert.deepEqual([state.status, state.player.lives, state.score.points, state.tick], ['playing', 1, 0, 0]);
});

test('advance runs whole 60 Hz steps, keeps the remainder and caps the catch-up', () => {
  const state = startGame(createGame());
  assert.equal(advance(state, STEP * 2.5), 2);
  assert.equal(advance(state, STEP * 0.5), 1);
  assert.equal(state.tick, 3);
  assert.equal(advance(state, 10), MAX_CATCH_UP_STEPS);
  assert.equal(advance(state, -1), 0);
  assert.equal(advance(state, Number.NaN), 0);
  assert.equal(state.tick, 3 + MAX_CATCH_UP_STEPS);
});

test('pause freezes the game; only a game in play can be paused', () => {
  const title = createGame();
  assert.equal(setPaused(title, true), false);
  step(title, { fire: true });
  assert.equal(title.tick, 0, 'the title screen does not simulate');
  const state = play(3, 300);
  assert.equal(setPaused(state, true), true);
  const frozen = JSON.stringify(state);
  assert.equal(advance(state, 1, { fire: true }), 0);
  step(state, { x: 1, fire: true });
  assert.equal(JSON.stringify(state), frozen);
  assert.equal(hudInfo(state).paused, true);
  assert.equal(togglePause(state), false);
  assert.equal(advance(state, STEP), 1);
});

test('the ship has inertia and stops at the screen bounds', () => {
  const state = sandbox();
  const { player } = state;
  step(state, { y: -1 });
  assert.equal(player.vy, -PLAYER.maxSpeed * PLAYER.response);
  assert.equal(player.y, PLAYER.startY + player.vy * STEP);
  for (let i = 0; i < 40; i += 1) step(state, { y: -1 });
  assert.ok(player.vy < -PLAYER.maxSpeed * 0.99 && player.vy > -PLAYER.maxSpeed, `vy ${player.vy}`);
  const coasting = player.vy;
  const y = player.y;
  step(state, {});
  assert.ok(Math.abs(player.vy - coasting * (1 - PLAYER.response)) < 1e-9, 'the ship keeps drifting');
  assert.ok(player.y < y);
  for (let i = 0; i < 300; i += 1) step(state, { x: -1, y: -1 });
  assert.deepEqual([player.x, player.y, player.vx, player.vy], [PLAYER.margin, PLAYER.minY, 0, 0]);
  for (let i = 0; i < 300; i += 1) step(state, { x: 1, y: 1 });
  assert.deepEqual([player.x, player.y, player.vx, player.vy], [WIDTH - PLAYER.margin, HEIGHT - PLAYER.margin, 0, 0]);
  let top = 0;
  for (let i = 0; i < 60; i += 1) {
    step(state, { x: -1, y: -1 });
    top = Math.max(top, Math.hypot(player.vx, player.vy));
  }
  assert.ok(top > PLAYER.maxSpeed * 0.95 && top <= PLAYER.maxSpeed + 1e-9, `diagonal top speed ${top}`);
});

test('touch steering follows a target point with capped speed, using relative drags', () => {
  const state = sandbox();
  const { player } = state;
  let top = 0;
  for (let i = 0; i < 120; i += 1) {
    step(state, { target: { x: 60, y: 300 } });
    top = Math.max(top, Math.hypot(player.vx, player.vy));
  }
  assert.ok(Math.hypot(player.x - 60, player.y - 300) < 0.5);
  assert.ok(top <= PLAYER.followMaxSpeed + 1e-9);
  assert.deepEqual(dragTarget({ x: 100, y: 500 }, { x: 50, y: 50 }, { x: 80, y: 20 }), { x: 130, y: 470 });
  assert.deepEqual(dragTarget({ x: 100, y: 500 }, { x: 0, y: 0 }, { x: -500, y: 900 }), { x: PLAYER.margin, y: HEIGHT - PLAYER.margin });
  assert.deepEqual(normalizeInput({ x: 5, y: -3, fire: 1, target: { x: Number.NaN, y: 2 } }), { x: 1, y: -1, fire: true, target: null });
  assert.deepEqual(normalizeInput(undefined), { x: 0, y: 0, fire: false, target: null });
});

test('weapon fire rates: each weapon fires at once, then once per cooldown, with its volley size', () => {
  const cases = [['blaster', 1, 1], ['spread', 1, 3], ['spread', 2, 5], ['spread', 3, 7], ['rapid', 1, 1], ['rapid', 2, 2], ['rapid', 3, 3]];
  for (const [type, level, volley] of cases) {
    const state = sandbox();
    Object.assign(state.player.weapon, { type, level });
    const ticks = countShots(state, 60);
    const { cooldown } = WEAPONS[type];
    assert.deepEqual(ticks, Array.from({ length: Math.ceil(60 / cooldown) }, (_, i) => 1 + i * cooldown), type);
    const state2 = sandbox();
    Object.assign(state2.player.weapon, { type, level });
    step(state2, { fire: true });
    assert.equal(state2.bullets.active, volley, `${type} level ${level}`);
  }
});

test('the spread fans out symmetrically and every bullet flies at the weapon speed', () => {
  const state = sandbox();
  Object.assign(state.player.weapon, { type: 'spread', level: 3 });
  step(state, { fire: true });
  const bullets = state.bullets.items.filter((bullet) => bullet.active);
  assert.equal(bullets.length, 7);
  assert.ok(Math.abs(bullets.reduce((sum, bullet) => sum + bullet.vx, 0)) < 1e-9);
  assert.ok(bullets.every((bullet) => Math.abs(Math.hypot(bullet.vx, bullet.vy) - WEAPONS.spread.speed) < 1e-9 && bullet.vy < 0));
});

test('pickups switch and upgrade weapons, losing a life downgrades them', () => {
  const weapon = createWeapon();
  const trail = [];
  for (const kind of ['spread', 'spread', 'spread', 'spread', 'rapid']) {
    upgradeWeapon(weapon, kind);
    trail.push(`${weapon.type}${weapon.level}`);
  }
  for (let i = 0; i < 4; i += 1) {
    downgradeWeapon(weapon);
    trail.push(`${weapon.type}${weapon.level}`);
  }
  assert.deepEqual(trail, ['spread1', 'spread2', 'spread3', 'spread3', 'rapid3', 'rapid2', 'rapid1', 'blaster1', 'blaster1']);
});

test('flying into a pickup applies it and pays a bonus; shields stack up to the maximum', () => {
  const state = sandbox();
  const { player } = state;
  spawnPickup(state, 'beam', player.x, player.y - 10);
  for (let i = 0; i < 5; i += 1) spawnPickup(state, 'shield', player.x, player.y - 12);
  step(state, {});
  assert.deepEqual([player.weapon.type, player.weapon.level, player.shield], ['beam', 1, PLAYER.maxShield]);
  assert.equal(state.score.points, 6 * PICKUP_BONUS);
  assert.equal(drainEvents(state).filter((event) => event.type === 'pickup').length, 6);
});

test('the beam burns only the lowest target in its column', () => {
  const state = sandbox();
  Object.assign(state.player.weapon, { type: 'beam', level: 1 });
  const target = (x, y) => spawnEnemy(state, { type: 'shard', x, y, params: { vx: 0, vy: 0, hp: 100 } });
  const upper = target(180, 200);
  const lower = target(180, 300);
  const aside = target(180 + 60, 320);
  for (let i = 0; i < 60; i += 1) step(state, { fire: true });
  assert.ok(Math.abs(lower.hp - (100 - WEAPONS.beam.dps[0])) < 1e-9, `lower ${lower.hp}`);
  assert.deepEqual([upper.hp, aside.hp], [100, 100]);
  assert.deepEqual([state.beam.on, state.beam.top, state.beam.bottom], [true, 310, state.player.y - 14]);
  lower.hp = 0.01;
  step(state, { fire: true });
  assert.equal(lower.active, false);
  step(state, { fire: true });
  assert.equal(state.beam.top, 210, 'with the lower target gone the beam reaches the next one');
  assert.ok(upper.hp < 100);
});

test('a shield charge absorbs a hit; after that every hit costs a life', () => {
  const state = sandbox();
  const { player } = state;
  player.shield = 1;
  Object.assign(player.weapon, { type: 'rapid', level: 2 });
  spawnEnemyBullet(state, player.x, player.y - 60, Math.PI / 2, 600);
  for (let i = 0; i < 10; i += 1) step(state, {});
  assert.deepEqual([player.shield, player.lives, state.enemyBullets.active], [0, 3, 0]);
  assert.ok(drainEvents(state).some((event) => event.type === 'shieldHit'));
  assert.equal(hitPlayer(state), false, 'briefly invulnerable after the shield breaks');
  player.invuln = 0;
  assert.equal(hitPlayer(state), true);
  assert.deepEqual([player.lives, player.alive, player.weapon.level], [2, false, 1]);
  assert.ok(drainEvents(state).some((event) => event.type === 'playerHit' && event.lives === 2));
  for (let i = 0; i < PLAYER.respawnSteps; i += 1) step(state, {});
  assert.deepEqual([player.alive, player.x, player.y, player.invuln], [true, PLAYER.startX, PLAYER.startY, PLAYER.invulnSteps]);
  assert.ok(drainEvents(state).some((event) => event.type === 'respawn'));
});

test('losing the last life ends the game, records the high score and freezes play', () => {
  const store = new Map();
  const memory = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  saveHighScore(400, memory);
  const state = sandbox(1, { lives: 1, highScore: loadHighScore(memory) });
  state.score.points = 900;
  hitPlayer(state);
  const events = [];
  for (let i = 0; i < ENDING_DELAY; i += 1) {
    assert.equal(state.status, 'playing');
    step(state, {});
    events.push(...drainEvents(state));
  }
  assert.equal(state.status, 'gameover');
  assert.deepEqual(events.find((event) => event.type === 'gameover'), { type: 'gameover', score: 900, highScore: 900, newHighScore: true });
  assert.equal(saveHighScore(hudInfo(state).highScore, memory), 900);
  assert.equal(loadHighScore(memory), 900);
  const tick = state.tick;
  step(state, { fire: true });
  assert.equal(state.tick, tick, 'the simulation stops after the game is over');
  assert.equal(setPaused(state, true), false);
  startGame(state);
  assert.deepEqual([hudInfo(state).score, hudInfo(state).highScore], [0, 900]);
});

test('hudInfo reports what the HUD needs', () => {
  const state = createGame({ highScore: 300 });
  assert.deepEqual(hudInfo(state), {
    status: 'title',
    paused: false,
    score: 0,
    highScore: 300,
    multiplier: 1,
    lives: PLAYER.lives,
    shield: 0,
    weapon: 'blaster',
    weaponLevel: 1,
    wave: 1,
    waveCount: 10,
    bossStage: false,
    bossHealth: 0,
    bossPhase: 1,
    kills: 0,
  });
  startGame(state);
  state.score.points = 450;
  jumpToWave(state, WAVES.length);
  const hud = hudInfo(state);
  assert.deepEqual([hud.status, hud.highScore, hud.wave, hud.bossStage, hud.bossHealth], ['playing', 450, 10, true, 1]);
});

test('the event queue is capped so an undrained queue cannot grow forever', () => {
  const state = createGame();
  for (let i = 0; i < MAX_EVENTS + 50; i += 1) emit(state, 'shoot', { weapon: 'blaster' });
  assert.equal(drainEvents(state).length, MAX_EVENTS);
  assert.deepEqual(drainEvents(state), []);
});

test('the ?demo state is a busy, repeatable moment of wave 3', () => {
  const demo = createDemoGame();
  assert.equal(JSON.stringify(demo), JSON.stringify(createDemoGame()));
  const hud = hudInfo(demo);
  assert.deepEqual([hud.status, hud.wave, hud.weapon, hud.weaponLevel, hud.lives, hud.shield, hud.multiplier], ['playing', 3, 'spread', 2, 2, 1, 3]);
  const onScreen = (item) => item.active && item.x >= 0 && item.x <= WIDTH && item.y >= 0 && item.y <= HEIGHT;
  assert.ok(demo.enemies.items.filter(onScreen).length >= 8);
  assert.ok(demo.bullets.items.filter(onScreen).length >= 5);
  assert.ok(demo.enemyBullets.items.filter(onScreen).length >= 2);
  assert.ok(demo.particles.items.filter((particle) => particle.active && particle.kind === 'ring').length >= 1);
  assert.deepEqual([demo.player.alive, demo.player.invuln, demo.events.length], [true, 0, 0]);
});

/** Whether checking only the end-of-step positions would ever see the bullet touch the target. */
function discreteHit(offset, gap, perStep, bulletRadius) {
  for (let y = 300 + gap - perStep; y > -20; y -= perStep) {
    if (circlesOverlap(180 + offset, y, bulletRadius, 180, 300, MIN_ENEMY_RADIUS)) return true;
  }
  return false;
}

/** Fires one bullet straight up at a shard in the sandbox; true when the shard was hit. */
function shootAt({ offset, gap, speed, radius, enemyVy = 0 }) {
  const state = sandbox();
  const enemy = spawnEnemy(state, { type: 'shard', x: 180, y: 300, params: { vx: 0, vy: enemyVy, hp: 5 } });
  spawnPlayerBullet(state, { kind: 'rapid', x: 180 + offset, y: 300 + gap, vx: 0, vy: -speed, r: radius, damage: 1 });
  for (let i = 0; i < 120 && state.bullets.active > 0; i += 1) step(state, {});
  return enemy.hp < 5;
}
