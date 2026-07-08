import { describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { audit } from '../src/audit.js';
import { walkSourceFiles } from '../src/walk.js';
import { runAuditEscapesCommand } from '../src/cli/audit-escapes.js';
import { parseArgs } from '../src/cli/args.js';
import { git, useEphemeralRepo } from './_git-helpers.js';
import type { Constitution } from '../src/schemas.js';

async function write(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, content);
}

const BASE_CONFIG: Constitution = {
  extends: ['recommended'],
  disable: {
    'toolchain.lint-clean': 'temp repo — no toolchain',
    'toolchain.typecheck-clean': 'temp repo — no toolchain',
    'toolchain.tests-pass': 'temp repo — no toolchain',
    'toolchain.coverage-meets-threshold': 'temp repo — no toolchain',
  },
};

const WALK_EVERYTHING: Constitution = {
  ...BASE_CONFIG,
  audit: { respectGitignore: false },
};

function debugFindings(findings: readonly { ruleId: string }[]): readonly { ruleId: string }[] {
  return findings.filter((f) => f.ruleId === 'no-stray-debug-output');
}

describe('audit() — respects .gitignore by default', () => {
  const repo = useEphemeralRepo();

  it('does not flag violations in a gitignored directory, and flags them with respectGitignore: false', async () => {
    await write(repo.current, '.gitignore', 'packages/notes/\n');
    await write(repo.current, 'src/clean.ts', 'export const x = 1;\n');
    await write(repo.current, 'packages/notes/tool.ts', 'console.log("local tool");\n');

    const byDefault = await audit({ config: BASE_CONFIG, repo: repo.current });
    expect(debugFindings(byDefault.findings)).toHaveLength(0);
    expect(byDefault.filesScanned).toContain('src/clean.ts');
    expect(byDefault.filesScanned).not.toContain('packages/notes/tool.ts');

    const walkAll = await audit({ config: WALK_EVERYTHING, repo: repo.current });
    expect(debugFindings(walkAll.findings)).toHaveLength(1);
    expect(walkAll.filesScanned).toContain('packages/notes/tool.ts');
  });

  it('always scans a TRACKED file even when a later-added ignore pattern matches it', async () => {
    // Commit the violating file first, then add an ignore rule that
    // matches it — the exact "hide committed code by editing
    // .gitignore" move the invariant exists to block.
    await write(repo.current, 'src/sneaky.ts', 'console.log("hidden?");\n');
    await git(repo.current, 'add src/sneaky.ts');
    await git(repo.current, 'commit -m "add sneaky"');
    await write(repo.current, '.gitignore', 'src/sneaky.ts\n');

    const result = await audit({ config: BASE_CONFIG, repo: repo.current });
    expect(result.filesScanned).toContain('src/sneaky.ts');
    expect(debugFindings(result.findings)).toHaveLength(1);
  });

  it('honors nested .gitignore files and still scans un-ignored siblings', async () => {
    await write(repo.current, 'packages/.gitignore', 'notes/\n');
    await write(repo.current, 'packages/notes/tool.ts', 'console.log("ignored");\n');
    await write(repo.current, 'packages/app/main.ts', 'console.log("sibling");\n');

    const result = await audit({ config: BASE_CONFIG, repo: repo.current });
    expect(result.filesScanned).not.toContain('packages/notes/tool.ts');
    expect(result.filesScanned).toContain('packages/app/main.ts');
    const findings = debugFindings(result.findings);
    expect(findings).toHaveLength(1);
  });

  it('skips .effective/ regardless of gitignore mode (built-in ignored dir)', async () => {
    await write(repo.current, '.effective/work/leftover.ts', 'console.log("engine workspace");\n');
    await write(repo.current, 'src/clean.ts', 'export const x = 1;\n');

    const walkAll = await audit({ config: WALK_EVERYTHING, repo: repo.current });
    expect(walkAll.filesScanned).toEqual(['src/clean.ts']);
    expect(debugFindings(walkAll.findings)).toHaveLength(0);
  });

  it('carves out audit.exclude globs without touching gitignore semantics', async () => {
    await write(repo.current, 'vendor/generated.ts', 'console.log("generated");\n');
    await write(repo.current, 'src/app.ts', 'console.log("real");\n');

    const config: Constitution = { ...BASE_CONFIG, audit: { exclude: ['vendor/**'] } };
    const result = await audit({ config, repo: repo.current });
    expect(result.filesScanned).toContain('src/app.ts');
    expect(result.filesScanned).not.toContain('vendor/generated.ts');
    expect(debugFindings(result.findings)).toHaveLength(1);
  });

  it('counts escape hatches over the same gitignore-filtered file set', async () => {
    await write(repo.current, '.gitignore', 'local/\n');
    await write(repo.current, 'local/hack.ts', '// eslint-disable-next-line foo\nconst x = 1;\n');
    await write(repo.current, 'src/clean.ts', 'export const x = 1;\n');

    const result = await audit({ config: BASE_CONFIG, repo: repo.current });
    expect(result.escapeHatchCount).toBe(0);

    const walkAll = await audit({ config: WALK_EVERYTHING, repo: repo.current });
    expect(walkAll.escapeHatchCount).toBe(1);
  });
});

describe('walkSourceFiles() — gitignore handling', () => {
  const repo = useEphemeralRepo();

  it('drops untracked-and-ignored files by default and keeps them with respectGitignore: false', async () => {
    await write(repo.current, '.gitignore', 'scratch/\n');
    await write(repo.current, 'scratch/tmp.ts', 'export {};\n');
    await write(repo.current, 'src/kept.ts', 'export {};\n');

    const filtered = await walkSourceFiles(repo.current);
    const rels = filtered.map((p) => path.relative(repo.current, p));
    expect(rels).toContain(path.join('src', 'kept.ts'));
    expect(rels).not.toContain(path.join('scratch', 'tmp.ts'));

    const unfiltered = await walkSourceFiles(repo.current, { respectGitignore: false });
    expect(unfiltered.map((p) => path.relative(repo.current, p))).toContain(
      path.join('scratch', 'tmp.ts'),
    );
  });

  it('never drops a tracked file, even when an ignore pattern matches it', async () => {
    await write(repo.current, 'src/tracked.ts', 'export {};\n');
    await git(repo.current, 'add src/tracked.ts');
    await git(repo.current, 'commit -m "track"');
    await write(repo.current, '.gitignore', 'src/tracked.ts\n');

    const files = await walkSourceFiles(repo.current);
    expect(files.map((p) => path.relative(repo.current, p))).toContain(
      path.join('src', 'tracked.ts'),
    );
  });
});

describe('audit-escapes CLI — shares the audit file set', () => {
  const repo = useEphemeralRepo();

  it('skips gitignored files by default and includes them when the config opts out', async () => {
    await write(repo.current, '.gitignore', 'local/\n');
    await write(repo.current, 'local/hack.ts', '// eslint-disable-next-line foo\nconst x = 1;\n');
    await write(repo.current, 'src/app.ts', '// eslint-disable-next-line bar\nconst y = 2;\n');

    const byDefault = await runAuditEscapesCommand(parseArgs(['audit-escapes']), repo.current);
    expect(byDefault.hatches).toHaveLength(1);
    expect(byDefault.hatches[0]?.location.file).toBe('src/app.ts');

    await write(
      repo.current,
      'effective.config.ts',
      `export default { extends: ['recommended'], audit: { respectGitignore: false } };\n`,
    );
    const walkAll = await runAuditEscapesCommand(parseArgs(['audit-escapes']), repo.current);
    expect(walkAll.hatches).toHaveLength(2);
  });
});
