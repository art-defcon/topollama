import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cpuPercentBetween, parseVmStat } from './host.js';

// Samples are the shape os.cpus() reduces to: cumulative idle and total ticks.
const sample = (idle, total) => [{ idle, total }];

test('reports 0% when only idle ticks advanced', () => {
  assert.equal(cpuPercentBetween(sample(100, 200), sample(200, 300)), 0);
});

test('reports 100% when no idle ticks advanced', () => {
  assert.equal(cpuPercentBetween(sample(100, 200), sample(100, 300)), 100);
});

test('reports 50% when half the ticks were idle', () => {
  assert.equal(cpuPercentBetween(sample(100, 200), sample(150, 300)), 50);
});

test('averages across cores', () => {
  const prev = [{ idle: 0, total: 0 }, { idle: 0, total: 0 }];
  const next = [{ idle: 0, total: 100 }, { idle: 100, total: 200 }];
  // core 0 fully busy, core 1 half busy
  assert.equal(cpuPercentBetween(prev, next), 75);
});

test('reports 0% rather than NaN when no time elapsed between samples', () => {
  assert.equal(cpuPercentBetween(sample(100, 200), sample(100, 200)), 0);
});

test('reports 0% when there is no previous sample yet', () => {
  assert.equal(cpuPercentBetween(null, sample(100, 200)), 0);
});

test('sums free and inactive pages as available memory', () => {
  const out = [
    'Mach Virtual Memory Statistics: (page size of 16384 bytes)',
    'Pages free:                               12345.',
    'Pages active:                            999999.',
    'Pages inactive:                            6789.',
    'Pages speculative:                          100.'
  ].join('\n');

  assert.equal(parseVmStat(out), (12345 + 6789) * 16384);
});

test('returns null when vm_stat output is unparseable', () => {
  assert.equal(parseVmStat('not vm_stat output'), null);
});
