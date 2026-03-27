#!/usr/bin/env ts-node
/**
 * Y-WebSocket Server Launcher
 * Runs the CRDT WebSocket server on port 1234
 * 
 * Usage:
 * npm run collab:server
 * 
 * The server will:
 * - Listen on ws://localhost:1234
 * - Accept connections from CollaborativeEditor clients
 * - Sync Yjs documents across all connected clients
 * - Track user presence (cursors, awareness)
 */

import initializeYWebSocketServer from '@/yWebsocketServer';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log(`
╔════════════════════════════════════════════════════════════╗
║  🚀 Y-WebSocket Server (CRDT Collaborative Editing)       ║
╚════════════════════════════════════════════════════════════╝
`);

// Start the server
initializeYWebSocketServer();

console.log(`
📚 Server is running!

📝 How it works:
  - Clients connect to ws://localhost:1234
  - Commands sent to room name (e.g., /session:123)
  - Yjs handles CRDT automatically
  - All clients stay in sync
  - No conflicts, even with simultaneous edits

🔧 For production:
  - Deploy to Render or Railway
  - Use environment variable WEBSOCKET_PORT
  - Scale to multiple instances with Redis pub/sub

🧪 Test it:
  - Open http://localhost:3000 in browser
  - Create a session
  - Open same session in another tab
  - Start typing - see real-time sync!
`);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 Shutting down server...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('👋 Shutting down server...');
  process.exit(0);
});
