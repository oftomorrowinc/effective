import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { audit } from '../src/audit.js';
import type { Constitution } from '../src/schemas.js';

async function makeRepo(): Promise<string> {
  return await mkdtemp(path.join(tmpdir(), 'effective-audit-'));
}

async function write(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, content);
}

// Disable toolchain rules: the temp repos have no scripts configured.
// (Audit skips toolchain rules by default anyway, but disabling keeps
// `result.skipped` reasons clean for tests asserting on it.)
const BASE_CONFIG: Constitution = {
  extends: ['recommended'],
  disable: {
    'toolchain.lint-clean': 'temp repo — no toolchain',
    'toolchain.typecheck-clean': 'temp repo — no toolchain',
    'toolchain.tests-pass': 'temp repo — no toolchain',
    'toolchain.coverage-meets-threshold': 'temp repo — no toolchain',
  },
};

describe('audit() — clean repo', () => {
  it('reports zero findings when the source is rule-compliant', async () => {
    const repo = await makeRepo();
    try {
      await write(repo, 'src/clean.ts', 'export const x = 1;\n');
      const result = await audit({ config: BASE_CONFIG, repo });
      expect(result.summary.total).toBe(0);
      expect(result.filesScanned).toContain('src/clean.ts');
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});

describe('audit() — surfaces existing violations', () => {
  it('flags console.log in source via no-stray-debug-output', async () => {
    const repo = await makeRepo();
    try {
      await write(repo, 'src/legacy.ts', 'console.log("debug me");\n');
      const result = await audit({ config: BASE_CONFIG, repo });
      const matches = result.findings.filter((f) => f.ruleId === 'no-stray-debug-output');
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches[0]?.severity).toBe('CRITICAL');
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('flags a real-shaped AWS key via no-hardcoded-secrets', async () => {
    const repo = await makeRepo();
    try {
      const token = 'AKIA' + 'IOSFODNN7EXAMPLE';
      await write(repo, 'src/config.ts', `const k = "${token}";\n`);
      const result = await audit({ config: BASE_CONFIG, repo });
      expect(result.findings.some((f) => f.ruleId === 'no-hardcoded-secrets')).toBe(true);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('flags `it.skip` without an exception-id via no-disabled-tests-without-exception', async () => {
    const repo = await makeRepo();
    try {
      await write(repo, 'test/legacy.test.ts', "it.skip('flaky', () => {});\n");
      const result = await audit({ config: BASE_CONFIG, repo });
      const matches = result.findings.filter(
        (f) => f.ruleId === 'no-disabled-tests-without-exception',
      );
      expect(matches.length).toBe(1);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('flags an unjustified eslint-disable via exceptions.must-cite-justification', async () => {
    const repo = await makeRepo();
    try {
      await write(
        repo,
        'src/legacy.ts',
        '// eslint-disable-next-line no-explicit-any\nconst x: any = 1;\n',
      );
      const result = await audit({ config: BASE_CONFIG, repo });
      expect(result.findings.some((f) => f.ruleId === 'exceptions.must-cite-justification')).toBe(
        true,
      );
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('aggregates findings across many files', async () => {
    const repo = await makeRepo();
    try {
      for (let i = 0; i < 5; i += 1) {
        await write(repo, `src/f${String(i)}.ts`, 'console.log(1);\n');
      }
      const result = await audit({ config: BASE_CONFIG, repo });
      const debugFindings = result.findings.filter((f) => f.ruleId === 'no-stray-debug-output');
      expect(debugFindings.length).toBe(5);
      expect(result.summary.critical).toBe(5);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});

describe('audit() — skipped-rule reporting', () => {
  it('reports diff-only rules as skipped', async () => {
    const repo = await makeRepo();
    try {
      await write(repo, 'src/x.ts', 'export const x = 1;\n');
      const result = await audit({ config: BASE_CONFIG, repo });
      const diffOnly = result.skipped.filter((s) => s.reason === 'diff-only');
      const ids = diffOnly.map((s) => s.ruleId);
      expect(ids).toContain('migration-has-exercising-test');
      expect(ids).toContain('new-exports-have-non-test-callers');
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('reports lane rules as skipped (no scope to check against)', async () => {
    const repo = await makeRepo();
    try {
      await write(repo, 'src/x.ts', 'export const x = 1;\n');
      const result = await audit({ config: BASE_CONFIG, repo });
      const laneSkips = result.skipped.filter((s) => s.reason === 'lane-no-scope');
      expect(laneSkips.length).toBeGreaterThanOrEqual(1);
      expect(laneSkips.some((s) => s.ruleId === 'lane.editable-respected')).toBe(true);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('reports meta rules as skipped (no agent report)', async () => {
    const repo = await makeRepo();
    try {
      await write(repo, 'src/x.ts', 'export const x = 1;\n');
      const result = await audit({ config: BASE_CONFIG, repo });
      const metaSkips = result.skipped.filter((s) => s.reason === 'meta-no-report');
      expect(metaSkips.length).toBeGreaterThanOrEqual(1);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('reports toolchain rules as skipped by default', async () => {
    const repo = await makeRepo();
    try {
      // Don't disable toolchain rules in the config so the skip-by-default path fires
      const config: Constitution = { extends: ['recommended'] };
      await write(repo, 'src/x.ts', 'export const x = 1;\n');
      const result = await audit({ config, repo });
      const toolSkips = result.skipped.filter((s) => s.reason === 'toolchain-not-included');
      expect(toolSkips.length).toBeGreaterThanOrEqual(4);
      const ids = toolSkips.map((s) => s.ruleId);
      expect(ids).toContain('toolchain.lint-clean');
      expect(ids).toContain('toolchain.typecheck-clean');
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('includes toolchain rules when includeToolchain=true', async () => {
    const repo = await makeRepo();
    try {
      // Even with includeToolchain, no toolchain commands configured → no
      // findings, but the rules are NOT in the skipped list either.
      const config: Constitution = {
        extends: ['recommended'],
        toolchain: {
          // empty — no commands actually configured
        },
      };
      await write(repo, 'src/x.ts', 'export const x = 1;\n');
      const result = await audit({ config, repo, includeToolchain: true });
      const toolSkips = result.skipped.filter((s) => s.reason === 'toolchain-not-included');
      expect(toolSkips.length).toBe(0);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});

describe('audit() — filtering', () => {
  it('runs only the named rule when onlyRuleId is set', async () => {
    const repo = await makeRepo();
    try {
      // Two distinct violations: console.log AND a hardcoded secret
      const token = 'AKIA' + 'IOSFODNN7EXAMPLE';
      await write(repo, 'src/a.ts', `console.log("x");\nconst k = "${token}";\n`);
      const result = await audit({
        config: BASE_CONFIG,
        repo,
        onlyRuleId: 'no-hardcoded-secrets',
      });
      // Should only see secrets findings, not debug-output
      expect(result.findings.every((f) => f.ruleId === 'no-hardcoded-secrets')).toBe(true);
      expect(result.findings.length).toBeGreaterThanOrEqual(1);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});

describe('audit() — directory exclusions', () => {
  it('skips node_modules, dist, .effective', async () => {
    const repo = await makeRepo();
    try {
      await write(repo, 'src/clean.ts', 'export const x = 1;\n');
      await write(repo, 'node_modules/pkg/index.ts', 'console.log("never scanned");\n');
      await write(repo, 'dist/bundle.ts', 'console.log("also never");\n');
      await write(repo, '.effective/work/file.ts', 'console.log("nor this");\n');
      const result = await audit({ config: BASE_CONFIG, repo });
      // The console.log in source files inside excluded dirs should NOT
      // appear; only files under src/ are scanned.
      expect(result.filesScanned).toContain('src/clean.ts');
      expect(result.filesScanned.every((p) => !p.startsWith('node_modules/'))).toBe(true);
      expect(result.filesScanned.every((p) => !p.startsWith('dist/'))).toBe(true);
      expect(result.filesScanned.every((p) => !p.startsWith('.effective/'))).toBe(true);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});

describe('audit() — exception registry', () => {
  it('uses config.exceptions when no exceptions option passed', async () => {
    const repo = await makeRepo();
    try {
      const config: Constitution = {
        extends: ['recommended'],
        exceptions: {
          'our-legacy-tag': {
            id: 'our-legacy-tag',
            category: 'external-library-drift-defense',
            mechanism: 'eslint-disable',
            context: 'legacy SDK quirk',
            retirementCondition: 'when sdk@3 ships',
            addedDate: '2026-05-12',
            status: 'active',
          },
        },
        disable: BASE_CONFIG.disable,
      };
      await write(
        repo,
        'src/legacy.ts',
        '// eslint-disable-next-line no-explicit-any -- exception-id: our-legacy-tag\nconst x: any = 1;\n',
      );
      const result = await audit({ config, repo });
      // The exception is registered, so must-cite-justification does NOT fire
      expect(result.findings.some((f) => f.ruleId === 'exceptions.must-cite-justification')).toBe(
        false,
      );
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});

describe('audit() — severity overrides reach escape-hatch findings (known-bug regression)', () => {
  it('reports an uncited escape hatch at the overridden severity under the recommended preset', async () => {
    const repo = await makeRepo();
    try {
      await write(repo, 'src/legacy.ts', '// @ts-expect-error\nexport const x = 1;\n');
      const result = await audit({
        config: {
          ...BASE_CONFIG,
          override: {
            'exceptions.must-cite-justification': {
              severity: 'LOW',
              rationale: 'phased adoption of the exception registry',
            },
          },
        },
        repo,
      });
      const finding = result.findings.find(
        (f) => f.ruleId === 'exceptions.must-cite-justification',
      );
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('LOW');
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});
