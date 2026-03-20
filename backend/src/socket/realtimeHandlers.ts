import { Server as SocketIOServer, Socket } from 'socket.io';
import { db } from '../database';

interface NotificationPayload {
  userId: string;
  type: 'session_start' | 'session_end' | 'rating_received' | 'message' | 'mentor_joined' | 'availability_change';
  title: string;
  message: string;
  data?: Record<string, any>;
}

interface UserConnection {
  userId: string;
  socketId: string;
  connectedAt: Date;
}

const userConnections = new Map<string, UserConnection>();

export function setupRealtimeHandlers(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    console.log(`📱 Client connected: ${socket.id}`);

    /**
     * User joins their personal room for notifications
     */
    socket.on('user:join', (userId: string) => {
      socket.join(`user:${userId}`);
      userConnections.set(socket.id, {
        userId,
        socketId: socket.id,
        connectedAt: new Date(),
      });
      console.log(`✅ User ${userId} joined notification room`);
    });

    /**
     * Session Started Event
     */
    socket.on('session:started', async (sessionData: any) => {
      const { sessionId, mentorId, studentId } = sessionData;
      
      // Notify both participants
      const notification = {
        type: 'session_start',
        title: 'Session Started',
        message: 'Your mentoring session has started',
        data: { sessionId },
      };

      io.to(`user:${mentorId}`).emit('notification:received', notification);
      io.to(`user:${studentId}`).emit('notification:received', notification);

      // Save to database
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, data, is_read) 
         VALUES ($1, $2, $3, $4, $5, false)`,
        [mentorId, notification.type, notification.title, notification.message, JSON.stringify(notification.data)]
      );
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, data, is_read) 
         VALUES ($1, $2, $3, $4, $5, false)`,
        [studentId, notification.type, notification.title, notification.message, JSON.stringify(notification.data)]
      );
    });

    /**
     * Session Ended Event
     */
    socket.on('session:ended', async (sessionData: any) => {
      const { sessionId, mentorId, studentId } = sessionData;

      const notification = {
        type: 'session_end',
        title: 'Session Ended',
        message: 'Your mentoring session has ended. Please leave feedback!',
        data: { sessionId },
      };

      io.to(`user:${mentorId}`).emit('notification:received', notification);
      io.to(`user:${studentId}`).emit('notification:received', notification);

      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, data, is_read) 
         VALUES ($1, $2, $3, $4, $5, false)`,
        [mentorId, notification.type, notification.title, notification.message, JSON.stringify(notification.data)]
      );
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, data, is_read) 
         VALUES ($1, $2, $3, $4, $5, false)`,
        [studentId, notification.type, notification.title, notification.message, JSON.stringify(notification.data)]
      );
    });

    /**
     * Rating Received Event
     */
    socket.on('rating:submitted', async (ratingData: any) => {
      const { mentorId, rating, studentId } = ratingData;

      const notification = {
        type: 'rating_received',
        title: `New Rating: ${rating}⭐`,
        message: `You received a ${rating}-star rating from a student`,
        data: { mentorId, rating },
      };

      io.to(`user:${mentorId}`).emit('notification:received', notification);

      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, data, is_read) 
         VALUES ($1, $2, $3, $4, $5, false)`,
        [mentorId, notification.type, notification.title, notification.message, JSON.stringify(notification.data)]
      );
    });

    /**
     * New Message Event
     */
    socket.on('message:sent', async (messageData: any) => {
      const { sessionId, senderId, recipientId, content } = messageData;

      const notification = {
        type: 'message',
        title: 'New Message',
        message: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
        data: { sessionId, senderId },
      };

      io.to(`user:${recipientId}`).emit('notification:received', notification);

      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, data, is_read) 
         VALUES ($1, $2, $3, $4, $5, false)`,
        [recipientId, notification.type, notification.title, notification.message, JSON.stringify(notification.data)]
      );
    });

    /**
     * Availability Changed Event
     */
    socket.on('availability:changed', async (availabilityData: any) => {
      const { mentorId } = availabilityData;

      const notification = {
        type: 'availability_change',
        title: 'Mentor Availability Updated',
        message: 'A mentor you follow has updated their availability',
        data: { mentorId },
      };

      // Notify all students following this mentor
      const followersResult = await db.query(
        `SELECT DISTINCT user_id FROM sessions WHERE mentor_id = $1 GROUP BY user_id`,
        [mentorId]
      );

      for (const follower of followersResult.rows) {
        io.to(`user:${follower.user_id}`).emit('notification:received', notification);
        
        await db.query(
          `INSERT INTO notifications (user_id, type, title, message, data, is_read) 
           VALUES ($1, $2, $3, $4, $5, false)`,
          [follower.user_id, notification.type, notification.title, notification.message, JSON.stringify(notification.data)]
        );
      }
    });

    /**
     * Typing indicator
     */
    socket.on('typing:start', (sessionId: string) => {
      socket.to(`session:${sessionId}`).emit('typing:indicator', { isTyping: true });
    });

    socket.on('typing:stop', (sessionId: string) => {
      socket.to(`session:${sessionId}`).emit('typing:indicator', { isTyping: false });
    });

    /**
     * User disconnects
     */
    socket.on('disconnect', () => {
      const connection = userConnections.get(socket.id);
      if (connection) {
        userConnections.delete(socket.id);
        console.log(`❌ User ${connection.userId} disconnected`);
      }
    });
  });
}

/**
 * Helper function to emit notifications from backend
 */
export async function emitNotification(io: SocketIOServer, payload: NotificationPayload) {
  // Send via socket
  io.to(`user:${payload.userId}`).emit('notification:received', payload);

  // Save to database
  await db.query(
    `INSERT INTO notifications (user_id, type, title, message, data, is_read) 
     VALUES ($1, $2, $3, $4, $5, false)`,
    [payload.userId, payload.type, payload.title, payload.message, JSON.stringify(payload.data || {})]
  );
}
