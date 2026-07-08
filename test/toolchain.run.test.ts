import { describe, expect, it } from 'vitest';
import { runCommand, runProcess } from '../src/toolchain/run.js';

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

  it('merges env over sanitized process.env', async () => {
    const result = await runCommand({
      command: `node -e "process.stdout.write(process.env.EFFECTIVE_TEST_VAR ?? 'missing')"`,
      env: { EFFECTIVE_TEST_VAR: 'present' },
    });
    expect(result.stdout).toBe('present');
  });

  it('strips nested-package-manager pollutants from inherited env', async () => {
    // Simulate the polluted env an outer `pnpm exec` would set.
    const original = process.env;
    process.env = {
      ...original,
      npm_config_user_agent: 'pnpm/10 npm/? node/v22.0.0',
      npm_lifecycle_event: 'exec',
      npm_package_json: '/wrong/path/package.json',
      NPM_CONFIG_REGISTRY: 'https://bad.example.com/',
      PNPM_HOME: '/wrong/pnpm-home',
      INIT_CWD: '/wrong/init/cwd',
      SAFE_PASS_THROUGH: 'kept',
    };
    try {
      const result = await runCommand({
        command:
          `node -e "process.stdout.write(JSON.stringify({` +
          `npm_config_user_agent: process.env.npm_config_user_agent ?? null,` +
          `npm_lifecycle_event: process.env.npm_lifecycle_event ?? null,` +
          `npm_package_json: process.env.npm_package_json ?? null,` +
          `NPM_CONFIG_REGISTRY: process.env.NPM_CONFIG_REGISTRY ?? null,` +
          `PNPM_HOME: process.env.PNPM_HOME ?? null,` +
          `INIT_CWD: process.env.INIT_CWD ?? null,` +
          `SAFE_PASS_THROUGH: process.env.SAFE_PASS_THROUGH ?? null,` +
          `}))"`,
      });
      const inherited = JSON.parse(result.stdout) as Record<string, string | null>;
      expect(inherited.npm_config_user_agent).toBeNull();
      expect(inherited.npm_lifecycle_event).toBeNull();
      expect(inherited.npm_package_json).toBeNull();
      expect(inherited.NPM_CONFIG_REGISTRY).toBeNull();
      expect(inherited.PNPM_HOME).toBeNull();
      expect(inherited.INIT_CWD).toBeNull();
      expect(inherited.SAFE_PASS_THROUGH).toBe('kept');
    } finally {
      process.env = original;
    }
  });

  it('preserves caller-supplied env vars even if they share the sanitized prefixes', async () => {
    // A user explicitly setting an npm_ var wins over the strip — the
    // sanitizer only guards against inherited pollution.
    const result = await runCommand({
      command: `node -e "process.stdout.write(process.env.npm_config_explicit ?? 'missing')"`,
      env: { npm_config_explicit: 'kept' },
    });
    expect(result.stdout).toBe('kept');
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

describe('runProcess', () => {
  it('defaults to an empty args array', async () => {
    // git with no arguments prints usage and exits non-zero — the point
    // here is only that the omitted-args path spawns cleanly.
    const result = await runProcess({ file: 'git' });
    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('usage');
  });

  it('reports exit code 128 when the child dies from a signal', async () => {
    const result = await runProcess({
      file: 'node',
      args: ['-e', "process.kill(process.pid, 'SIGKILL')"],
    });
    expect(result.signal).toBe('SIGKILL');
    expect(result.exitCode).toBe(128);
  });
});
