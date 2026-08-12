// llama.cpp server telemetry. Ollama spawns llama-server as its runner, so the
// same endpoints serve both Ollama-managed and standalone servers — the only
// difference is that Ollama omits --metrics, leaving /metrics answering 501.

export function parsePrometheus(text) {
  const samples = {};

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^(\S+)\s+(-?[\d.eE+]+)$/);
    if (!match) continue;

    samples[match[1]] = Number(match[2]);
  }

  return samples;
}

export function summarizeMetrics(text) {
  if (!text) return null;
  const s = parsePrometheus(text);

  return {
    predictedTps: s['llamacpp:predicted_tokens_seconds'] ?? null,
    promptTps: s['llamacpp:prompt_tokens_seconds'] ?? null,
    tokensPredicted: s['llamacpp:tokens_predicted_total'] ?? null,
    processing: s['llamacpp:requests_processing'] ?? null,
    deferred: s['llamacpp:requests_deferred'] ?? null
  };
}

export function summarizeSlots(slots) {
  if (!Array.isArray(slots)) return null;

  return {
    total: slots.length,
    processing: slots.filter((slot) => slot.is_processing).length,
    // Context is divided across slots, so every slot reports the same n_ctx.
    nCtx: slots[0]?.n_ctx ?? null
  };
}

export function summarizeProps(props) {
  if (!props) return null;

  return {
    modelPath: props.model_path ?? null,
    totalSlots: props.total_slots ?? null,
    buildInfo: props.build_info ?? null,
    // /props advertises whether --metrics was passed, so we can skip polling an
    // endpoint that would only ever answer 501.
    metricsEnabled: props.endpoint_metrics === true
  };
}

async function get(url, timeoutMs, asText = false) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) return null;
  return asText ? res.text() : res.json();
}

export async function readLlamaServer({ port, host = '127.0.0.1', props = null }) {
  const base = `http://${host}:${port}`;

  try {
    // /props is static for the life of the process, so it is fetched once and
    // handed back in on later ticks.
    const staticInfo = props ?? summarizeProps(await get(`${base}/props`, 2000));

    const [slots, metrics] = await Promise.all([
      get(`${base}/slots`, 2000).catch(() => null),
      staticInfo?.metricsEnabled
        ? get(`${base}/metrics`, 2000, true).catch(() => null)
        : Promise.resolve(null)
    ]);

    return {
      up: true,
      props: staticInfo,
      slots: summarizeSlots(slots),
      metrics: summarizeMetrics(metrics)
    };
  } catch {
    return { up: false, props: props ?? null, slots: null, metrics: null };
  }
}
