import { Router, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { query, queryOne } from '@/database';
import authMiddleware, { AuthRequest } from '@/middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Socket.io instance for emitting live notification events
let io: SocketIOServer | null = null;

export function setSocketIO(socketIO: SocketIOServer) {
  io = socketIO;
}

// Get unread notifications for user
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const notifications = await query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [userId]
    );

    res.json({
      success: true,
      data: notifications.rows,
    });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// Get unread count
router.get('/unread/count', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const result = await queryOne(
      'SELECT COUNT(*) as unread_count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
      [userId]
    );

    res.json({
      success: true,
      data: { unread_count: result?.unread_count || 0 },
    });
  } catch (err) {
    console.error('Get unread count error:', err);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// Mark notification as read
const markReadHandler = async (req: AuthRequest, res: Response) => {
  try {
    const notificationId = req.params.notification_id;
    const userId = req.user?.id;

    // Scope to the owner so a user cannot mutate someone else's notification (issue #141).
    const result = await query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING id',
      [notificationId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({
      success: true,
      data: { message: 'Notification marked as read' },
    });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
};

router.put('/:notification_id/read', authMiddleware, markReadHandler);
router.patch('/:notification_id/read', authMiddleware, markReadHandler);

// Mark all as read
router.put('/mark-all/read', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const result = await query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE user_id = $1
         AND is_read = FALSE
       RETURNING id`,
      [userId]
    );

    res.json({
      success: true,
      data: {
        message: 'All notifications marked as read',
        updatedCount: result.rows.length,
      },
    });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({
      error: 'Failed to mark all as read',
    });
  }
});

// Delete notification
router.delete('/:notification_id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const notificationId = req.params.notification_id;
    const userId = req.user?.id;

    // Scope to the owner so a user cannot delete someone else's notification (issue #141).
    const result = await query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
      [notificationId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({
      success: true,
      data: { message: 'Notification deleted' },
    });
  } catch (err) {
    console.error('Delete notification error:', err);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// NOTE: There is intentionally NO client-facing route to create notifications.
// A generic `POST /` that accepted an arbitrary `user_id` let any authenticated
// user spoof notifications (system alerts, phishing) to any other user
// (issue #142). Notifications must only originate from trusted server-side event
// handlers via the internal `createNotification()` below. If a client-triggered
// notification is ever required, it must validate the caller's relationship to
// the recipient (e.g. shared session participant) before sending.

// Create notification (internal use) — also emits a live `notification:new`
// socket event to the recipient's personal room, so every caller of this
// function gets real-time delivery for free without wiring sockets itself.
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  relatedId?: string
) {
  try {
    const allowedNotificationTypes = [
      "message",
      "session",
      "payment",
      "system",
    ];

    const normalizedType =
      typeof type === "string"
        ? type.trim().toLowerCase()
        : "";

    if (!allowedNotificationTypes.includes(normalizedType)) {
      throw new Error(
        `Invalid notification type. Allowed values are: ${allowedNotificationTypes.join(", ")}`
      );
    }
    const notificationId = uuidv4();
    const now = new Date().toISOString();

    await query(
      `INSERT INTO notifications (id, user_id, type, title, message, related_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [notificationId, userId, normalizedType, title, message, relatedId || null, now]
    );

    if (io) {
      const newNotification = await queryOne('SELECT * FROM notifications WHERE id = $1', [notificationId]);
      io.to(`user:${userId}`).emit('notification:new', newNotification);
    }

    return notificationId;
  } catch (err) {
    console.error('Create notification error:', err);
  }
}

export default router;
