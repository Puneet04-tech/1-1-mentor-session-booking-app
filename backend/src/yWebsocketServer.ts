import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';

const WEBSOCKET_PORT = process.env.WEBSOCKET_PORT || 1234;

interface RoomDoc {
  ydoc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  clients: Set<WebSocket>;
}

interface MessageData {
  type: 'sync' | 'update' | 'awareness' | 'init';
  data?: any;
}

// Store for all documents/rooms
const docStore: Map<string, RoomDoc> = new Map();

/**
 * Get or create document for a specific room
 */
function getOrCreateDoc(roomName: string): RoomDoc {
  if (!docStore.has(roomName)) {
    console.log(`📚 [Y-WS] Creating new document for room: ${roomName}`);

    const ydoc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(ydoc);

    const roomDoc: RoomDoc = {
      ydoc,
      awareness,
      clients: new Set(),
    };

    // Observe document changes
    ydoc.on('update', (update: Uint8Array, origin: any) => {
      if (origin !== 'local') {
        console.log(`📝 [Y-WS] Document updated in ${roomName}`);
        broadcastUpdate(roomName, update);
      }
    });

    // Observe awareness changes
    awareness.on('update', ({ added, updated, removed }: any, origin: any) => {
      console.log(`👥 [Y-WS] Awareness update in ${roomName}`);
      broadcastAwareness(roomName, awareness);
    });

    docStore.set(roomName, roomDoc);
  }

  return docStore.get(roomName)!;
}

/**
 * Broadcast document update to all clients in room
 */
function broadcastUpdate(roomName: string, update: Uint8Array) {
  const roomDoc = docStore.get(roomName);
  if (!roomDoc) return;

  const message = JSON.stringify({
    type: 'update',
    data: Array.from(update),
  });

  console.log(`📤 [Y-WS] Broadcasting update in ${roomName} to ${roomDoc.clients.size} clients`);

  roomDoc.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (error) {
        console.error('❌ [Y-WS] Error sending update:', error);
      }
    }
  });
}

/**
 * Broadcast awareness state to all clients
 */
function broadcastAwareness(roomName: string, awareness: awarenessProtocol.Awareness) {
  const roomDoc = docStore.get(roomName);
  if (!roomDoc) return;

  const states = awareness.getStates();
  const awarenessData: any[] = [];

  states.forEach((state, clientId) => {
    awarenessData.push({
      clientId,
      state: state.user || {},
    });
  });

  const message = JSON.stringify({
    type: 'awareness',
    data: awarenessData,
  });

  console.log(`👥 [Y-WS] Broadcasting awareness in ${roomName} to ${roomDoc.clients.size} clients`);

  roomDoc.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (error) {
        console.error('❌ [Y-WS] Error sending awareness:', error);
      }
    }
  });
}

/**
 * Initialize Y-WebSocket Server
 */
export function initializeYWebSocketServer(expressServer?: any) {
  const server = expressServer || http.createServer();
  const wss = new WebSocketServer({ server });

  console.log(`
  🟢 ═══════════════════════════════════════════════════════════
  🟢 Y-WebSocket Server initializing...
  🟢 ═══════════════════════════════════════════════════════════
  `);

  wss.on('connection', (ws: WebSocket, req) => {
    if (!req.url) {
      console.warn('❌ [Y-WS] No URL provided, closing connection');
      ws.close();
      return;
    }

    // Extract room name from URL (format: /session:123)
    const roomName = decodeURIComponent(req.url).slice(1);

    if (!roomName) {
      console.warn('❌ [Y-WS] No room name in URL, closing connection');
      ws.close();
      return;
    }

    console.log(`✅ [Y-WS] Client connected to room: ${roomName}`);

    const roomDoc = getOrCreateDoc(roomName);
    roomDoc.clients.add(ws);

    // Send initial sync data to client
    try {
      const ydoc = roomDoc.ydoc;
      const update = Y.encodeStateAsUpdate(ydoc);

      const message = JSON.stringify({
        type: 'sync',
        data: Array.from(update),
      });

      ws.send(message);
      console.log(`📤 [Y-WS] Sent initial sync to client in ${roomName}`);
    } catch (error) {
      console.error('❌ [Y-WS] Error sending initial sync:', error);
    }

    // Handle incoming messages
    ws.on('message', (data: Buffer) => {
      try {
        const message: MessageData = JSON.parse(data.toString());

        if (message.type === 'update' && message.data) {
          // Apply update from client
          const update = new Uint8Array(message.data);
          console.log(`📥 [Y-WS] Received update from client in ${roomName}`);

          try {
            Y.applyUpdate(roomDoc.ydoc, update, 'local');
          } catch (error) {
            console.error('❌ [Y-WS] Error applying update:', error);
          }

          // Broadcast to other clients
          broadcastUpdate(roomName, update);
        } else if (message.type === 'awareness' && message.data) {
          // Update user awareness (presence)
          console.log(`👥 [Y-WS] Received awareness update in ${roomName}`);

          try {
            roomDoc.awareness.setLocalState(message.data);
            broadcastAwareness(roomName, roomDoc.awareness);
          } catch (error) {
            console.error('❌ [Y-WS] Error updating awareness:', error);
          }
        }
      } catch (error) {
        console.error(`❌ [Y-WS] Error handling message in ${roomName}:`, error);
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      console.log(`❌ [Y-WS] Client disconnected from room: ${roomName}`);
      roomDoc.clients.delete(ws);

      // Clean up empty rooms
      if (roomDoc.clients.size === 0) {
        console.log(`🧹 [Y-WS] Cleaning up empty room: ${roomName}`);
        docStore.delete(roomName);
      }
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`❌ [Y-WS] WebSocket error in ${roomName}:`, error);
    });
  });

  // If we created the server, start it
  if (!expressServer) {
    server.listen(WEBSOCKET_PORT, () => {
      console.log(`
  ✅ ═══════════════════════════════════════════════════════════
  ✅ Y-WebSocket Server running on ws://localhost:${WEBSOCKET_PORT}
  ✅ ═══════════════════════════════════════════════════════════
      `);
    });
  }

  return { server, wss };
}

export default initializeYWebSocketServer;
