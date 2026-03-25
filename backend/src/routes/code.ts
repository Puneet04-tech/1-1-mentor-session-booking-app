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

// Language mappings to Judge0 language IDs
// Reference: https://judge0.com/api/docs
const LANGUAGE_MAP: { [key: string]: number } = {
  'python': 71,          // Python 3.8+
  'python3': 71,
  'py': 71,
  'java': 62,            // Java (OpenJDK)
  'cpp': 54,             // C++ (GCC)
  'c++': 54,
  'c': 52,               // C (GCC)
  'javascript': 63,      // JavaScript (Node.js)
  'js': 63,
  'typescript': 67,      // TypeScript
  'ts': 67,
  'php': 68,             // PHP
  'ruby': 72,            // Ruby
  'go': 60,              // Go
  'rust': 73,            // Rust
  'csharp': 51,          // C#
  'cs': 51,
  'swift': 83,           // Swift
  'kotlin': 78,          // Kotlin
  'scala': 81,           // Scala
  'haskell': 11,         // Haskell
};


/**
 * Code execution endpoint - Supports cloud-based execution via Judge0 API
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
        // Use Judge0 API for all other languages (Python, Java, C++, etc.)
        output = await executeViaJudge0(code, normalizedLang);
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
 * Execute code via Judge0 API (free cloud code execution service)
 * Supports: Python, Java, C++, C, C#, Ruby, PHP, Go, Rust, Swift, Kotlin, Scala, Haskell, etc.
 * API: https://judge0.com/api/docs
 */
async function executeViaJudge0(code: string, language: string): Promise<string> {
  const JUDGE0_API = process.env.JUDGE0_API || 'https://judge0-ce.p.rapidapi.com';
  const JUDGE0_KEY = process.env.JUDGE0_KEY;
  
  try {
    const langId = LANGUAGE_MAP[language.toLowerCase()];
    
    if (!langId) {
      throw new Error(`Unsupported language: ${language}`);
    }

    console.log(`Calling Judge0 API for ${language} (ID: ${langId})...`);

    const headers: any = {
      'Content-Type': 'application/json',
    };

    // Add API key if available (for RapidAPI)
    if (JUDGE0_KEY) {
      headers['X-RapidAPI-Key'] = JUDGE0_KEY;
      headers['X-RapidAPI-Host'] = 'judge0-ce.p.rapidapi.com';
    }

    const requestPayload = {
      source_code: code,
      language_id: langId,
      stdin: '',
      cpu_time_limit: 10,
      memory_limit: 512000,  // 512MB
    };

    console.log('Request payload:', { language_id: langId, code_length: code.length });

    const response = await axios.post(
      `${JUDGE0_API}/submissions?base64_encoded=false&wait=true`,
      requestPayload,
      {
        timeout: 30000,
        headers,
      }
    );

    console.log('Judge0 API response status:', response.data.status);

    const result = response.data;

    // Check for compilation errors
    if (result.compile_output) {
      const compileError = result.compile_output.trim();
      if (compileError && !result.stdout) {
        throw new Error(`Compilation Error:\n${compileError}`);
      }
    }

    // Check for runtime errors
    if (result.runtime_error) {
      throw new Error(`Runtime Error:\n${result.runtime_error}`);
    }

    // Return output
    const stdout = result.stdout ? Buffer.from(result.stdout, 'base64').toString('utf-8').trim() : '';
    const stderr = result.stderr ? Buffer.from(result.stderr, 'base64').toString('utf-8').trim() : '';
    
    if (stdout || stderr) {
      return stdout + (stdout && stderr ? '\n' : '') + stderr;
    }

    return 'Code executed successfully (no output)';
  } catch (err: any) {
    console.error('Judge0 API detailed error:', {
      message: err.message,
      code: err.code,
      status: err.response?.status,
      statusText: err.response?.statusText,
      data: err.response?.data,
    });

    // Handle network errors
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
      throw new Error(`Judge0 API unavailable (${err.code})`);
    }

    // Handle HTTP errors
    if (err.response?.status) {
      throw new Error(`Judge0 API error (${err.response.status}): ${err.response.statusText}`);
    }

    throw new Error(`Code execution failed: ${err.message}`);
  }
}

/**
 * Execute code via Piston API (DEPRECATED - Left for reference)
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
 * List available runtimes from Judge0 API (PUBLIC - no auth needed)
 */
router.get('/runtimes', async (req: any, res: Response) => {
  try {
    const JUDGE0_API = process.env.JUDGE0_API || 'https://judge0-ce.p.rapidapi.com';
    const JUDGE0_KEY = process.env.JUDGE0_KEY;

    const headers: any = {
      'Content-Type': 'application/json',
    };

    if (JUDGE0_KEY) {
      headers['X-RapidAPI-Key'] = JUDGE0_KEY;
      headers['X-RapidAPI-Host'] = 'judge0-ce.p.rapidapi.com';
    }

    // Get languages from Judge0
    const languagesResponse = await axios.get(`${JUDGE0_API}/languages`, {
      timeout: 5000,
      headers,
    });

    const languages = languagesResponse.data || [];

    res.json({
      success: true,
      totalLanguages: languages.length,
      languages: languages.map((lang: any) => ({
        id: lang.id,
        name: lang.name,
      })),
    });
  } catch (err: any) {
    console.error('Failed to fetch Judge0 languages:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available languages',
      details: err.message,
    });
  }
});

/**
 * List available runtimes from Piston API (DEPRECATED - Left for reference)
 */
router.get('/runtimes-piston', async (req: any, res: Response) => {
  try {
    const PISTON_API = process.env.PISTON_API || 'https://emkc.org/api/v2';

    const runtimesResponse = await axios.get(`${PISTON_API}/runtimes`, {
      timeout: 5000,
    });

    const runtimes = runtimesResponse.data || [];
    
    // Organize by language
    const byLanguage: { [key: string]: any[] } = {};
    runtimes.forEach((runtime: any) => {
      if (!byLanguage[runtime.language]) {
        byLanguage[runtime.language] = [];
      }
      byLanguage[runtime.language].push(runtime.version);
    });

    res.json({
      success: true,
      totalRuntimes: runtimes.length,
      byLanguage,
      allRuntimes: runtimes,
    });
  } catch (err: any) {
    console.error('Failed to fetch Piston runtimes:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available runtimes',
      details: err.message,
    });
  }
});

/**
 * Health check - Verify code execution service is available
 * Tests JavaScript locally and checks Judge0 API connectivity
 */
router.get('/health/check', async (req: AuthRequest, res: Response) => {
  try {
    const JUDGE0_API = process.env.JUDGE0_API || 'https://judge0-ce.p.rapidapi.com';
    const JUDGE0_KEY = process.env.JUDGE0_KEY;

    // Test JavaScript execution
    const jsTest = executeJavaScriptLocal('console.log("JS works!")');

    // Get available languages from Judge0 API
    let availableLanguages: any[] = [];
    try {
      const headers: any = {
        'Content-Type': 'application/json',
      };

      if (JUDGE0_KEY) {
        headers['X-RapidAPI-Key'] = JUDGE0_KEY;
        headers['X-RapidAPI-Host'] = 'judge0-ce.p.rapidapi.com';
      }

      const languagesResponse = await axios.get(`${JUDGE0_API}/languages`, {
        timeout: 5000,
        headers,
      });
      availableLanguages = languagesResponse.data || [];
      console.log('Available Judge0 languages:', availableLanguages.length);
    } catch (e) {
      console.warn('Failed to fetch Judge0 API languages');
    }

    res.json({
      success: true,
      message: 'Code execution service is available',
      localExecution: {
        status: 'available',
        test: 'Passed',
        jsTest: jsTest,
      },
      judge0API: {
        endpoint: JUDGE0_API,
        status: availableLanguages.length > 0 ? 'available' : 'checking',
        totalLanguages: availableLanguages.length,
      },
      supportedLanguages: availableLanguages.map((lang: any) => lang.name),
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
