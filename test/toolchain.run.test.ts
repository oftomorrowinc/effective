import { describe, expect, it } from 'vitest';
import { runCommand } from '../src/toolchain/run.js';

describe('runCommand', () => {
  it('returns exit code 0 and captured stdout for a successful command', async () => {
    const result = await runCommand({ command: `node -e "console.log('hello')"` });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello');
    expect(result.stderr).toBe('');
    expect(result.timedOut).toBe(false);
  });

  it('captures stderr and a non-zero exit code on failure', async () => {
    const result = await runCommand({
      command: `node -e "console.error('boom'); process.exit(3)"`,
    });
    expect(result.exitCode).toBe(3);
    expect(result.stderr.trim()).toBe('boom');
  });

  it('respects the working directory', async () => {
    const result = await runCommand({
      command: `node -e "process.stdout.write(process.cwd())"`,
      cwd: '/tmp',
    });
    expect(result.stdout).toMatch(/tmp/);
    expect(result.cwd).toBe('/tmp');
  });

  it('merges env over process.env', async () => {
    const result = await runCommand({
      command: `node -e "process.stdout.write(process.env.EFFECTIVE_TEST_VAR ?? 'missing')"`,
      env: { EFFECTIVE_TEST_VAR: 'present' },
    });
    expect(result.stdout).toBe('present');
  });

  it('times out long-running commands and marks timedOut=true', async () => {
    const result = await runCommand({
      command: `node -e "setTimeout(() => {}, 30000)"`,
      timeoutMs: 200,
    });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  }, 15_000);

  it('reports nonzero exit when the spawned program is missing', async () => {
    const result = await runCommand({
      command: `node -e "process.exit(127)"`,
    });
    expect(result.exitCode).toBe(127);
  });

  it('records duration in milliseconds', async () => {
    const result = await runCommand({ command: `node -e "0"` });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.durationMs).toBeLessThan(60_000);
  });
});
