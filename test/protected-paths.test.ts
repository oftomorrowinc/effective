import { describe, expect, it } from 'vitest';
import { verify } from '../src/verify.js';
import type { Constitution } from '../src/schemas.js';
import type { InlineSource } from '../src/source/inline.js';
import { changed, scope } from './_helpers.js';

const RULE_ID = 'protected-paths-respected';

const BASE_CONFIG: Omit<Constitution, 'protected'> = {
  extends: ['recommended'],
  disable: {
    'toolchain.lint-clean': 'no toolchain in inline tests',
    'toolchain.typecheck-clean': 'no toolchain in inline tests',
    'toolchain.tests-pass': 'no toolchain in inline tests',
    'toolchain.coverage-non-decreasing': 'no toolchain in inline tests',
  },
};

function withProtected(...entries: { path: string; rationale: string }[]): Constitution {
  return { ...BASE_CONFIG, protected: entries };
}

function diff(
  ...files: { path: string; status?: 'added' | 'modified' | 'deleted' }[]
): InlineSource {
  return {
    kind: 'inline',
    changedFiles: files.map((f) => changed(f.path, '', f.status ?? 'modified')),
  };
}

describe('protected-paths-respected', () => {
  it('flags a file matching a protected glob with CRITICAL', async () => {
    const result = await verify({
      scope: scope('code-writer'),
      config: withProtected({
        path: 'effective.config.ts',
        rationale: 'The constitution itself.',
      }),
      source: diff({ path: 'effective.config.ts' }),
    });
    const finding = result.findings.find((f) => f.ruleId === RULE_ID);
    expect(finding?.severity).toBe('CRITICAL');
    expect(finding?.message).toContain('The constitution itself.');
  });

  it('does not flag files outside the protected list', async () => {
    const result = await verify({
      scope: scope('code-writer'),
      config: withProtected({
        path: 'effective.config.ts',
        rationale: 'The constitution itself.',
      }),
      source: diff({ path: 'src/feature.ts' }),
    });
    expect(result.findings.some((f) => f.ruleId === RULE_ID)).toBe(false);
  });

  it('matches glob patterns (eslint.config.*, tsconfig*.json)', async () => {
    const result = await verify({
      scope: scope('code-writer'),
      config: withProtected(
        { path: 'eslint.config.*', rationale: 'ESLint config governs lint behavior.' },
        { path: 'tsconfig*.json', rationale: 'TypeScript config governs typecheck.' },
      ),
      source: diff(
        { path: 'eslint.config.js' },
        { path: 'tsconfig.build.json' },
        { path: 'src/x.ts' },
      ),
    });
    const findings = result.findings.filter((f) => f.ruleId === RULE_ID);
    expect(findings.length).toBe(2);
    expect(findings.map((f) => f.location?.file).sort()).toEqual([
      'eslint.config.js',
      'tsconfig.build.json',
    ]);
  });

  it('matches directory globs (.github/workflows/**)', async () => {
    const result = await verify({
      scope: scope('code-writer'),
      config: withProtected({
        path: '.github/workflows/**',
        rationale: 'CI workflows are the deployment gate.',
      }),
      source: diff({ path: '.github/workflows/ci.yml' }),
    });
    expect(result.findings.some((f) => f.ruleId === RULE_ID)).toBe(true);
  });

  it('cites only the FIRST matched rationale when multiple protected entries match', async () => {
    const result = await verify({
      scope: scope('code-writer'),
      config: withProtected(
        { path: 'package.json', rationale: 'First-listed rationale.' },
        { path: '**/package.json', rationale: 'Second matcher would also fire.' },
      ),
      source: diff({ path: 'package.json' }),
    });
    const findings = result.findings.filter((f) => f.ruleId === RULE_ID);
    expect(findings.length).toBe(1);
    expect(findings[0]?.message).toContain('First-listed rationale.');
  });

  it('fails the verdict', async () => {
    const result = await verify({
      scope: scope('code-writer'),
      config: withProtected({
        path: 'effective.config.ts',
        rationale: 'The constitution.',
      }),
      source: diff({ path: 'effective.config.ts' }),
    });
    expect(result.verdict).toBe('fail');
  });

  it('also flags protected files that are deleted', async () => {
    const result = await verify({
      scope: scope('code-writer'),
      config: withProtected({
        path: 'effective.config.ts',
        rationale: 'The constitution.',
      }),
      source: diff({ path: 'effective.config.ts', status: 'deleted' }),
    });
    expect(result.findings.some((f) => f.ruleId === RULE_ID)).toBe(true);
  });

  it('produces no findings when no protected paths are declared', async () => {
    const result = await verify({
      scope: scope('code-writer'),
      config: BASE_CONFIG,
      source: diff({ path: 'effective.config.ts' }),
    });
    expect(result.findings.some((f) => f.ruleId === RULE_ID)).toBe(false);
  });

  it('is marked diffOnly: audit skips it', async () => {
    // Smoke-check via the resolved-constitution shape rather than running
    // audit (which needs a repo).
    const { resolveConstitution } = await import('../src/resolve.js');
    const { presets } = await import('../src/presets/index.js');
    const resolved = resolveConstitution(
      { extends: ['recommended'] },
      { presetRegistry: { recommended: presets.recommended } },
    );
    const rule = resolved.rules.get(RULE_ID);
    expect(rule?.diffOnly).toBe(true);
  });

  it('protected paths from presets merge with project-level additions', async () => {
    const config: Constitution = {
      rules: [{ ...BASE_CONFIG } as never], // we don't actually need a rule; just to satisfy refine
      ...BASE_CONFIG,
      protected: [{ path: 'effective.config.ts', rationale: 'The constitution.' }],
    };
    // resolveConstitution merges; verify that the project-level entries
    // are present in the resolved list.
    const { resolveConstitution } = await import('../src/resolve.js');
    const { presets } = await import('../src/presets/index.js');
    const resolved = resolveConstitution(config, {
      presetRegistry: { recommended: presets.recommended },
    });
    const paths = resolved.protectedPaths.map((p) => p.path);
    expect(paths).toContain('effective.config.ts');
  });
});
