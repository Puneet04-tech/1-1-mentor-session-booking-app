import { Router, Response } from 'express';
import { query, queryOne } from '@/database';
import authMiddleware, { AuthRequest } from '@/middleware/auth';
import axios from 'axios';
import { config } from '@/config';

const router = Router();

// Execute code - using Piston API (free, no authentication needed)
router.post('/execute', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { code, language } = req.body;

    if (!code || !language) {
      return res.status(400).json({ error: 'Code and language required' });
    }

    // Use Piston API - completely free and reliable
    const pistonUrl = 'https://emkc.org/api/v2';

    // Map language to Piston Runtime name
    const languageMap: { [key: string]: string } = {
      javascript: 'javascript',
      python: 'python',
      java: 'java',
      cpp: 'cpp',
      typescript: 'javascript', // TypeScript compiled to JavaScript
    };

    const runtime = languageMap[language];
    if (!runtime) {
      return res.status(400).json({ error: `Unsupported language: ${language}` });
    }

    // Prepare code
    let codeToExecute = code;
    if (language === 'java') {
      if (!code.includes('class ') || !code.includes('public static void main')) {
        codeToExecute = `public class Main {
  public static void main(String[] args) {
    ${code.replace(/\n/g, '\n    ')}
  }
}`;
      }
    }

    // Step 1: Execute code via Piston API
    console.log(`Executing ${language} code via Piston API...`);
    console.log('Request payload:', {
      language: runtime,
      version: '*',
      codeLength: codeToExecute.length,
    });

    const executeResponse = await axios.post(
      `${pistonUrl}/execute`,
      {
        language: runtime,
        version: '*',
        files: [
          {
            content: codeToExecute,
          },
        ],
      },
      {
        timeout: 20000,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Piston API response status:', executeResponse.status);
    const result = executeResponse.data;

    // Format response
    let output = '';
    let error = null;

    if (result.compile && result.compile.stderr) {
      error = result.compile.stderr;
      output = `Compilation Error:\n${result.compile.stderr}`;
    } else if (result.runtime && result.runtime.stderr) {
      error = result.runtime.stderr;
      output = `Runtime Error:\n${result.runtime.stderr}`;
    } else if (result.run && result.run.stdout) {
      output = result.run.stdout;
    } else if (result.run && !result.run.stdout && !result.run.stderr) {
      output = 'Code executed successfully (no output)';
    } else {
      output = 'Code executed successfully';
    }

    res.json({
      success: true,
      data: {
        output: output.trim(),
        error: error,
        status: 'Success',
      },
    });
  } catch (err: any) {
    console.error('Code execution error:', err.message);
    console.error('Error response status:', err.response?.status);
    console.error('Error response data:', err.response?.data);
    console.error('Error code:', err.code);
    
    // Provide helpful error message
    let errorMsg = err.message;
    let tip = 'Using Piston API for code execution. Ensure you have internet connectivity.';
    
    if (err.code === 'ECONNREFUSED') {
      errorMsg = 'Could not connect to code execution service. Check your internet connection.';
      tip = 'Piston API might be temporarily unavailable.';
    } else if (err.code === 'ENOTFOUND') {
      errorMsg = 'Code execution service endpoint not found.';
      tip = 'Check your internet connection or Piston API status.';
    } else if (err.response?.status === 404) {
      errorMsg = 'Code execution service endpoint not found.';
      tip = 'The Piston API endpoint might have changed. Check https://emkc.org/api/v2/runtimes';
    } else if (err.response?.status === 429) {
      errorMsg = 'Too many requests. Please wait a moment and try again.';
      tip = 'Piston API has rate limiting. Wait before trying again.';
    } else if (err.response?.status === 400) {
      errorMsg = `Invalid request: ${err.response?.data?.message || 'Bad parameters'}`;
      tip = 'Check your code syntax and language selection.';
    }
    
    res.status(500).json({
      error: 'Code execution failed',
      message: errorMsg,
      tip: tip,
      debug: process.env.NODE_ENV === 'development' ? {
        apiUrl: `https://emkc.org/api/v2/execute`,
        language: err.config?.data ? JSON.parse(err.config.data).language : 'unknown',
        status: err.response?.status,
      } : undefined,
    });
  }
});

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

export default router;
