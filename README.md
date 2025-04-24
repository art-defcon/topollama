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
- **ollama-js**: Official JavaScript client for Ollama. ([source](https://github.com/ollama/ollama-js))

## How It Works

topollama uses the official Ollama JavaScript client (ollama-js) to retrieve information about all running Ollama models. It stores the last 100 data points to provide a historical view of CPU and memory usage over time.
