import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTierGate } from './schedule.js';

test('is due on its very first check', () => {
  const gate = createTierGate(2000);
  assert.equal(gate.due(1000), true);
});

test('is not due again until the interval has passed', () => {
  const gate = createTierGate(2000);
  gate.due(1000);
  assert.equal(gate.due(2500), false);
});

test('is due once the interval has elapsed', () => {
  const gate = createTierGate(2000);
  gate.due(1000);
  assert.equal(gate.due(3000), true);
});

test('does not mark itself run when it reports not due', () => {
  const gate = createTierGate(2000);
  gate.due(1000);
  gate.due(1500); // not due, must not reset the clock
  assert.equal(gate.due(3000), true);
});
