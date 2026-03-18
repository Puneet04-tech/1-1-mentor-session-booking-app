import { Router, Response } from 'express';
import { query, queryOne } from '@/database';
import authMiddleware, { AuthRequest } from '@/middleware/auth';
import axios from 'axios';
import { config } from '@/config';

const router = Router();

// Get code snapshot
router.get('/:sessionId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const snapshot = await queryOne(
      'SELECT * FROM code_snapshots WHERE session_id = $1 ORDER BY saved_at DESC LIMIT 1',
      [req.params.sessionId]
    );

    res.json({
      success: true,
      data: snapshot,
    });
  } catch (err) {
    console.error('Get code snapshot error:', err);
    res.status(500).json({ error: 'Failed to get code snapshot' });
  }
});

// Save code snapshot
router.post('/:sessionId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { code, language } = req.body;
    const now = new Date().toISOString();

    const result = await queryOne(
      `INSERT INTO code_snapshots (session_id, code, language, user_id, saved_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.params.sessionId, code, language, req.user?.id, now]
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error('Save code snapshot error:', err);
    res.status(500).json({ error: 'Failed to save code' });
  }
});

// Execute code
router.post('/execute', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!config.ENABLE_CODE_EXECUTION) {
      return res.status(403).json({ error: 'Code execution is disabled' });
    }

    const { code, language } = req.body;

    if (!code || !language) {
      return res.status(400).json({ error: 'Code and language required' });
    }

    // Use Piston API for code execution
    const response = await axios.post(
      `${config.PISTON_API}/execute`,
      {
        language: language,
        version: '*',
        files: [
          {
            name: 'main',
            content: code,
          },
        ],
      },
      { timeout: 10000 }
    );

    const { run } = response.data;

    res.json({
      success: true,
      data: {
        output: run.stdout || run.stderr || '',
        error: run.stderr || null,
      },
    });
  } catch (err: any) {
    console.error('Code execution error:', err);
    res.status(500).json({
      error: 'Code execution failed',
      message: err.message,
    });
  }
});

export default router;
