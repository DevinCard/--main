// Secure server startup script that sets OpenAI API key as environment variable
const { spawn } = require('child_process');
const path = require('path');

// IMPORTANT: In production, use a proper .env file or environment variables management
// This is only for development purposes - NEVER store API keys in code in production
const OPENAI_API_KEY = "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";

// Start the server with environment variable
const serverProcess = spawn('node', ['index.js'], {
  env: {
    ...process.env,
    OPENAI_API_KEY: OPENAI_API_KEY
  },
  stdio: 'inherit',
  cwd: path.join(__dirname)
});

// Log server status
console.log('Starting Vaultly server with AI assistant capability...');

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