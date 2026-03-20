import { Router, Response } from 'express';
import { query, queryOne } from '@/database';
import authMiddleware, { AuthRequest } from '@/middleware/auth';
import axios from 'axios';
import { config } from '@/config';
import { execSync } from 'child_process';
import { VM } from 'vm';

const router = Router();

// Execute code - Local execution without external dependencies
router.post('/execute', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { code, language } = req.body;

    if (!code || !language) {
      return res.status(400).json({ error: 'Code and language required' });
    }

    console.log(`Executing ${language} code locally...`);

    let output = '';
    let error = null;
    let status = 'Success';

    try {
      if (language === 'javascript' || language === 'typescript') {
        // Use Node.js VM for safe JavaScript execution
        output = executeJavaScript(code);
      } else if (language === 'python') {
        // Try to execute Python if available
        output = executePython(code);
      } else if (language === 'java') {
        // Return helpful message for Java
        output = 'Java execution requires compilation. This is a simplified demo.\nTo execute actual Java, use a self-hosted solution.';
      } else if (language === 'cpp') {
        // Return helpful message for C++
        output = 'C++ execution requires compilation. This is a simplified demo.\nTo execute actual C++, use a self-hosted solution.';
      } else {
        output = `Language "${language}" is not supported in local execution mode.`;
      }
    } catch (execErr: any) {
      error = execErr.message;
      output = `Execution Error:\n${execErr.message}`;
      status = 'Error';
    }

    res.json({
      success: true,
      data: {
        output: output.trim(),
        error: error,
        status: status,
      },
    });
  } catch (err: any) {
    console.error('Code execution error:', err.message);

    res.status(500).json({
      error: 'Code execution failed',
      message: err.message || 'Unknown error occurred',
      tip: 'Using local code execution. Make sure your code is valid.',
    });
  }
});

/**
 * Execute JavaScript code safely using Node VM
 */
function executeJavaScript(code: string): string {
  const context = {
    console: {
      log: (...args: any[]) => {
        console.log(...args);
        return args.map(arg => String(arg)).join(' ');
      },
    },
  };

  // Capture console.log output
  let output = '';
  const originalLog = console.log;
  
  try {
    console.log = (...args: any[]) => {
      const line = args.map(arg => {
        if (typeof arg === 'object') {
          return JSON.stringify(arg, null, 2);
        }
        return String(arg);
      }).join(' ');
      output += line + '\n';
      originalLog(...args);
    };

    // Execute code in a safe VM context
    const vm = new VM(context);
    vm.runInNewContext(code);

    return output.trim() || 'Code executed successfully (no output)';
  } finally {
    console.log = originalLog;
  }
}

/**
 * Execute Python code using child_process
 */
function executePython(code: string): string {
  try {
    // Try to execute Python code
    const result = execSync(`python3 -c "${code.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`, {
      timeout: 10000,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return result.trim() || 'Code executed successfully (no output)';
  } catch (err: any) {
    // If Python3 not available, try Python
    try {
      const result = execSync(`python -c "${code.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`, {
        timeout: 10000,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      return result.trim() || 'Code executed successfully (no output)';
    } catch (innerErr: any) {
      throw new Error('Python is not installed or not available in PATH. Install Python 3 to execute Python code.');
    }
  }
}

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

// Health check - Verify local code execution is working
router.get('/health', async (req: AuthRequest, res: Response) => {
  try {
    // Test JavaScript execution
    const testOutput = executeJavaScript('console.log("Local execution working!")');

    res.json({
      success: true,
      message: 'Local code execution is available',
      supportedLanguages: [
        { language: 'javascript', status: 'supported', engine: 'Node.js VM' },
        { language: 'typescript', status: 'supported', engine: 'Node.js VM' },
        { language: 'python', status: 'supported if installed', engine: 'Python' },
        { language: 'java', status: 'demo mode', engine: 'Not compiled' },
        { language: 'cpp', status: 'demo mode', engine: 'Not compiled' },
      ],
      testResult: testOutput,
    });
  } catch (err: any) {
    console.error('Health check error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Local code execution is not available',
      error: err.message,
    });
  }
});

export default router;
