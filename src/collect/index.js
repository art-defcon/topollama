import os from 'os';

import { readGpu } from './gpu-apple.js';
import { readCpuSample, cpuPercentBetween, readFreeMemory } from './host.js';
import { readOllama } from './engines/ollama.js';
import { readProcs, cpuPercentFor } from './procs.js';
import { classifyEngines } from './engines/discover.js';
import { readLlamaServer } from './engines/llamacpp.js';

// The on-disk model list barely changes, so it rides a slower tier than the
// per-tick counters.
const TAGS_INTERVAL_MS = 10_000;

// One collector instance owns all sampling state. Rate metrics are deltas
// against the previous tick rather than a blocking in-tick measurement.
export function createCollector() {
  let prevCpuSample = null;
  let cachedDisk = null;
  let lastTagsAt = 0;
  let prevProcs = null;
  let prevProcsAt = 0;
  // /props never changes for the life of a runner, so cache it per pid and drop
  // the entry when that pid goes away.
  const propsByPid = new Map();

  return async function collect() {
    const wantTags = Date.now() - lastTagsAt >= TAGS_INTERVAL_MS;

    const [gpu, freeMem, ollama, procs] = await Promise.all([
      readGpu(),
      readFreeMemory(),
      readOllama({ withTags: wantTags }),
      readProcs().catch(() => [])
    ]);

    const now = Date.now();
    const elapsedMs = prevProcsAt ? now - prevProcsAt : 0;
    const byPid = new Map(procs.map((p) => [p.pid, p]));

    // Attribute every pid an engine owns — for Ollama that means folding the
    // llama-server runner's cost into the supervisor's row, since the
    // supervisor itself sits idle while the runner does the work.
    const engines = classifyEngines(procs).map((engine) => {
      let cpu = 0;
      let rssBytes = 0;
      for (const pid of engine.pids) {
        const proc = byPid.get(pid);
        if (!proc) continue;
        rssBytes += proc.rssBytes;
        cpu += cpuPercentFor(prevProcs?.get(pid), proc, elapsedMs);
      }
      return { ...engine, cpu: Math.round(cpu * 10) / 10, rssBytes };
    });

    // llama-cli has no HTTP surface, so only engines with a port are polled.
    await Promise.all(
      engines
        .filter((engine) => engine.port !== null)
        .map(async (engine) => {
          const telemetry = await readLlamaServer({
            port: engine.port,
            props: propsByPid.get(engine.pid) ?? null
          });
          if (telemetry.props) propsByPid.set(engine.pid, telemetry.props);
          engine.telemetry = telemetry;
        })
    );

    for (const pid of propsByPid.keys()) {
      if (!byPid.has(pid)) propsByPid.delete(pid);
    }

    prevProcs = byPid;
    prevProcsAt = now;

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
      },
      engines
    };
  };
}
