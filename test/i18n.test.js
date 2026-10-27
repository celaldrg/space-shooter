import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, STRINGS, formatNumber, normalizeLanguage, otherLanguage, translate } from '../src/i18n.js';

function placeholders(text) {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

test('English and Turkish have the same keys, no empty strings and the same placeholders', () => {
  const keys = Object.keys(STRINGS.en).sort();
  assert.deepEqual(LANGUAGES, ['en', 'tr']);
  assert.deepEqual(Object.keys(STRINGS.tr).sort(), keys);
  for (const key of keys) {
    for (const lang of LANGUAGES) assert.ok(STRINGS[lang][key].trim().length > 0, `${lang}: ${key}`);
    assert.deepEqual(placeholders(STRINGS.tr[key]), placeholders(STRINGS.en[key]), key);
  }
});

test('translate fills placeholders in the chosen language', () => {
  assert.equal(translate('en', 'hud.wave', { wave: 3, total: 10 }), 'Wave 3/10');
  assert.equal(translate('tr', 'hud.wave', { wave: 3, total: 10 }), 'Dalga 3/10');
  assert.equal(translate('en', 'end.stats', { wave: 4, kills: 27 }), 'Wave 4 · Kills: 27');
  assert.equal(translate('en', 'hud.wave', { wave: 2 }), 'Wave 2/{total}');
});

test('English counts read right for one item too (no "1 kills")', () => {
  for (const [key, text] of Object.entries(STRINGS.en)) assert.doesNotMatch(text, /\{\w+\} [a-z]+s\b/, key);
  assert.equal(translate('en', 'end.stats', { wave: 8, kills: 1 }), 'Wave 8 · Kills: 1');
  assert.equal(translate('en', 'end.bossStats', { kills: 1 }), 'Boss stage · Kills: 1');
  assert.equal(translate('en', 'hud.lives', { count: 1 }), 'Ships left: 1');
});

test('translate falls back to English for unknown languages and to the key for unknown keys', () => {
  assert.equal(translate('de', 'end.again'), STRINGS.en['end.again']);
  assert.equal(translate(undefined, 'pause.title'), STRINGS.en['pause.title']);
  assert.equal(translate('tr', 'no.such.key'), 'no.such.key');
});

test('language helpers accept only the supported codes and toggle between them', () => {
  assert.equal(normalizeLanguage('tr'), 'tr');
  assert.equal(normalizeLanguage('en'), 'en');
  for (const value of ['TR', 'de', '', null, undefined, 42]) assert.equal(normalizeLanguage(value), 'en');
  assert.equal(otherLanguage('en'), 'tr');
  assert.equal(otherLanguage('tr'), 'en');
  assert.equal(otherLanguage('xx'), 'tr');
});

test('numbers use the digit grouping of the language', () => {
  assert.equal(formatNumber('en', 12650), '12,650');
  assert.equal(formatNumber('tr', 12650), '12.650');
  assert.equal(formatNumber('en', 48249.6), '48,250');
  assert.equal(formatNumber('en', 0), '0');
});
