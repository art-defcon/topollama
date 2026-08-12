import os from 'os';

import { readGpu } from './gpu-apple.js';
import { readCpuSample, cpuPercentBetween, readFreeMemory } from './host.js';
import { readOllama } from './engines/ollama.js';
import { readProcs, cpuPercentFor } from './procs.js';
import { classifyEngines } from './engines/discover.js';
import { readLlamaServer } from './engines/llamacpp.js';
import { createTierGate } from './schedule.js';

// Sampling tiers. Cheap kernel reads run every tick; local HTTP polls run
// slower; discovery-grade static info slower still. The fast tier costs about
// 46ms (ioreg ~24ms + ps sweep ~22ms), so the charts can afford 1s resolution.
const HTTP_INTERVAL_MS = 2_000;
const STATIC_INTERVAL_MS = 10_000;

// One collector instance owns all sampling state. Rate metrics are deltas
// against the previous tick rather than a blocking in-tick measurement.
export function createCollector() {
  const httpTier = createTierGate(HTTP_INTERVAL_MS);
  const staticTier = createTierGate(STATIC_INTERVAL_MS);

  let prevCpuSample = null;
  let prevProcs = null;
  let prevProcsAt = 0;

  // Last known values for anything sampled slower than the fast tier, so a
  // snapshot is always complete even on ticks that skipped those sources.
  let lastOllama = { up: false, host: null, error: null, loaded: [] };
  let cachedDisk = [];
  const propsByPid = new Map();
  const telemetryByPid = new Map();

  return async function collect() {
    const now = Date.now();
    const wantHttp = httpTier.due(now);
    const wantStatic = staticTier.due(now);

    // --- fast tier: every tick ---
    const [gpu, freeMem, procs, ollama] = await Promise.all([
      readGpu(),
      readFreeMemory(),
      readProcs().catch(() => []),
      wantHttp ? readOllama({ withTags: wantStatic }) : Promise.resolve(null)
    ]);

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
      return {
        ...engine,
        cpu: Math.round(cpu * 10) / 10,
        rssBytes,
        telemetry: telemetryByPid.get(engine.pid) ?? null
      };
    });

    prevProcs = byPid;
    prevProcsAt = now;

    // --- http tier ---
    if (ollama) {
      lastOllama = {
        up: ollama.up,
        host: ollama.host,
        error: ollama.error,
        loaded: ollama.loaded
      };
      if (ollama.disk) cachedDisk = ollama.disk;
    }

    if (wantHttp) {
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
            telemetryByPid.set(engine.pid, telemetry);
            engine.telemetry = telemetry;
          })
      );

      // Drop cached state for pids that have gone away.
      for (const pid of propsByPid.keys()) if (!byPid.has(pid)) propsByPid.delete(pid);
      for (const pid of telemetryByPid.keys()) if (!byPid.has(pid)) telemetryByPid.delete(pid);
    }

    const cpuSample = readCpuSample();
    const cpu = cpuPercentBetween(prevCpuSample, cpuSample);
    prevCpuSample = cpuSample;

    const memTotal = os.totalmem();

    return {
      t: now,
      gpu,
      host: {
        cpu,
        cores: os.cpus().length,
        memTotal,
        memFree: freeMem,
        memUsed: memTotal - freeMem
      },
      ollama: { ...lastOllama, disk: cachedDisk },
      engines
    };
  };
}
