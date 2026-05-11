import type { RunResult } from '../src/toolchain/run.js';

/**
 * Builder for fake RunResult objects used by parser-fixture tests. Default
 * is a clean, zero-exit run; spread `over` to inject stdout/stderr/exit
 * for the case under test.
 */
export function runResult(over: Partial<RunResult> = {}): RunResult {
  return {
    command: 'cmd',
    cwd: '.',
    exitCode: 0,
    signal: null,
    stdout: '',
    stderr: '',
    timedOut: false,
    durationMs: 1,
    ...over,
  };
}
