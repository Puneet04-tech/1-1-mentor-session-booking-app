import { Server as SocketIOServer, Socket } from 'socket.io';

export async function handlePresenceUpdate(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, status, userId } = data;
    
    socket.to(`session:${sessionId}`).emit('presence:updated', {
      userId,
      status,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('Presence update error:', err);
  }
}
