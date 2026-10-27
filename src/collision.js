/**
 * Collision tests.
 *
 * Contact is inclusive: shapes that exactly touch (a graze) collide.
 * Boxes are axis-aligned and written as {minX, minY, maxX, maxY}.
 * Swept tests treat the motion during one step as linear and return the earliest contact
 * time t in [0, 1] (0 = start of the step, 1 = end) or -1 when the shapes never touch.
 * They are what keeps fast bullets from tunnelling through thin targets.
 */

import { clamp } from './math.js';

/**
 * Circle/circle overlap.
 * @param {number} ax
 * @param {number} ay
 * @param {number} ar
 * @param {number} bx
 * @param {number} by
 * @param {number} br
 * @returns {boolean}
 */
export function circlesOverlap(ax, ay, ar, bx, by, br) {
  const dx = bx - ax;
  const dy = by - ay;
  const reach = ar + br;
  return dx * dx + dy * dy <= reach * reach;
}

/**
 * Circle/AABB overlap, measured from the box point closest to the circle centre.
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} box
 * @returns {boolean}
 */
export function circleBoxOverlap(cx, cy, r, box) {
  const dx = cx - clamp(cx, box.minX, box.maxX);
  const dy = cy - clamp(cy, box.minY, box.maxY);
  return dx * dx + dy * dy <= r * r;
}

/**
 * AABB/AABB overlap.
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} a
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} b
 * @returns {boolean}
 */
export function boxesOverlap(a, b) {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

/**
 * Earliest t in [0, 1] at which the point (sx, sy) + t * (dx, dy) is within `radius` of the origin.
 * @param {number} sx start x relative to the circle centre
 * @param {number} sy start y relative to the circle centre
 * @param {number} dx motion along x during the step
 * @param {number} dy motion along y during the step
 * @param {number} radius
 * @returns {number} contact time, or -1
 */
export function pointCircleTime(sx, sy, dx, dy, radius) {
  const c = sx * sx + sy * sy - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  const b = sx * dx + sy * dy;
  if (a === 0 || b >= 0) return -1;
  const discriminant = b * b - a * c;
  if (discriminant < 0) return -1;
  const t = (-b - Math.sqrt(discriminant)) / a;
  return t <= 1 ? t : -1;
}

/**
 * Swept circle/circle test for two bodies that both moved during the step.
 * Each body exposes its previous position (px, py), current position (x, y) and radius r;
 * the test runs in B's frame of reference, so a moving target is handled exactly.
 * @param {{px: number, py: number, x: number, y: number, r: number}} a
 * @param {{px: number, py: number, x: number, y: number, r: number}} b
 * @returns {number} contact time in [0, 1], or -1
 */
export function sweepCircles(a, b) {
  const dx = a.x - a.px - (b.x - b.px);
  const dy = a.y - a.py - (b.y - b.py);
  return pointCircleTime(a.px - b.px, a.py - b.py, dx, dy, a.r + b.r);
}

/**
 * Swept circle/AABB test: a circle of radius r moves from (x0, y0) by (dx, dy) past a static box.
 * Exact for the rounded shape "box grown by r": face hits come from the slab entry,
 * corner hits from the corner circle.
 * @param {number} x0
 * @param {number} y0
 * @param {number} dx
 * @param {number} dy
 * @param {number} r
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} box
 * @returns {number} contact time in [0, 1], or -1
 */
export function sweepCircleBox(x0, y0, dx, dy, r, box) {
  if (circleBoxOverlap(x0, y0, r, box)) return 0;
  const enter = grownBoxEntry(x0, y0, dx, dy, r, box);
  if (enter < 0) return -1;
  const ex = x0 + dx * enter;
  const ey = y0 + dy * enter;
  const besideFace = (ex >= box.minX && ex <= box.maxX) || (ey >= box.minY && ey <= box.maxY);
  if (besideFace) return enter;
  const cornerX = ex < box.minX ? box.minX : box.maxX;
  const cornerY = ey < box.minY ? box.minY : box.maxY;
  return pointCircleTime(x0 - cornerX, y0 - cornerY, dx, dy, r);
}

/**
 * Time at which a segment enters the box grown by r on every side (slab method), or -1.
 * @param {number} x0
 * @param {number} y0
 * @param {number} dx
 * @param {number} dy
 * @param {number} r
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} box
 * @returns {number}
 */
function grownBoxEntry(x0, y0, dx, dy, r, box) {
  const x = slab(x0, dx, box.minX - r, box.maxX + r);
  const y = slab(y0, dy, box.minY - r, box.maxY + r);
  if (!x || !y) return -1;
  const enter = Math.max(x.enter, y.enter, 0);
  const exit = Math.min(x.exit, y.exit, 1);
  return enter <= exit ? enter : -1;
}

/**
 * Parameter interval during which a 1D motion stays inside [min, max], or null if never.
 * @param {number} start
 * @param {number} delta
 * @param {number} min
 * @param {number} max
 * @returns {{enter: number, exit: number}|null}
 */
function slab(start, delta, min, max) {
  if (delta === 0) {
    return start < min || start > max ? null : { enter: -Infinity, exit: Infinity };
  }
  const a = (min - start) / delta;
  const b = (max - start) / delta;
  return { enter: Math.min(a, b), exit: Math.max(a, b) };
}
