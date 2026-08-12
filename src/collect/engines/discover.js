// Classifies a ps sweep into inference engines. Modern Ollama spawns
// llama-server as its runner subprocess, so a llama-server is only "standalone"
// if its parent isn't an ollama server — otherwise we'd double-count it.

const LLAMA_SERVER_DEFAULT_PORT = 8080;

// Match the executable name, not any mention of it: `tail /var/log/llama-server.log`
// must not register as an engine.
const execName = (command) => {
  const bin = command.split(/\s+/)[0] ?? '';
  return bin.substring(bin.lastIndexOf('/') + 1);
};

export function argValue(command, flags) {
  const parts = command.split(/\s+/);
  for (const flag of flags) {
    const i = parts.indexOf(flag);
    if (i === -1 || i + 1 >= parts.length) continue;
    const value = parts[i + 1];
    if (value.startsWith('-')) continue; // the flag was passed without a value
    return value;
  }
  return null;
}

const portOf = (command, fallback) => {
  const raw = argValue(command, ['--port']);
  return raw === null ? fallback : Number(raw);
};

const modelOf = (command) => argValue(command, ['--model', '-m']);

export function classifyEngines(procs) {
  const isOllamaServer = (p) =>
    execName(p.command) === 'ollama' && / serve\b/.test(p.command);

  const ollamaPids = new Set(procs.filter(isOllamaServer).map((p) => p.pid));
  const engines = [];

  for (const proc of procs) {
    const name = execName(proc.command);

    if (isOllamaServer(proc)) {
      const runners = procs.filter(
        (p) => p.ppid === proc.pid && execName(p.command) === 'llama-server'
      );
      engines.push({
        kind: 'ollama',
        pid: proc.pid,
        pids: [proc.pid, ...runners.map((r) => r.pid)],
        runnerPids: runners.map((r) => r.pid),
        // The runner owns the port and the weights; the supervisor is idle.
        port: runners.length ? portOf(runners[0].command, null) : null,
        model: runners.length ? modelOf(runners[0].command) : null
      });
      continue;
    }

    if (name === 'llama-server') {
      if (ollamaPids.has(proc.ppid)) continue; // already folded into its ollama engine
      engines.push({
        kind: 'llama-server',
        pid: proc.pid,
        pids: [proc.pid],
        runnerPids: [],
        port: portOf(proc.command, LLAMA_SERVER_DEFAULT_PORT),
        model: modelOf(proc.command)
      });
      continue;
    }

    if (name === 'llama-cli') {
      engines.push({
        kind: 'llama-cli',
        pid: proc.pid,
        pids: [proc.pid],
        runnerPids: [],
        port: null, // no HTTP surface at all
        model: modelOf(proc.command)
      });
    }
  }

  return engines;
}
