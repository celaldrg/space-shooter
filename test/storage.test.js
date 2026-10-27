import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HIGH_SCORE_KEY,
  loadHighScore,
  readNumber,
  readString,
  saveHighScore,
  writeNumber,
  writeString,
} from '../src/storage.js';

function memoryStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

const brokenStore = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
};

/** Runs `body` with globalThis.localStorage replaced by `descriptor`, then restores it. */
function withGlobalStorage(descriptor, body) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, ...descriptor });
  try {
    body();
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
}

test('the high score round-trips and only ever goes up', () => {
  const store = memoryStore();
  assert.equal(loadHighScore(store), 0);
  assert.equal(saveHighScore(1200, store), 1200);
  assert.equal(loadHighScore(store), 1200);
  assert.equal(saveHighScore(800, store), 1200);
  assert.equal(store.data.get(HIGH_SCORE_KEY), '1200');
  assert.equal(saveHighScore(1500.7, store), 1500);
  assert.equal(loadHighScore(store), 1500);
});

test('strings and numbers round-trip with fallbacks for missing keys', () => {
  const store = memoryStore();
  assert.equal(readString('missing', 'fallback', store), 'fallback');
  assert.equal(writeString('name', 'pilot', store), true);
  assert.equal(readString('name', null, store), 'pilot');
  assert.equal(writeNumber('volume', 0.5, store), true);
  assert.equal(readNumber('volume', 1, store), 0.5);
  assert.equal(writeNumber('volume', Number.NaN, store), false);
  assert.equal(readNumber('volume', 1, store), 0.5);
});

test('garbage stored values fall back instead of breaking the game', () => {
  for (const raw of ['abc', '', '   ', 'Infinity', 'NaN', '-50']) {
    assert.equal(loadHighScore(memoryStore({ [HIGH_SCORE_KEY]: raw })), 0, JSON.stringify(raw));
  }
  assert.equal(loadHighScore(memoryStore({ [HIGH_SCORE_KEY]: '12.9' })), 12);
  assert.equal(readNumber('n', 5, memoryStore({ n: '1e3' })), 1000);
});

test('a throwing store (private mode, full quota) never crashes', () => {
  assert.equal(readString('k', 'fallback', brokenStore), 'fallback');
  assert.equal(writeString('k', 'v', brokenStore), false);
  assert.equal(loadHighScore(brokenStore), 0);
  assert.equal(saveHighScore(500, brokenStore), 500);
});

test('missing storage is harmless', () => {
  assert.equal(readString('k', 'fallback', null), 'fallback');
  assert.equal(writeString('k', 'v', null), false);
  assert.equal(loadHighScore(null), 0);
  assert.equal(saveHighScore(10, null), 10);
});

test('without an explicit store the helper uses localStorage, and survives it throwing', () => {
  const store = memoryStore();
  withGlobalStorage({ value: store, writable: true }, () => {
    assert.equal(saveHighScore(4200), 4200);
    assert.equal(loadHighScore(), 4200);
  });
  assert.equal(store.data.get(HIGH_SCORE_KEY), '4200');
  withGlobalStorage({ get() { throw new Error('SecurityError'); } }, () => {
    assert.equal(loadHighScore(), 0);
    assert.equal(saveHighScore(7), 7);
    assert.equal(writeString('k', 'v'), false);
  });
});
