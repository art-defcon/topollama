import os from 'os';

import { readGpu } from './gpu-apple.js';
import { readCpuSample, cpuPercentBetween, readFreeMemory } from './host.js';

// One collector instance owns all sampling state. Rate metrics are deltas
// against the previous tick rather than a blocking in-tick measurement.
export function createCollector() {
  let prevCpuSample = null;

  return async function collect() {
    const [gpu, freeMem] = await Promise.all([readGpu(), readFreeMemory()]);

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
      }
    };
  };
}
