import { Router, Response } from 'express';
import { query, queryOne } from '@/database';
import { requireSessionParticipant, isSessionParticipant, SessionRecord } from '@/middleware/requireSessionParticipant';
import authMiddleware, { AuthRequest } from '@/middleware/auth';
import { Server as SocketIOServer } from 'socket.io';
import { GLOT_LANGUAGE_MAP, executeCode, executeViaGlot, normalizeLanguage } from '@/utils/codeExecution';

const router = Router();

// Store io instance reference (will be set by index.ts)
let io: SocketIOServer | null = null;

export function setSocketIO(socketIO: SocketIOServer) {
  io = socketIO;
}

/**
 * Code execution endpoint - Executes user code in an external sandbox (Piston API).
 * Every supported language (including JavaScript/TypeScript) is routed through the
 * external runner. User-submitted code is NEVER executed on the backend process
 * (see issue #139): Node's `vm` module is not a security boundary.
 */
router.post('/execute', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { code, language, sessionId } = req.body;

    if (!code || !language) {
      return res.status(400).json({
        error: 'Code and language required',
      });
    }

    if (typeof code !== 'string') {
      return res.status(400).json({
        error: 'Code must be a string',
      });
    }

    // Maximum allowed source code size
    const MAX_CODE_LENGTH = 100000;

    if (code.length > MAX_CODE_LENGTH) {
      return res.status(400).json({
        error: `Code must not exceed ${MAX_CODE_LENGTH} characters`,
      });
    }

    // Ensure language is a non-empty string
    const languageStr = String(language).trim().toLowerCase();

    if (!languageStr) {
      return res.status(400).json({
        error: 'Language must be a non-empty string',
      });
    }

    // When a session is targeted, the result is broadcast to that session's
    // Socket.io room — so the caller must be a participant. `sessionId` arrives
    // in the body (not a route param), so we can't use the requireSessionParticipant
    // middleware directly; we reuse its pure isSessionParticipant check instead.
    if (sessionId) {
      const session = await queryOne<SessionRecord>(
        'SELECT id, mentor_id, student_id FROM sessions WHERE id = $1',
        [sessionId]
      );
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      if (!isSessionParticipant(session, req.user?.id)) {
        return res.status(403).json({ error: 'You are not a participant in this session' });
      }
    }

    const normalizedLang = normalizeLanguage(languageStr);

    console.log(`Executing ${normalizedLang} code via Piston API in session ${sessionId}...`);

    let output = '';
    let error: string | null = null;
    let status = 'Success';

    try {
      // All languages run through the external sandbox — no local execution path.
      output = await executeCode(code, normalizedLang);
    } catch (execErr: any) {
      error = execErr.message;
      output = `Execution Error:\n${execErr.message}`;
      status = 'Error';
    }

    const result = {
      output: output.trim(),
      error: error,
      status: status,
      language: normalizedLang,
      timestamp: new Date().toISOString(),
      executedBy: req.user?.id,
    };

    // Broadcast execution result to all users in the session via Socket.io
    if (io && sessionId) {
      io.to(`session:${sessionId}`).emit('code:execution:result', result);
      console.log(`Broadcasted execution result to session:${sessionId}`);
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    console.error('Code execution error:', err.message);

    res.status(500).json({
      error: 'Code execution failed',
      message: err.message || 'Unknown error occurred',
    });
  }
});

/**
 * Get code snapshot from database
 */
router.post('/:sessionId', authMiddleware, requireSessionParticipant(), async (req: AuthRequest, res: Response) => {
  try {
    const { code, language } = req.body;
    const now = new Date().toISOString();

    if (typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({
        error: 'Code must be a non-empty string',
      });
    }

    if (typeof language !== 'string' || !language.trim()) {
      return res.status(400).json({
        error: 'Language must be a non-empty string',
      });
    }

    const MAX_CODE_LENGTH = 100000;

    if (code.length > MAX_CODE_LENGTH) {
      return res.status(400).json({
        error: `Code must not exceed ${MAX_CODE_LENGTH} characters`,
      });
    }

    const result = await queryOne(
      `INSERT INTO code_snapshots (session_id, code, language, user_id, saved_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        req.params.sessionId,
        code.trimEnd(),
        language.trim().toLowerCase(),
        req.user?.id,
        now,
      ]
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error('Save code snapshot error:', err);
    res.status(500).json({
      error: 'Failed to save code',
    });
  }
});

/**
 * Get the full ordered code-editor activity recording for playback.
 * Only available once the session has completed and recording was opted into.
 */
router.get('/:sessionId/history', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const session = await queryOne(
      'SELECT id, mentor_id, student_id, status, recording_enabled, started_at, ended_at, title, code_language FROM sessions WHERE id = $1',
      [req.params.sessionId]
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.mentor_id !== userId && session.student_id !== userId) {
      return res.status(403).json({ error: 'You are not a participant in this session' });
    }

    if (!session.recording_enabled) {
      return res.status(404).json({ error: 'Recording was not enabled for this session' });
    }

    if (session.status !== 'completed') {
      return res.status(400).json({ error: 'Recording is only available once the session has ended' });
    }

    const events = await query(
      `SELECT code, language, user_id, saved_at
       FROM code_snapshots WHERE session_id = $1
       ORDER BY saved_at ASC`,
      [req.params.sessionId]
    );

    res.json({
      success: true,
      data: {
        session: {
          id: session.id,
          title: session.title,
          code_language: session.code_language,
          started_at: session.started_at,
          ended_at: session.ended_at,
        },
        events: events.rows,
      },
    });
  } catch (err) {
    console.error('Get code recording history error:', err);
    res.status(500).json({ error: 'Failed to get code recording history' });
  }
});


/**
 * List available languages (PUBLIC - no auth needed)
 */
router.get('/runtimes', async (req: any, res: Response) => {
  try {
    res.json({
      success: true,
      totalLanguages: Object.keys(GLOT_LANGUAGE_MAP).length,
      languages: Object.keys(GLOT_LANGUAGE_MAP).map(lang => ({
        name: lang,
        id: GLOT_LANGUAGE_MAP[lang],
      })),
    });
  } catch (err: any) {
    console.error('Failed to get languages:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available languages',
      details: err.message,
    });
  }
});

/**
 * Health check - Verify code execution service is available.
 * Exercises the external sandbox (Piston) for both JavaScript and Python; there
 * is no local execution path to test.
 */
router.get('/health/check', async (req: AuthRequest, res: Response) => {
  try {
    let pistonStatus = 'checking';
    let jsTest = '';
    try {
      jsTest = await executeViaGlot('console.log("JS works!")', 'javascript');
      const pythonTest = await executeViaGlot('print("Piston works!")', 'python');
      pistonStatus = 'available';
      console.log('Piston test passed:', pythonTest);
    } catch (e: any) {
      console.warn('Piston test failed:', e.message);
      pistonStatus = 'error';
    }

    res.json({
      success: true,
      message: 'Code execution service is available',
      pistonAPI: {
        endpoint: 'https://emkc.org/api/v2/execute',
        status: pistonStatus,
        jsTest: jsTest,
        supportedLanguages: Object.keys(GLOT_LANGUAGE_MAP),
      },
    });
  } catch (err: any) {
    console.error('Health check error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Code execution health check failed',
      error: err.message,
    });
  }
});

export default router;
