# topollama

A terminal-based monitoring dashboard for local LLM inference, inspired by gtop and nvtop. It shows what your GPU is actually doing, which engines are running, and how your models are placed in memory.

![Topollama Screenshot](https://github.com/art-defcon/topollama/blob/main/public/screenshot.png)

## Features

- Real GPU utilization and VRAM, read from the macOS IORegistry
- Ollama models with their on-disk, loaded and VRAM sizes
- Inference engines discovered from the process table: `ollama`, `llama-server` and `llama-cli`
- Throughput and slot occupancy for llama.cpp servers
- CPU, GPU and memory history graphs over the last 60 samples
- Updates every second

## Requirements

- Node.js 18+ (uses the built-in `fetch` and test runner)
- Ollama and/or llama.cpp running on the same machine
- macOS on Apple Silicon for GPU telemetry — everything else works anywhere

Ollama defaults to `http://127.0.0.1:11434` and honours `OLLAMA_HOST`.

## Installation

### Global Installation

```bash
# Or install locally from the source
git clone https://github.com/yourusername/topollama.git
cd topollama
npm install
npm link
```

### Local Installation

```bash
git clone https://github.com/yourusername/topollama.git
cd topollama
npm install
```

## Usage

```bash
# If installed globally
topollama

# If installed locally
npm start
```

## Keyboard Controls

- `q`, `Esc`, or `Ctrl+C`: Exit the application
- `r`: Manually refresh data

## Libraries

- **blessed**: For creating the terminal-based UI. ([source](https://github.com/chjj/blessed))
- **blessed-contrib**: For adding interactive components like tables and charts. ([source](https://github.com/Yomguithereal/blessed-contrib))
- **moment**: For handling date and time formatting. ([source](https://github.com/moment/moment))

Everything else is read from the system directly, so there are no other runtime dependencies.

## How It Works

All data collection lives in `src/collect/`, which produces one snapshot per tick. The UI only renders that snapshot — it never spawns a process or makes a request itself.

Each source is read once per tick and rate metrics are computed as deltas against the previous sample, rather than by blocking to measure:

- **GPU** — `ioreg` reads the `AGXAccelerator` node's `PerformanceStatistics`, the same source nvtop uses. Because Apple Silicon has unified memory, these figures cover every engine on the machine at once.
- **Ollama** — `/api/ps` and `/api/tags` over HTTP. Per-model VRAM comes from `size_vram`, so the CPU/GPU split is computed from bytes rather than parsed from the `ollama ps` table.
- **Engines** — a single `ps` sweep classifies processes and attributes CPU and memory to each. Modern Ollama spawns `llama-server` as its runner, so that child is folded into its parent rather than counted twice.
- **llama.cpp** — `/props`, `/slots` and `/metrics`. Throughput needs the server started with `--metrics`; Ollama omits it, so those cells read `-`.

Sampling is tiered: kernel reads run every second, HTTP polls every two, and static information every ten.

## Development

```bash
npm test
```
