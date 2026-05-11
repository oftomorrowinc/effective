import { spawn } from 'node:child_process';

export interface RunInput {
  /** Shell command to execute. Runs through the user's shell. */
  command: string;
  /** Working directory. Defaults to process.cwd(). */
  cwd?: string;
  /** Hard timeout in milliseconds. Defaults to 5 minutes. */
  timeoutMs?: number;
  /** Additional env variables merged over process.env. */
  env?: Readonly<Record<string, string>>;
}

export interface RunResult {
  readonly command: string;
  readonly cwd: string;
  readonly exitCode: number;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly durationMs: number;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_BUFFER_BYTES = 50 * 1024 * 1024;

/**
 * Run a shell command and capture its output.
 *
 * The command runs through the user's shell so familiar invocations like
 * `pnpm lint --format json` work without argument-splitting hassle. The
 * command string comes from the user's `effective.config.ts` and is
 * therefore trusted code, not untrusted user input — a malicious config
 * could already do anything by exporting a bad rule, so allowing shell
 * expansion adds nothing to that risk surface.
 *
 * Output buffers are capped at 50 MiB. Exceeding the cap kills the child
 * and returns a result marked `timedOut: false` but with the partial
 * buffers. Timeout defaults to 5 minutes.
 */
export async function runCommand(input: RunInput): Promise<RunResult> {
  const cwd = input.cwd ?? process.cwd();
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const env = { ...process.env, ...input.env };
  const startedAt = Date.now();

  return new Promise<RunResult>((resolve) => {
    const child = spawn(input.command, {
      cwd,
      env,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let bufferOverflowed = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
        }
      }, 5000);
    }, timeoutMs);

    function bufferGuard(stream: 'stdout' | 'stderr', chunk: Buffer): void {
      if (bufferOverflowed) return;
      if (stream === 'stdout') {
        stdoutBytes += chunk.length;
        if (stdoutBytes > MAX_BUFFER_BYTES) {
          bufferOverflowed = true;
          child.kill('SIGTERM');
          return;
        }
        stdoutChunks.push(chunk);
      } else {
        stderrBytes += chunk.length;
        if (stderrBytes > MAX_BUFFER_BYTES) {
          bufferOverflowed = true;
          child.kill('SIGTERM');
          return;
        }
        stderrChunks.push(chunk);
      }
    }

    child.stdout.on('data', (chunk: Buffer) => {
      bufferGuard('stdout', chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      bufferGuard('stderr', chunk);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        command: input.command,
        cwd,
        exitCode: -1,
        signal: null,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: `${Buffer.concat(stderrChunks).toString('utf8')}\n[runCommand error] ${err.message}`,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        command: input.command,
        cwd,
        exitCode: code ?? (signal === null ? 0 : 128),
        signal,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}
