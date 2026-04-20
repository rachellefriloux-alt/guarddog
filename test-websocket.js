// Test WebSocket connection for GuardDog
import WebSocket from 'ws';

console.log('Testing WebSocket connection to GuardDog server...');

const ws = new WebSocket('ws://localhost:5000/ws');

ws.on('open', function open() {
    console.log('✅ WebSocket connected successfully');

    // Send a test message
    ws.send(JSON.stringify({ type: 'test', message: 'Hello GuardDog!' }));
});

ws.on('message', function message(data) {
    console.log('📨 Received message:', data.toString());
});

ws.on('error', function error(err) {
    console.log('❌ WebSocket error:', err.message);
});

ws.on('close', function close() {
    console.log('🔌 WebSocket connection closed');
});

// Close connection after 5 seconds
setTimeout(() => {
    console.log('Closing WebSocket connection...');
    ws.close();
}, 5000);