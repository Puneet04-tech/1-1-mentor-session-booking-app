import axios from 'axios';

// Language name normalization (aliases -> canonical language)
export const LANGUAGE_MAP: { [key: string]: string } = {
  'python': 'python',
  'python3': 'python',
  'py': 'python',
  'java': 'java',
  'cpp': 'cpp',
  'c++': 'cpp',
  'c': 'c',
  'javascript': 'javascript',
  'js': 'javascript',
  'typescript': 'typescript',
  'ts': 'typescript',
  'php': 'php',
  'ruby': 'ruby',
  'go': 'go',
  'rust': 'rust',
  'csharp': 'csharp',
  'cs': 'csharp',
  'swift': 'swift',
  'kotlin': 'kotlin',
  'scala': 'scala',
  'haskell': 'haskell',
};

// Language to Piston (Glot-compatible) language identifiers
// Reference: https://glot.io/ , https://emkc.org/api/v2/piston
export const GLOT_LANGUAGE_MAP: { [key: string]: string } = {
  'python': 'python',
  'java': 'java',
  'cpp': 'cpp',
  'c++': 'cpp',
  'c': 'c',
  'javascript': 'javascript',
  'js': 'javascript',
  'typescript': 'typescript',
  'ts': 'typescript',
  'php': 'php',
  'ruby': 'ruby',
  'go': 'go',
  'rust': 'rust',
  'csharp': 'csharp',
  'cs': 'csharp',
  'swift': 'swift',
  'kotlin': 'kotlin',
  'scala': 'scala',
  'haskell': 'haskell',
};

// File extension per Piston language identifier
const FILE_EXTENSION_MAP: { [key: string]: string } = {
  javascript: 'js',
  python: 'py',
  java: 'java',
  cpp: 'cpp',
  csharp: 'cs',
  typescript: 'ts',
  ruby: 'rb',
  go: 'go',
  rust: 'rs',
  php: 'php',
};

/**
 * Normalize a user-supplied language string (alias -> canonical name).
 */
export function normalizeLanguage(language: string): string {
  const languageStr = String(language).trim().toLowerCase();
  return LANGUAGE_MAP[languageStr] || languageStr;
}

/**
 * Execute code via the Piston API (external sandbox).
 *
 * ALL supported languages — including JavaScript/TypeScript — are routed
 * through this external runner. We intentionally do NOT execute any
 * user-submitted code on the backend process (see issue #139): Node's `vm`
 * module is not a security boundary and cannot isolate untrusted code from
 * server secrets, environment variables, or the database.
 *
 * API: https://emkc.org/api/v2/execute - No authentication needed
 */
export async function executeViaGlot(code: string, language: string): Promise<string> {
  try {
    const pistonLang = GLOT_LANGUAGE_MAP[language.toLowerCase()];

    if (!pistonLang) {
      throw new Error(`Unsupported language: ${language}. Supported: ${Object.keys(GLOT_LANGUAGE_MAP).join(', ')}`);
    }

    console.log(`Calling Piston API for ${language} (${pistonLang})...`);

    // Piston API endpoint
    const PISTON_API = 'https://emkc.org/api/v2/execute';

    const requestPayload = {
      language: pistonLang,
      version: '*', // Use latest version
      files: [
        {
          name: 'f.' + (FILE_EXTENSION_MAP[pistonLang] || 'txt'),
          content: code,
        },
      ],
      stdin: '',
    };

    console.log('Piston API request:', { url: PISTON_API, language: pistonLang, code_length: code.length });

    const response = await axios.post(PISTON_API, requestPayload, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('Piston API response status:', response.status);

    const result = response.data;

    // Handle compile errors
    if (result.compile && result.compile.stderr && result.compile.stderr.trim()) {
      const compileErr = result.compile.stderr.trim();
      if (!result.run || !result.run.stdout) {
        throw new Error(`Compilation Error:\n${compileErr}`);
      }
    }

    // Extract runtime output
    const stdout = (result.run && result.run.stdout) ? result.run.stdout.trim() : '';
    const stderr = (result.run && result.run.stderr) ? result.run.stderr.trim() : '';

    if (stdout) {
      return stdout;
    }

    if (stderr) {
      throw new Error(`Runtime Error:\n${stderr}`);
    }

    return 'Code executed successfully (no output)';
  } catch (err: any) {
    console.error('Piston API error:', {
      message: err.message,
      code: err.code,
      status: err.response?.status,
      statusText: err.response?.statusText,
      data: err.response?.data,
      url: err.config?.url,
    });

    // Re-throw execution errors we produced above (they carry useful detail)
    if (typeof err.message === 'string' && (err.message.startsWith('Compilation Error') || err.message.startsWith('Runtime Error') || err.message.startsWith('Unsupported language'))) {
      throw err;
    }

    // Handle network errors
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
      throw new Error(`Piston API unavailable (${err.code})`);
    }

    // Handle HTTP errors
    if (err.response?.status) {
      throw new Error(`Piston API error (${err.response.status}): ${err.response.statusText}`);
    }

    throw new Error(`Code execution failed: ${err.message}`);
  }
}

/**
 * Execute code in the given language via the external sandbox.
 * Single dispatch for every supported language — there is no local/backend
 * execution path. Returns the program's stdout (or a friendly no-output note).
 */
export async function executeCode(code: string, language: string): Promise<string> {
  const normalizedLang = normalizeLanguage(language);
  return executeViaGlot(code, normalizedLang);
}
