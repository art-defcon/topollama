import os from 'os';

import { readGpu } from './gpu-apple.js';
import { readCpuSample, cpuPercentBetween, readFreeMemory } from './host.js';
import { readOllama } from './engines/ollama.js';

// The on-disk model list barely changes, so it rides a slower tier than the
// per-tick counters.
const TAGS_INTERVAL_MS = 10_000;

// One collector instance owns all sampling state. Rate metrics are deltas
// against the previous tick rather than a blocking in-tick measurement.
export function createCollector() {
  let prevCpuSample = null;
  let cachedDisk = null;
  let lastTagsAt = 0;

  return async function collect() {
    const wantTags = Date.now() - lastTagsAt >= TAGS_INTERVAL_MS;

    const [gpu, freeMem, ollama] = await Promise.all([
      readGpu(),
      readFreeMemory(),
      readOllama({ withTags: wantTags })
    ]);

    if (ollama.disk) {
      cachedDisk = ollama.disk;
      lastTagsAt = Date.now();
    }

    const cpuSample = readCpuSample();
    const cpu = cpuPercentBetween(prevCpuSample, cpuSample);
    prevCpuSample = cpuSample;

    const memTotal = os.totalmem();

    return {
      t: Date.now(),
      gpu,
      host: {
        cpu,
        cores: os.cpus().length,
        memTotal,
        memFree: freeMem,
        memUsed: memTotal - freeMem
      },
      ollama: {
        up: ollama.up,
        host: ollama.host,
        error: ollama.error,
        loaded: ollama.loaded,
        disk: cachedDisk ?? []
      }
    };
  };
}
