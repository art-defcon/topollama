import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatHeader, headerTitle } from './header.js';

const snapshot = {
  gpu: {
    name: 'Apple M5',
    cores: 10,
    util: 14,
    allocBytes: 5_000_000_000,
    totalBytes: 25_769_803_776
  },
  host: {
    cpu: 23.4,
    cores: 10,
    memTotal: 25_769_803_776,
    memUsed: 18_000_000_000,
    memFree: 7_769_803_776
  }
};

test('names the device and its core count', () => {
  assert.equal(headerTitle(snapshot), 'Apple M5 · 10 GPU cores');
});

test('falls back to a generic title when GPU info is unavailable', () => {
  assert.equal(headerTitle({ ...snapshot, gpu: null }), 'topollama');
});

// formatHeader emits blessed markup; assert on the text a reader actually sees.
const plain = (s) => s.replace(/\{[^}]*\}/g, '');

test('shows GPU utilization and allocated VRAM', () => {
  const line = plain(formatHeader(snapshot));
  assert.match(line, /GPU\s+14%/);
  assert.match(line, /5\.0 GB \/ 25\.8 GB/);
});

test('shows CPU utilization and used memory', () => {
  const line = plain(formatHeader(snapshot));
  assert.match(line, /CPU\s+23%/);
  assert.match(line, /18\.0 GB \/ 25\.8 GB/);
});

test('renders dashes for GPU figures when the accelerator is unreadable', () => {
  const line = plain(formatHeader({ ...snapshot, gpu: null }));
  assert.match(line, /GPU\s+-/);
  // CPU must still report even when the GPU read failed
  assert.match(line, /CPU\s+23%/);
});
