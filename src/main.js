/**
 * Entry point: connects the pure game logic to the page - canvas renderer, DOM HUD, keyboard
 * and touch input, sound, saved settings and the language toggle - and runs the frame loop.
 * "?demo" in the URL opens a fixed mid-game moment (used for the README screenshot); it stays
 * frozen until the first key press or touch and never saves a best score.
 */

import { advance, createGame, drainEvents, hudInfo, setPaused, startGame, togglePause } from './game.js';
import { createDemoGame } from './demo.js';
import { loadHighScore, saveHighScore } from './storage.js';
import { loadSettings, saveSetting } from './settings.js';
import { formatNumber, otherLanguage, translate } from './i18n.js';
import { PICKUP_COLORS } from './art.js';
import { createRenderer } from './render.js';
import { WEAPON_KEYS, createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';

const MAX_FRAME_SECONDS = 0.1;
const REDUCED_MOTION_PACE = 0.5;
const KILL_COLORS = ['#e2e8f0', '#c7d2fe', '#a5b4fc', '#fde68a'];
const NON_GESTURE_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'Escape']);

const stage = document.getElementById('stage');
const settings = loadSettings();
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = motionQuery.matches;
let demo = new URLSearchParams(window.location.search).has('demo');
let frozen = demo;
let state = demo ? createDemoGame() : createGame({ seed: randomSeed(), highScore: loadHighScore() });
let sceneTime = 0;
let lastFrame = null;

const renderer = createRenderer(document.getElementById('game-canvas'));
const hud = createHud(document, { reducedMotion: () => reducedMotion });
const audio = createAudio({ muted: settings.muted });
const input = createInput({
  stage,
  ship: () => state.player,
  playing: () => state.status === 'playing' && !state.paused,
  autoFire: () => settings.autoFire,
  onCommand: (command) => COMMANDS[command](),
});

const COMMANDS = Object.freeze({
  pause: () => {
    if (state.status === 'playing' && !togglePause(state)) focusStage();
  },
  autoFire: toggleAutoFire,
  mute: toggleMute,
  start: () => {
    if (state.paused) resume();
    else if (state.status !== 'playing') newGame();
  },
});

const EVENT_HANDLERS = Object.freeze({
  kill: (event) => popPoints(event.points, event.x, event.y, KILL_COLORS[Math.min(event.multiplier, 4) - 1]),
  pickup: (event) => renderer.popText(pickupText(event.kind), event.x, event.y - 22, PICKUP_COLORS[event.kind]),
  shieldHit: () => renderer.flash('shield'),
  playerHit: (event) => {
    renderer.flash('danger');
    if (event.lives === 1) hud.banner(translate(settings.language, 'banner.lastShip'));
  },
  respawn: () => input.reanchor(),
  waveStart: (event) => {
    const key = event.boss ? 'banner.boss' : 'banner.wave';
    hud.banner(translate(settings.language, key, { wave: event.wave }));
  },
  waveClear: () => hud.banner(translate(settings.language, 'banner.waveClear')),
  bossPhase: (event) => {
    renderer.flash('boss');
    hud.banner(translate(settings.language, 'banner.phase', { phase: event.phase }));
  },
  bossDefeated: (event) => {
    popPoints(event.points, event.x, event.y, KILL_COLORS[KILL_COLORS.length - 1]);
    hud.banner(translate(settings.language, 'banner.bossDown'));
  },
  gameover: finishGame,
  victory: finishGame,
});

/** Starts a fresh game (also leaves the demo for good). */
function newGame() {
  if (demo) {
    demo = false;
    frozen = false;
    state.score.highScore = loadHighScore();
  }
  startGame(state, randomSeed());
  input.release();
  renderer.clearEffects();
  hud.clearBanner();
  focusStage();
}

function resume() {
  setPaused(state, false);
  focusStage();
}

/** Gives the keyboard focus back to the play area (after a button click took it). */
function focusStage() {
  stage.focus({ preventScroll: true });
}

function finishGame() {
  if (!demo) saveHighScore(state.score.points);
}

function toggleAutoFire() {
  settings.autoFire = !settings.autoFire;
  saveSetting('autoFire', settings.autoFire);
}

function toggleMute() {
  settings.muted = !settings.muted;
  saveSetting('muted', settings.muted);
  audio.setMuted(settings.muted);
}

function toggleLanguage() {
  settings.language = otherLanguage(settings.language);
  saveSetting('language', settings.language);
  translatePage();
}

/** Applies the current language to every static text, label and tooltip of the page. */
function translatePage() {
  const lang = settings.language;
  document.documentElement.lang = lang;
  document.title = translate(lang, 'app.title');
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = translate(lang, element.dataset.i18n);
  }
  for (const element of document.querySelectorAll('[data-i18n-label]')) {
    element.setAttribute('aria-label', translate(lang, element.dataset.i18nLabel));
  }
  for (const element of document.querySelectorAll('[data-i18n-title]')) {
    element.title = translate(lang, element.dataset.i18nTitle);
  }
}

function popPoints(points, x, y, color) {
  const text = translate(settings.language, 'float.points', { points: formatNumber(settings.language, points) });
  renderer.popText(text, x, y, color);
}

function pickupText(kind) {
  const lang = settings.language;
  if (kind === 'shield') return translate(lang, 'pickup.shield');
  return translate(lang, 'pickup.weapon', { weapon: translate(lang, WEAPON_KEYS[kind]) });
}

function randomSeed() {
  return window.crypto.getRandomValues(new Uint32Array(1))[0];
}

function wake() {
  frozen = false;
}

function resizeCanvas() {
  const rect = stage.getBoundingClientRect();
  renderer.resize(rect.width, rect.height, window.devicePixelRatio);
}

function frame(now) {
  const seconds = lastFrame === null ? 0 : Math.min(MAX_FRAME_SECONDS, (now - lastFrame) / 1000);
  lastFrame = now;
  if (!frozen) {
    advance(state, seconds, input.read());
    for (const event of drainEvents(state)) {
      audio.play(event);
      EVENT_HANDLERS[event.type]?.(event);
    }
    if (!state.paused) sceneTime += seconds * (reducedMotion ? REDUCED_MOTION_PACE : 1);
  }
  audio.setBeam(state.beam.on && state.status === 'playing' && !state.paused && !frozen);
  renderer.draw(state, sceneTime, { shake: !reducedMotion });
  const info = hudInfo(state);
  info.newBest = state.score.newHighScore;
  hud.render(info, { lang: settings.language, autoFire: settings.autoFire, muted: settings.muted });
  window.requestAnimationFrame(frame);
}

function bindControls() {
  const clicks = {
    'new-game': newGame,
    'lang-toggle': toggleLanguage,
    'start-button': newGame,
    'again-button': newGame,
    'resume-button': resume,
    'pause-button': COMMANDS.pause,
    'autofire-button': toggleAutoFire,
    'sound-button': toggleMute,
  };
  for (const [id, handler] of Object.entries(clicks)) {
    document.getElementById(id).addEventListener('click', handler);
  }
}

function bindPage() {
  motionQuery.addEventListener('change', (event) => {
    reducedMotion = event.matches;
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    audio.setBeam(false);
    audio.suspend();
    if (!frozen) setPaused(state, true);
  });
  window.addEventListener('pointerup', audio.unlock);
  window.addEventListener('keydown', (event) => {
    if (!NON_GESTURE_KEYS.has(event.key) && !event.ctrlKey && !event.metaKey) audio.unlock();
  });
  if (demo) {
    window.addEventListener('keydown', wake, { once: true });
    stage.addEventListener('pointerdown', wake, { once: true });
  }
  new ResizeObserver(resizeCanvas).observe(stage);
  window.addEventListener('resize', resizeCanvas);
}

translatePage();
bindControls();
bindPage();
resizeCanvas();
// The first frame is drawn at once, so the page never shows an empty play area.
frame(performance.now());
