import { execFile } from 'child_process';
import { promisify } from 'util';

const run = promisify(execFile);

// A single `ps -A` sweep (~22ms for ~750 processes) serves three purposes at
// once: per-process CPU deltas, resident memory, and engine discovery. This is
// the same trade nvtop makes by reading proc_pidinfo once per refresh.

export function parseCpuTime(text) {
  // macOS ps prints MM:SS.hh, letting minutes run past 60 rather than adding an
  // hours field. Handle HH:MM:SS.hh too in case that assumption ever changes.
  const m = text.match(/^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/);
  if (!m) return null;

  const [, hours, minutes, seconds] = m;
  return (hours ? Number(hours) * 3600 : 0) + Number(minutes) * 60 + Number(seconds);
}

export function parsePsSweep(text) {
  const rows = [];

  for (const line of text.split('\n').slice(1)) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
    if (!m) continue;

    const cpuSeconds = parseCpuTime(m[4]);
    if (cpuSeconds === null) continue;

    rows.push({
      pid: Number(m[1]),
      ppid: Number(m[2]),
      rssBytes: Number(m[3]) * 1024, // ps reports RSS in kilobytes
      cpuSeconds,
      command: m[5]
    });
  }

  return rows;
}

export function cpuPercentFor(prev, next, elapsedMs) {
  if (!prev || elapsedMs <= 0) return 0;

  const delta = next.cpuSeconds - prev.cpuSeconds;
  // A pid can be recycled between sweeps, which reads as time going backwards.
  if (delta < 0) return 0;

  return Math.round((delta / (elapsedMs / 1000)) * 1000) / 10;
}

export async function readProcs() {
  const { stdout } = await run(
    'ps',
    ['-Ao', 'pid,ppid,rss,time,command'],
    { timeout: 4000, maxBuffer: 8 * 1024 * 1024 }
  );
  return parsePsSweep(stdout);
}
