import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEIGHT, WIDTH } from '../src/constants.js';
import { FIRE_CODE, commandFor, isHoldKey, stickFromKeys } from '../src/keys.js';
import { MAX_PIXEL_RATIO, backingSize, clientToWorld, fitWorld } from '../src/viewport.js';
import { SIDE_MARGIN, STAR_LAYERS, createStarfield, starPosition } from '../src/starfield.js';
import { SETTING_KEYS, loadSettings, saveSetting } from '../src/settings.js';

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

test('arrows, WASD and Space are held keys; command letters are not', () => {
  for (const code of [FIRE_CODE, 'ArrowLeft', 'ArrowUp', 'KeyA', 'KeyS']) assert.equal(isHoldKey(code), true, code);
  for (const code of ['KeyP', 'KeyF', 'Enter', 'Escape', 'toString']) assert.equal(isHoldKey(code), false, code);
});

test('held keys add up to a stick direction and opposite keys cancel out', () => {
  assert.deepEqual(stickFromKeys([]), { x: 0, y: 0 });
  assert.deepEqual(stickFromKeys(['ArrowLeft', 'KeyA']), { x: -1, y: 0 });
  assert.deepEqual(stickFromKeys(new Set(['KeyW', 'ArrowRight'])), { x: 1, y: -1 });
  assert.deepEqual(stickFromKeys(['ArrowLeft', 'ArrowRight', 'KeyS', FIRE_CODE]), { x: 0, y: 1 });
});

test('command keys work in either case and unknown keys do nothing', () => {
  assert.equal(commandFor({ key: 'p' }), 'pause');
  assert.equal(commandFor({ key: 'P' }), 'pause');
  assert.equal(commandFor({ key: 'Escape' }), 'pause');
  assert.equal(commandFor({ key: 'f' }), 'autoFire');
  assert.equal(commandFor({ key: 'M' }), 'mute');
  assert.equal(commandFor({ key: 'Enter' }), 'start');
  for (const event of [{ key: 'x' }, { key: 'constructor' }, {}, { key: 7 }]) assert.equal(commandFor(event), null);
});

test('the canvas backing store follows the pixel ratio, capped for speed', () => {
  assert.deepEqual(backingSize(300, 500, 1), { width: 300, height: 500, ratio: 1 });
  assert.deepEqual(backingSize(300, 500, 1.5), { width: 450, height: 750, ratio: 1.5 });
  assert.deepEqual(backingSize(300, 500, 3), { width: 300 * MAX_PIXEL_RATIO, height: 500 * MAX_PIXEL_RATIO, ratio: MAX_PIXEL_RATIO });
  assert.deepEqual(backingSize(300, 500, 0.5), { width: 300, height: 500, ratio: 1 });
  assert.deepEqual(backingSize(300, 500, Number.NaN), { width: 300, height: 500, ratio: 1 });
  assert.deepEqual(backingSize(0, 0, 2), { width: 1, height: 1, ratio: 2 });
});

test('the world is fitted whole and centred, and pointer positions map back into it', () => {
  assert.deepEqual(fitWorld(WIDTH, HEIGHT), { scale: 1, offsetX: 0, offsetY: 0 });
  assert.deepEqual(fitWorld(WIDTH * 2 + 100, HEIGHT * 2), { scale: 2, offsetX: 50, offsetY: 0 });
  assert.deepEqual(fitWorld(WIDTH / 2, HEIGHT), { scale: 0.5, offsetX: 0, offsetY: HEIGHT / 4 });
  const rect = { left: 10, top: 20, width: WIDTH / 2, height: HEIGHT / 2 };
  assert.deepEqual(clientToWorld(10, 20, rect), { x: 0, y: 0 });
  assert.deepEqual(clientToWorld(10 + WIDTH / 4, 20 + HEIGHT / 2, rect), { x: WIDTH / 2, y: HEIGHT });
});

test('the starfield is repeatable and fills every layer inside its bounds', () => {
  const stars = createStarfield(7);
  assert.deepEqual(stars, createStarfield(7));
  assert.notDeepEqual(stars, createStarfield(8));
  STAR_LAYERS.forEach((layer, index) => {
    const own = stars.filter((star) => star.layer === index);
    assert.equal(own.length, layer.count);
    for (const star of own) {
      assert.ok(star.x >= -SIDE_MARGIN && star.x <= WIDTH + SIDE_MARGIN);
      assert.ok(star.y >= 0 && star.y < HEIGHT);
      assert.ok(star.size >= layer.size[0] && star.size <= layer.size[1]);
      assert.ok(star.alpha >= layer.alpha[0] && star.alpha <= layer.alpha[1]);
    }
  });
});

test('stars drift down, wrap around and slide further the nearer they are', () => {
  const far = { layer: 0, x: 100, y: 200 };
  const near = { layer: STAR_LAYERS.length - 1, x: 100, y: 200 };
  assert.deepEqual(starPosition(far, 0, 0), { x: 100, y: 200 });
  assert.deepEqual(starPosition(far, -5, 0), { x: 100, y: 200 });
  assert.equal(starPosition(far, 2, 0).y, 200 + STAR_LAYERS[0].speed * 2);
  for (const time of [3, 60, 3600]) {
    const { y } = starPosition(near, time, 0);
    assert.ok(y >= 0 && y < HEIGHT, `time ${time}`);
  }
  const farShift = 100 - starPosition(far, 0, 40).x;
  const nearShift = 100 - starPosition(near, 0, 40).x;
  assert.ok(farShift > 0 && nearShift > farShift);
});

test('settings default to English, sound on and auto-fire off', () => {
  assert.deepEqual(loadSettings(memoryStore()), { language: 'en', muted: false, autoFire: false });
  assert.deepEqual(loadSettings(null), { language: 'en', muted: false, autoFire: false });
  assert.deepEqual(loadSettings(brokenStore), { language: 'en', muted: false, autoFire: false });
  assert.equal(loadSettings(memoryStore({ [SETTING_KEYS.language]: 'de' })).language, 'en');
});

test('settings round-trip through the store', () => {
  const store = memoryStore();
  assert.equal(saveSetting('language', 'tr', store), true);
  assert.equal(saveSetting('muted', true, store), true);
  assert.equal(saveSetting('autoFire', true, store), true);
  assert.deepEqual(loadSettings(store), { language: 'tr', muted: true, autoFire: true });
  assert.equal(store.data.get(SETTING_KEYS.muted), '1');
  saveSetting('muted', false, store);
  assert.equal(loadSettings(store).muted, false);
});

test('unknown settings and failing storage are refused quietly', () => {
  const store = memoryStore();
  assert.equal(saveSetting('volume', 3, store), false);
  assert.equal(store.data.size, 0);
  assert.equal(saveSetting('language', 'tr', brokenStore), false);
  assert.equal(saveSetting('language', 'tr', null), false);
});
