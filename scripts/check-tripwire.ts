/**
 * Self-check for the local tripwire. Runs under plain Node (type stripping, Node 22.18+):
 *
 *   npm run check:tripwire
 *
 * Exits non-zero on the first failed assertion.
 */
import assert from 'node:assert/strict';

import { AlertThrottle, ZoneTripwire } from '../src/navigation/tripwire.ts';

// A 0.002-degree square (about 200 m) near Jerusalem, and an L-shaped concave zone.
const square: [number, number][] = [
  [35.2, 31.77],
  [35.202, 31.77],
  [35.202, 31.772],
  [35.2, 31.772],
  [35.2, 31.77],
];
const lShape: [number, number][] = [
  [35.21, 31.78],
  [35.214, 31.78],
  [35.214, 31.781],
  [35.211, 31.781],
  [35.211, 31.784],
  [35.21, 31.784],
  [35.21, 31.78],
];

const tripwire = new ZoneTripwire([
  { ring: square, payload: 'square' },
  { ring: lShape, payload: 'L' },
]);

assert.equal(tripwire.size, 2);

// Inside and outside the square.
assert.equal(tripwire.test({ lat: 31.771, lng: 35.201 }), 'square');
assert.equal(tripwire.test({ lat: 31.7725, lng: 35.201 }), null);
assert.equal(tripwire.test({ lat: 31.771, lng: 35.1999 }), null);

// Concavity: inside each arm of the L, but not in the notch between them.
assert.equal(tripwire.test({ lat: 31.7805, lng: 35.213 }), 'L');
assert.equal(tripwire.test({ lat: 31.783, lng: 35.2105 }), 'L');
assert.equal(tripwire.test({ lat: 31.783, lng: 35.213 }), null);

// The cache returns the previous answer within ~50 m and re-tests beyond it.
const cached = new ZoneTripwire([{ ring: square, payload: 'square' }]);
assert.equal(cached.containing({ lat: 31.771, lng: 35.201 }), 'square');
assert.equal(cached.containing({ lat: 31.7711, lng: 35.2011 }), 'square');
assert.equal(cached.containing({ lat: 31.775, lng: 35.201 }), null);

// Look-ahead: a path heading north into the square from ~110 m south of it.
const path = [
  { lat: 31.769, lng: 35.201 },
  { lat: 31.773, lng: 35.201 },
];
const hit = tripwire.firstAlong(path, 400, 10);
assert.ok(hit, 'expected the path to enter the square');
assert.equal(hit.payload, 'square');
assert.ok(hit.distanceMeters > 100 && hit.distanceMeters < 125, `distance ${hit.distanceMeters}`);
// The same path probed only 80 m ahead stays clean.
assert.equal(tripwire.firstAlong(path, 80, 10), null);
// Starting inside reports distance zero.
assert.equal(tripwire.firstAlong([{ lat: 31.771, lng: 35.201 }, ...path], 400)?.distanceMeters, 0);

// Throttle: fires, holds for the interval, then fires again.
const throttle = new AlertThrottle();
assert.equal(throttle.shouldFire('zone', 1000, 0), true);
assert.equal(throttle.shouldFire('zone', 1000, 500), false);
assert.equal(throttle.shouldFire('other', 1000, 500), true);
assert.equal(throttle.shouldFire('zone', 1000, 1000), true);

console.log('tripwire self-check passed');
