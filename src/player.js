/**
 * The player's ship: inertial movement inside the screen bounds, lives, shield and respawn.
 * Input either steers with a stick (keyboard: x/y in -1..1) or follows a target point
 * (touch: the UI turns a relative drag into a target with dragTarget()).
 */

import { HEIGHT, STEP, WIDTH } from './constants.js';
import { clamp } from './math.js';
import { createWeapon } from './weapons.js';

/** Ship tuning. Speeds are units/second; responses are the share of the velocity gap closed per step. */
export const PLAYER = Object.freeze({
  radius: 4,
  pickupRadius: 18,
  margin: 16,
  minY: Math.round(HEIGHT * 0.3),
  maxSpeed: 300,
  response: 0.2,
  followGain: 10,
  followMaxSpeed: 620,
  followResponse: 0.35,
  startX: WIDTH / 2,
  startY: HEIGHT - 84,
  lives: 3,
  maxShield: 3,
  respawnSteps: 60,
  invulnSteps: 120,
  shieldInvulnSteps: 45,
});

/**
 * Creates the ship at its start position.
 * @param {number} [lives=PLAYER.lives]
 * @returns {object}
 */
export function createPlayer(lives = PLAYER.lives) {
  return {
    x: PLAYER.startX,
    y: PLAYER.startY,
    px: PLAYER.startX,
    py: PLAYER.startY,
    vx: 0,
    vy: 0,
    r: PLAYER.radius,
    alive: true,
    lives,
    shield: 0,
    invuln: 0,
    respawnTimer: 0,
    weapon: createWeapon(),
  };
}

/**
 * Brings the ship back at its start position with temporary invulnerability.
 * @param {object} player
 */
export function respawnPlayer(player) {
  player.x = PLAYER.startX;
  player.y = PLAYER.startY;
  player.px = player.x;
  player.py = player.y;
  player.vx = 0;
  player.vy = 0;
  player.alive = true;
  player.invuln = PLAYER.invulnSteps;
  player.respawnTimer = 0;
}

/**
 * Turns any input-like object into a clean input record.
 * @param {{x?: number, y?: number, fire?: boolean, target?: {x: number, y: number}|null}} [input]
 * @returns {{x: number, y: number, fire: boolean, target: {x: number, y: number}|null}}
 */
export function normalizeInput(input) {
  const source = input ?? {};
  const target = source.target;
  const hasTarget = Boolean(target) && Number.isFinite(target.x) && Number.isFinite(target.y);
  return {
    x: Number.isFinite(source.x) ? clamp(source.x, -1, 1) : 0,
    y: Number.isFinite(source.y) ? clamp(source.y, -1, 1) : 0,
    fire: Boolean(source.fire),
    target: hasTarget ? { x: target.x, y: target.y } : null,
  };
}

/**
 * Moves the ship one step. Velocity eases towards the wanted velocity (inertia) and the
 * ship stops at the screen bounds.
 * @param {object} player
 * @param {ReturnType<typeof normalizeInput>} input
 */
export function movePlayer(player, input) {
  player.px = player.x;
  player.py = player.y;
  if (!player.alive) return;
  const following = input.target !== null;
  const wanted = following ? followVelocity(player, input.target) : stickVelocity(input);
  const response = following ? PLAYER.followResponse : PLAYER.response;
  player.vx += (wanted.x - player.vx) * response;
  player.vy += (wanted.y - player.vy) * response;
  player.x += player.vx * STEP;
  player.y += player.vy * STEP;
  keepInField(player);
}

/**
 * Clamps a point to the area the ship may occupy.
 * @param {number} x
 * @param {number} y
 * @returns {{x: number, y: number}}
 */
export function clampToField(x, y) {
  return {
    x: clamp(x, PLAYER.margin, WIDTH - PLAYER.margin),
    y: clamp(y, PLAYER.minY, HEIGHT - PLAYER.margin),
  };
}

/**
 * Relative touch steering: the ship target moves exactly as far as the finger has moved
 * since the drag began, so the finger never has to cover the ship.
 * @param {{x: number, y: number}} anchor ship position when the drag began
 * @param {{x: number, y: number}} start pointer position when the drag began (world units)
 * @param {{x: number, y: number}} pointer current pointer position (world units)
 * @returns {{x: number, y: number}} target point for the input record
 */
export function dragTarget(anchor, start, pointer) {
  return clampToField(anchor.x + pointer.x - start.x, anchor.y + pointer.y - start.y);
}

function stickVelocity(input) {
  const length = Math.hypot(input.x, input.y);
  const scale = length > 1 ? PLAYER.maxSpeed / length : PLAYER.maxSpeed;
  return { x: input.x * scale, y: input.y * scale };
}

function followVelocity(player, target) {
  const vx = (target.x - player.x) * PLAYER.followGain;
  const vy = (target.y - player.y) * PLAYER.followGain;
  const speed = Math.hypot(vx, vy);
  const scale = speed > PLAYER.followMaxSpeed ? PLAYER.followMaxSpeed / speed : 1;
  return { x: vx * scale, y: vy * scale };
}

function keepInField(player) {
  const inside = clampToField(player.x, player.y);
  if (inside.x !== player.x) player.vx = 0;
  if (inside.y !== player.y) player.vy = 0;
  player.x = inside.x;
  player.y = inside.y;
}
