import { Server as SocketIOServer, Socket } from 'socket.io';
import { query } from '@/database';
import { v4 as uuidv4 } from 'uuid';

export async function handleMessageSend(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, content, type = 'text', userId } = data;
    
    const messageId = uuidv4();
    const timestamp = new Date().toISOString();

    // Save message to database
    await query(
      `INSERT INTO messages (id, session_id, user_id, content, type, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [messageId, sessionId, userId, content, type, timestamp]
    );

    // Fetch user details
    const users = await query<any>('SELECT id, name, email, avatar_url FROM users WHERE id = $1', [userId]);
    const user = users[0];

    // Broadcast message to session (including full user details)
    io.to(`session:${sessionId}`).emit('message:receive', {
      id: messageId,
      session_id: sessionId,
      user_id: userId,
      content,
      type,
      created_at: timestamp,
      user: user ? { id: user.id, name: user.name, email: user.email, avatar: user.avatar_url } : null,
    });
  } catch (err) {
    console.error('Message send error:', err);
    socket.emit('error', { message: 'Failed to send message' });
  }
}

export async function handleSessionJoin(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, userId, userName } = data;
    
    socket.join(`session:${sessionId}`);
    
    // Notify others in session
    socket.to(`session:${sessionId}`).emit('presence:user-joined', {
      userId,
      userName,
      timestamp: Date.now(),
    });

    console.log(`User ${userId} joined session ${sessionId}`);
  } catch (err) {
    console.error('Session join error:', err);
  }
}

export async function handleSessionLeave(socket: Socket, io: SocketIOServer, data: any) {
  try {
    const { sessionId, userId } = data;
    
    socket.leave(`session:${sessionId}`);
    
    // Notify others in session
    socket.to(`session:${sessionId}`).emit('presence:user-left', {
      userId,
      timestamp: Date.now(),
    });

    console.log(`User ${userId} left session ${sessionId}`);
  } catch (err) {
    console.error('Session leave error:', err);
  }
}
