// Connect to the Socket.io server hosted on the Gateway
const socket = io(window.location.origin);
const consoleOutput = document.getElementById('console-output');
const statusSpan = document.getElementById('connection-status');

// Socket Connection Listeners
socket.on('connect', () => {
  statusSpan.textContent = 'Connected via WebSocket';
  statusSpan.className = 'connected';
  logToConsole('System', 'Established real-time WebSocket connection.', 'info');
});

socket.on('disconnect', () => {
  statusSpan.textContent = 'Disconnected';
  statusSpan.className = 'disconnected';
  logToConsole('System', 'WebSocket connection lost.', 'error');
});

// Listen for the specific event emitted by our backend worker
socket.on('task-completed', (data) => {
  logToConsole('SOCKET', `Task Completed! JobID: ${data.correlationId} | Tier: ${data.tier}`, 'socket');
});

// UI Functions
function logToConsole(source, message, type) {
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  
  let colorClass = 'log-info';
  if (type === 'http') colorClass = 'log-http';
  if (type === 'socket') colorClass = 'log-socket';
  if (type === 'error') colorClass = 'log-error';
  if (type === 'warn') colorClass = 'log-warn';

  entry.innerHTML = `<span class="log-time">[${time}]</span> <strong class="${colorClass}">[${source}]</strong> ${message}`;
  consoleOutput.appendChild(entry);
  
  // Auto-scroll to bottom
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function clearConsole() {
  consoleOutput.innerHTML = '';
}

// Core Request Logic
async function triggerTrafficSpike() {
  const tier = document.getElementById('tier-select').value;
  const count = parseInt(document.getElementById('request-count').value, 10);
  
  // Resolve the dummy API keys matching the backend tier-resolver
  const headers = { 'Content-Type': 'application/json' };
  if (tier === 'premium') headers['x-api-key'] = 'premium-key-123';
  else if (tier === 'standard') headers['x-api-key'] = 'standard-key-456';
  
  logToConsole('CLIENT', `Firing ${count} request(s) as ${tier.toUpperCase()} tier...`, 'info');

  for (let i = 0; i < count; i++) {
    const payload = { 
      task: `demo-task-${i}`, 
      timestamp: Date.now() 
    };

    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (response.status === 202) {
        const data = await response.json();
        logToConsole('HTTP', `202 Accepted. Job offloaded to queue. JobID: ${data.jobId}`, 'http');
        
        // Critical Step: Subscribe to this specific Job ID's room via WebSocket
        socket.emit('subscribe-to-job', data.jobId);
        
      } else if (response.status === 429) {
        logToConsole('HTTP', `429 Too Many Requests. Rate limit sliding window exhausted!`, 'error');
      } else if (response.status === 503) {
        logToConsole('HTTP', `503 Service Unavailable. Circuit Breaker tripped via Load Shedding!`, 'warn');
      } else {
        logToConsole('HTTP', `Unexpected status: ${response.status}`, 'error');
      }
    } catch (error) {
      logToConsole('ERROR', `Network failure: ${error.message}`, 'error');
    }
  }
}