#!/usr/bin/env node

import blessed from 'blessed';
import contrib from 'blessed-contrib';
import moment from 'moment';
import ollama from 'ollama';
import os from 'os';
import { exec } from 'child_process';

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

// --- WIDGETS ---

// Log widget
const log = grid.set(11, 0, 1, 12, contrib.log, {
  fg: 'green',
  selectedFg: 'green',
  label: 'Events & Logs'
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
const cpuChart = grid.set(7, 0, 4, 6, contrib.line, {
  style: { text: 'green', baseline: 'black' },
  xLabelPadding: 3,
  xPadding: 5,
  showLegend: true,
  legend: { width: 10 },
  label: 'CPU & GPU Usage History (%)',
  minY: 0,
  maxY: 100,
  border: { type: 'line', fg: 'cyan' }
});

// Memory History Chart
const memoryChart = grid.set(7, 6, 4, 6, contrib.line, {
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

const memoryHistoryData = {
  title: 'Memory (MB)',
  x: Array(historyLength).fill('').map((_, i) => moment().subtract(historyLength - 1 - i, 'seconds').format('HH:mm:ss')),
  y: Array(historyLength).fill(0),
  style: { line: 'yellow' }
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

async function getCpuUsage() {
  const startMeasure = os.cpus().map(cpu => ({
    idle: cpu.times.idle,
    total: Object.values(cpu.times).reduce((acc, tv) => acc + tv, 0)
  }));
  await new Promise(resolve => setTimeout(resolve, 100));
  const endMeasure = os.cpus().map(cpu => ({
    idle: cpu.times.idle,
    total: Object.values(cpu.times).reduce((acc, tv) => acc + tv, 0)
  }));
  const idleDifference = startMeasure.map((start, i) => endMeasure[i].idle - start.idle);
  const totalDifference = startMeasure.map((start, i) => endMeasure[i].total - start.total);
  const idlePercent = idleDifference.map((idle, i) => totalDifference[i] ? idle / totalDifference[i] : 0);
  const avgIdlePercent = idlePercent.length > 0 ? idlePercent.reduce((sum, idle) => sum + idle, 0) / idlePercent.length : 0;
  const cpuPercent = (1 - avgIdlePercent) * 100;
  return parseFloat(cpuPercent.toFixed(1));
}

async function getSystemInfo() {
  try {
    const cpuInfo = await getCpuUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const usedMemInMB = Math.round(usedMem / (1024 * 1024));
    
    // For GPU usage, we'll use a placeholder value that will be updated
    // based on active models using GPU from 'ollama ps'
    let gpuUsagePercent = 0;
    
    // If we have running models, check if any are using GPU
    if (currentModelData && currentModelData.length > 0) {
      // Find models using GPU and get their usage
      const gpuModels = currentModelData.filter(model => 
        model.gpu && model.gpu !== '0%' && model.gpu !== 'N/A');
      
      if (gpuModels.length > 0) {
        // Extract percentage values and calculate average
        const gpuPercentages = gpuModels.map(model => {
          const match = model.gpu.match(/(\d+)%/);
          return match ? parseInt(match[1], 10) : 0;
        });
        
        if (gpuPercentages.length > 0) {
          const sum = gpuPercentages.reduce((acc, val) => acc + val, 0);
          gpuUsagePercent = sum / gpuPercentages.length;
        }
      }
    }

    return {
      cpu: cpuInfo,
      memory: usedMemInMB,
      gpu: gpuUsagePercent
    };
  } catch (error) {
    log.log(`Sys Info Err: ${error.message}`);
    return { cpu: 0, memory: 0, gpu: 0 };
  }
}

// Get running model info from 'ollama ps' - FIXED FOR EXACT FORMAT
async function getOllamaPsInfo() {
  return new Promise((resolve) => {
    exec('ollama ps', { timeout: 4000 }, (error, stdout, stderr) => {
      const modelData = {};
      
      // Handle errors
      if (error) {
        if (stderr && stderr.toLowerCase().includes("could not connect")) {
          log.log("Ollama server not running?");
        } else if (stderr && (stderr.toLowerCase().includes("no models running") || stdout.trim() === '')) {
          log.log("No models currently running.");
        } else if (error.signal === 'SIGTERM' || error.code === null) {
          log.log("'ollama ps' timed out.");
        } else {
          log.log(`ollama ps err: ${error.message.split('\n')[0]}`);
        }
        resolve(modelData);
        return;
      }
      
      // Parse output
      const lines = stdout.trim().split('\n');
      if (lines.length < 2) {
        resolve(modelData);
        return;
      }
      
      // Check for exact header format: NAME ID SIZE PROCESSOR UNTIL

      const headerLine = lines[0];
      if (!headerLine.includes('NAME') || !headerLine.includes('ID') || 
          !headerLine.includes('SIZE') || !headerLine.includes('PROCESSOR') || 
          !headerLine.includes('UNTIL')) {
        log.log(`Unexpected 'ollama ps' header format: "${headerLine}"`);
        resolve(modelData);
        return;
      }
      
      // Find column positions
      const namePos = headerLine.indexOf('NAME');
      const idPos = headerLine.indexOf('ID');
      const memPos = headerLine.indexOf('SIZE');
      const processorPos = headerLine.indexOf('PROCESSOR');
      const untilPos = headerLine.indexOf('UNTIL');
      
      // Process data rows
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        
        try {
          // Extract fields based on column positions
          const name = line.substring(namePos, idPos).trim();
          const mem = line.substring(memPos, processorPos).trim();
          const processor = line.substring(processorPos, untilPos).trim();
          
          // Parse processor info to get CPU/GPU usage
          let cpuUsage = '0%';
          let gpuUsage = '0%';
          
          if (processor.includes('GPU')) {
            // Extract GPU percentage if available
            const gpuMatch = processor.match(/(\d+)%\s*GPU/);
            gpuUsage = gpuMatch ? `${gpuMatch[1]}%` : '100%'; // Default to 100% if no percentage
          } else if (processor.includes('CPU')) {
            // Extract CPU percentage if available
            const cpuMatch = processor.match(/(\d+)%\s*CPU/);
            cpuUsage = cpuMatch ? `${cpuMatch[1]}%` : '100%'; // Default to 100% if no percentage
          }
          
          if (name) {
            modelData[name] = {
              committedMem: mem, // Store committed memory
              cpu: cpuUsage,
              gpu: gpuUsage
            };
          }
        } catch (parseError) {
          log.log(`Error parsing line ${i}: ${parseError.message}`);
        }
      }
      
      resolve(modelData);
    });
  });
}

// Get combined list of models and their status/usage
async function getRunningModels() {
  try {
    const [listResponse, psInfo] = await Promise.all([
      ollama.list().catch(err => {
        log.log(`ollama list err: ${err.message.split('\n')[0]}`);
        if (err.message.toLowerCase().includes('connection refused')) {
          log.log("Is the Ollama server running?");
        }
        return { models: [] };
      }),
      getOllamaPsInfo()
    ]);

    if (!listResponse || !Array.isArray(listResponse.models)) {
      log.log("Could not retrieve model list from Ollama API.");
      return [];
    }

    return listResponse.models.map(model => {
      const runningData = psInfo[model.name];

      return {
        name: model.name.substring(0, 28),
        id: model.digest.substring(0, 12),
        diskSize: formatSize(model.size), // Model size on disk from ollama list
        // If running, use committed memory from ollama ps as MEM, otherwise 0 B
        usedMem: runningData ? runningData.committedMem : '0 B', // formatSize(model.size)
        cpu: runningData ? runningData.cpu : '0%',
        gpu: runningData ? runningData.gpu : '0%',
        isRunning: !!runningData
      };
    });
  } catch (error) {
    log.log(`Get models err: ${error.message.split('\n')[0]}`);
    return [];
  }
}


// --- UPDATE FUNCTIONS ---

function updateModelsList() {
  const models = currentModelData;
  const data = models.map(model => [
    model.name,
    model.id,
    model.diskSize, // Disk Size from ollama list (renamed from size to diskSize)
    model.usedMem,  // Committed Memory from ollama ps
    model.cpu,
    model.gpu
  ]);

  if (data.length === 0) {
    data.push(['(No models available or running)', '', '', '', '', '']);
  }

  runningModelsList.setData({
    headers: ['Model', 'ID', 'DISK', 'MEM', 'CPU%', 'GPU%'], // Changed SIZE to DISK
    data: data,
    align: ['left', 'left', 'right', 'right', 'right', 'right']
  });
}

async function updateHistoryCharts() {
  try {
    const systemInfo = await getSystemInfo();
    const totalCpuUsage = systemInfo.cpu ?? 0;
    const totalMemoryUsage = systemInfo.memory ?? 0;
    const totalGpuUsage = systemInfo.gpu ?? 0;

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

    memoryHistoryData.y.shift();
    memoryHistoryData.y.push(totalMemoryUsage);
    memoryHistoryData.x.shift();
    memoryHistoryData.x.push(currentTime);
    memoryChart.setData([memoryHistoryData]);

  } catch (error) {
    log.log(`Chart update err: ${error.message.split('\n')[0]}`);
  }
}

// Update all components
async function updateAll() {
  try {
    currentModelData = await getRunningModels();
    await Promise.all([
      updateHistoryCharts(),
      Promise.resolve().then(updateModelsList)
    ]);
    screen.render();
  } catch (error) {
    log.log(`UpdateAll Err: ${error.message.split('\n')[0]}`);
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
  log.log('Manual refresh triggered...');
  updateAll();
});

log.log('topollama starting... Press q to quit, r to refresh.');
updateAll();
const updateInterval = setInterval(updateAll, 2000);

screen.on('resize', () => {
  runningModelsList.emit('attach');
  cpuChart.emit('attach');
  memoryChart.emit('attach');
  log.emit('attach');
  screen.render();
});

process.on('unhandledRejection', (reason, promise) => {
  log.log(`Unhandled Rejection at:', ${promise}, 'reason:', ${reason}`);
});

screen.render();
