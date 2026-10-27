/**
 * Canvas artwork, all drawn with paths: the player's ship, the four enemy families, the boss,
 * pickups, the beam and pre-rendered glowing bullet sprites. Shapes are drawn in world units
 * around the entity's position; gradients are built once and reused through transforms.
 */

import { TAU, clamp } from './math.js';
import { ENEMY_TYPES } from './enemies.js';
import { PLAYER } from './player.js';

/** Colour of each particle tone used by the simulation. */
export const TONES = Object.freeze({ ember: '#fb923c', violet: '#a78bfa', cyan: '#67e8f9', spark: '#fde68a' });

/** Accent colour of each pickup kind. */
export const PICKUP_COLORS = Object.freeze({ spread: '#22d3ee', rapid: '#facc15', beam: '#c084fc', shield: '#34d399' });

const SPRITE_RESOLUTION = 4;
const SPRITE_GLOW = 4;
const SHIP_OUTLINE = [
  [0, -17], [3.5, -9], [5.5, -2], [15, 7], [14, 11], [5, 8], [3, 12],
  [-3, 12], [-5, 8], [-14, 11], [-15, 7], [-5.5, -2], [-3.5, -9],
];
const BOSS_HULL = [
  [-76, -6], [-62, -22], [-34, -28], [34, -28], [62, -22], [76, -6], [68, 12],
  [44, 20], [20, 30], [0, 34], [-20, 30], [-44, 20], [-68, 12],
];
const BOSS_CORES = ['#818cf8', '#fbbf24', '#f43f5e'];
const CANNON_X = 48;
const HEXAGON = regularPolygon(6, 10, Math.PI / 6);
const OCTAGON = regularPolygon(8, ENEMY_TYPES.turret.radius, Math.PI / 8);

/**
 * Prepares the reusable paints for a 2D context and returns the drawing functions.
 * @param {CanvasRenderingContext2D} ctx
 * @returns {{player: Function, enemy: Function, boss: Function, pickup: Function, beam: Function}}
 */
export function createArt(ctx) {
  const paints = createPaints(ctx);
  return {
    player: (player, time) => drawPlayer(ctx, paints, player, time),
    enemy: (enemy, player) => drawEnemy(ctx, paints, enemy, player),
    boss: (boss, time) => drawBoss(ctx, paints, boss, time),
    pickup: (pickup, time) => drawPickup(ctx, paints, pickup, time),
    beam: (beam, time) => drawBeam(ctx, beam, time),
  };
}

/**
 * Pre-renders the glowing bullet sprites (player shots by weapon, enemy shots by kind).
 * @returns {Record<string, {canvas: HTMLCanvasElement, width: number, height: number, round: boolean}>}
 */
export function createSprites() {
  return {
    blaster: capsuleSprite(3.2, 12, '#eef2ff', '#818cf8'),
    spread: capsuleSprite(3.2, 10, '#ecfeff', '#22d3ee'),
    rapid: capsuleSprite(2.2, 14, '#fefce8', '#facc15'),
    pellet: orbSprite(4.5, '#fff7ed', '#fb923c'),
    needle: capsuleSprite(3.8, 12, '#fdf2f8', '#f472b6'),
    orb: orbSprite(5.5, '#fdf4ff', '#d946ef'),
  };
}

function createPaints(ctx) {
  const turret = ENEMY_TYPES.turret.radius;
  return {
    ship: linear(ctx, 0, -17, 0, 12, ['#eef2ff', '#a5b4fc', '#4338ca']),
    cockpit: linear(ctx, 0, -11, 0, -1, ['#cffafe', '#0891b2']),
    flame: linear(ctx, 0, 10, 0, 30, ['rgba(254, 243, 199, 0.95)', 'rgba(251, 146, 60, 0.8)', 'rgba(244, 63, 94, 0)']),
    shield: radial(ctx, 6, 23, ['rgba(103, 232, 249, 0)', 'rgba(103, 232, 249, 0.24)']),
    weaver: linear(ctx, 0, -12, 0, 12, ['#99f6e4', '#14b8a6', '#115e59']),
    diver: linear(ctx, 0, -11, 0, 14, ['#fde68a', '#f59e0b', '#9a3412']),
    turret: linear(ctx, 0, -turret, 0, turret, ['#fecdd3', '#e11d48', '#4c0519']),
    dome: radial(ctx, 0, 6, ['#fff1f2', '#fb7185']),
    splitter: linear(ctx, 0, -18, 0, 18, ['#d6d3d1', '#78716c', '#292524']),
    shard: linear(ctx, 0, -10, 0, 10, ['#e7e5e4', '#a8a29e', '#44403c']),
    hull: linear(ctx, 0, -28, 0, 34, ['#94a3b8', '#475569', '#0f172a']),
    cores: BOSS_CORES.map((color) => radial(ctx, 0, 15, ['#ffffff', color, 'rgba(15, 23, 42, 0)'])),
    pickupGlow: mapValues(PICKUP_COLORS, (color) => radial(ctx, 4, 17, [withAlpha(color, 0.45), withAlpha(color, 0)])),
  };
}

function drawPlayer(ctx, paints, player, time) {
  if (!player.alive) return;
  ctx.save();
  ctx.translate(player.x, player.y);
  if (player.shield > 0) drawShieldBubble(ctx, paints, player.shield, time);
  ctx.globalAlpha = player.invuln > 0 && Math.floor(time * 16) % 2 === 0 ? 0.35 : 1;
  ctx.rotate(clamp(player.vx / 1600, -0.2, 0.2));
  drawFlame(ctx, paints.flame, time);
  polygon(ctx, SHIP_OUTLINE);
  ctx.fillStyle = paints.ship;
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = '#c7d2fe';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(6.5, 0.5);
  ctx.lineTo(13, 7.5);
  ctx.moveTo(-6.5, 0.5);
  ctx.lineTo(-13, 7.5);
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = '#6366f1';
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, -6.5, 2.3, 4.6, 0, 0, TAU);
  ctx.fillStyle = paints.cockpit;
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  dot(ctx, 0, 0, PLAYER.radius * 0.5, 'rgba(224, 231, 255, 0.95)');
  ctx.restore();
}

function drawShieldBubble(ctx, paints, shield, time) {
  ctx.beginPath();
  ctx.arc(0, 0, 21 + Math.sin(time * 5), 0, TAU);
  ctx.fillStyle = paints.shield;
  ctx.fill();
  ctx.lineWidth = 0.6 + shield * 0.5;
  ctx.strokeStyle = 'rgba(103, 232, 249, 0.7)';
  ctx.stroke();
}

function drawFlame(ctx, paint, time) {
  const length = 12 + 4 * Math.sin(time * 38) + 2 * Math.sin(time * 91);
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.moveTo(-3.2, 11);
  ctx.quadraticCurveTo(0, 11 + length * 1.5, 3.2, 11);
  ctx.closePath();
  ctx.fillStyle = paint;
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

function drawEnemy(ctx, paints, enemy, player) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  if (enemy.type === 'weaver') drawWeaver(ctx, paints, enemy);
  else if (enemy.type === 'diver') drawDiver(ctx, paints, enemy, player);
  else if (enemy.type === 'turret') drawTurret(ctx, paints, enemy);
  else drawRock(ctx, paints, enemy);
  ctx.restore();
}

function drawWeaver(ctx, paints, enemy) {
  const r = enemy.r;
  const flap = 1 + 0.12 * Math.sin(enemy.t * 0.22 + enemy.id);
  ctx.beginPath();
  ctx.moveTo(0, r * 0.85);
  ctx.quadraticCurveTo(r * 0.75, r * 0.55, r * 1.2 * flap, -r * 0.2);
  ctx.quadraticCurveTo(r * 0.62, -r * 0.18, r * 0.3, -r * 0.55);
  ctx.lineTo(0, -r * 1.05);
  ctx.lineTo(-r * 0.3, -r * 0.55);
  ctx.quadraticCurveTo(-r * 0.62, -r * 0.18, -r * 1.2 * flap, -r * 0.2);
  ctx.quadraticCurveTo(-r * 0.75, r * 0.55, 0, r * 0.85);
  ctx.closePath();
  fillBody(ctx, paints.weaver, enemy.flash, '#134e4a');
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.75);
  ctx.lineTo(0, r * 0.4);
  ctx.stroke();
  glowDot(ctx, -r * 0.25, r * 0.3, 1.6, '#f0fdfa');
  glowDot(ctx, r * 0.25, r * 0.3, 1.6, '#f0fdfa');
}

function drawDiver(ctx, paints, enemy, player) {
  const r = enemy.r;
  ctx.rotate(diverHeading(enemy, player) - Math.PI / 2);
  if (enemy.mode === 'dive') {
    ctx.globalCompositeOperation = 'lighter';
    dot(ctx, 0, -r * 1.05, r * 0.45, 'rgba(251, 146, 60, 0.55)');
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.beginPath();
  ctx.moveTo(0, r * 1.25);
  ctx.lineTo(r * 0.95, -r * 0.75);
  ctx.lineTo(r * 0.32, -r * 0.42);
  ctx.lineTo(0, -r * 0.9);
  ctx.lineTo(-r * 0.32, -r * 0.42);
  ctx.lineTo(-r * 0.95, -r * 0.75);
  ctx.closePath();
  fillBody(ctx, paints.diver, enemy.flash, '#7c2d12');
  const warning = enemy.mode === 'hover' && Math.floor(enemy.t / 6) % 2 === 0;
  glowDot(ctx, 0, r * 0.3, 2, warning ? '#fecaca' : '#fff7ed');
}

/** Divers point down while entering, track the ship while hovering, and face their dive. */
function diverHeading(enemy, player) {
  if (enemy.mode === 'dive') return enemy.angle;
  if (enemy.mode === 'hover') return Math.atan2(player.y - enemy.y, player.x - enemy.x);
  return Math.PI / 2;
}

function drawTurret(ctx, paints, enemy) {
  const r = enemy.r;
  polygon(ctx, OCTAGON);
  fillBody(ctx, paints.turret, enemy.flash, '#4c0519');
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, TAU);
  ctx.fillStyle = '#881337';
  ctx.fill();
  ctx.save();
  ctx.rotate(enemy.angle);
  ctx.fillStyle = '#fecdd3';
  ctx.fillRect(r * 0.15, -2.6, r * 0.95, 5.2);
  ctx.fillStyle = '#9f1239';
  ctx.fillRect(r * 0.9, -3.4, r * 0.3, 6.8);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.36, 0, TAU);
  ctx.fillStyle = paints.dome;
  ctx.fill();
  const charge = enemy.mode === 'aim' ? clamp(1 - enemy.fireTimer / 24, 0, 1) : 0;
  if (charge > 0) glowDot(ctx, 0, 0, 2 + 3 * charge, `rgba(255, 228, 230, ${0.4 + 0.6 * charge})`);
}

function drawRock(ctx, paints, enemy) {
  const splitter = enemy.type === 'splitter';
  const r = enemy.r;
  ctx.rotate(enemy.angle);
  polygon(ctx, rockOutline(enemy.id, r, splitter ? 9 : 6));
  fillBody(ctx, splitter ? paints.splitter : paints.shard, enemy.flash, '#1c1917');
  dot(ctx, -r * 0.3, -r * 0.35, r * 0.16, 'rgba(41, 37, 36, 0.55)');
  dot(ctx, r * 0.35, r * 0.25, r * 0.12, 'rgba(41, 37, 36, 0.55)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  if (splitter) {
    ctx.moveTo(-r * 0.62, -r * 0.08);
    ctx.lineTo(-r * 0.2, r * 0.16);
    ctx.lineTo(r * 0.14, -r * 0.12);
    ctx.lineTo(r * 0.6, r * 0.1);
  } else {
    ctx.moveTo(-r * 0.45, r * 0.2);
    ctx.lineTo(r * 0.4, -r * 0.15);
  }
  ctx.lineWidth = splitter ? 1.8 : 1.2;
  ctx.strokeStyle = 'rgba(232, 121, 249, 0.85)';
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

/** A lumpy polygon whose shape is fixed per enemy id, so each rock keeps its own outline. */
function rockOutline(id, r, corners) {
  const points = [];
  for (let k = 0; k < corners; k += 1) {
    const angle = (k / corners) * TAU;
    const radius = r * (0.78 + 0.24 * hash(id, k));
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return points;
}

function drawBoss(ctx, paints, boss, time) {
  if (!boss.active) return;
  const dying = boss.mode === 'dying';
  ctx.save();
  ctx.translate(boss.x + (dying ? Math.sin(time * 67) * 2 : 0), boss.y + (dying ? Math.cos(time * 53) * 2 : 0));
  drawBossEngines(ctx, time);
  polygon(ctx, BOSS_HULL);
  fillBody(ctx, paints.hull, boss.flash, '#cbd5e1');
  drawBossPlating(ctx);
  for (const side of [-1, 1]) drawCannon(ctx, side * CANNON_X);
  const pulse = 1 + 0.12 * Math.sin(time * (3 + boss.phase * 2));
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = dying && Math.floor(time * 20) % 2 === 0 ? 0.4 : 1;
  ctx.translate(0, 2);
  ctx.beginPath();
  ctx.arc(0, 0, 15 * pulse, 0, TAU);
  ctx.fillStyle = paints.cores[boss.phase - 1];
  ctx.fill();
  ctx.restore();
}

function drawBossEngines(ctx, time) {
  ctx.globalCompositeOperation = 'lighter';
  for (const x of [-30, -12, 12, 30]) {
    const length = 8 + 3 * Math.sin(time * 30 + x);
    ctx.beginPath();
    ctx.moveTo(x - 4, -26);
    ctx.quadraticCurveTo(x, -26 - length * 1.6, x + 4, -26);
    ctx.closePath();
    ctx.fillStyle = 'rgba(129, 140, 248, 0.55)';
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawBossPlating(ctx) {
  ctx.beginPath();
  ctx.moveTo(-60, -8);
  ctx.lineTo(-24, -18);
  ctx.lineTo(24, -18);
  ctx.lineTo(60, -8);
  ctx.moveTo(-40, 14);
  ctx.lineTo(-18, 22);
  ctx.moveTo(40, 14);
  ctx.lineTo(18, 22);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(203, 213, 225, 0.35)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
  ctx.beginPath();
  ctx.arc(0, 2, 18, 0, TAU);
  ctx.fill();
}

function drawCannon(ctx, x) {
  ctx.fillStyle = '#334155';
  ctx.fillRect(x - 8, 4, 16, 14);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(x - 3, 16, 6, 12);
  glowDot(ctx, x, 27, 2.2, '#fda4af');
}

function drawPickup(ctx, paints, pickup, time) {
  const color = PICKUP_COLORS[pickup.kind];
  ctx.save();
  ctx.translate(pickup.x, pickup.y);
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.arc(0, 0, 17, 0, TAU);
  ctx.fillStyle = paints.pickupGlow[pickup.kind];
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.rotate(Math.sin(time * 2.4 + pickup.slot) * 0.3);
  polygon(ctx, HEXAGON);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = color;
  ctx.stroke();
  drawPickupIcon(ctx, pickup.kind, color);
  ctx.restore();
}

function drawPickupIcon(ctx, kind, color) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (kind === 'spread') {
    for (const dx of [-4.5, 0, 4.5]) {
      ctx.moveTo(0, 4.5);
      ctx.lineTo(dx, -4.5);
    }
    ctx.stroke();
  } else if (kind === 'rapid') {
    for (const y of [-1, 4]) {
      ctx.moveTo(-4, y + 1);
      ctx.lineTo(0, y - 3);
      ctx.lineTo(4, y + 1);
    }
    ctx.stroke();
  } else if (kind === 'beam') {
    ctx.fillRect(-1.6, -6, 3.2, 12);
  } else {
    ctx.moveTo(0, -5.5);
    ctx.lineTo(4.8, -3.5);
    ctx.lineTo(4, 1.5);
    ctx.quadraticCurveTo(2.5, 4.5, 0, 6);
    ctx.quadraticCurveTo(-2.5, 4.5, -4, 1.5);
    ctx.lineTo(-4.8, -3.5);
    ctx.closePath();
    ctx.stroke();
  }
}

function drawBeam(ctx, beam, time) {
  const length = beam.bottom - beam.top;
  if (!beam.on || length <= 0) return;
  const width = beam.width * (1 + 0.12 * Math.sin(time * 70));
  const glow = ctx.createLinearGradient(beam.x - width, 0, beam.x + width, 0);
  glow.addColorStop(0, 'rgba(167, 139, 250, 0)');
  glow.addColorStop(0.3, 'rgba(167, 139, 250, 0.4)');
  glow.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
  glow.addColorStop(0.7, 'rgba(167, 139, 250, 0.4)');
  glow.addColorStop(1, 'rgba(167, 139, 250, 0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = glow;
  ctx.fillRect(beam.x - width, beam.top, width * 2, length);
  if (beam.top > 0) glowDot(ctx, beam.x, beam.top, width * 0.6, 'rgba(237, 233, 254, 0.9)');
  glowDot(ctx, beam.x, beam.bottom, width * 0.45, 'rgba(196, 181, 253, 0.9)');
  ctx.globalCompositeOperation = 'source-over';
}

/** Fills the current path, adds the white hit flash and strokes the outline. */
function fillBody(ctx, paint, flash, outline) {
  ctx.fillStyle = paint;
  ctx.fill();
  if (flash > 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fill();
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = outline;
  ctx.stroke();
}

function glowDot(ctx, x, y, radius, color) {
  const mode = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  dot(ctx, x, y, radius * 2.2, withAlpha(color, 0.18));
  dot(ctx, x, y, radius, color);
  ctx.globalCompositeOperation = mode;
}

function dot(ctx, x, y, radius, color) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
}

function polygon(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
}

function regularPolygon(corners, radius, rotation) {
  return Array.from({ length: corners }, (_, k) => {
    const angle = rotation + (k / corners) * TAU;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });
}

function linear(ctx, x0, y0, x1, y1, colors) {
  return withStops(ctx.createLinearGradient(x0, y0, x1, y1), colors);
}

function radial(ctx, inner, outer, colors) {
  return withStops(ctx.createRadialGradient(0, 0, inner, 0, 0, outer), colors);
}

function withStops(gradient, colors) {
  colors.forEach((color, i) => gradient.addColorStop(i / (colors.length - 1), color));
  return gradient;
}

/** Same colour with a new alpha; accepts #rrggbb and rgb()/rgba() strings. */
function withAlpha(color, alpha) {
  if (color.startsWith('#')) {
    const value = Number.parseInt(color.slice(1), 16);
    return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  }
  const [r, g, b] = color.match(/[\d.]+/g);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mapValues(object, transform) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value)]));
}

/** Stable pseudo-random value in [0, 1) for an id and an index. */
function hash(id, index) {
  const value = Math.sin(id * 12.9898 + index * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function capsuleSprite(width, height, core, color) {
  return makeSprite(width, height, false, (g) => {
    capsulePath(g, width, height);
    glowFill(g, color);
    capsulePath(g, width * 0.45, height * 0.8);
    g.fillStyle = core;
    g.fill();
  });
}

function orbSprite(radius, core, color) {
  return makeSprite(radius * 2, radius * 2, true, (g) => {
    g.beginPath();
    g.arc(0, 0, radius, 0, TAU);
    glowFill(g, color);
    g.beginPath();
    g.arc(0, 0, radius * 0.55, 0, TAU);
    g.fillStyle = core;
    g.fill();
  });
}

function glowFill(g, color) {
  g.shadowColor = color;
  g.shadowBlur = SPRITE_GLOW * SPRITE_RESOLUTION;
  g.fillStyle = color;
  g.fill();
  g.shadowBlur = 0;
}

function capsulePath(g, width, height) {
  const r = width / 2;
  g.beginPath();
  g.arc(0, -height / 2 + r, r, Math.PI, 0);
  g.arc(0, height / 2 - r, r, 0, Math.PI);
  g.closePath();
}

function makeSprite(width, height, round, paint) {
  const fullWidth = width + SPRITE_GLOW * 2;
  const fullHeight = height + SPRITE_GLOW * 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(fullWidth * SPRITE_RESOLUTION);
  canvas.height = Math.ceil(fullHeight * SPRITE_RESOLUTION);
  const g = canvas.getContext('2d');
  g.scale(SPRITE_RESOLUTION, SPRITE_RESOLUTION);
  g.translate(fullWidth / 2, fullHeight / 2);
  paint(g);
  return { canvas, width: fullWidth, height: fullHeight, round };
}
