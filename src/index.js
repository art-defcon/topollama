#!/usr/bin/env node

import blessed from 'blessed';
import contrib from 'blessed-contrib';
import moment from 'moment';

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

// Create widgets
const runningModelsList = grid.set(0, 0, 7, 12, contrib.table, {
  keys: true,
  fg: 'white',
  selectedFg: 'white',
  selectedBg: 'blue',
  interactive: true,
  label: 'Running Models',
  columnSpacing: 2,
  columnWidth: [20, 15, 15, 15, 15, 15]
});

const cpuChart = grid.set(7, 0, 5, 6, contrib.line, {
  style: {
    line: 'cyan',
    text: 'green',
    baseline: 'black'
  },
  xLabelPadding: 3,
  xPadding: 5,
  showLegend: true,
  label: 'CPU Usage History',
  minY: 0,
  maxY: 100
});

const memoryChart = grid.set(7, 6, 5, 6, contrib.line, {
  style: {
    line: 'yellow',
    text: 'green',
    baseline: 'black'
  },
  xLabelPadding: 3,
  xPadding: 5,
  showLegend: true,
  label: 'Memory Usage History',
});

const log = grid.set(0, 0, 0, 0, contrib.log, {
  fg: 'green',
  selectedFg: 'green',
  label: 'Events & Logs',
  hidden: true
});

// Initialize data structures
const historyLength = 100;

// CPU usage history for all running models
const cpuHistoryData = {
  title: 'CPU',
  x: Array(historyLength).fill(0).map((_, i) => moment().subtract(historyLength - 1 - i, 'seconds').format('HH:mm:ss')),
  y: Array(historyLength).fill(0),
  style: {
    line: 'cyan'
  }
};

// Memory usage history for all running models
const memoryHistoryData = {
  title: 'Memory',
  x: Array(historyLength).fill(0).map((_, i) => moment().subtract(historyLength - 1 - i, 'seconds').format('HH:mm:ss')),
  y: Array(historyLength).fill(0),
  style: {
    line: 'yellow'
  }
};

import ollama from 'ollama';
import os from 'os';

// Helper functions
async function getSystemInfo() {
  try {
    // Get CPU usage (cross-platform)
    const cpuInfo = await getCpuUsage();
    
    // Get memory usage (cross-platform)
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const usedMemInMB = Math.round(usedMem / (1024 * 1024));
    
    return {
      cpu: cpuInfo,
      memory: usedMemInMB,
      gpu: null
    };
  } catch (error) {
    console.error(`Error fetching system info: ${error.message}`);
    return { cpu: null, memory: null, gpu: null };
  }
}

// Get CPU usage with cross-platform support
async function getCpuUsage() {
  const platform = os.platform();
  let cpuPercent = 0;
  
  // First get initial measurements
  const startMeasure = os.cpus().map(cpu => {
    return {
      idle: cpu.times.idle,
      total: Object.values(cpu.times).reduce((acc, tv) => acc + tv, 0)
    };
  });
  
  // Wait a short time for more accurate measurement
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Get measurements again
  const endMeasure = os.cpus().map(cpu => {
    return {
      idle: cpu.times.idle,
      total: Object.values(cpu.times).reduce((acc, tv) => acc + tv, 0)
    };
  });
  
  // Calculate the difference
  const idleDifference = startMeasure.map((start, i) => endMeasure[i].idle - start.idle);
  const totalDifference = startMeasure.map((start, i) => endMeasure[i].total - start.total);
  
  // Calculate the average CPU usage across all cores
  const idlePercent = idleDifference.map((idle, i) => {
    return idle / totalDifference[i] || 0;
  });
  
  // Convert to CPU usage percentage (average of all cores)
  cpuPercent = (1 - idlePercent.reduce((sum, idle) => sum + idle, 0) / idlePercent.length) * 100;
  
  return parseFloat(cpuPercent.toFixed(2));
}

// Function to get running Ollama models
async function getProcessInfo() {
  try {
    const { exec } = await import('child_process');
    return new Promise((resolve) => {
      exec('ps aux | grep ollama', (error, stdout) => {
        if (error) return resolve([]);
        const processes = stdout.toString().split('\n')
          .filter(line => line.includes('ollama serve') || line.includes('ollama run'));
        resolve(processes);
      });
    });
  } catch (error) {
    console.error(`Error getting process info: ${error.message}`);
    return [];
  }
}

async function getRunningModels() {
  try {
    const [response, processes] = await Promise.all([
      ollama.list(),
      getProcessInfo()
    ]);
    return response.models.map(model => {
      const isRunning = processes.some(p => p.includes(model.name));
      const usedMem = isRunning ? Math.floor(model.size * 0.7) : 0; // Estimate 70% of size when running
      
      return {
        name: model.name,
        id: model.digest.substring(0, 12),
        size: formatSize(model.size),
        used: formatSize(usedMem),
        gpu: 'N/A',
        util: 'N/A',
        isRunning
      };
    });
  } catch (error) {
    console.error(`Error getting running models: ${error.message}`);
    return [];
  }
}


// Update functions
async function updateModelsList() {
  try {
    const models = await getRunningModels();
    const data = models.map(model => [
      model.isRunning ? `{red-fg}${model.name}{/red-fg}` : model.name,
      model.id,
      model.size,
      model.used,
      model.gpu,
      model.util
    ]);

    if (data.length === 0) {
      data.push(['No models running', '', '', '']);
    }
    
    // Add system info at bottom of models list
    // const systemInfo = await getSystemInfo();
    // data.push(['----------------------', '', '', '']);
    // data.push(['CPU', `${systemInfo.cpu ? systemInfo.cpu.toFixed(1) + '%' : 'N/A'}`, '', '']);
    // data.push(['Memory', `${systemInfo.memory ? formatSize(systemInfo.memory * 1024 * 1024) : 'N/A'}`, '', '']);
    
    runningModelsList.setData({
      headers: ['Model', 'ID', 'SIZE', 'Used', 'CPU', 'Util'],
      data: data
    });
  } catch (error) {
    console.error(`Error updating models list: ${error.message}`);
  }
}

async function updateHistoryCharts() {
  try {
    // Get CPU and memory usage from OS
    const systemInfo = await getSystemInfo();
    
    // Get usage values
    let totalCpuUsage = systemInfo.cpu || 0;
    let totalMemoryUsage = systemInfo.memory || 0;
    
    const currentTime = moment().format('HH:mm:ss');
    
    // Update CPU history chart
    cpuHistoryData.y.shift();
    cpuHistoryData.y.push(totalCpuUsage);
    cpuHistoryData.x.shift();
    cpuHistoryData.x.push(currentTime);
    
    cpuChart.setData([cpuHistoryData]);
    
    // Update memory history chart
    memoryHistoryData.y.shift();
    memoryHistoryData.y.push(totalMemoryUsage);
    memoryHistoryData.x.shift();
    memoryHistoryData.x.push(currentTime);
    
    memoryChart.setData([memoryHistoryData]);
  } catch (error) {
    console.error(`Error updating history charts: ${error.message}`);
  }
}

function formatSize(bytes) {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return '-';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 B';
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
  if (i === 0) return `${bytes} ${sizes[i]}`;
  return `${(bytes / (1024 ** i)).toFixed(1)} ${sizes[i]}`;
}

// Set key handlers
screen.key(['escape', 'q', 'C-c'], function() {
  return process.exit(0);
});

screen.key(['r'], function() {
  console.log('Refreshing data...');
  updateAll();
});

// Function to update all components
async function updateAll() {
  await Promise.all([
    updateModelsList(),
    updateHistoryCharts()
  ]);
  screen.render();
}

// Initial message
console.log('topollama started. Press q to quit, r to refresh.');

// Initial update
updateAll();

// Set up interval for updates
setInterval(updateAll, 1000);

// Render the screen
screen.render();
