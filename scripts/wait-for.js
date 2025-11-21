// Simple port wait utility to avoid Vite proxy errors if the API isn't up yet.
const net = require('net');

const port = Number(process.argv[2] || '3000');
const host = process.argv[3] || 'localhost';
const timeoutMs = Number(process.argv[4] || '30000');
const start = Date.now();

function tryConnect() {
  const socket = net.createConnection(port, host);
  socket.once('connect', () => {
    socket.end();
    process.exit(0);
  });
  socket.once('error', () => {
    socket.destroy();
    if (Date.now() - start > timeoutMs) {
      console.error(`Timed out waiting for ${host}:${port}`);
      process.exit(1);
    }
    setTimeout(tryConnect, 200);
  });
}

tryConnect();
