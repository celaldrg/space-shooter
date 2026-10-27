/**
 * Screen geometry: how the 360 x 640 world maps onto a canvas of any size and pixel density,
 * and how pointer positions map back into the world.
 */

import { HEIGHT, WIDTH } from './constants.js';

/** Highest device pixel ratio the canvas renders at: sharp on phones without a huge fill cost. */
export const MAX_PIXEL_RATIO = 2;

/**
 * Backing-store size of a canvas shown at a CSS size on a screen with the given pixel ratio.
 * @param {number} cssWidth
 * @param {number} cssHeight
 * @param {number} devicePixelRatio
 * @returns {{width: number, height: number, ratio: number}}
 */
export function backingSize(cssWidth, cssHeight, devicePixelRatio) {
  const dpr = Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1;
  const ratio = Math.min(MAX_PIXEL_RATIO, Math.max(1, dpr));
  return {
    width: Math.max(1, Math.round(cssWidth * ratio)),
    height: Math.max(1, Math.round(cssHeight * ratio)),
    ratio,
  };
}

/**
 * Uniform scale and offsets that fit the whole world into a width x height area, centred.
 * @param {number} width
 * @param {number} height
 * @returns {{scale: number, offsetX: number, offsetY: number}}
 */
export function fitWorld(width, height) {
  const scale = Math.min(width / WIDTH, height / HEIGHT);
  return { scale, offsetX: (width - WIDTH * scale) / 2, offsetY: (height - HEIGHT * scale) / 2 };
}

/**
 * Converts a pointer position (client pixels) into world coordinates.
 * @param {number} clientX
 * @param {number} clientY
 * @param {{left: number, top: number, width: number, height: number}} rect the play area's client rect
 * @returns {{x: number, y: number}}
 */
export function clientToWorld(clientX, clientY, rect) {
  const { scale, offsetX, offsetY } = fitWorld(rect.width, rect.height);
  return { x: (clientX - rect.left - offsetX) / scale, y: (clientY - rect.top - offsetY) / scale };
}
