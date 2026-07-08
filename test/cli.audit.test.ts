import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runAuditCommand } from '../src/cli/audit.js';
import { parseArgs } from '../src/cli/args.js';

const EFFECTIVE_INDEX = path.resolve('src/index.ts');

async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'effective-audit-cli-'));
  // Minimal valid config that extends recommended and disables toolchain
  // rules so audit doesn't try to run lint/typecheck/test in a temp dir.
  // Imports `effective` via absolute path so the temp config can load
  // without a local `node_modules`.
  await writeFile(
    path.join(dir, 'effective.config.ts'),
    `import { defineConfig } from '${EFFECTIVE_INDEX}';
export default defineConfig({
  extends: ['recommended'],
  disable: {
    'toolchain.lint-clean': 'temp',
    'toolchain.typecheck-clean': 'temp',
    'toolchain.tests-pass': 'temp',
    'toolchain.coverage-meets-threshold': 'temp',
  },
});
`,
  );
  return dir;
}

async function write(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, content);
}

describe('runAuditCommand', () => {
  it('reports a clean repo with the pretty reporter', async () => {
    const dir = await makeRepo();
    try {
      await write(dir, 'src/clean.ts', 'export const x = 1;\n');
      const result = await runAuditCommand(parseArgs(['audit']), dir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Audit complete');
      expect(result.stdout).toContain('0 total');
      expect(result.stdout).toContain('No findings.');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('groups findings by severity in pretty output', async () => {
    const dir = await makeRepo();
    try {
      await write(dir, 'src/legacy.ts', 'console.log("debug me");\n');
      const result = await runAuditCommand(parseArgs(['audit']), dir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('CRITICAL findings');
      expect(result.stdout).toContain('no-stray-debug-output');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('emits JSON when --json is passed', async () => {
    const dir = await makeRepo();
    try {
      await write(dir, 'src/legacy.ts', 'console.log("debug me");\n');
      const result = await runAuditCommand(parseArgs(['audit', '--json']), dir);
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout) as {
        findings: { ruleId: string }[];
        summary: { total: number };
        skipped: { ruleId: string; reason: string }[];
        filesScanned: string[];
      };
      expect(parsed.summary.total).toBeGreaterThanOrEqual(1);
      expect(parsed.findings.some((f) => f.ruleId === 'no-stray-debug-output')).toBe(true);
      expect(parsed.filesScanned).toContain('src/legacy.ts');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('--rule limits to a single rule id', async () => {
    const dir = await makeRepo();
    try {
      const token = 'AKIA' + 'IOSFODNN7EXAMPLE';
      await write(dir, 'src/legacy.ts', `console.log(1);\nconst k = "${token}";\n`);
      const result = await runAuditCommand(
        parseArgs(['audit', '--rule', 'no-hardcoded-secrets', '--json']),
        dir,
      );
      const parsed = JSON.parse(result.stdout) as {
        findings: { ruleId: string }[];
      };
      expect(parsed.findings.every((f) => f.ruleId === 'no-hardcoded-secrets')).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('exits 0 even when findings are present (audit is informational)', async () => {
    const dir = await makeRepo();
    try {
      await write(dir, 'src/legacy.ts', 'console.log(1);\n');
      const result = await runAuditCommand(parseArgs(['audit']), dir);
      expect(result.exitCode).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('mentions skipped diff-only rules in pretty output', async () => {
    const dir = await makeRepo();
    try {
      await write(dir, 'src/x.ts', 'export const x = 1;\n');
      const result = await runAuditCommand(parseArgs(['audit']), dir);
      expect(result.stdout).toContain('Skipped rules');
      expect(result.stdout).toContain('diff-only');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('runAuditCommand — severity rendering and config arms', () => {
  it('renders HIGH, MED, and LOW findings with their own icons and groups', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'effective-audit-cli-'));
    try {
      await writeFile(
        path.join(dir, 'effective.config.ts'),
        `import { defineConfig, rule } from '${EFFECTIVE_INDEX}';
export default defineConfig({
  rules: [
    rule.requirePattern(/Copyright/, { id: 'needs-copyright', in: '**/*.ts' }),
    rule.forbidPattern(/FIXME/, { id: 'no-fixme', defaultSeverity: 'MED', matchInComments: true }),
    rule.forbidPattern(/XXX/, { id: 'no-xxx', defaultSeverity: 'LOW', matchInComments: true }),
  ],
});
`,
      );
      await write(dir, 'src/messy.ts', 'export const x = 1; // FIXME later, XXX\n');
      const result = await runAuditCommand(parseArgs(['audit']), dir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('HIGH findings');
      expect(result.stdout).toContain('⚠️  HIGH  needs-copyright');
      expect(result.stdout).toContain('MED findings');
      expect(result.stdout).toContain('ⓘ  MED  no-fixme');
      expect(result.stdout).toContain('LOW findings');
      expect(result.stdout).toContain('·  LOW  no-xxx');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('loads the constitution from an explicit --config path', async () => {
    const dir = await makeRepo();
    try {
      await write(dir, 'src/clean.ts', 'export const x = 1;\n');
      const result = await runAuditCommand(
        parseArgs(['audit', '--config', 'effective.config.ts']),
        dir,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Audit complete');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
