import axios from 'axios';
import { executeCode, executeViaGlot, normalizeLanguage } from './codeExecution';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('normalizeLanguage', () => {
  it('maps JavaScript aliases to the canonical name', () => {
    expect(normalizeLanguage('js')).toBe('javascript');
    expect(normalizeLanguage('JS')).toBe('javascript');
    expect(normalizeLanguage(' JavaScript ')).toBe('javascript');
  });

  it('maps TypeScript aliases to the canonical name', () => {
    expect(normalizeLanguage('ts')).toBe('typescript');
  });
});

describe('executeCode - JavaScript via external runner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes JavaScript through the Piston sandbox rather than executing locally', async () => {
    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: { run: { stdout: 'hello\n', stderr: '' } },
    });

    const output = await executeCode('console.log("hello")', 'javascript');

    expect(output).toBe('hello');
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);

    const [url, payload] = mockedAxios.post.mock.calls[0];
    expect(url).toBe('https://emkc.org/api/v2/execute');
    expect(payload).toMatchObject({
      language: 'javascript',
      files: [{ name: 'f.js', content: 'console.log("hello")' }],
    });
  });

  it('sends attempts to read Node internals to the sandbox instead of running them on the backend', async () => {
    // A payload that would leak secrets if executed on the backend process.
    const malicious = 'console.log(process.env.JWT_SECRET)';
    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: { run: { stdout: 'undefined\n', stderr: '' } },
    });

    const output = await executeCode(malicious, 'js');

    // The real backend secret is never touched: the call goes to the sandbox
    // with our code as a plain string payload.
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const [, payload] = mockedAxios.post.mock.calls[0] as [string, any];
    expect(payload.files[0].content).toBe(malicious);
    expect(output).toBe('undefined');
  });

  it('surfaces runtime errors from the sandbox', async () => {
    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: { run: { stdout: '', stderr: 'ReferenceError: foo is not defined' } },
    });

    await expect(executeViaGlot('foo()', 'javascript')).rejects.toThrow('Runtime Error');
  });

  it('rejects unsupported languages before making a network call', async () => {
    await expect(executeViaGlot('print(1)', 'brainfuck')).rejects.toThrow('Unsupported language');
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
