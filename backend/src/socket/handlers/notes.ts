import { Server as SocketIOServer, Socket } from 'socket.io';
import { query } from '@/database';

/**
 * Handle real-time notes sync.
 * Emits `notes:update` to everyone else in the session room.
 * Debounced auto-save is handled client-side; the server also
 * saves on `notes:save` for reliability.
 */
export async function handleNotesUpdate(socket: Socket, io: SocketIOServer, data: {
  sessionId: string;
  notes: string;
  userId: string;
}) {
  const { sessionId, notes, userId } = data;
  if (!sessionId) return;

  // Broadcast to the rest of the room (not back to sender)
  socket.to(sessionId).emit('notes:update', { notes, userId });
}

export async function handleNotesSave(socket: Socket, io: SocketIOServer, data: {
  sessionId: string;
  notes: string;
}) {
  const { sessionId, notes } = data;
  if (!sessionId) return;

  try {
    await query(
      'UPDATE sessions SET notes = $1, updated_at = NOW() WHERE id = $2',
      [notes, sessionId]
    );
    socket.emit('notes:saved', { success: true });
    console.log(`📝 [NOTES] Saved notes for session ${sessionId}`);
  } catch (err) {
    console.error('❌ [NOTES] Failed to save notes:', err);
    socket.emit('notes:saved', { success: false });
  }
}
