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
  /**
   * Data written to the child's stdin (then closed). When omitted,
   * stdin is ignored entirely — the child sees an immediate EOF.
   */
  stdin?: string;
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
 * Strip nested-package-manager pollutants from inherited env before
 * spawning a child.
 *
 * When effective itself is invoked via `pnpm exec effective verify`
 * (or `npx effective ...`, `yarn effective ...`), the outer package
 * manager sets a swarm of `npm_*`, `PNPM_*`, and `INIT_CWD`
 * variables describing its own workspace context. effective's
 * toolchain step then spawns the project's `pnpm typecheck` /
 * `pnpm test` / etc., and the inner pnpm sees env vars from the
 * OUTER pnpm's context and resolves workspace roots, module paths,
 * and lifecycle hooks from the wrong base — symptoms range from
 * "TS2307: Cannot find module 'effective'" to test runners exiting
 * 1 with no visible error. The fix is to scrub these prefixes
 * before merging with the caller's explicit env.
 *
 * What we strip:
 * - `npm_*` — npm-compat vars set by every modern PM
 * - `NPM_*` — uppercase variants (NPM_CONFIG_*, NPM_TOKEN, etc.)
 * - `PNPM_*` — pnpm-specific
 * - `INIT_CWD` — the directory the outer PM was invoked from
 *
 * Caller's explicit `input.env` is unaffected — if a user really
 * wants to pass `npm_config_foo` to a child, they can set it
 * explicitly and it'll override the sanitized inherited env.
 */
function sanitizeInheritedEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (key.startsWith('npm_')) continue;
    if (key.startsWith('NPM_')) continue;
    if (key.startsWith('PNPM_')) continue;
    if (key === 'INIT_CWD') continue;
    // eslint-disable-next-line security/detect-object-injection -- exception-id: caller-validated-dynamic-key -- key is one we just read from the same env object; not user input
    out[key] = value;
  }
  return out;
}

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
  const env = { ...sanitizeInheritedEnv(process.env), ...input.env };
  const startedAt = Date.now();

  return new Promise<RunResult>((resolve) => {
    const child = spawn(input.command, {
      cwd,
      env,
      shell: true,
      stdio: [input.stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      // Detach so the shell starts a new process group and we can SIGTERM
      // the whole group — otherwise `shell: true` makes `sh` our direct
      // child and the real workload (e.g. `node`, `eslint`) a grandchild,
      // and SIGTERM-ing `sh` leaves the grandchild holding our pipes
      // open until it exits on its own.
      detached: process.platform !== 'win32',
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let bufferOverflowed = false;

    function killTree(signal: NodeJS.Signals): void {
      if (child.pid === undefined) {
        child.kill(signal);
        return;
      }
      if (process.platform === 'win32') {
        child.kill(signal);
        return;
      }
      try {
        process.kill(-child.pid, signal);
      } catch {
        child.kill(signal);
      }
    }

    const timer = setTimeout(() => {
      timedOut = true;
      killTree('SIGTERM');
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          killTree('SIGKILL');
        }
      }, 5000);
    }, timeoutMs);

    function bufferGuard(stream: 'stdout' | 'stderr', chunk: Buffer): void {
      if (bufferOverflowed) return;
      if (stream === 'stdout') {
        stdoutBytes += chunk.length;
        if (stdoutBytes > MAX_BUFFER_BYTES) {
          bufferOverflowed = true;
          killTree('SIGTERM');
          return;
        }
        stdoutChunks.push(chunk);
      } else {
        stderrBytes += chunk.length;
        if (stderrBytes > MAX_BUFFER_BYTES) {
          bufferOverflowed = true;
          killTree('SIGTERM');
          return;
        }
        stderrChunks.push(chunk);
      }
    }

    if (input.stdin !== undefined && child.stdin !== null) {
      child.stdin.on('error', (error: Error) => {
        // The child exiting before draining stdin (EPIPE) is an expected
        // outcome, not a crash — the exit code carries the verdict.
        // Recorded on stderr for diagnosability.
        bufferGuard('stderr', Buffer.from(`[runCommand stdin error] ${error.message}\n`));
      });
      child.stdin.end(input.stdin);
    }

    // Optional-chained: with a conditional stdin slot TS can no longer
    // prove the stdio tuple pipes stdout/stderr, but both are always
    // 'pipe' above so the streams exist at runtime.
    child.stdout?.on('data', (chunk: Buffer) => {
      bufferGuard('stdout', chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
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
