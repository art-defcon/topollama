import { test } from 'node:test';
import assert from 'node:assert/strict';

import { argValue, classifyEngines } from './discover.js';

// Real command lines observed on this machine.
const OLLAMA_SERVE = '/Applications/Ollama.app/Contents/Resources/ollama serve';
const OLLAMA_RUNNER =
  '/Applications/Ollama.app/Contents/Resources/llama-server --model ' +
  '/Users/x/.ollama/models/blobs/sha256-7f4030143c1c --port 63188 --host 127.0.0.1 ' +
  '--no-webui --offline -c 40960 -np 1 --flash-attn auto';

test('reads a long-form flag value', () => {
  assert.equal(argValue(OLLAMA_RUNNER, ['--port']), '63188');
});

test('reads the first flag that is present', () => {
  assert.equal(argValue('llama-cli -m /models/a.gguf', ['--model', '-m']), '/models/a.gguf');
});

test('returns null when no candidate flag is present', () => {
  assert.equal(argValue('llama-cli --verbose', ['--model', '-m']), null);
});

test('does not treat a following flag as a value', () => {
  assert.equal(argValue('llama-server --model --port 8080', ['--model']), null);
});

test('finds an ollama server and its llama-server runner as one engine', () => {
  const procs = [
    { pid: 9011, ppid: 8970, rssBytes: 14_000_000, cpuSeconds: 1, command: OLLAMA_SERVE },
    { pid: 9076, ppid: 9011, rssBytes: 5_000_000_000, cpuSeconds: 2, command: OLLAMA_RUNNER }
  ];

  const engines = classifyEngines(procs);
  assert.equal(engines.length, 1);
  assert.equal(engines[0].kind, 'ollama');
  assert.equal(engines[0].pid, 9011);
  assert.deepEqual(engines[0].runnerPids, [9076]);
  // The runner holds the weights, so it is where the port and memory live.
  assert.equal(engines[0].port, 63188);
});

test('treats a standalone llama-server as its own engine', () => {
  const procs = [
    { pid: 500, ppid: 1, rssBytes: 4_000_000_000, cpuSeconds: 9,
      command: '/opt/homebrew/bin/llama-server -m /models/qwen.gguf --port 8080' }
  ];

  const engines = classifyEngines(procs);
  assert.equal(engines.length, 1);
  assert.equal(engines[0].kind, 'llama-server');
  assert.equal(engines[0].port, 8080);
  assert.equal(engines[0].model, '/models/qwen.gguf');
});

test('defaults a standalone llama-server with no port flag to 8080', () => {
  const procs = [
    { pid: 500, ppid: 1, rssBytes: 1, cpuSeconds: 1,
      command: '/opt/homebrew/bin/llama-server -m /models/qwen.gguf' }
  ];
  assert.equal(classifyEngines(procs)[0].port, 8080);
});

test('finds llama-cli and gives it no port', () => {
  const procs = [
    { pid: 700, ppid: 1, rssBytes: 2_000_000_000, cpuSeconds: 4,
      command: '/opt/homebrew/bin/llama-cli -m /models/llama.gguf -p hello' }
  ];

  const engines = classifyEngines(procs);
  assert.equal(engines[0].kind, 'llama-cli');
  assert.equal(engines[0].port, null);
  assert.equal(engines[0].model, '/models/llama.gguf');
});

test('does not mistake an ollama-spawned runner for a standalone server', () => {
  const procs = [
    { pid: 9011, ppid: 8970, rssBytes: 1, cpuSeconds: 1, command: OLLAMA_SERVE },
    { pid: 9076, ppid: 9011, rssBytes: 1, cpuSeconds: 1, command: OLLAMA_RUNNER }
  ];
  assert.equal(classifyEngines(procs).filter((e) => e.kind === 'llama-server').length, 0);
});

test('ignores unrelated processes', () => {
  const procs = [
    { pid: 1, ppid: 0, rssBytes: 1, cpuSeconds: 1, command: '/sbin/launchd' },
    { pid: 2, ppid: 1, rssBytes: 1, cpuSeconds: 1, command: '/usr/sbin/coreaudiod' }
  ];
  assert.deepEqual(classifyEngines(procs), []);
});

test('does not match a path that merely mentions an engine name', () => {
  const procs = [
    { pid: 3, ppid: 1, rssBytes: 1, cpuSeconds: 1,
      command: '/usr/bin/tail -f /var/log/llama-server.log' }
  ];
  assert.deepEqual(classifyEngines(procs), []);
});

test('sums runner memory onto the ollama engine', () => {
  const procs = [
    { pid: 9011, ppid: 8970, rssBytes: 14_000_000, cpuSeconds: 1, command: OLLAMA_SERVE },
    { pid: 9076, ppid: 9011, rssBytes: 5_000_000_000, cpuSeconds: 2, command: OLLAMA_RUNNER }
  ];
  assert.equal(classifyEngines(procs)[0].pids.length, 2);
});
