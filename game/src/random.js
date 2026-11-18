// Seeded RNG (mulberry32): one seed always builds the same Velmora.
// Plus the small helpers every system shares: picking, ranges, clamping,
// angles and squared distances.
export function makeRng(seed) {
  let state = seed >>> 0;
  function next() {
    state = state | 0;
    state = state + 0x6d2b79f5;
    state = state | 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    let folded = Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    mixed = (mixed + folded) ^ mixed;
    let out = mixed ^ (mixed >>> 14);
    return (out >>> 0) / 4294967296;
  }
  return next;
}

// One random element; an empty array is a caller bug, so fail loudly.
export function pick(rng, arr) {
  let empty = !arr || arr.length === 0;
  if (empty) throw new Error('pick: empty array');
  let slot = Math.floor(rng() * arr.length);
  return arr[slot];
}

// A random float in [lo, hi). Reversed bounds are swapped, not honoured
// as-is, so a caller can pass either order.
export function range(rng, lo, hi) {
  let low = Math.min(lo, hi);
  let high = Math.max(lo, hi);
  return low + rng() * (high - low);
}

export function clamp(v, lo, hi) {
  if (v > hi) return hi;
  if (v < lo) return lo;
  return v;
}

// Squared distance: cheaper than a square root when only comparing.
export function dist2(ax, ay, bx, by) {
  let dx = ax - bx;
  let dy = ay - by;
  return dx * dx + dy * dy;
}

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

// The smallest signed turn from angle `a` to angle `b`, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
