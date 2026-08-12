#!/usr/bin/env node

import blessed from 'blessed';
import contrib from 'blessed-contrib';
import moment from 'moment';
import { createCollector } from './collect/index.js';

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
const runningModelsList = grid.set(0, 0, 7, 12, contrib.table, {
  keys: true,
  fg: 'white',
  selectedFg: 'white',
  selectedBg: 'blue',
  interactive: true,
  label: 'Running Models (ollama ps)',
  columnSpacing: 2,
  columnWidth: [28, 12, 10, 10, 8, 8], // Name, ID, DISK, MEM, CPU%, GPU%
  border: { type: 'line', fg: 'cyan' }
});

// CPU & GPU History Chart
const cpuChart = grid.set(7, 0, 5, 6, contrib.line, { // Increased height from 4 to 5
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
const memoryChart = grid.set(7, 6, 5, 6, contrib.line, { // Increased height from 4 to 5
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

function formatSize(bytes) {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return '-';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 B';
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
  if (i === 0) return `${bytes} ${sizes[i]}`;
  return `${(bytes / (1024 ** i)).toFixed(1)} ${sizes[i]}`;
}

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
    updateHistoryCharts(snapshot);

    runningModelsList.setLabel(
      snapshot.ollama.up
        ? `Ollama Models — ${snapshot.ollama.loaded.length} loaded`
        : `Ollama unreachable (${snapshot.ollama.host})`
    );

    if (snapshot.gpu) {
      cpuChart.setLabel(`CPU & GPU Utilization (%) — ${snapshot.gpu.name}, ${snapshot.gpu.cores} cores`);
    }

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
const updateInterval = setInterval(updateAll, 2000);

screen.on('resize', () => {
  runningModelsList.emit('attach');
  cpuChart.emit('attach');
  memoryChart.emit('attach');
  screen.render();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`Unhandled Rejection at:', ${promise}, 'reason:', ${reason}`);
});

screen.render();
