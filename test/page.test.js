import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { STRINGS } from '../src/i18n.js';

const ROOT = new URL('../', import.meta.url);
const SRC = new URL('src/', ROOT);
const html = readFileSync(new URL('index.html', ROOT), 'utf8');
const body = html.slice(html.indexOf('<body'), html.indexOf('</body>'));
const modules = readdirSync(SRC).filter((name) => name.endsWith('.js'));

function source(name) {
  return readFileSync(new URL(name, SRC), 'utf8');
}

/** Elements carrying data-i18n, with the text written between their tags. */
function translatedElements() {
  const found = [];
  for (const match of body.matchAll(/<([a-z0-9]+)\b[^>]*\sdata-i18n="([^"]+)"[^>]*>/g)) {
    const rest = body.slice(match.index + match[0].length);
    found.push({ key: match[2], inner: rest.slice(0, rest.indexOf(`</${match[1]}>`)) });
  }
  return found;
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
}

test('the page head carries the metadata, favicon and module entry point', () => {
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/);
  assert.match(html, /<title>Space Shooter<\/title>/);
  assert.match(html, /<meta name="description" content="[^"]{40,}">/);
  assert.match(html, /<meta property="og:title" content="[^"]+">/);
  assert.match(html, /<meta property="og:description" content="[^"]+">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/celaldrg\.github\.io\/space-shooter\/">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/celaldrg\.github\.io\/space-shooter\/docs\/screenshot\.png">/);
  assert.match(html, /<link rel="icon" href="data:image\/svg\+xml,[^"]+">/);
  assert.match(html, /<script type="module" src="src\/main\.js"><\/script>/);
});

test('every local file the page and the modules refer to exists, and nothing loads from elsewhere', () => {
  const references = [...html.matchAll(/<(\w+)[^>]*\s(?:src|href)="([^"]+)"/g)];
  for (const [, tag, reference] of references) {
    if (/^https?:/.test(reference)) assert.equal(tag, 'a', `only links may point off-site: ${reference}`);
    else if (!reference.startsWith('data:')) assert.ok(existsSync(new URL(reference, ROOT)), reference);
  }
  assert.ok(existsSync(new URL('docs/screenshot.png', ROOT)));
  for (const name of modules) {
    for (const [, path] of source(name).matchAll(/from '([^']+)'/g)) {
      assert.ok(path.startsWith('./') && existsSync(new URL(path, SRC)), `${name} imports ${path}`);
    }
  }
});

test('every module except the entry point loads without a browser', async () => {
  for (const name of modules.filter((file) => file !== 'main.js')) {
    await assert.doesNotReject(import(new URL(name, SRC).href), name);
  }
});

test('shipped code avoids unsafe and noisy calls and touches storage only through the helper', () => {
  const rules = [/\binnerHTML\b/, /\bouterHTML\b/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /\bFunction\s*\(/, /console\.log/, /Math\.random/];
  for (const name of modules) {
    const raw = source(name);
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const rule of rules) assert.doesNotMatch(code, rule, `${name}: ${rule}`);
    assert.doesNotMatch(raw, /https?:\/\//, `${name} must not fetch from the network`);
    if (name !== 'storage.js') assert.doesNotMatch(code, /localStorage|sessionStorage/, name);
  }
});

test('every text in the page comes from the English strings and has a Turkish twin', () => {
  const elements = translatedElements();
  assert.ok(elements.length > 30);
  for (const { key, inner } of elements) {
    assert.ok(Object.hasOwn(STRINGS.tr, key), key);
    assert.equal(inner, STRINGS.en[key], `default text of ${key}`);
  }
  assert.match(html, new RegExp(`<title>${STRINGS.en['app.title']}</title>`));
});

test('labels and tooltips are translated too', () => {
  for (const tag of body.match(/<[a-z][^>]*>/g)) {
    const label = attribute(tag, 'data-i18n-label');
    const title = attribute(tag, 'data-i18n-title');
    assert.equal(attribute(tag, 'aria-label'), label && STRINGS.en[label], tag);
    assert.equal(attribute(tag, 'title'), title && STRINGS.en[title], tag);
    assert.equal(attribute(tag, 'alt'), undefined, tag);
    assert.equal(attribute(tag, 'placeholder'), undefined, tag);
  }
});

test('no visible text in the page bypasses translation', () => {
  const leftover = body
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/(<([a-z0-9]+)\b[^>]*\sdata-i18n="[^"]+"[^>]*>)[^<]*(<\/\2>)/g, '$1$3')
    .replace(/<[^>]+>/g, ' ');
  assert.deepEqual(leftover.split(/\s+/).filter(Boolean), ['·']);
});

test('every string is used, and every key the code asks for exists', () => {
  const used = new Set([...html.matchAll(/data-i18n(?:-label|-title)?="([^"]+)"/g)].map((match) => match[1]));
  for (const name of modules.filter((file) => file !== 'i18n.js')) {
    for (const [, key] of source(name).matchAll(/'([a-z]+\.[a-zA-Z]+)'/g)) {
      assert.ok(Object.hasOwn(STRINGS.en, key), `${name} uses missing key ${key}`);
      used.add(key);
    }
  }
  assert.deepEqual(Object.keys(STRINGS.en).filter((key) => !used.has(key)), []);
});

test('the repository ships its licence, readme, Pages marker and CI workflow', () => {
  const license = readFileSync(new URL('LICENSE', ROOT), 'utf8');
  assert.match(license, /^MIT License/);
  assert.match(license, /Copyright \(c\) 2026 Celalettin Durgaç/);
  const readme = readFileSync(new URL('README.md', ROOT), 'utf8');
  assert.match(readme, /^# Space Shooter - /);
  assert.match(readme, /\*\*▶ Play now: https:\/\/celaldrg\.github\.io\/space-shooter\/\*\*/);
  assert.match(readme, /^## Türkçe$/m);
  assert.equal(readFileSync(new URL('.nojekyll', ROOT), 'utf8'), '');
  const workflow = readFileSync(new URL('.github/workflows/test.yml', ROOT), 'utf8');
  assert.match(workflow, /node-version: 22/);
  assert.match(workflow, /run: node --test/);
});
