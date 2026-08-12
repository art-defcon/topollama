import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatSize, formatPct, formatBar } from './format.js';

// Ollama prints decimal GB (5287958282 bytes -> "5.3 GB"). Matching that lets a
// reader cross-check the table against `ollama ps` without unit arithmetic.
test('formats bytes the same way ollama does', () => {
  assert.equal(formatSize(5287958282), '5.3 GB');
});

test('formats megabyte-scale sizes', () => {
  assert.equal(formatSize(522653767), '522.7 MB');
});

test('formats small sizes in bytes without a decimal', () => {
  assert.equal(formatSize(512), '512 B');
});

test('formats zero as a plain zero', () => {
  assert.equal(formatSize(0), '0 B');
});

test('renders a dash for a missing size', () => {
  assert.equal(formatSize(null), '-');
  assert.equal(formatSize(undefined), '-');
});

test('formats a percentage with no decimal places', () => {
  assert.equal(formatPct(14.4), '14%');
});

test('renders a dash for a missing percentage', () => {
  assert.equal(formatPct(null), '-');
});

test('draws a proportional bar', () => {
  assert.equal(formatBar(50, 10), '█████░░░░░');
});

test('draws an empty bar at zero', () => {
  assert.equal(formatBar(0, 10), '░░░░░░░░░░');
});

test('draws a full bar at one hundred', () => {
  assert.equal(formatBar(100, 10), '██████████');
});

test('clamps a bar above one hundred rather than overflowing its width', () => {
  assert.equal(formatBar(340, 10).length, 10);
});

test('treats a missing value as an empty bar', () => {
  assert.equal(formatBar(null, 4), '░░░░');
});
