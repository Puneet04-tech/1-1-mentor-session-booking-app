import express, { Request, Response } from 'express';
import * as db from '../database';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// Start recording
router.post('/start', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    const userId = (req as any).user.id;

    // Verify user is part of session
    const sessionResult = await db.query(
      `SELECT * FROM sessions WHERE id = $1 AND (mentor_id = $2 OR student_id = $2)`,
      [sessionId, userId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Create recording record
    const recordingResult = await db.query(
      `INSERT INTO session_recordings (session_id, started_at, status)
       VALUES ($1, NOW(), 'recording')
       RETURNING id`,
      [sessionId]
    );

    res.json({
      success: true,
      recordingId: recordingResult.rows[0].id,
      message: 'Recording started',
    });
  } catch (error) {
    console.error('Error starting recording:', error);
    res.status(500).json({ error: 'Failed to start recording' });
  }
});

// Stop recording
router.post('/stop/:recordingId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { recordingId } = req.params;

    const result = await db.query(
      `UPDATE session_recordings 
       SET ended_at = NOW(), status = 'processing', duration = EXTRACT(EPOCH FROM (NOW() - started_at))::INT
       WHERE id = $1
       RETURNING *`,
      [recordingId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    res.json({
      success: true,
      message: 'Recording stopped',
      recording: result.rows[0],
    });
  } catch (error) {
    console.error('Error stopping recording:', error);
    res.status(500).json({ error: 'Failed to stop recording' });
  }
});

// Get session recordings
router.get('/session/:sessionId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = (req as any).user.id;

    // Verify user is part of session
    const sessionResult = await db.query(
      `SELECT * FROM sessions WHERE id = $1 AND (mentor_id = $2 OR student_id = $2)`,
      [sessionId, userId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const result = await db.query(
      `SELECT * FROM session_recordings 
       WHERE session_id = $1
       ORDER BY started_at DESC`,
      [sessionId]
    );

    res.json({
      success: true,
      recordings: result.rows,
    });
  } catch (error) {
    console.error('Error fetching recordings:', error);
    res.status(500).json({ error: 'Failed to fetch recordings' });
  }
});

// Get recording url (for playback)
router.get('/:recordingId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { recordingId } = req.params;
    const userId = (req as any).user.id;

    const result = await db.query(
      `SELECT sr.* FROM session_recordings sr
       JOIN sessions s ON sr.session_id = s.id
       WHERE sr.id = $1 AND (s.mentor_id = $2 OR s.student_id = $2)`,
      [recordingId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const recording = result.rows[0];

    // In production, generate signed URLs for cloud storage (S3, etc.)
    // For now, return mock data
    const playbackUrl = `/recordings/${recording.id}.mp4`;

    res.json({
      success: true,
      recording: {
        ...recording,
        playbackUrl,
      },
    });
  } catch (error) {
    console.error('Error fetching recording:', error);
    res.status(500).json({ error: 'Failed to fetch recording' });
  }
});

// Delete recording
router.delete('/:recordingId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { recordingId } = req.params;
    const userId = (req as any).user.id;

    // Verify user is mentor of the session
    const result = await db.query(
      `SELECT sr.* FROM session_recordings sr
       JOIN sessions s ON sr.session_id = s.id
       WHERE sr.id = $1 AND s.mentor_id = $2`,
      [recordingId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await db.query('DELETE FROM session_recordings WHERE id = $1', [recordingId]);

    res.json({ success: true, message: 'Recording deleted' });
  } catch (error) {
    console.error('Error deleting recording:', error);
    res.status(500).json({ error: 'Failed to delete recording' });
  }
});

export default router;
