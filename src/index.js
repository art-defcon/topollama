#!/usr/bin/env node

import blessed from 'blessed';
import contrib from 'blessed-contrib';
import moment from 'moment';
import { createCollector } from './collect/index.js';
import { formatSize, formatPct } from './format.js';
import { formatHeader, headerTitle } from './header.js';

// Create a screen object
const screen = blessed.screen({
  smartCSR: true,
  title: 'topollama - Ollama Process Monitor'
});

// Create a grid layout
const grid = new contrib.grid({
  rows: 12,
  cols: 12,
  screen: screen
});

// Create a hidden log widget for internal logging (not visible in UI)
const log = blessed.log({
  parent: screen,
  hidden: true, // Make it completely hidden
  width: 0,
  height: 0
});

// Running Models Table
// Machine-wide summary: correct regardless of which engines are running,
// because unified memory puts every allocation in the same accelerator.
const headerBox = grid.set(0, 0, 2, 12, blessed.box, {
  tags: true,
  label: 'topollama',
  padding: { left: 1 },
  border: { type: 'line', fg: 'cyan' }
});

const runningModelsList = grid.set(2, 0, 3, 12, contrib.table, {
  keys: true,
  fg: 'white',
  selectedFg: 'white',
  selectedBg: 'blue',
  interactive: true,
  label: 'Ollama Models',
  columnSpacing: 2,
  columnWidth: [28, 12, 11, 11, 11, 8], // Model, ID, DISK, LOADED, VRAM, ON GPU
  border: { type: 'line', fg: 'cyan' }
});

// Inference engines discovered from the process table
const enginesList = grid.set(5, 0, 3, 12, contrib.table, {
  keys: false,
  fg: 'white',
  interactive: false,
  label: 'Engines',
  columnSpacing: 2,
  columnWidth: [14, 7, 7, 24, 9, 9, 9, 8], // Engine, PID, Port, Model, CPU%, RAM, TOK/S, SLOTS
  border: { type: 'line', fg: 'cyan' }
});

// CPU & GPU History Chart
const cpuChart = grid.set(8, 0, 4, 6, contrib.line, { // Increased height from 4 to 5
  style: { text: 'green', baseline: 'black' },
  xLabelPadding: 3,
  xPadding: 5,
  showLegend: true,
  legend: { width: 10 },
  label: 'CPU & GPU Utilization (%)',
  minY: 0,
  maxY: 100,
  border: { type: 'line', fg: 'cyan' }
});

// Memory History Chart
const memoryChart = grid.set(8, 6, 4, 6, contrib.line, { // Increased height from 4 to 5
  style: { line: 'yellow', text: 'green', baseline: 'black' },
  xLabelPadding: 3,
  xPadding: 5,
  showLegend: true,
  legend: { width: 12 },
  label: 'Memory Usage History (MB)',
  border: { type: 'line', fg: 'cyan' }
});


// --- DATA STRUCTURES ---
const historyLength = 60;
let currentModelData = [];

const cpuHistoryData = {
  title: 'CPU',
  x: Array(historyLength).fill('').map((_, i) => moment().subtract(historyLength - 1 - i, 'seconds').format('HH:mm:ss')),
  y: Array(historyLength).fill(0),
  style: { line: 'cyan' }
};

const gpuHistoryData = {
  title: 'GPU',
  x: Array(historyLength).fill('').map((_, i) => moment().subtract(historyLength - 1 - i, 'seconds').format('HH:mm:ss')),
  y: Array(historyLength).fill(0),
  style: { line: 'magenta' }
};

const usedMemoryHistoryData = {
  title: 'Used (MB)',
  x: Array(historyLength).fill('').map((_, i) => moment().subtract(historyLength - 1 - i, 'seconds').format('HH:mm:ss')),
  y: Array(historyLength).fill(0),
  style: { line: 'cyan' }
};

const freeMemoryHistoryData = {
  title: 'Free (MB)',
  x: Array(historyLength).fill('').map((_, i) => moment().subtract(historyLength - 1 - i, 'seconds').format('HH:mm:ss')),
  y: Array(historyLength).fill(0),
  style: { line: 'magenta' }
};

// --- HELPER FUNCTIONS ---


const collect = createCollector();

const MB = 1024 * 1024;

// Everything the UI needs arrives in one snapshot per tick. Nothing below this
// point spawns a process or makes a request.
function buildModelRows(snapshot) {
  const loadedByName = new Map(snapshot.ollama.loaded.map((m) => [m.name, m]));

  // Show every model on disk, with live figures for the ones actually loaded.
  const rows = snapshot.ollama.disk.map((model) => {
    const live = loadedByName.get(model.name);
    loadedByName.delete(model.name);
    return {
      name: model.name.substring(0, 28),
      id: model.id,
      disk: formatSize(model.diskBytes),
      loaded: live ? formatSize(live.sizeBytes) : '-',
      vram: live ? formatSize(live.vramBytes) : '-',
      onGpu: live && live.gpuPct !== null ? `${live.gpuPct}%` : '-'
    };
  });

  // A model can be loaded without appearing on disk (e.g. pulled by digest).
  for (const live of loadedByName.values()) {
    rows.push({
      name: live.name.substring(0, 28),
      id: live.id,
      disk: '-',
      loaded: formatSize(live.sizeBytes),
      vram: formatSize(live.vramBytes),
      onGpu: live.gpuPct !== null ? `${live.gpuPct}%` : '-'
    });
  }

  return rows;
}

// --- UPDATE FUNCTIONS ---

function updateModelsList() {
  const data = currentModelData.map(model => [
    model.name,
    model.id,
    model.disk,
    model.loaded,
    model.vram,
    model.onGpu
  ]);

  if (data.length === 0) {
    data.push(['(no models)', '', '', '', '', '']);
  }

  // LOADED and VRAM are byte counts from /api/ps; ON GPU is the share of the
  // weights resident in VRAM — placement, not utilization.
  runningModelsList.setData({
    headers: ['Model', 'ID', 'DISK', 'LOADED', 'VRAM', 'ON GPU'],
    data: data,
    align: ['left', 'left', 'right', 'right', 'right', 'right']
  });
}

// Ollama names its runner by blob path, so show the loaded model name instead
// when we have one; a bare sha256 blob tells the reader nothing.
function engineModelLabel(engine, snapshot) {
  if (engine.kind === 'ollama') {
    const loaded = snapshot.ollama.loaded[0];
    if (loaded) return loaded.name;
  }
  if (!engine.model) return '-';
  const base = engine.model.substring(engine.model.lastIndexOf('/') + 1);
  return base.startsWith('sha256-') ? `blob ${base.slice(7, 19)}` : base;
}

// Ollama omits --metrics when launching its runner, so throughput is simply
// unavailable there — shown as '-' rather than a misleading zero.
function throughputLabel(engine) {
  const tps = engine.telemetry?.metrics?.predictedTps;
  return typeof tps === 'number' ? tps.toFixed(1) : '-';
}

function slotsLabel(engine) {
  const slots = engine.telemetry?.slots;
  return slots ? `${slots.processing}/${slots.total}` : '-';
}

function updateEnginesList(snapshot) {
  const data = snapshot.engines.map(engine => [
    engine.kind,
    String(engine.pid),
    engine.port === null ? '-' : String(engine.port),
    engineModelLabel(engine, snapshot).substring(0, 24),
    `${engine.cpu}%`,
    formatSize(engine.rssBytes),
    throughputLabel(engine),
    slotsLabel(engine)
  ]);

  if (data.length === 0) {
    data.push(['(none running)', '', '', '', '', '', '', '']);
  }

  enginesList.setData({
    headers: ['Engine', 'PID', 'Port', 'Model', 'CPU%', 'RAM', 'TOK/S', 'SLOTS'],
    data: data,
    align: ['left', 'right', 'right', 'left', 'right', 'right', 'right', 'right']
  });
}

function updateHistoryCharts(snapshot) {
  try {
    const totalCpuUsage = snapshot.host.cpu ?? 0;
    const totalMemoryUsage = Math.round(snapshot.host.memUsed / MB);
    const freeMemory = Math.round(snapshot.host.memFree / MB);
    const totalGpuUsage = snapshot.gpu ? snapshot.gpu.util : 0;

    const currentTime = moment().format('HH:mm:ss');

    cpuHistoryData.y.shift();
    cpuHistoryData.y.push(totalCpuUsage);
    cpuHistoryData.x.shift();
    cpuHistoryData.x.push(currentTime);

    gpuHistoryData.y.shift();
    gpuHistoryData.y.push(totalGpuUsage);
    gpuHistoryData.x.shift();
    gpuHistoryData.x.push(currentTime);

    cpuChart.setData([cpuHistoryData, gpuHistoryData]);

    freeMemoryHistoryData.y.shift();
    freeMemoryHistoryData.y.push(freeMemory);
    freeMemoryHistoryData.x.shift();
    freeMemoryHistoryData.x.push(currentTime);

    usedMemoryHistoryData.y.shift();
    usedMemoryHistoryData.y.push(totalMemoryUsage);
    usedMemoryHistoryData.x.shift();
    usedMemoryHistoryData.x.push(currentTime);

    memoryChart.setData([freeMemoryHistoryData, usedMemoryHistoryData]);

  } catch (error) {
    console.error(`Chart update err: ${error.message.split('\n')[0]}`);
  }
}

// One collect() per tick feeds every widget.
async function updateAll() {
  try {
    const snapshot = await collect();
    currentModelData = buildModelRows(snapshot);
    updateModelsList();
    updateEnginesList(snapshot);
    updateHistoryCharts(snapshot);

    headerBox.setContent(formatHeader(snapshot));
    headerBox.setLabel(headerTitle(snapshot));

    enginesList.setLabel(`Engines — ${snapshot.engines.length} running`);

    runningModelsList.setLabel(
      snapshot.ollama.up
        ? `Ollama Models — ${snapshot.ollama.loaded.length} loaded`
        : `Ollama unreachable (${snapshot.ollama.host ?? 'not polled yet'})`
    );

    screen.render();
  } catch (error) {
    console.error(`UpdateAll Err: ${error.message.split('\n')[0]}`);
    screen.render();
  }
}


// --- MAIN EXECUTION ---
screen.key(['escape', 'q', 'C-c'], () => {
  clearInterval(updateInterval);
  screen.destroy();
  console.log('\ntopollama stopped.');
  process.exit(0);
});

screen.key(['r'], () => {
  console.log('Manual refresh triggered...');
  updateAll();
});

console.log('topollama starting... Press q to quit, r to refresh.');
updateAll();
// Fast tier is ~46ms of work, so a 1s tick gives the charts real resolution
// while HTTP polls and static info ride their own slower gates in the collector.
const updateInterval = setInterval(updateAll, 1000);

screen.on('resize', () => {
  runningModelsList.emit('attach');
  headerBox.emit('attach');
  enginesList.emit('attach');
  cpuChart.emit('attach');
  memoryChart.emit('attach');
  screen.render();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`Unhandled Rejection at:', ${promise}, 'reason:', ${reason}`);
});

screen.render();
