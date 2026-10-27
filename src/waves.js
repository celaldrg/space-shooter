/**
 * The wave script, written as data.
 *
 * Each wave lists spawn groups: `at` is the time in seconds after the wave starts, `x` a
 * fraction of the field width, and `count` / `every` / `dx` repeat the spawn `count` times,
 * `every` seconds and `dx` widths apart. `params` tune the enemy pattern (see enemies.js) and
 * `drop` is a guaranteed pickup carried by the last enemy of the group.
 * A wave ends once all of its spawns have appeared and the field is clear. After wave 10 the
 * boss arrives.
 */

import { WIDTH, secondsToSteps } from './constants.js';

const PI = Math.PI;

/** Steps before wave 1 starts. */
export const INTRO_STEPS = 90;

/** Steps between a cleared wave and the next one (also before the boss). */
export const INTERLUDE_STEPS = 120;

/** Ten scripted waves. */
export const WAVES = Object.freeze([
  // 1 - Weaver stream
  {
    spawns: [
      { at: 0.5, type: 'weaver', x: 0.3, count: 5, every: 0.45, params: { amp: 48, freq: 0.5, vy: 85 } },
      { at: 4, type: 'weaver', x: 0.7, count: 5, every: 0.45, params: { amp: 48, freq: 0.5, vy: 85, phase: PI } },
      { at: 7.5, type: 'weaver', x: 0.5, count: 6, every: 0.35, params: { amp: 100, freq: 0.4, vy: 95 }, drop: 'spread' },
    ],
  },
  // 2 - Divers
  {
    spawns: [
      { at: 0.5, type: 'weaver', x: 0.2, count: 4, every: 0.4, params: { amp: 36, vy: 90 } },
      { at: 0.5, type: 'weaver', x: 0.8, count: 4, every: 0.4, params: { amp: 36, vy: 90, phase: PI } },
      { at: 3.5, type: 'diver', x: 0.25, count: 3, every: 0.6, dx: 0.25, params: { hoverY: 140 } },
      { at: 6.5, type: 'diver', x: 0.75, count: 3, every: 0.6, dx: -0.25, params: { hoverY: 180 } },
      { at: 9, type: 'weaver', x: 0.5, count: 6, every: 0.3, params: { amp: 110, freq: 0.35, vy: 100 }, drop: 'rapid' },
    ],
  },
  // 3 - Turrets
  {
    spawns: [
      { at: 0.5, type: 'turret', x: 0.25, params: { stopY: 110 } },
      { at: 0.5, type: 'turret', x: 0.75, params: { stopY: 110 } },
      { at: 2, type: 'weaver', x: 0.5, count: 6, every: 0.35, params: { amp: 80, freq: 0.45, vy: 90 } },
      { at: 5.5, type: 'diver', x: 0.15, count: 4, every: 0.5, dx: 0.233, params: { hoverY: 170 } },
      { at: 8.5, type: 'turret', x: 0.5, params: { stopY: 150, burst: 3 }, drop: 'shield' },
      { at: 10, type: 'weaver', x: 0.25, count: 4, every: 0.4, params: { amp: 40, vy: 100 } },
      { at: 10, type: 'weaver', x: 0.75, count: 4, every: 0.4, params: { amp: 40, vy: 100, phase: PI } },
    ],
  },
  // 4 - Splitters
  {
    spawns: [
      { at: 0.5, type: 'splitter', x: 0.3, params: { vx: 40 } },
      { at: 2, type: 'splitter', x: 0.7, params: { vx: -40 } },
      { at: 3.5, type: 'weaver', x: 0.5, count: 8, every: 0.3, params: { amp: 120, freq: 0.3, vy: 90 } },
      { at: 7, type: 'splitter', x: 0.5, params: { vx: 60 } },
      { at: 9, type: 'splitter', x: 0.2, params: { vx: 50 } },
      { at: 9, type: 'splitter', x: 0.8, params: { vx: -50 }, drop: 'beam' },
    ],
  },
  // 5 - Pincer
  {
    spawns: [
      { at: 0.5, type: 'diver', x: 0.1, count: 5, every: 0.35, dx: 0.1, params: { hoverY: 120, hold: 0.4 } },
      { at: 2.5, type: 'diver', x: 0.9, count: 5, every: 0.35, dx: -0.1, params: { hoverY: 160, hold: 0.4 } },
      { at: 5, type: 'turret', x: 0.3, params: { stopY: 100, burst: 3, fireEvery: 1.4 } },
      { at: 5, type: 'turret', x: 0.7, params: { stopY: 100, burst: 3, fireEvery: 1.4 } },
      { at: 7, type: 'weaver', x: 0.5, count: 6, every: 0.35, params: { amp: 90, vy: 95, fireEvery: 2.2 }, drop: 'spread' },
    ],
  },
  // 6 - Crossfire
  {
    spawns: [
      { at: 0.5, type: 'weaver', x: 0.25, count: 6, every: 0.35, params: { amp: 60, vy: 85, fireEvery: 1.8 } },
      { at: 2.5, type: 'weaver', x: 0.75, count: 6, every: 0.35, params: { amp: 60, vy: 85, phase: PI, fireEvery: 1.8 } },
      { at: 5, type: 'splitter', x: 0.4, params: { vx: 55 } },
      { at: 6, type: 'splitter', x: 0.6, params: { vx: -55 } },
      { at: 8, type: 'diver', x: 0.5, count: 3, every: 0.4, params: { hoverY: 200, speed: 380 }, drop: 'shield' },
    ],
  },
  // 7 - Battery
  {
    spawns: [
      { at: 0.5, type: 'turret', x: 0.2, params: { stopY: 90, burst: 3, stay: 6 } },
      { at: 0.5, type: 'turret', x: 0.5, params: { stopY: 120, stay: 6, fireEvery: 0.8 } },
      { at: 0.5, type: 'turret', x: 0.8, params: { stopY: 90, burst: 3, stay: 6 } },
      { at: 3, type: 'diver', x: 0.15, count: 4, every: 0.5, dx: 0.233, params: { hoverY: 200 } },
      { at: 6.5, type: 'diver', x: 0.85, count: 4, every: 0.5, dx: -0.233, params: { hoverY: 230 } },
      { at: 9, type: 'weaver', x: 0.5, count: 6, every: 0.3, params: { amp: 120, vy: 110 }, drop: 'rapid' },
    ],
  },
  // 8 - Rockfall
  {
    spawns: [
      { at: 0.5, type: 'splitter', x: 0.2, params: { vx: 35, vy: 60 } },
      { at: 1.5, type: 'splitter', x: 0.8, params: { vx: -35, vy: 60 } },
      { at: 2.5, type: 'splitter', x: 0.5, params: { vx: 70, vy: 65 } },
      { at: 4, type: 'diver', x: 0.2, count: 3, every: 0.4, dx: 0.3, params: { hoverY: 150 } },
      { at: 5.5, type: 'splitter', x: 0.35, params: { vx: -50, vy: 70 } },
      { at: 6.5, type: 'splitter', x: 0.65, params: { vx: 50, vy: 70 } },
      { at: 8, type: 'diver', x: 0.8, count: 3, every: 0.4, dx: -0.3, params: { hoverY: 190 } },
      { at: 9.5, type: 'splitter', x: 0.5, params: { vx: -30, vy: 75 }, drop: 'shield' },
    ],
  },
  // 9 - Swarm
  {
    spawns: [
      { at: 0.5, type: 'weaver', x: 0.2, count: 8, every: 0.25, params: { amp: 40, vy: 120, fireEvery: 2 } },
      { at: 0.5, type: 'weaver', x: 0.8, count: 8, every: 0.25, params: { amp: 40, vy: 120, phase: PI, fireEvery: 2 } },
      { at: 3, type: 'turret', x: 0.5, params: { stopY: 110, burst: 3, fireEvery: 1 } },
      { at: 4.5, type: 'diver', x: 0.1, count: 5, every: 0.3, dx: 0.2, params: { hoverY: 170, hold: 0.35 } },
      { at: 7, type: 'splitter', x: 0.3, params: { vx: 60 } },
      { at: 7, type: 'splitter', x: 0.7, params: { vx: -60 } },
      { at: 9, type: 'weaver', x: 0.5, count: 8, every: 0.25, params: { amp: 130, freq: 0.3, vy: 110 }, drop: 'beam' },
    ],
  },
  // 10 - Gauntlet
  {
    spawns: [
      { at: 0.5, type: 'turret', x: 0.15, params: { stopY: 95, burst: 3, stay: 7, hp: 10 } },
      { at: 0.5, type: 'turret', x: 0.85, params: { stopY: 95, burst: 3, stay: 7, hp: 10 } },
      { at: 2, type: 'weaver', x: 0.5, count: 10, every: 0.25, params: { amp: 120, freq: 0.35, vy: 105, fireEvery: 1.6 } },
      { at: 5, type: 'diver', x: 0.2, count: 4, every: 0.35, dx: 0.2, params: { hoverY: 160, hold: 0.3, speed: 400 } },
      { at: 7.5, type: 'splitter', x: 0.25, params: { vx: 65, hp: 7 } },
      { at: 7.5, type: 'splitter', x: 0.75, params: { vx: -65, hp: 7 } },
      { at: 10, type: 'turret', x: 0.5, params: { stopY: 140, burst: 5, fireEvery: 1.1, hp: 12 }, drop: 'shield' },
      { at: 11, type: 'diver', x: 0.8, count: 4, every: 0.35, dx: -0.2, params: { hoverY: 200, hold: 0.3, speed: 400 } },
    ],
  },
]);

/**
 * Flattens a wave's spawn groups into single spawns ordered by step (stable for equal steps).
 * @param {{spawns: object[]}} wave
 * @returns {{step: number, type: string, x: number, params: object, drop: string|null}[]}
 */
export function expandWave(wave) {
  const entries = [];
  for (const group of wave.spawns) {
    const count = group.count ?? 1;
    for (let i = 0; i < count; i += 1) {
      entries.push({
        step: secondsToSteps(group.at + i * (group.every ?? 0)),
        type: group.type,
        x: (group.x + i * (group.dx ?? 0)) * WIDTH,
        params: group.params ?? {},
        drop: i === count - 1 ? group.drop ?? null : null,
      });
    }
  }
  return entries.sort((a, b) => a.step - b.step);
}

/** WAVES expanded once: SCHEDULE[w] is the ordered spawn list of wave w (0-based). */
export const SCHEDULE = Object.freeze(WAVES.map(expandWave));
