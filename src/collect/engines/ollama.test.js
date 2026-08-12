import { test } from 'node:test';
import assert from 'node:assert/strict';

import { placementOf, normalizePs, normalizeTags, resolveHost } from './ollama.js';

// Mirrors the switch in ollama's cmd.go ListRunningHandler, which derives the
// PROCESSOR column from SizeVRAM vs Size. We compute it from the same numbers
// instead of parsing the string it prints.

test('reports fully resident on GPU when vram equals total size', () => {
  assert.deepEqual(placementOf(5287958282, 5287958282), { cpuPct: 0, gpuPct: 100 });
});

test('reports fully on CPU when no vram is used', () => {
  assert.deepEqual(placementOf(5287958282, 0), { cpuPct: 100, gpuPct: 0 });
});

test('splits the percentage when a model is partially offloaded', () => {
  // 40% of the weights left on the CPU
  assert.deepEqual(placementOf(1000, 600), { cpuPct: 40, gpuPct: 60 });
});

test('rounds the split the same way ollama does', () => {
  // sizeCPU/size = 0.335 -> round() -> 34
  assert.deepEqual(placementOf(1000, 665), { cpuPct: 34, gpuPct: 66 });
});

test('reports unknown placement when vram exceeds total size', () => {
  assert.deepEqual(placementOf(1000, 2000), { cpuPct: null, gpuPct: null });
});

test('reports unknown placement when total size is zero', () => {
  assert.deepEqual(placementOf(0, 0), { cpuPct: null, gpuPct: null });
});

test('normalizes a loaded model from the /api/ps payload', () => {
  const payload = {
    models: [{
      name: 'qwen3:0.6b',
      model: 'qwen3:0.6b',
      size: 5287958282,
      digest: '7df6b6e09427a769808717c0a93cadc4ae99ed4eb8bf5ca557c90846becea435',
      size_vram: 5287958282,
      context_length: 40960,
      expires_at: '2026-08-12T14:50:12.579231+02:00',
      details: { parameter_size: '751.63M', quantization_level: 'Q4_K_M' }
    }]
  };

  assert.deepEqual(normalizePs(payload), [{
    name: 'qwen3:0.6b',
    id: '7df6b6e094',
    sizeBytes: 5287958282,
    vramBytes: 5287958282,
    cpuPct: 0,
    gpuPct: 100,
    contextLength: 40960,
    expiresAt: '2026-08-12T14:50:12.579231+02:00',
    quant: 'Q4_K_M'
  }]);
});

test('returns an empty list when no models are loaded', () => {
  assert.deepEqual(normalizePs({ models: [] }), []);
});

test('returns an empty list when the payload has no models key', () => {
  assert.deepEqual(normalizePs({}), []);
});

test('normalizes on-disk models from the /api/tags payload', () => {
  const payload = {
    models: [{ name: 'qwen3:0.6b', size: 522653767, digest: '7df6b6e09427abc' }]
  };
  assert.deepEqual(normalizeTags(payload), [
    { name: 'qwen3:0.6b', id: '7df6b6e094', diskBytes: 522653767 }
  ]);
});

test('defaults to the local ollama port', () => {
  assert.equal(resolveHost({}), 'http://127.0.0.1:11434');
});

test('honours OLLAMA_HOST when it carries a scheme', () => {
  assert.equal(resolveHost({ OLLAMA_HOST: 'http://box:9999' }), 'http://box:9999');
});

test('adds a scheme to a bare OLLAMA_HOST value', () => {
  assert.equal(resolveHost({ OLLAMA_HOST: '127.0.0.1:9999' }), 'http://127.0.0.1:9999');
});
