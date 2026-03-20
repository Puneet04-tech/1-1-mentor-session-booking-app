import { Router, Response } from 'express';
import { query, queryOne } from '@/database';
import authMiddleware, { AuthRequest } from '@/middleware/auth';
import axios from 'axios';
import { config } from '@/config';

const router = Router();

// Execute code - using Judge0 API (must come before /:sessionId routes)
router.post('/execute', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { code, language } = req.body;

    if (!code || !language) {
      return res.status(400).json({ error: 'Code and language required' });
    }

    // Use free public Judge0 API (or self-hosted)
    const judge0Url = process.env.JUDGE0_API_URL || 'https://judge0.com';

    // Map language to Judge0 language ID
    const languageMap: { [key: string]: number } = {
      javascript: 63,
      python: 71,
      java: 62,
      cpp: 54,
      typescript: 63, // TypeScript uses JavaScript ID
    };

    const languageId = languageMap[language];
    if (!languageId) {
      return res.status(400).json({ error: `Unsupported language: ${language}` });
    }

    // Prepare code for Java (add main method if needed)
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

    // Step 1: Submit code to Judge0
    console.log(`Submitting ${language} code to Judge0...`);
    const submitResponse = await axios.post(
      `${judge0Url}/api/submissions?base64_encoded=false&wait=false`,
      {
        source_code: codeToExecute,
        language_id: languageId,
        stdin: '',
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      }
    );

    const submissionToken = submitResponse.data.token;
    console.log(`Code submitted with token: ${submissionToken}`);

    // Step 2: Poll for result
    let result = null;
    let attempts = 0;
    const maxAttempts = 20;
    let delayMs = 500;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delayMs));

      try {
        const statusResponse = await axios.get(
          `${judge0Url}/api/submissions/${submissionToken}?base64_encoded=false`,
          {
            headers: {
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );

        result = statusResponse.data;

        // Status 1 = In Queue, 2 = Processing, anything else = Done
        if (result.status && result.status.id > 2) {
          console.log(`Execution completed with status: ${result.status.description}`);
          break;
        }

        attempts++;
        delayMs = Math.min(delayMs * 1.5, 3000);
      } catch (pollErr: any) {
        console.error('Poll error:', pollErr.message);
        attempts++;
      }
    }

    if (!result) {
      return res.status(504).json({
        error: 'Code execution timeout',
        message: 'The code took too long to execute',
      });
    }

    // Step 3: Format and return output
    let output = '';
    let error = null;

    if (result.compile_output) {
      error = result.compile_output;
      output = `Compilation Error:\n${result.compile_output}`;
    } else if (result.runtime_error) {
      error = result.runtime_error;
      output = `Runtime Error:\n${result.runtime_error}`;
    } else if (result.stdout) {
      output = result.stdout;
    } else {
      output = 'Code executed successfully (no output)';
    }

    res.json({
      success: true,
      data: {
        output: output.trim(),
        error: error,
        status: result.status.description,
      },
    });
  } catch (err: any) {
    console.error('Code execution error:', err.message);
    res.status(500).json({
      error: 'Code execution failed',
      message: err.message || 'Unknown error occurred',
      tip: 'Make sure you have internet connectivity. Judge0 API is used for code execution.',
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
