import { Server as SocketIOServer, Socket } from 'socket.io';

const VALID_PRESENCE_STATUSES = new Set([
  "online",
  "away",
  "busy",
  "offline",
]);

export async function handlePresenceUpdate(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, status } = data;
    const userId = socket.data.userId;
    const roomName = `session:${sessionId}`;

    if (!socket.rooms.has(roomName)) {
      return;
    }

    if (typeof status !== "string" || !VALID_PRESENCE_STATUSES.has(status)) {
      socket.emit("error", {
        message: "Invalid presence status.",
      });
      return;
    }

    socket.to(roomName).emit("presence:updated", {
      userId,
      status,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('Presence update error:', err);
  }
}
