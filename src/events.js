/**
 * Game events: the simulation reports what happened (shots, kills, pickups, wave changes...)
 * so the UI can play sounds and show banners without inspecting the state.
 */

/** Upper bound on queued events; extra events are dropped if nobody drains the queue. */
export const MAX_EVENTS = 256;

/**
 * Queues an event on the state.
 * @param {{events: object[]}} state
 * @param {string} type
 * @param {object} [data] extra fields copied onto the event
 */
export function emit(state, type, data = {}) {
  if (state.events.length < MAX_EVENTS) state.events.push({ type, ...data });
}
