import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const run = promisify(execFile);

// nvtop keeps the previous cumulative counters and divides by elapsed time
// instead of sleeping to sample. Same idea here: os.cpus() exposes cumulative
// tick counters, so two ticks apart is all we need.

export function readCpuSample(cpus = os.cpus()) {
  return cpus.map((cpu) => ({
    idle: cpu.times.idle,
    total: Object.values(cpu.times).reduce((sum, t) => sum + t, 0)
  }));
}

export function cpuPercentBetween(prev, next) {
  if (!prev || prev.length !== next.length) return 0;

  const busy = next.map((core, i) => {
    const totalDelta = core.total - prev[i].total;
    if (totalDelta <= 0) return 0;
    const idleDelta = core.idle - prev[i].idle;
    return (1 - idleDelta / totalDelta) * 100;
  });

  return round1(busy.reduce((sum, b) => sum + b, 0) / busy.length);
}

export function parseVmStat(text) {
  const pageSize = text.match(/page size of (\d+) bytes/);
  if (!pageSize) return null;

  const pages = (label) => {
    const m = text.match(new RegExp(`Pages ${label}:\\s+(\\d+)\\.`));
    return m ? Number(m[1]) : 0;
  };

  // Inactive pages are reclaimable, so macOS treats them as available. This is
  // what osx-extra computed, minus its two synchronous process spawns.
  return (pages('free') + pages('inactive')) * Number(pageSize[1]);
}

export async function readFreeMemory() {
  if (os.platform() !== 'darwin') return os.freemem();
  try {
    const { stdout } = await run('vm_stat', [], { timeout: 2000 });
    return parseVmStat(stdout) ?? os.freemem();
  } catch {
    return os.freemem();
  }
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
