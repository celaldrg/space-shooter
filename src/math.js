/** Small math helpers shared by the logic modules. Angles are radians with y pointing down. */

/** A full turn in radians. */
export const TAU = Math.PI * 2;

/** Multiply degrees by this to get radians. */
export const DEG = Math.PI / 180;

/**
 * Limits a value to the range [min, max].
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Angle of the direction from one point to another.
 * @param {number} fromX
 * @param {number} fromY
 * @param {number} toX
 * @param {number} toY
 * @returns {number}
 */
export function angleTo(fromX, fromY, toX, toY) {
  return Math.atan2(toY - fromY, toX - fromX);
}

/**
 * Rotates `current` towards `target` by at most `maxDelta`, taking the short way round.
 * @param {number} current
 * @param {number} target
 * @param {number} maxDelta
 * @returns {number}
 */
export function turnTowards(current, target, maxDelta) {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + clamp(difference, -maxDelta, maxDelta);
}
