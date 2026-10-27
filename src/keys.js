/**
 * Keyboard bindings. Steering and firing use physical key positions (KeyboardEvent.code, so
 * WASD sits under the same fingers on every layout); one-shot commands use the printed letter
 * (KeyboardEvent.key). Pure helpers over plain records, testable without a browser.
 */

const MOVES = Object.freeze({
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
});

const COMMANDS = Object.freeze({ p: 'pause', escape: 'pause', f: 'autoFire', m: 'mute', enter: 'start' });

/** Physical key that fires while held. */
export const FIRE_CODE = 'Space';

/**
 * Whether a key is held for steering or firing (as opposed to a one-shot command).
 * @param {string} code KeyboardEvent.code
 * @returns {boolean}
 */
export function isHoldKey(code) {
  return code === FIRE_CODE || Object.hasOwn(MOVES, code);
}

/**
 * Stick direction for the held keys. Arrows and WASD add up; opposite directions cancel out.
 * @param {Iterable<string>} held KeyboardEvent.code values
 * @returns {{x: number, y: number}} each -1, 0 or 1
 */
export function stickFromKeys(held) {
  let x = 0;
  let y = 0;
  for (const code of held) {
    const move = Object.hasOwn(MOVES, code) ? MOVES[code] : null;
    if (move) {
      x += move[0];
      y += move[1];
    }
  }
  return { x: Math.sign(x), y: Math.sign(y) };
}

/**
 * The one-shot command a key press triggers.
 * @param {{key?: string}} event
 * @returns {'pause'|'autoFire'|'mute'|'start'|null}
 */
export function commandFor(event) {
  const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
  return Object.hasOwn(COMMANDS, key) ? COMMANDS[key] : null;
}
