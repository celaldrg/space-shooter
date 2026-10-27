/**
 * Player input. Keyboard: arrows / WASD fly, Space fires while held, single keys trigger
 * commands (pause, auto-fire, sound, start). Pointer: a drag anywhere on the play area steers
 * relatively - the ship copies the finger's movement from wherever the finger landed, so the
 * finger never covers the ship - and the ship fires for as long as the finger is down.
 */

import { FIRE_CODE, commandFor, isHoldKey, stickFromKeys } from './keys.js';
import { clientToWorld } from './viewport.js';
import { dragTarget } from './player.js';

const INTERACTIVE = 'button, a, input, select, textarea';

/**
 * Starts listening to the keyboard (window) and to pointer drags on the play area.
 * @param {object} options
 * @param {HTMLElement} options.stage element that receives drags
 * @param {() => {x: number, y: number}} options.ship current ship position (world units)
 * @param {() => boolean} options.playing true while a game runs unpaused (keys are captured then)
 * @param {() => boolean} options.autoFire true when auto-fire is on
 * @param {(command: 'pause'|'autoFire'|'mute'|'start') => void} options.onCommand
 * @returns {{read(): {x: number, y: number, fire: boolean, target: {x: number, y: number}|null},
 *   reanchor(): void, release(): void}}
 */
export function createInput({ stage, ship, playing, autoFire, onCommand }) {
  const held = new Set();
  let drag = null;

  function onKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isHoldKey(event.code)) {
      held.add(event.code);
      if (shouldCapture(event)) event.preventDefault();
      return;
    }
    const command = commandFor(event);
    if (!command) return;
    if (command === 'start' && isInteractive(event.target)) return;
    event.preventDefault();
    if (!event.repeat) onCommand(command);
  }

  function onKeyUp(event) {
    if (!isHoldKey(event.code)) return;
    held.delete(event.code);
    if (shouldCapture(event)) event.preventDefault();
  }

  /** Hold keys never scroll the page, and never press a focused button during play. */
  function shouldCapture(event) {
    return playing() || !isInteractive(event.target);
  }

  function onPointerDown(event) {
    if (drag || !event.isPrimary || !playing() || isInteractive(event.target)) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const pointer = toWorld(event);
    const anchor = { ...ship() };
    drag = { id: event.pointerId, anchor, start: pointer, pointer, target: { ...anchor } };
    stage.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const pointer = toWorld(event);
    const target = dragTarget(drag.anchor, drag.start, pointer);
    // Slide the start point when the ship is pinned at an edge, so moving back responds at once.
    drag.start = { x: pointer.x - (target.x - drag.anchor.x), y: pointer.y - (target.y - drag.anchor.y) };
    drag.pointer = pointer;
    drag.target = target;
  }

  function onPointerEnd(event) {
    if (drag && event.pointerId === drag.id) drag = null;
  }

  function toWorld(event) {
    return clientToWorld(event.clientX, event.clientY, stage.getBoundingClientRect());
  }

  function release() {
    drag = null;
  }

  /** Restarts the drag from the ship's new position (after a respawn) without lifting the finger. */
  function reanchor() {
    if (!drag) return;
    drag.anchor = { ...ship() };
    drag.start = drag.pointer;
    drag.target = { ...drag.anchor };
  }

  function read() {
    const stick = stickFromKeys(held);
    return {
      x: stick.x,
      y: stick.y,
      fire: autoFire() || drag !== null || held.has(FIRE_CODE),
      target: drag ? drag.target : null,
    };
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => {
    held.clear();
    release();
  });
  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stage.addEventListener(type, onPointerEnd);

  return { read, reanchor, release };
}

function isInteractive(target) {
  return target instanceof Element && target.closest(INTERACTIVE) !== null;
}
