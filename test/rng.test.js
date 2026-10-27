import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chance, createRng, pick, random, randomInt, randomRange } from '../src/rng.js';

const draw = (rng, count) => Array.from({ length: count }, () => random(rng));

test('the same seed replays the same sequence; another seed does not', () => {
  assert.deepEqual(draw(createRng(42), 200), draw(createRng(42), 200));
  assert.notDeepEqual(draw(createRng(42), 200), draw(createRng(43), 200));
});

test('the generator is pinned (mulberry32), so recorded games stay valid', () => {
  assert.deepEqual(draw(createRng(1), 3), [0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
});

test('random() stays in [0, 1) and its state survives a JSON round trip', () => {
  const rng = createRng(7);
  for (let i = 0; i < 10000; i += 1) {
    const value = random(rng);
    assert.ok(value >= 0 && value < 1);
  }
  const copy = JSON.parse(JSON.stringify(rng));
  assert.deepEqual(draw(copy, 20), draw(rng, 20));
});

test('seeds are reduced to 32 bits and invalid seeds become 0', () => {
  assert.deepEqual(createRng(2 ** 32 + 5), { s: 5 });
  assert.deepEqual(createRng(-1), { s: 4294967295 });
  assert.deepEqual(createRng(Number.NaN), { s: 0 });
  assert.deepEqual(createRng(undefined), { s: 0 });
});

test('randomInt covers both ends of its range; randomRange stays inside its range', () => {
  const rng = createRng(99);
  const seen = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const whole = randomInt(rng, 1, 4);
    assert.ok(Number.isInteger(whole) && whole >= 1 && whole <= 4);
    seen.add(whole);
    const real = randomRange(rng, -3, 5);
    assert.ok(real >= -3 && real < 5);
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4]);
});

test('chance() follows its probability and pick() reaches every item', () => {
  const rng = createRng(5);
  let hits = 0;
  for (let i = 0; i < 10000; i += 1) if (chance(rng, 0.25)) hits += 1;
  assert.ok(hits > 2300 && hits < 2700, `hits ${hits}`);
  assert.equal(chance(rng, 0), false);
  assert.equal(chance(rng, 1), true);
  const items = ['a', 'b', 'c'];
  const picked = new Set(Array.from({ length: 200 }, () => pick(rng, items)));
  assert.deepEqual([...picked].sort(), items);
});
