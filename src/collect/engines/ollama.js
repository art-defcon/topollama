// Reads Ollama state over HTTP instead of parsing the `ollama ps` table. The
// CLI's PROCESSOR column is derived from SizeVRAM vs Size in cmd.go, so we
// compute the same split from the raw byte counts and skip the text entirely.

export function resolveHost(env = process.env) {
  const raw = env.OLLAMA_HOST;
  if (!raw) return 'http://127.0.0.1:11434';
  return /^https?:\/\//.test(raw) ? raw : `http://${raw}`;
}

export function placementOf(size, sizeVram) {
  if (size === 0 || sizeVram > size) return { cpuPct: null, gpuPct: null };
  if (sizeVram === 0) return { cpuPct: 100, gpuPct: 0 };
  if (sizeVram === size) return { cpuPct: 0, gpuPct: 100 };

  const cpuPct = Math.round(((size - sizeVram) / size) * 100);
  return { cpuPct, gpuPct: 100 - cpuPct };
}

export function normalizePs(payload) {
  const models = payload?.models;
  if (!Array.isArray(models)) return [];

  return models.map((m) => {
    const size = m.size ?? 0;
    const vram = m.size_vram ?? 0;
    const { cpuPct, gpuPct } = placementOf(size, vram);

    return {
      name: m.name ?? m.model ?? '',
      id: (m.digest ?? '').substring(0, 10),
      sizeBytes: size,
      vramBytes: vram,
      cpuPct,
      gpuPct,
      contextLength: m.context_length ?? null,
      expiresAt: m.expires_at ?? null,
      quant: m.details?.quantization_level ?? null
    };
  });
}

export function normalizeTags(payload) {
  const models = payload?.models;
  if (!Array.isArray(models)) return [];

  return models.map((m) => ({
    name: m.name ?? m.model ?? '',
    id: (m.digest ?? '').substring(0, 10),
    diskBytes: m.size ?? 0
  }));
}

async function getJson(url, timeoutMs) {
  const signal = AbortSignal.timeout(timeoutMs);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.json();
}

export async function readOllama({ host = resolveHost(), withTags = false } = {}) {
  try {
    const loaded = normalizePs(await getJson(`${host}/api/ps`, 2000));
    const disk = withTags
      ? normalizeTags(await getJson(`${host}/api/tags`, 4000))
      : null;
    return { up: true, host, loaded, disk, error: null };
  } catch (err) {
    return { up: false, host, loaded: [], disk: null, error: err.message };
  }
}
