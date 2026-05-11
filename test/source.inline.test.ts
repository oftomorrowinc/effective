import { describe, expect, it } from 'vitest';
import { loadInlineSource } from '../src/source/inline.js';
import type { ResolvedScope } from '../src/resolve.js';

const scope: ResolvedScope = {
  goal: 'g',
  editable: ['src/**'],
  role: 'code-writer',
  expectations: {},
};

describe('loadInlineSource', () => {
  it('compiles scope.editable into the matcher', () => {
    const ctx = loadInlineSource({ kind: 'inline', changedFiles: [] }, scope);
    expect(ctx.editableMatcher('src/a.ts')).toBe(true);
    expect(ctx.editableMatcher('test/a.test.ts')).toBe(false);
  });

  it('defaults missing maps to empty objects', () => {
    const ctx = loadInlineSource({ kind: 'inline', changedFiles: [] }, scope);
    expect(ctx.artifacts).toEqual({});
    expect(ctx.toolchainResults).toEqual({});
    expect(ctx.customChecks).toEqual({});
    expect(ctx.exceptionRegistry).toEqual({});
  });

  it('passes through changed files, artifacts, toolchain results', () => {
    const ctx = loadInlineSource(
      {
        kind: 'inline',
        changedFiles: [{ path: 'src/a.ts', content: 'x', status: 'added' }],
        artifacts: { 'spec.md': 'hello' },
        toolchainResults: {
          lint: { tool: 'lint', exitCode: 0, stdout: '', stderr: '' },
        },
      },
      scope,
    );
    expect(ctx.changedFiles.length).toBe(1);
    expect(ctx.artifacts['spec.md']).toBe('hello');
    expect(ctx.toolchainResults.lint?.exitCode).toBe(0);
  });
});
