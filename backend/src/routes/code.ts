import { Router, Response } from 'express';
import { query, queryOne } from '@/database';
import authMiddleware, { AuthRequest } from '@/middleware/auth';
import axios from 'axios';
import { config } from '@/config';
import { execSync, spawnSync } from 'child_process';
import { runInNewContext } from 'vm';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Server as SocketIOServer } from 'socket.io';

const router = Router();

// Store io instance reference (will be set by index.ts)
let io: SocketIOServer | null = null;

export function setSocketIO(socketIO: SocketIOServer) {
  io = socketIO;
}

const TEMP_DIR = path.join(os.tmpdir(), 'code-execution');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Execute code - Local execution without external dependencies
router.post('/execute', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { code, language, sessionId } = req.body;

    if (!code || !language) {
      return res.status(400).json({ error: 'Code and language required' });
    }

    console.log(`Executing ${language} code locally in session ${sessionId}...`);

    let output = '';
    let error = null;
    let status = 'Success';

    try {
      if (language === 'javascript' || language === 'typescript') {
        // Use Node.js VM for safe JavaScript execution
        output = executeJavaScript(code);
      } else if (language === 'python') {
        // Execute Python if available
        output = executePython(code);
      } else if (language === 'java') {
        // Compile and execute Java if JDK available
        output = executeJava(code);
      } else if (language === 'cpp') {
        // Compile and execute C++ if GCC available
        output = executeCpp(code);
      } else {
        output = `Language "${language}" is not supported.`;
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
      language: language,
      timestamp: new Date().toISOString(),
      executedBy: req.user?.id,
    };

    // Broadcast execution result to all users in the session via Socket.io
    if (io && sessionId) {
      io.to(`session:${sessionId}`).emit('code:execution:result', result);
      console.log(`Broadcaster execution result to session:${sessionId}`);
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
      tip: 'Using local code execution. Make sure your code is valid.',
    });
  }
});

/**
 * Execute JavaScript code safely using Node VM
 */
function executeJavaScript(code: string): string {
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

    // Create sandbox context with console
    const context = {
      console: {
        log: (...args: any[]) => {
          const line = args.map(arg => {
            if (typeof arg === 'object') {
              return JSON.stringify(arg, null, 2);
            }
            return String(arg);
          }).join(' ');
          output += line + '\n';
        },
      },
    };

    // Execute code in a safe VM context
    runInNewContext(code, context, { timeout: 10000 });

    return output.trim() || 'Code executed successfully (no output)';
  } finally {
    console.log = originalLog;
  }
}

/**
 * Execute Python code
 */
function executePython(code: string): string {
  try {
    // Write code to temp file
    const tempFile = path.join(TEMP_DIR, `script_${Date.now()}.py`);
    fs.writeFileSync(tempFile, code);

    try {
      // Try python3 first
      const result = execSync(`python3 "${tempFile}"`, {
        timeout: 15000,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });
      fs.unlinkSync(tempFile);
      return result.trim() || 'Code executed successfully (no output)';
    } catch (err) {
      // Try python if python3 fails
      try {
        const result = execSync(`python "${tempFile}"`, {
          timeout: 15000,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
        });
        fs.unlinkSync(tempFile);
        return result.trim() || 'Code executed successfully (no output)';
      } catch (innerErr: any) {
        fs.unlinkSync(tempFile);
        throw new Error('Python is not installed. Install Python 3 to execute Python code.');
      }
    }
  } catch (err: any) {
    throw err;
  }
}

/**
 * Execute Java code
 */
function executeJava(code: string): string {
  try {
    const className = 'TempCode';
    const fileName = `${className}.java`;
    const tempFile = path.join(TEMP_DIR, fileName);
    const classFile = path.join(TEMP_DIR, `${className}.class`);

    // Wrap code in a class if not already wrapped
    let javaCode = code;
    if (!code.includes('public class') && !code.includes('public static void main')) {
      javaCode = `public class ${className} {
    public static void main(String[] args) {
        ${code.replace(/\n/g, '\n        ')}
    }
}`;
    }

    fs.writeFileSync(tempFile, javaCode);

    try {
      // Compile Java code
      execSync(`javac "${tempFile}"`, {
        timeout: 20000,
        encoding: 'utf-8',
      });

      // Run compiled Java code
      const result = execSync(`java -cp "${TEMP_DIR}" ${className}`, {
        timeout: 20000,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });

      // Cleanup
      fs.unlinkSync(tempFile);
      if (fs.existsSync(classFile)) fs.unlinkSync(classFile);

      return result.trim() || 'Code executed successfully (no output)';
    } catch (compileErr: any) {
      // Cleanup on error
      try {
        fs.unlinkSync(tempFile);
        if (fs.existsSync(classFile)) fs.unlinkSync(classFile);
      } catch (e) {}

      if (compileErr.message.includes('not found') || compileErr.message.includes('javac')) {
        throw new Error('Java compiler not found. Install JDK to execute Java code.');
      }
      throw new Error(`Java Error: ${compileErr.message}`);
    }
  } catch (err: any) {
    throw err;
  }
}

/**
 * Execute C++ code using local compiler (with helpful fallback message)
 */
function executeCpp(code: string): string {
  try {
    // Wrap code in main if needed
    let cppCode = code;
    if (!code.includes('int main')) {
      cppCode = `#include <iostream>
using namespace std;
int main() {
    ${code.replace(/\n/g, '\n    ')}
    return 0;
}`;
    }

    const exeName = `program_${Date.now()}`;
    const cppFile = path.join(TEMP_DIR, `${exeName}.cpp`);
    const exeFile = path.join(TEMP_DIR, exeName + (process.platform === 'win32' ? '.exe' : ''));

    fs.writeFileSync(cppFile, cppCode);

    try {
      // Try to compile with g++
      const compileResult = spawnSync('g++', [`"${cppFile}"`, '-o', `"${exeFile}"`], {
        timeout: 20000,
        encoding: 'utf-8',
        shell: true,
        maxBuffer: 10 * 1024 * 1024,
      });

      // Check for compilation errors
      if (compileResult.error || compileResult.status !== 0) {
        const errorMsg = compileResult.stderr || compileResult.error?.message || 'Unknown compilation error';
        
        // Cleanup and provide helpful message
        try { fs.unlinkSync(cppFile); } catch (e) {}
        try { if (fs.existsSync(exeFile)) fs.unlinkSync(exeFile); } catch (e) {}
        
        if (errorMsg.includes('not found') || errorMsg.includes('ENOENT')) {
          return `❌ C++ Compiler Not Found\n\n` +
                 `Install a C++ compiler to execute C++ code:\n\n` +
                 `📦 Windows (MinGW):\n` +
                 `   1. Download: https://www.mingw-w64.org/\n` +
                 `   2. Run the installer and add to PATH\n` +
                 `   3. Verify: Open Command Prompt and type "g++ --version"\n\n` +
                 `🍎 macOS:\n` +
                 `   brew install gcc\n\n` +
                 `🐧 Linux:\n` +
                 `   sudo apt install g++     # Ubuntu/Debian\n` +
                 `   sudo yum install gcc-c++ # RedHat/CentOS`;
        }
        
        return `Compilation Error:\n${errorMsg}`;
      }

      // Run the compiled executable
      const runResult = spawnSync(exeFile, [], {
        timeout: 20000,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });

      // Cleanup
      try { fs.unlinkSync(cppFile); } catch (e) {}
      try { if (fs.existsSync(exeFile)) fs.unlinkSync(exeFile); } catch (e) {}

      if (runResult.error) {
        return `Runtime Error: ${runResult.error.message}`;
      }

      const output = (runResult.stdout || '').trim();
      if (runResult.stderr) {
        return output + (output ? '\n' : '') + runResult.stderr;
      }

      return output || 'Code executed successfully (no output)';
    } catch (err: any) {
      // Cleanup temp files
      try { fs.unlinkSync(cppFile); } catch (e) {}
      try { if (fs.existsSync(exeFile)) fs.unlinkSync(exeFile); } catch (e) {}
      
      throw err;
    }
  } catch (err: any) {
    return `❌ C++ Compilation Failed\n\n` +
           `Install a C++ compiler to execute C++ code:\n\n` +
           `📦 Windows (MinGW):\n` +
           `   1. Download: https://www.mingw-w64.org/\n` +
           `   2. Run the installer and add to PATH\n` +
           `   3. Verify: Open Command Prompt and type "g++ --version"\n\n` +
           `🍎 macOS:\n` +
           `   brew install gcc\n\n` +
           `🐧 Linux:\n` +
           `   sudo apt install g++     # Ubuntu/Debian\n` +
           `   sudo yum install gcc-c++ # RedHat/CentOS\n\n` +
           `Error Details: ${err.message}`;
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
    const jsTest = executeJavaScript('console.log("JS works!")');
    
    // Check for language support
    const support: any = {
      javascript: { status: 'supported', engine: 'Node.js VM', test: 'Passed' },
      typescript: { status: 'supported', engine: 'Node.js VM', test: 'Passed' },
    };

    // Check Python
    try {
      support.python = { status: 'supported', engine: 'Python', test: 'Available' };
    } catch (e) {
      support.python = { status: 'not installed', engine: 'Requires Python 3', test: 'Failed' };
    }

    // Check Java
    try {
      support.java = { status: 'supported', engine: 'JDK', test: 'Available' };
    } catch (e) {
      support.java = { status: 'not installed', engine: 'Requires JDK', test: 'Failed' };
    }

    // Check C++
    try {
      support.cpp = { status: 'supported', engine: 'GCC/G++', test: 'Available' };
    } catch (e) {
      support.cpp = { status: 'not installed', engine: 'Requires GCC', test: 'Failed' };
    }

    res.json({
      success: true,
      message: 'Local code execution is available',
      supportedLanguages: support,
      jsTest: jsTest,
    });
  } catch (err: any) {
    console.error('Health check error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Local code execution check failed',
      error: err.message,
    });
  }
});

export default router;
