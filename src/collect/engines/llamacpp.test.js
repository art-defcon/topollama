import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parsePrometheus, summarizeMetrics, summarizeSlots, summarizeProps } from './llamacpp.js';

const fixture = (name) =>
  readFileSync(fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url)), 'utf8');

const metricsText = fixture('llamacpp-metrics.txt');
const slots = JSON.parse(fixture('llamacpp-slots.json'));
const props = JSON.parse(fixture('llamacpp-props.json'));

test('parses prometheus samples into name and value pairs', () => {
  const parsed = parsePrometheus(metricsText);
  assert.equal(parsed['llamacpp:tokens_predicted_total'], 60);
  assert.equal(parsed['llamacpp:predicted_tokens_seconds'], 215.827);
});

test('ignores HELP and TYPE comment lines', () => {
  const parsed = parsePrometheus(metricsText);
  assert.equal(parsed['#'], undefined);
  assert.equal(Object.keys(parsed).every((k) => k.startsWith('llamacpp:')), true);
});

test('parses a zero-valued gauge rather than dropping it', () => {
  assert.equal(parsePrometheus(metricsText)['llamacpp:requests_processing'], 0);
});

test('returns an empty object for text that has no samples', () => {
  assert.deepEqual(parsePrometheus('# HELP only a comment'), {});
});

test('summarizes throughput and queue depth from metrics', () => {
  assert.deepEqual(summarizeMetrics(metricsText), {
    predictedTps: 215.827,
    promptTps: 54.5455,
    tokensPredicted: 60,
    processing: 0,
    deferred: 0
  });
});

test('summarizes slot occupancy and context size', () => {
  assert.deepEqual(summarizeSlots(slots), {
    total: 2,
    processing: 0,
    nCtx: 1024
  });
});

test('counts only the slots that are actively processing', () => {
  const busy = [
    { id: 0, n_ctx: 4096, is_processing: true },
    { id: 1, n_ctx: 4096, is_processing: false }
  ];
  assert.deepEqual(summarizeSlots(busy), { total: 2, processing: 1, nCtx: 4096 });
});

test('returns null when the slots endpoint is disabled', () => {
  assert.equal(summarizeSlots(null), null);
});

test('summarizes the static server properties', () => {
  assert.deepEqual(summarizeProps(props), {
    modelPath: '/Users/johnpetroff/.ollama/models/blobs/sha256-7f4030143c1c477224c5434f8272c662a8b042079a0a584f0a27a1684fe2e1fa',
    totalSlots: 2,
    buildInfo: 'b10210-000547513',
    metricsEnabled: true
  });
});

test('reports metrics as unavailable when the server did not enable the endpoint', () => {
  // Ollama launches its runner without --metrics, so /metrics answers 501.
  assert.equal(summarizeProps({ ...props, endpoint_metrics: false }).metricsEnabled, false);
});
