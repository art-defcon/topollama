import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const run = promisify(execFile);

// Reads Apple GPU telemetry the way nvtop's extract_gpuinfo_apple.m does: the
// AGXAccelerator node's PerformanceStatistics dictionary is the authoritative
// source for device-wide utilization and allocated memory.
//
// -w 0 disables line wrapping so the dictionary stays on one line; -d 1 keeps
// the walk to the accelerator's own properties. Measured at ~24ms.
export async function readGpu() {
  if (os.platform() !== 'darwin') return null;
  try {
    const { stdout } = await run(
      'ioreg',
      ['-r', '-d', '1', '-w', '0', '-c', 'AGXAccelerator'],
      { timeout: 3000, maxBuffer: 4 * 1024 * 1024 }
    );
    const info = parseAcceleratorInfo(stdout);
    if (!info) return null;
    // Memory is unified, so the host's total is the GPU's total — the same
    // substitution nvtop makes via host_info(HOST_BASIC_INFO).max_mem.
    return { ...info, totalBytes: os.totalmem() };
  } catch {
    return null;
  }
}

export function parseAcceleratorInfo(text) {
  const stats = text.match(/"PerformanceStatistics"\s*=\s*\{([^}]*)\}/);
  if (!stats) return null;

  const num = (key) => {
    const m = stats[1].match(new RegExp(`"${key}"=(\\d+)`));
    return m ? Number(m[1]) : null;
  };

  const name = text.match(/"model"\s*=\s*"([^"]*)"/);
  const cores = text.match(/"gpu-core-count"\s*=\s*(\d+)/);

  return {
    util: num('Device Utilization %'),
    renderer: num('Renderer Utilization %'),
    tiler: num('Tiler Utilization %'),
    // nvtop uses "Alloc system memory" rather than MTLDevice.currentAllocatedSize,
    // which only covers the calling process.
    allocBytes: num('Alloc system memory'),
    // The quoted key stops the match before "In use system memory (driver)".
    inUseBytes: num('In use system memory'),
    name: name ? name[1] : null,
    cores: cores ? Number(cores[1]) : null
  };
}
