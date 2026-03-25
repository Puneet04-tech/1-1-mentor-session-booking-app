import { Router, Response } from 'express';
import { query, queryOne } from '@/database';
import authMiddleware, { AuthRequest } from '@/middleware/auth';
import axios from 'axios';
import { config } from '@/config';
import { runInNewContext } from 'vm';
import { Server as SocketIOServer } from 'socket.io';

const router = Router();

// Store io instance reference (will be set by index.ts)
let io: SocketIOServer | null = null;

export function setSocketIO(socketIO: SocketIOServer) {
  io = socketIO;
}

// Language mappings to Piston API runtime identifiers
const LANGUAGE_MAP: { [key: string]: string } = {
  'javascript': 'javascript',
  'js': 'javascript',
  'typescript': 'typescript',
  'ts': 'typescript',
  'python': 'python',
  'python3': 'python',
  'py': 'python',
  'py3': 'python',
  'java': 'java',
  'cpp': 'cpp',
  'c++': 'cpp',
  'c': 'c',
  'csharp': 'csharp',
  'cs': 'csharp',
  'ruby': 'ruby',
  'php': 'php',
  'go': 'go',
  'rust': 'rust',
  'swift': 'swift',
  'kotlin': 'kotlin',
  'scala': 'scala',
  'haskell': 'haskell',
};


/**
 * Code execution endpoint - Supports cloud-based execution via Piston API
 * Executes code in multiple languages: JS, Python, Java, C++, C#, Ruby, PHP, Go, Rust, etc.
 */
router.post('/execute', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { code, language, sessionId } = req.body;

    if (!code || !language) {
      return res.status(400).json({ error: 'Code and language required' });
    }

    // Normalize language name
    const normalizedLang = LANGUAGE_MAP[language.toLowerCase()] || language;

    console.log(`Executing ${normalizedLang} code via Piston API in session ${sessionId}...`);

    let output = '';
    let error: string | null = null;
    let status = 'Success';

    try {
      // For JavaScript, try local execution first (safer, faster, no network latency)
      if (normalizedLang === 'javascript' || normalizedLang === 'typescript') {
        output = executeJavaScriptLocal(code);
      } else {
        // Use Piston API for all other languages (Python, Java, C++, etc.)
        output = await executeViaPiston(code, normalizedLang);
      }
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
 * Execute code via Piston API (free cloud code execution service)
 * Supports: Python, Java, C++, C, C#, Ruby, PHP, Go, Rust, Swift, Kotlin, Scala, Haskell, etc.
 * API: https://emkc.org/api/v2/
 */
async function executeViaPiston(code: string, language: string): Promise<string> {
  const PISTON_API = process.env.PISTON_API || 'https://emkc.org/api/v2';

  try {
    console.log(`Calling Piston API (${PISTON_API}) for ${language}...`);

    const requestPayload = {
      language: language,
      version: '*',  // Use latest version
      files: [
        {
          name: 'main',
          content: code,
        },
      ],
      stdin: '',
    };

    console.log('Request payload:', JSON.stringify(requestPayload, null, 2));

    const response = await axios.post(`${PISTON_API}/execute`, requestPayload, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('Piston API response:', JSON.stringify(response.data, null, 2));

    // Check for errors in response
    if (response.data.error) {
      throw new Error(`Piston Error: ${response.data.error}`);
    }

    // Get compile and run results
    const compile = response.data.compile || {};
    const run = response.data.run || {};

    // Handle compile stage errors
    if (compile.stderr?.trim()) {
      const compileError = compile.stderr.trim();
      // Only throw if there's no runtime output (sometimes stderr is warnings)
      if (!run.stdout) {
        throw new Error(`Compilation Error:\n${compileError}`);
      }
    }

    // Return runtime output (stdout + stderr if needed)
    const stdout = run.stdout?.trim() || '';
    const stderr = run.stderr?.trim() || '';
    
    if (stdout || stderr) {
      return stdout + (stdout && stderr ? '\n' : '') + stderr;
    }

    return 'Code executed successfully (no output)';
  } catch (err: any) {
    console.error('Piston API detailed error:', {
      message: err.message,
      code: err.code,
      status: err.response?.status,
      statusText: err.response?.statusText,
      data: err.response?.data,
    });

    // Re-throw compilation errors
    if (err.message.includes('Compilation Error')) {
      throw err;
    }

    // Handle network errors
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
      throw new Error(`Piston API unavailable (${err.code}). Endpoint: ${PISTON_API}`);
    }

    // Handle HTTP errors
    if (err.response?.status === 404) {
      throw new Error(
        `Piston API Runtime Not Found (404). Language: ${language}. ` +
        `Available runtimes: ${PISTON_API}/runtimes`
      );
    }

    if (err.response?.status) {
      console.error('Full error response:', err.response.data);
      throw new Error(`Piston API error (${err.response.status}): ${err.response.statusText}`);
    }

    throw new Error(`Code execution failed: ${err.message}`);
  }
}

/**
 * Execute JavaScript/TypeScript code safely using Node VM
 * Faster and safer than cloud execution for JS - no network latency
 */
function executeJavaScriptLocal(code: string): string {
  let output = '';
  const originalLog = console.log;

  try {
    console.log = (...args: any[]) => {
      const line = args
        .map((arg) => {
          if (typeof arg === 'object') {
            return JSON.stringify(arg, null, 2);
          }
          return String(arg);
        })
        .join(' ');
      output += line + '\n';
      originalLog(...args);
    };

    // Create sandbox context with console object
    const context = {
      console: {
        log: (...args: any[]) => {
          const line = args
            .map((arg) => {
              if (typeof arg === 'object') {
                return JSON.stringify(arg, null, 2);
              }
              return String(arg);
            })
            .join(' ');
          output += line + '\n';
        },
      },
    };

    // Execute code in a safe VM context with 10 second timeout
    runInNewContext(code, context, { timeout: 10000 });

    return output.trim() || 'Code executed successfully (no output)';
  } finally {
    console.log = originalLog;
  }
}

/**
 * Get code snapshot from database
 */
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


/**
 * Health check - Verify code execution service is available
 * Tests JavaScript locally and checks Piston API connectivity
 */
router.get('/health/check', async (req: AuthRequest, res: Response) => {
  try {
    const PISTON_API = process.env.PISTON_API || 'https://emkc.org/api/v2';

    // Test JavaScript execution
    const jsTest = executeJavaScriptLocal('console.log("JS works!")');

    // Check Piston API connectivity
    let pistonStatus = 'unavailable';
    let pistonVersion = null;
    try {
      const pistonResponse = await axios.get(`${PISTON_API}/runtimes`, {
        timeout: 5000,
      });
      pistonStatus = 'available';
      pistonVersion = pistonResponse.data?.length || 'unknown';
    } catch (e) {
      console.warn('Piston API connectivity check failed');
    }

    const support: any = {
      javascript: { status: 'supported', engine: 'Node.js VM', latency: 'local', test: 'Passed' },
      typescript: { status: 'supported', engine: 'Node.js VM', latency: 'local', test: 'Passed' },
      python: { status: 'supported', engine: 'Piston API', latency: 'remote', test: pistonStatus },
      java: { status: 'supported', engine: 'Piston API', latency: 'remote', test: pistonStatus },
      cpp: { status: 'supported', engine: 'Piston API', latency: 'remote', test: pistonStatus },
      php: { status: 'supported', engine: 'Piston API', latency: 'remote', test: pistonStatus },
      ruby: { status: 'supported', engine: 'Piston API', latency: 'remote', test: pistonStatus },
      go: { status: 'supported', engine: 'Piston API', latency: 'remote', test: pistonStatus },
      rust: { status: 'supported', engine: 'Piston API', latency: 'remote', test: pistonStatus },
    };

    res.json({
      success: true,
      message: 'Code execution service is available',
      localExecution: {
        status: 'available',
        test: 'Passed',
        jsTest: jsTest,
      },
      pistonAPI: {
        endpoint: PISTON_API,
        status: pistonStatus,
        supportedRuntimes: pistonVersion,
      },
      supportedLanguages: support,
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
