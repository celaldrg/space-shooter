import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  boxesOverlap,
  circleBoxOverlap,
  circlesOverlap,
  pointCircleTime,
  sweepCircleBox,
  sweepCircles,
} from '../src/collision.js';

const box = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

test('circlesOverlap: overlap, exact touch (graze) and a hair-wide gap', () => {
  assert.equal(circlesOverlap(0, 0, 5, 6, 0, 2), true);
  assert.equal(circlesOverlap(0, 0, 5, 7, 0, 2), true, 'touching circles collide');
  assert.equal(circlesOverlap(0, 0, 3, 3, 4, 2), true, '3-4-5 diagonal touch');
  assert.equal(circlesOverlap(0, 0, 5, 7.001, 0, 2), false);
  assert.equal(circlesOverlap(0, 0, 3, 3, 4, 1.999), false);
});

test('circleBoxOverlap: inside, face graze, corner graze and the rounded corner', () => {
  assert.equal(circleBoxOverlap(5, 5, 1, box), true, 'centre inside');
  assert.equal(circleBoxOverlap(13, 5, 3, box), true, 'touches the right face');
  assert.equal(circleBoxOverlap(13.01, 5, 3, box), false);
  assert.equal(circleBoxOverlap(13, 14, 5, box), true, 'touches the corner at distance 5');
  assert.equal(circleBoxOverlap(13, 14, 4.99, box), false);
  assert.equal(circleBoxOverlap(13, 13, 4, box), false, 'inside the grown box, outside the rounded corner');
});

test('boxesOverlap counts touching edges', () => {
  assert.equal(boxesOverlap(box, { minX: 10, minY: 3, maxX: 20, maxY: 4 }), true);
  assert.equal(boxesOverlap(box, { minX: 10.5, minY: 3, maxX: 20, maxY: 4 }), false);
  assert.equal(boxesOverlap(box, { minX: -5, minY: -5, maxX: 15, maxY: 15 }), true);
});

test('pointCircleTime: head-on, tangent graze, near miss, too short, receding and resting', () => {
  assert.equal(pointCircleTime(1, 0, 5, 0, 2), 0, 'already inside');
  assert.equal(pointCircleTime(-10, 0, 20, 0, 2), 0.4);
  assert.equal(pointCircleTime(5, -20, 0, 40, 5), 0.5, 'tangent path touches at t = 0.5');
  assert.equal(pointCircleTime(5.001, -20, 0, 40, 5), -1);
  assert.equal(pointCircleTime(-10, 0, 8, 0, 2), 1, 'contact exactly at the end of the step');
  assert.equal(pointCircleTime(-10, 0, 5, 0, 2), -1, 'stops short');
  assert.equal(pointCircleTime(-10, 0, -5, 0, 2), -1, 'moving away');
  assert.equal(pointCircleTime(-10, 0, 0, 0, 2), -1, 'not moving');
});

test('sweepCircles catches a fast bullet that jumps over a target between two frames', () => {
  const bullet = { px: 0, py: 40, x: 0, y: -40, r: 2 };
  const target = { px: 0, py: 0, x: 0, y: 0, r: 10 };
  assert.equal(circlesOverlap(bullet.px, bullet.py, 2, 0, 0, 10), false);
  assert.equal(circlesOverlap(bullet.x, bullet.y, 2, 0, 0, 10), false);
  assert.equal(sweepCircles(bullet, target), 0.35);
});

test('sweepCircles works in the target frame: crossing paths meet, a dodge misses', () => {
  const bullet = { px: 0, py: 40, x: 0, y: -40, r: 1 };
  const crossing = { px: -30, py: 0, x: 30, y: 0, r: 5 };
  assert.equal(sweepCircles(bullet, crossing), 0.44);
  const dodging = { px: 0, py: 0, x: 40, y: 0, r: 5 };
  assert.equal(sweepCircles(bullet, dodging), -1, 'the target left the path before the bullet arrived');
});

test('sweepCircleBox: face hit, thin plate, face graze, corner graze and corner miss', () => {
  assert.equal(sweepCircleBox(5, 30, 0, -40, 2, box), 0.45, 'straight into the bottom face');
  const plate = { minX: 0, minY: 0, maxX: 100, maxY: 2 };
  assert.equal(circleBoxOverlap(50, 20, 1, plate) || circleBoxOverlap(50, -20, 1, plate), false);
  assert.equal(sweepCircleBox(50, 20, 0, -40, 1, plate), 0.425, 'no tunnelling through a thin plate');
  assert.equal(sweepCircleBox(12, 30, 0, -40, 2, box), 0.5, 'slides along the right face, touching at the corner');
  assert.equal(sweepCircleBox(30, 14, -40, 0, 5, box), 0.425, 'grazes the corner (3-4-5)');
  assert.equal(sweepCircleBox(20, 7.5, -10, 10, 4, box), -1, 'cuts the grown box but misses the rounded corner');
});

test('sweepCircleBox: start inside, moving away, parallel outside and stopping short', () => {
  assert.equal(sweepCircleBox(5, 11, 0, 40, 2, box), 0);
  assert.equal(sweepCircleBox(5, 30, 0, 40, 2, box), -1);
  assert.equal(sweepCircleBox(13, 30, 0, -40, 2, box), -1);
  assert.equal(sweepCircleBox(5, 30, 0, -10, 2, box), -1);
});
