import { Server as SocketIOServer, Socket } from 'socket.io';
import { query, queryOne } from '@/database';

export async function handleCodeUpdate(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, code, language, userId } = data;
    
    // Broadcast to other users in the session
    socket.to(`session:${sessionId}`).emit('code:update', {
      code,
      language,
      userId,
      timestamp: Date.now(),
    });

    // Save code snapshot (debounced in DB)
    try {
      await query(
        `INSERT INTO code_snapshots (session_id, code, language, user_id, saved_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [sessionId, code, language, userId]
      );
    } catch (err) {
      console.error('Error saving code snapshot:', err);
    }
  } catch (err) {
    console.error('Code update error:', err);
    socket.emit('error', { message: 'Failed to update code' });
  }
}

export async function handleCursorMove(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, line, column, userId } = data;
    
    socket.to(`session:${sessionId}`).emit('cursor:move', {
      line,
      column,
      userId,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('Cursor move error:', err);
  }
}

export async function handleLanguageChange(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, language } = data;
    
    socket.to(`session:${sessionId}`).emit('language:change', {
      language,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('Language change error:', err);
  }
}
