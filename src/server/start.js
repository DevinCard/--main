// Secure server startup script
const { spawn } = require('child_process');
const path = require('path');

const serverProcess = spawn('node', ['index.js'], {
  env: {
    ...process.env
  },
  stdio: 'inherit',
  cwd: path.join(__dirname)
});

// Log server status
console.log('Starting Vaultly server...');

// Handle server process events
serverProcess.on('error', (error) => {
  console.error('Failed to start server:', error);
});

serverProcess.on('exit', (code, signal) => {
  if (code) {
    console.log(`Server process exited with code ${code}`);
  } else if (signal) {
    console.log(`Server process was killed with signal ${signal}`);
  } else {
    console.log('Server process exited');
  }
});

// Handle process termination to clean up the server process
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  serverProcess.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  serverProcess.kill('SIGTERM');
  process.exit(0);
}); 