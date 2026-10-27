import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acquire, createPool, forEachActive, release, resetPool } from '../src/pool.js';
import { createRng, random } from '../src/rng.js';

const makePool = (capacity) => createPool(capacity, () => ({ value: 0 }));

function assertConsistent(pool) {
  const active = pool.items.filter((item) => item.active).length;
  assert.equal(pool.active, active, 'active count matches the active flags');
  assert.equal(pool.free.length + pool.active, pool.items.length, 'every slot is either free or active');
  assert.equal(new Set(pool.free).size, pool.free.length, 'no slot is free twice');
}

test('acquire hands out the lowest free slot first and never grows the pool', () => {
  const pool = makePool(3);
  const items = [acquire(pool), acquire(pool), acquire(pool)];
  assert.deepEqual(items.map((item) => item.slot), [0, 1, 2]);
  assert.ok(items.every((item) => item.active));
  assert.equal(acquire(pool), null);
  assert.equal(pool.items.length, 3);
  assert.equal(pool.active, 3);
});

test('release recycles items and ignores double releases', () => {
  const pool = makePool(3);
  const [, middle] = [acquire(pool), acquire(pool), acquire(pool)];
  assert.equal(release(pool, middle), true);
  assert.equal(release(pool, middle), false);
  assert.equal(pool.active, 2);
  assert.equal(acquire(pool), middle);
  assertConsistent(pool);
});

test('forEachActive visits active items in slot order and tolerates releases during the visit', () => {
  const pool = makePool(5);
  for (let i = 0; i < 5; i += 1) acquire(pool).value = i;
  release(pool, pool.items[1]);
  const visited = [];
  forEachActive(pool, (item) => {
    visited.push(item.value);
    release(pool, item);
  });
  assert.deepEqual(visited, [0, 2, 3, 4]);
  assert.equal(pool.active, 0);
  assertConsistent(pool);
});

test('pools never leak: heavy random churn stays consistent and a reset returns to 0', () => {
  const pool = makePool(64);
  const fresh = JSON.stringify(makePool(64));
  const rng = createRng(2024);
  for (let i = 0; i < 20000; i += 1) {
    if (random(rng) < 0.55) acquire(pool);
    else release(pool, pool.items[Math.floor(random(rng) * 64)]);
    if (i % 97 === 0) assertConsistent(pool);
  }
  assert.ok(pool.active > 0);
  resetPool(pool);
  assert.equal(pool.active, 0);
  assertConsistent(pool);
  for (const item of pool.items) item.value = 0;
  assert.equal(JSON.stringify(pool), fresh, 'a reset pool hands out slots in the same order as a fresh one');
});
