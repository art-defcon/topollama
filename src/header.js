import { formatSize, formatPct, formatBar } from './format.js';

// The header carries the machine-wide truth: on unified memory every engine's
// allocations land in the same accelerator, so these figures are correct no
// matter which engines are running.

export function headerTitle(snapshot) {
  const gpu = snapshot.gpu;
  if (!gpu) return 'topollama';
  return `${gpu.name} · ${gpu.cores} GPU cores`;
}

export function formatHeader(snapshot) {
  const { gpu, host } = snapshot;

  const gpuUtil = gpu ? formatPct(gpu.util) : '-';
  const gpuBar = formatBar(gpu ? gpu.util : null, 12);
  const gpuMem = gpu
    ? `${formatSize(gpu.allocBytes)} / ${formatSize(gpu.totalBytes)}`
    : '-';

  const cpuUtil = formatPct(host.cpu);
  const cpuBar = formatBar(host.cpu, 12);
  const hostMem = `${formatSize(host.memUsed)} / ${formatSize(host.memTotal)}`;

  return (
    `{cyan-fg}GPU{/} ${gpuUtil.padStart(4)} ${gpuBar}  {cyan-fg}VRAM{/} ${gpuMem}\n` +
    `{cyan-fg}CPU{/} ${cpuUtil.padStart(4)} ${cpuBar}  {cyan-fg}RAM {/} ${hostMem}`
  );
}
