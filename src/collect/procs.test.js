import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseCpuTime, parsePsSweep, cpuPercentFor } from './procs.js';

test('parses the MM:SS.hh time format ps uses on macOS', () => {
  assert.equal(parseCpuTime('0:02.27'), 2.27);
});

test('parses minute counts that run past an hour without rolling over', () => {
  // ps prints 880 minutes rather than switching to an hours field
  assert.equal(parseCpuTime('880:51.57'), 880 * 60 + 51.57);
});

test('parses an explicit hours field when ps emits one', () => {
  assert.equal(parseCpuTime('2:03:04.50'), 2 * 3600 + 3 * 60 + 4.5);
});

test('returns null for an unparseable time', () => {
  assert.equal(parseCpuTime('-'), null);
});

test('parses a ps sweep into pid, ppid, rss and cpu time', () => {
  const out = [
    '  PID  PPID    RSS      TIME COMMAND',
    ' 9011  8970  14208   0:00.79 /Applications/Ollama.app/Contents/Resources/ollama serve',
    ' 9076  9011 5094784   0:02.27 /Applications/Ollama.app/Contents/Resources/llama-server --port 63188'
  ].join('\n');

  assert.deepEqual(parsePsSweep(out), [
    {
      pid: 9011,
      ppid: 8970,
      rssBytes: 14208 * 1024,
      cpuSeconds: 0.79,
      command: '/Applications/Ollama.app/Contents/Resources/ollama serve'
    },
    {
      pid: 9076,
      ppid: 9011,
      rssBytes: 5094784 * 1024,
      cpuSeconds: 2.27,
      command: '/Applications/Ollama.app/Contents/Resources/llama-server --port 63188'
    }
  ]);
});

test('keeps spaces inside a command path', () => {
  const out = [
    '  PID  PPID    RSS      TIME COMMAND',
    '66114 66106 155456 296:56.60 /Applications/Hermes Helper (Renderer).app/Contents/MacOS/Hermes Helper'
  ].join('\n');

  assert.equal(
    parsePsSweep(out)[0].command,
    '/Applications/Hermes Helper (Renderer).app/Contents/MacOS/Hermes Helper'
  );
});

test('skips blank and malformed lines', () => {
  const out = ['  PID  PPID    RSS      TIME COMMAND', '', 'garbage'].join('\n');
  assert.deepEqual(parsePsSweep(out), []);
});

test('derives process cpu percent from the cpu-time delta over elapsed wallclock', () => {
  // 1.0s of CPU burned across 2.0s of wallclock = 50% of one core
  assert.equal(cpuPercentFor({ cpuSeconds: 10 }, { cpuSeconds: 11 }, 2000), 50);
});

test('reports above 100% for a process using more than one core', () => {
  assert.equal(cpuPercentFor({ cpuSeconds: 0 }, { cpuSeconds: 6 }, 2000), 300);
});

test('reports 0% when there is no previous sample for the pid', () => {
  assert.equal(cpuPercentFor(undefined, { cpuSeconds: 11 }, 2000), 0);
});

test('reports 0% rather than dividing by zero when no time elapsed', () => {
  assert.equal(cpuPercentFor({ cpuSeconds: 10 }, { cpuSeconds: 11 }, 0), 0);
});

test('reports 0% when a recycled pid shows cpu time going backwards', () => {
  assert.equal(cpuPercentFor({ cpuSeconds: 100 }, { cpuSeconds: 1 }, 2000), 0);
});
