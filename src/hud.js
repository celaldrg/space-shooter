/**
 * The DOM layer over the canvas: score, best, combo multiplier, wave, lives, shield and weapon,
 * the boss health bar, wave banners, the title / pause / end screens and the state of the
 * control buttons. render() runs every frame and only writes what changed.
 */

import { BOSS } from './boss.js';
import { PLAYER } from './player.js';
import { MAX_WEAPON_LEVEL } from './weapons.js';
import { formatNumber, translate } from './i18n.js';

/** Message key of each weapon's name. */
export const WEAPON_KEYS = Object.freeze({
  blaster: 'weapon.blaster',
  spread: 'weapon.spread',
  rapid: 'weapon.rapid',
  beam: 'weapon.beam',
});

const PHASE_COUNT = BOSS.phaseHp.length + 1;
const BANNER_MS = 1700;
const SLIDE_FRAMES = [
  { opacity: 0, transform: 'translateY(10px) scale(0.96)' },
  { opacity: 1, transform: 'none', offset: 0.14 },
  { opacity: 1, transform: 'none', offset: 0.76 },
  { opacity: 0, transform: 'translateY(-8px)' },
];
const FADE_FRAMES = [{ opacity: 0 }, { opacity: 1, offset: 0.14 }, { opacity: 1, offset: 0.76 }, { opacity: 0 }];

const IDS = Object.freeze({
  stage: 'stage',
  score: 'hud-score',
  best: 'hud-best',
  multiplier: 'hud-multiplier',
  weapon: 'hud-weapon',
  weaponName: 'hud-weapon-name',
  weaponLevel: 'hud-weapon-level',
  wave: 'hud-wave',
  lives: 'hud-lives',
  shield: 'hud-shield',
  bossBar: 'bossbar',
  bossPhase: 'bossbar-phase',
  bossTrack: 'bossbar-track',
  bossFill: 'bossbar-fill',
  banner: 'banner',
  titleScreen: 'screen-title',
  titleBest: 'title-best',
  pauseScreen: 'screen-pause',
  endScreen: 'screen-end',
  endTitle: 'end-title',
  endText: 'end-text',
  endScore: 'end-score',
  endNewBest: 'end-new-best',
  endStats: 'end-stats',
  endBest: 'end-best',
  pauseButton: 'pause-button',
  pauseLabel: 'pause-label',
  autoFireButton: 'autofire-button',
  soundButton: 'sound-button',
});

/**
 * Connects to the overlay elements of the page.
 * @param {Document} doc
 * @param {{reducedMotion: () => boolean}} options
 * @returns {{
 *   render(info: object, ui: {lang: string, autoFire: boolean, muted: boolean}): void,
 *   banner(text: string): void,
 *   clearBanner(): void,
 * }}
 */
export function createHud(doc, { reducedMotion }) {
  const el = Object.fromEntries(Object.entries(IDS).map(([name, id]) => [name, doc.getElementById(id)]));
  const shieldPips = makePips(doc, el.shield, PLAYER.maxShield);
  const weaponPips = makePips(doc, el.weaponLevel, MAX_WEAPON_LEVEL);
  addPhaseMarks(doc, el.bossTrack);
  let bossFill = -1;
  let bannerAnimation = null;

  function render(info, ui) {
    const screen = screenFor(info);
    setData(el.stage, 'screen', screen);
    renderStats(info, ui.lang);
    renderBoss(info, ui.lang);
    setHidden(el.titleScreen, screen !== 'title');
    setHidden(el.pauseScreen, screen !== 'pause');
    setHidden(el.endScreen, screen !== 'end');
    if (screen === 'title') renderTitle(info, ui.lang);
    if (screen === 'end') renderEnd(info, ui.lang);
    renderControls(info, ui);
  }

  function renderStats(info, lang) {
    setText(el.score, formatNumber(lang, info.score));
    setText(el.best, translate(lang, 'hud.best', { score: formatNumber(lang, info.highScore) }));
    const multiplier = translate(lang, 'hud.multiplier', { value: info.multiplier });
    setText(el.multiplier, multiplier);
    setAttr(el.multiplier, 'aria-label', `${translate(lang, 'hud.multiplierLabel')} ${multiplier}`);
    setData(el.multiplier, 'level', String(Math.min(info.multiplier, 4)));
    const wave = info.bossStage
      ? translate(lang, 'hud.boss')
      : translate(lang, 'hud.wave', { wave: info.wave, total: info.waveCount });
    setText(el.wave, wave);
    renderLives(info.lives, lang);
    renderShield(info.shield, lang);
    renderWeapon(info, lang);
  }

  function renderLives(lives, lang) {
    const count = Math.max(0, lives);
    if (el.lives.childElementCount !== count) {
      el.lives.replaceChildren(...Array.from({ length: count }, () => makeElement(doc, 'span', 'life')));
    }
    setAttr(el.lives, 'aria-label', translate(lang, 'hud.lives', { count }));
  }

  function renderShield(shield, lang) {
    setHidden(el.shield, shield === 0);
    shieldPips.forEach((pip, i) => pip.classList.toggle('is-on', i < shield));
    setAttr(el.shield, 'aria-label', translate(lang, 'hud.shield', { count: shield }));
  }

  function renderWeapon(info, lang) {
    setHidden(el.weapon, info.weapon === 'blaster');
    setData(el.weapon, 'weapon', info.weapon);
    const name = translate(lang, WEAPON_KEYS[info.weapon]);
    setText(el.weaponName, name);
    weaponPips.forEach((pip, i) => pip.classList.toggle('is-on', i < info.weaponLevel));
    setAttr(el.weapon, 'aria-label', translate(lang, 'hud.weapon', { weapon: name, level: info.weaponLevel }));
  }

  function renderBoss(info, lang) {
    const visible = info.bossStage && info.bossHealth > 0;
    setHidden(el.bossBar, !visible);
    if (!visible) return;
    setText(el.bossPhase, translate(lang, 'hud.phase', { phase: info.bossPhase, total: PHASE_COUNT }));
    const fill = Math.round(info.bossHealth * 1000) / 1000;
    if (fill !== bossFill) {
      bossFill = fill;
      el.bossFill.style.transform = `scaleX(${fill})`;
    }
  }

  function renderTitle(info, lang) {
    setHidden(el.titleBest, info.highScore <= 0);
    setText(el.titleBest, translate(lang, 'title.best', { score: formatNumber(lang, info.highScore) }));
  }

  function renderEnd(info, lang) {
    const victory = info.status === 'victory';
    setData(el.endScreen, 'outcome', info.status);
    setText(el.endTitle, translate(lang, victory ? 'end.victory' : 'end.gameover'));
    setText(el.endText, translate(lang, victory ? 'end.victoryText' : 'end.gameoverText'));
    setText(el.endScore, formatNumber(lang, info.score));
    setHidden(el.endNewBest, !info.newBest);
    const kills = formatNumber(lang, info.kills);
    const stats = info.bossStage
      ? translate(lang, 'end.bossStats', { kills })
      : translate(lang, 'end.stats', { wave: info.wave, kills });
    setText(el.endStats, stats);
    setText(el.endBest, formatNumber(lang, info.highScore));
  }

  function renderControls(info, ui) {
    setText(el.pauseLabel, translate(ui.lang, info.paused ? 'control.resume' : 'control.pause'));
    setData(el.pauseButton, 'paused', String(info.paused));
    const disabled = info.status !== 'playing';
    if (el.pauseButton.disabled !== disabled) el.pauseButton.disabled = disabled;
    setAttr(el.autoFireButton, 'aria-pressed', String(ui.autoFire));
    setAttr(el.soundButton, 'aria-pressed', String(!ui.muted));
  }

  function banner(text) {
    el.banner.textContent = text;
    bannerAnimation?.cancel();
    bannerAnimation = el.banner.animate(reducedMotion() ? FADE_FRAMES : SLIDE_FRAMES, {
      duration: BANNER_MS,
      easing: 'ease-out',
    });
  }

  function clearBanner() {
    bannerAnimation?.cancel();
    bannerAnimation = null;
  }

  return { render, banner, clearBanner };
}

/** Which overlay belongs to the game status: 'title', 'pause', 'end' or 'play' (none). */
function screenFor(info) {
  if (info.status === 'title') return 'title';
  if (info.status !== 'playing') return 'end';
  return info.paused ? 'pause' : 'play';
}

function makePips(doc, container, count) {
  const pips = Array.from({ length: count }, () => makeElement(doc, 'span', 'pip'));
  container.replaceChildren(...pips);
  return pips;
}

/** Ticks on the boss bar where phases 2 and 3 begin. */
function addPhaseMarks(doc, track) {
  for (const threshold of BOSS.phaseHp) {
    const mark = makeElement(doc, 'span', 'bossbar-mark');
    mark.style.left = `${(threshold / BOSS.maxHp) * 100}%`;
    track.append(mark);
  }
}

function makeElement(doc, tag, className) {
  const element = doc.createElement(tag);
  element.className = className;
  return element;
}

function setText(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

function setAttr(element, name, value) {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

function setHidden(element, hidden) {
  if (element.hidden !== hidden) element.hidden = hidden;
}

function setData(element, name, value) {
  if (element.dataset[name] !== value) element.dataset[name] = value;
}
