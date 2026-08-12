import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseAcceleratorInfo } from './gpu-apple.js';

const fixture = readFileSync(
  fileURLToPath(new URL('./__fixtures__/ioreg-agx.txt', import.meta.url)),
  'utf8'
);

test('reads device utilization from PerformanceStatistics', () => {
  const info = parseAcceleratorInfo(fixture);
  assert.equal(info.util, 12);
});

test('reads renderer and tiler utilization separately', () => {
  const info = parseAcceleratorInfo(fixture);
  assert.equal(info.renderer, 12);
  assert.equal(info.tiler, 3);
});

test('reads allocated and in-use GPU memory in bytes', () => {
  const info = parseAcceleratorInfo(fixture);
  assert.equal(info.allocBytes, 4761616384);
  assert.equal(info.inUseBytes, 955203584);
});

test('reads device name and GPU core count', () => {
  const info = parseAcceleratorInfo(fixture);
  assert.equal(info.name, 'Apple M5');
  assert.equal(info.cores, 10);
});

test('returns null when no accelerator node is present', () => {
  assert.equal(parseAcceleratorInfo(''), null);
});
