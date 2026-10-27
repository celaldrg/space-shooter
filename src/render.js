/**
 * Canvas renderer of the play area. Each frame it paints the nebula backdrop, the parallax
 * starfield, pickups, the beam, bullets, enemies, the boss, the ship, particles, floating
 * score texts and the damage flash. Screen shake offsets the whole scene.
 * The renderer only reads the game state; its own effects (texts, flash) run on scene time.
 */

import { HEIGHT, WIDTH } from './constants.js';
import { TAU } from './math.js';
import { forEachActive } from './pool.js';
import { createRng, randomRange } from './rng.js';
import { createStarfield, starPosition } from './starfield.js';
import { backingSize, fitWorld } from './viewport.js';
import { TONES, createArt, createSprites } from './art.js';

const BACKGROUND = '#0b1020';
const STARFIELD_SEED = 7;
const BACKDROP_SEED = 11;
const BACKDROP_MARGIN = 12;
const DUST_COUNT = 140;
const NEBULAE = [
  { x: 70, y: 150, r: 200, color: '129, 140, 248', alpha: 0.16 },
  { x: 300, y: 390, r: 220, color: '45, 212, 191', alpha: 0.08 },
  { x: 100, y: 570, r: 180, color: '217, 70, 239', alpha: 0.09 },
  { x: 280, y: 40, r: 130, color: '56, 189, 248', alpha: 0.07 },
];
const STAR_COLORS = ['#94a3b8', '#c7d2fe', '#eef2ff'];
const SHAKE_DISTANCE = 7;
const SPARK_TRAIL = 0.035;
const FIREBALL_FADE = 0.5;
const FIREBALL_REACH = 1.6;
const FIREBALL_PAD = 6;
const FIREBALL_CORE = '#fff7ed';
const FLOATER_SECONDS = 0.9;
const FLOATER_RISE = 26;
const MAX_FLOATERS = 24;
const FLOATER_FONT = '700 13px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FLASH_SECONDS = 0.45;
const FLASH_COLORS = Object.freeze({ danger: '244, 63, 94', shield: '103, 232, 249', boss: '224, 231, 255' });

/**
 * Creates the renderer for a canvas.
 * @param {HTMLCanvasElement} canvas
 * @returns {{
 *   resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void,
 *   draw(state: object, time: number, options?: {shake?: boolean}): void,
 *   popText(text: string, x: number, y: number, color: string): void,
 *   flash(tone: 'danger'|'shield'|'boss'): void,
 *   clearEffects(): void,
 * }}
 */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const art = createArt(ctx);
  const sprites = createSprites();
  const stars = createStarfield(STARFIELD_SEED);
  const vignettes = mapTones((color) => vignette(ctx, color));
  const view = { scale: 1, x: 0, y: 0 };
  const origin = { x: 0, y: 0 };
  const floaters = [];
  let backdrop = null;
  let flash = null;
  let now = 0;

  function resize(cssWidth, cssHeight, devicePixelRatio) {
    const size = backingSize(cssWidth, cssHeight, devicePixelRatio);
    if (canvas.width !== size.width) canvas.width = size.width;
    if (canvas.height !== size.height) canvas.height = size.height;
    const fit = fitWorld(size.width, size.height);
    view.scale = fit.scale;
    view.x = fit.offsetX;
    view.y = fit.offsetY;
    backdrop = paintBackdrop(view.scale);
  }

  function draw(state, time, options = {}) {
    now = time;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const amount = options.shake ? state.shake * state.shake * SHAKE_DISTANCE : 0;
    origin.x = view.x + amount * Math.sin(time * 83) * view.scale;
    origin.y = view.y + amount * Math.cos(time * 71) * view.scale;
    resetTransform();
    if (backdrop) {
      const span = BACKDROP_MARGIN * 2;
      ctx.drawImage(backdrop, -BACKDROP_MARGIN, -BACKDROP_MARGIN, WIDTH + span, HEIGHT + span);
    }
    drawStars(state.player.x - WIDTH / 2, time);
    drawScene(state, time);
    drawFloaters();
    drawFlash();
  }

  function drawScene(state, time) {
    forEachActive(state.pickups, (pickup) => art.pickup(pickup, time));
    if (state.status === 'playing') art.beam(state.beam, time);
    drawBullets(state.bullets, 'lighter');
    forEachActive(state.enemies, (enemy) => art.enemy(enemy, state.player));
    art.boss(state.boss, time);
    art.player(state.player, time);
    drawParticles(state.particles);
    drawBullets(state.enemyBullets, 'source-over');
  }

  function resetTransform() {
    ctx.setTransform(view.scale, 0, 0, view.scale, origin.x, origin.y);
  }

  function drawStars(shift, time) {
    for (const star of stars) {
      const { x, y } = starPosition(star, time, shift);
      ctx.globalAlpha = star.alpha * (0.75 + 0.25 * Math.sin(time * 2.2 + star.twinkle));
      ctx.fillStyle = STAR_COLORS[star.layer];
      const length = star.layer === STAR_COLORS.length - 1 ? star.size * 3 : star.size;
      ctx.fillRect(x - star.size / 2, y - length / 2, star.size, length);
    }
    ctx.globalAlpha = 1;
  }

  function drawBullets(pool, mode) {
    ctx.globalCompositeOperation = mode;
    forEachActive(pool, (bullet) => {
      const sprite = sprites[bullet.kind];
      if (sprite.round) {
        ctx.drawImage(sprite.canvas, bullet.x - sprite.width / 2, bullet.y - sprite.height / 2, sprite.width, sprite.height);
        return;
      }
      const angle = Math.atan2(bullet.vy, bullet.vx) + Math.PI / 2;
      const cos = Math.cos(angle) * view.scale;
      const sin = Math.sin(angle) * view.scale;
      ctx.setTransform(cos, sin, -sin, cos, origin.x + bullet.x * view.scale, origin.y + bullet.y * view.scale);
      ctx.drawImage(sprite.canvas, -sprite.width / 2, -sprite.height / 2, sprite.width, sprite.height);
    });
    resetTransform();
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawParticles(pool) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    forEachActive(pool, (particle) => {
      const fade = particle.life / particle.maxLife;
      if (particle.kind === 'ring') drawRing(particle, fade);
      else drawSpark(particle, fade);
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawRing(particle, fade) {
    const radius = Math.max(0, particle.size);
    if (fade > FIREBALL_FADE) drawFireball(particle, radius, (fade - FIREBALL_FADE) / (1 - FIREBALL_FADE));
    ctx.globalAlpha = fade;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, radius, 0, TAU);
    ctx.lineWidth = 0.6 + 2.4 * fade;
    ctx.strokeStyle = TONES[particle.tone];
    ctx.stroke();
  }

  /** The glow of a fresh explosion: white-hot in the middle, fading out through the tone colour. */
  function drawFireball(particle, radius, strength) {
    const reach = radius * FIREBALL_REACH + FIREBALL_PAD;
    const color = TONES[particle.tone];
    const glow = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, reach);
    glow.addColorStop(0, FIREBALL_CORE);
    glow.addColorStop(0.25, color);
    glow.addColorStop(1, `${color}00`);
    ctx.globalAlpha = strength;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, reach, 0, TAU);
    ctx.fill();
  }

  function drawSpark(particle, fade) {
    ctx.globalAlpha = fade;
    ctx.beginPath();
    ctx.moveTo(particle.x, particle.y);
    ctx.lineTo(particle.x - particle.vx * SPARK_TRAIL, particle.y - particle.vy * SPARK_TRAIL);
    ctx.lineWidth = Math.max(0.4, particle.size);
    ctx.strokeStyle = TONES[particle.tone];
    ctx.stroke();
  }

  function drawFloaters() {
    let kept = 0;
    for (const floater of floaters) {
      if (now - floater.born < FLOATER_SECONDS && now >= floater.born) floaters[kept++] = floater;
    }
    floaters.length = kept;
    if (kept === 0) return;
    ctx.font = FLOATER_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(2, 6, 23, 0.85)';
    for (const floater of floaters) {
      const age = (now - floater.born) / FLOATER_SECONDS;
      const y = floater.y - FLOATER_RISE * (1 - (1 - age) * (1 - age));
      ctx.globalAlpha = age < 0.6 ? 1 : 1 - (age - 0.6) / 0.4;
      ctx.strokeText(floater.text, floater.x, y);
      ctx.fillStyle = floater.color;
      ctx.fillText(floater.text, floater.x, y);
    }
    ctx.globalAlpha = 1;
  }

  function drawFlash() {
    if (!flash) return;
    const age = (now - flash.born) / FLASH_SECONDS;
    if (age >= 1 || age < 0) {
      flash = null;
      return;
    }
    ctx.globalAlpha = (1 - age) * (1 - age);
    ctx.fillStyle = vignettes[flash.tone];
    ctx.fillRect(-BACKDROP_MARGIN, -BACKDROP_MARGIN, WIDTH + BACKDROP_MARGIN * 2, HEIGHT + BACKDROP_MARGIN * 2);
    ctx.globalAlpha = 1;
  }

  function popText(text, x, y, color) {
    if (floaters.length >= MAX_FLOATERS) floaters.shift();
    floaters.push({ text, x, y, color, born: now });
  }

  function startFlash(tone) {
    flash = { tone, born: now };
  }

  function clearEffects() {
    floaters.length = 0;
    flash = null;
  }

  return { resize, draw, popText, flash: startFlash, clearEffects };
}

/** Paints the static backdrop (gradient sky, nebula clouds, faint dust) once per canvas size. */
function paintBackdrop(scale) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((WIDTH + BACKDROP_MARGIN * 2) * scale);
  canvas.height = Math.ceil((HEIGHT + BACKDROP_MARGIN * 2) * scale);
  const g = canvas.getContext('2d');
  g.scale(scale, scale);
  g.translate(BACKDROP_MARGIN, BACKDROP_MARGIN);
  const sky = g.createLinearGradient(0, -BACKDROP_MARGIN, 0, HEIGHT + BACKDROP_MARGIN);
  sky.addColorStop(0, '#090e22');
  sky.addColorStop(0.55, '#0f172a');
  sky.addColorStop(1, '#130f2e');
  g.fillStyle = sky;
  g.fillRect(-BACKDROP_MARGIN, -BACKDROP_MARGIN, WIDTH + BACKDROP_MARGIN * 2, HEIGHT + BACKDROP_MARGIN * 2);
  for (const cloud of NEBULAE) {
    const glow = g.createRadialGradient(cloud.x, cloud.y, 0, cloud.x, cloud.y, cloud.r);
    glow.addColorStop(0, `rgba(${cloud.color}, ${cloud.alpha})`);
    glow.addColorStop(1, `rgba(${cloud.color}, 0)`);
    g.fillStyle = glow;
    g.fillRect(cloud.x - cloud.r, cloud.y - cloud.r, cloud.r * 2, cloud.r * 2);
  }
  const rng = createRng(BACKDROP_SEED);
  g.fillStyle = '#cbd5e1';
  for (let i = 0; i < DUST_COUNT; i += 1) {
    g.globalAlpha = randomRange(rng, 0.05, 0.22);
    g.fillRect(randomRange(rng, 0, WIDTH), randomRange(rng, 0, HEIGHT), 0.7, 0.7);
  }
  return canvas;
}

/** Edge glow used by the damage flash: clear in the middle, coloured towards the borders. */
function vignette(ctx, color) {
  const gradient = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 120, WIDTH / 2, HEIGHT / 2, 420);
  gradient.addColorStop(0, `rgba(${color}, 0)`);
  gradient.addColorStop(1, `rgba(${color}, 0.6)`);
  return gradient;
}

function mapTones(transform) {
  return Object.fromEntries(Object.entries(FLASH_COLORS).map(([tone, color]) => [tone, transform(color)]));
}
