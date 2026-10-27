/**
 * Fixed-capacity object pools.
 * A pool is plain data ({items, free, active}); every item carries `active` and `slot` fields.
 * Items are created once and recycled, and acquisition order is fully deterministic.
 */

/**
 * Creates a pool of `capacity` items built by `make`.
 * @template T
 * @param {number} capacity
 * @param {() => T} make factory for one inactive item
 * @returns {{items: (T & {active: boolean, slot: number})[], free: number[], active: number}}
 */
export function createPool(capacity, make) {
  const items = [];
  for (let slot = 0; slot < capacity; slot += 1) {
    items.push(Object.assign(make(), { active: false, slot }));
  }
  const pool = { items, free: [], active: 0 };
  resetPool(pool);
  return pool;
}

/**
 * Takes a free item (the lowest free slot of a fresh pool first).
 * @template T
 * @param {{items: T[], free: number[], active: number}} pool
 * @returns {T|null} the item, or null when the pool is exhausted (pools never grow)
 */
export function acquire(pool) {
  const slot = pool.free.pop();
  if (slot === undefined) return null;
  const item = pool.items[slot];
  item.active = true;
  pool.active += 1;
  return item;
}

/**
 * Returns an item to its pool. Releasing an inactive item is ignored, so double releases are harmless.
 * @param {{items: object[], free: number[], active: number}} pool
 * @param {{active: boolean, slot: number}} item
 * @returns {boolean} true when the item was active
 */
export function release(pool, item) {
  if (!item.active) return false;
  item.active = false;
  pool.free.push(item.slot);
  pool.active -= 1;
  return true;
}

/**
 * Deactivates every item and restores the canonical free order, so a reset pool
 * behaves exactly like a fresh one.
 * @param {{items: {active: boolean}[], free: number[], active: number}} pool
 */
export function resetPool(pool) {
  pool.free.length = 0;
  for (let slot = pool.items.length - 1; slot >= 0; slot -= 1) {
    pool.items[slot].active = false;
    pool.free.push(slot);
  }
  pool.active = 0;
}

/**
 * Calls `visit` for every active item in slot order. Items may be released during the visit.
 * @template T
 * @param {{items: T[]}} pool
 * @param {(item: T) => void} visit
 */
export function forEachActive(pool, visit) {
  const { items } = pool;
  for (let slot = 0; slot < items.length; slot += 1) {
    if (items[slot].active) visit(items[slot]);
  }
}
