# topollama

A terminal-based monitoring dashboard for Ollama, inspired by gtop. This tool provides a real-time view of your running Ollama models with historical data visualization.

![Topollama Screenshot](https://github.com/art-defcon/topollama/blob/main/public/screenshot.png)

## Features

- List of running Ollama models with details
- CPU usage history graph (last 100 data points)
- Memory usage history graph (last 100 data points)
- Real-time updates every second
- All data fetched directly from the Ollama API

## Requirements

- Node.js 14+
- Ollama running on the same machine (default: http://localhost:11434)

## Installation

### Global Installation

```bash
# Install from npm (once published)
npm install -g topollama

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

## How It Works

topollama connects to the Ollama API endpoint at `http://localhost:11434/api/ps` to retrieve information about all running Ollama processes. It stores the last 100 data points to provide a historical view of CPU and memory usage over time.q