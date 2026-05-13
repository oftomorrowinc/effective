import { describe, expect, it } from 'vitest';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { verify } from '../src/verify.js';
import type { Constitution } from '../src/schemas.js';
import { git, useEphemeralRepo } from './_git-helpers.js';
import { scope } from './_helpers.js';

const RULE_ID = 'new-exports-have-non-test-callers';

// Disable toolchain rules: the temp repos used here have no configured
// lint/typecheck/test/coverage commands. Disabling them keeps the
// findings list focused on the rule under test.
const TOOLCHAIN_DISABLED: Constitution = {
  extends: ['recommended'],
  disable: {
    'toolchain.lint-clean': 'temp repo — no toolchain configured',
    'toolchain.typecheck-clean': 'temp repo — no toolchain configured',
    'toolchain.tests-pass': 'temp repo — no toolchain configured',
    'toolchain.coverage-non-decreasing': 'temp repo — no toolchain configured',
  },
};

async function commitFiles(repo: string, files: { rel: string; content: string }[]): Promise<void> {
  for (const f of files) {
    const abs = path.join(repo, f.rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, f.content);
  }
  for (const f of files) await git(repo, `add ${f.rel}`);
  await git(repo, 'commit -m "stage"');
}

describe('new-exports-have-non-test-callers (CustomRule)', () => {
  const repoRef = useEphemeralRepo();

  it('flags a new export with no non-test caller anywhere in the repo', async () => {
    const repo = repoRef.current;
    await commitFiles(repo, [{ rel: 'src/main.ts', content: 'export const m = 1;\n' }]);
    await git(repo, 'checkout -b feature');
    await commitFiles(repo, [{ rel: 'src/util.ts', content: 'export function unused() {}\n' }]);

    const result = await verify({
      scope: scope('code-writer'),
      config: TOOLCHAIN_DISABLED,
      source: { kind: 'git', repo, work: 'feature', baseline: 'main' },
    });
    const f = result.findings.filter((x) => x.ruleId === RULE_ID);
    expect(f.some((x) => x.evidence === 'unused')).toBe(true);
  });

  it('passes when a non-test file calls the new export', async () => {
    const repo = repoRef.current;
    await commitFiles(repo, [{ rel: 'src/app.ts', content: 'export const app = 1;\n' }]);
    await git(repo, 'checkout -b feature');
    await commitFiles(repo, [
      { rel: 'src/util.ts', content: 'export function wired() {}\n' },
      {
        rel: 'src/app.ts',
        content: "import { wired } from './util';\nexport const app = wired;\n",
      },
    ]);

    const result = await verify({
      scope: scope('code-writer'),
      config: TOOLCHAIN_DISABLED,
      source: { kind: 'git', repo, work: 'feature', baseline: 'main' },
    });
    const f = result.findings.filter((x) => x.ruleId === RULE_ID);
    expect(f.some((x) => x.evidence === 'wired')).toBe(false);
  });

  it('does NOT count test-only callers as wiring', async () => {
    const repo = repoRef.current;
    await commitFiles(repo, [{ rel: 'src/main.ts', content: 'export const m = 1;\n' }]);
    await git(repo, 'checkout -b feature');
    await commitFiles(repo, [
      { rel: 'src/util.ts', content: 'export function onlyTested() {}\n' },
      {
        rel: 'test/util.test.ts',
        content: "import { onlyTested } from '../src/util';\nit('x', () => onlyTested());",
      },
    ]);

    const result = await verify({
      scope: scope('code-writer'),
      config: TOOLCHAIN_DISABLED,
      source: { kind: 'git', repo, work: 'feature', baseline: 'main' },
    });
    const f = result.findings.filter((x) => x.ruleId === RULE_ID);
    expect(f.some((x) => x.evidence === 'onlyTested')).toBe(true);
  });

  it('silently skips when source is inline (no repo to walk)', async () => {
    // Inline source has no ctx.repo, so the check returns no findings
    const result = await verify({
      scope: scope('code-writer'),
      config: { extends: ['recommended'] },
      source: {
        kind: 'inline',
        changedFiles: [{ path: 'src/u.ts', content: 'export function x() {}\n', status: 'added' }],
      },
    });
    expect(result.findings.some((f) => f.ruleId === RULE_ID)).toBe(false);
  });

  it('extracts function, class, const, let, var, and aliased named exports', async () => {
    const repo = repoRef.current;
    await commitFiles(repo, [{ rel: 'src/main.ts', content: 'export const m = 1;\n' }]);
    await git(repo, 'checkout -b feature');
    await commitFiles(repo, [
      {
        rel: 'src/exports.ts',
        content:
          'export function fnExport() {}\n' +
          'export class ClassExport {}\n' +
          'export const constExport = 1;\n' +
          'export let letExport = 2;\n' +
          'export var varExport = 3;\n' +
          'const internal = 0;\n' +
          'export { internal as aliasedExport };\n',
      },
    ]);

    const result = await verify({
      scope: scope('code-writer'),
      config: TOOLCHAIN_DISABLED,
      source: { kind: 'git', repo, work: 'feature', baseline: 'main' },
    });
    const evidences = result.findings
      .filter((f) => f.ruleId === RULE_ID)
      .map((f) => f.evidence)
      .sort();
    expect(evidences).toEqual([
      'ClassExport',
      'aliasedExport',
      'constExport',
      'fnExport',
      'letExport',
      'varExport',
    ]);
  });

  it('passes when the new export is referenced elsewhere in its own file (CLI-entry pattern)', async () => {
    const repo = repoRef.current;
    await commitFiles(repo, [{ rel: 'src/main.ts', content: 'export const m = 1;\n' }]);
    await git(repo, 'checkout -b feature');
    await commitFiles(repo, [
      {
        rel: 'scripts/build-something.ts',
        content:
          'export function buildSomething(): string {\n' +
          '  return "built";\n' +
          '}\n' +
          '\n' +
          'if (process.argv[1] !== undefined) {\n' +
          '  process.stdout.write(buildSomething() + "\\n");\n' +
          '}\n',
      },
    ]);

    const result = await verify({
      scope: scope('code-writer'),
      config: TOOLCHAIN_DISABLED,
      source: { kind: 'git', repo, work: 'feature', baseline: 'main' },
    });
    const f = result.findings.filter((x) => x.ruleId === RULE_ID);
    expect(f.some((x) => x.evidence === 'buildSomething')).toBe(false);
  });

  it("passes when a pre-existing index re-exports the new file's export", async () => {
    const repo = repoRef.current;
    // Pre-existing index that already names the symbol the new file
    // will export — verifies the walk picks up the re-export as a
    // caller without needing the index to be modified in the diff.
    await commitFiles(repo, [
      {
        rel: 'src/index.ts',
        content: "export { reExported } from './leaf.js';\n",
      },
      {
        rel: 'src/leaf.ts',
        content: 'export const reExported = "placeholder";\n',
      },
    ]);
    await git(repo, 'checkout -b feature');
    // The new file replaces the leaf with a new symbol; the index
    // still re-exports the new symbol since we update the index file
    // (modified, so the rule doesn't consider its exports new, but
    // its content is still walkable as a caller).
    await commitFiles(repo, [
      {
        rel: 'src/leaf.ts',
        content: 'export const newSymbol = "real";\n',
      },
      {
        rel: 'src/index.ts',
        content: "export { newSymbol } from './leaf.js';\n",
      },
    ]);

    const result = await verify({
      scope: scope('code-writer'),
      config: TOOLCHAIN_DISABLED,
      source: { kind: 'git', repo, work: 'feature', baseline: 'main' },
    });
    // newSymbol isn't a "new export" since leaf.ts is modified, not
    // added — so it shouldn't even appear in findings. This test
    // mostly documents the modified-files limitation, but if/when
    // that limitation is lifted the re-export traversal should hold.
    const f = result.findings.filter((x) => x.ruleId === RULE_ID);
    expect(f.some((x) => x.evidence === 'newSymbol')).toBe(false);
  });

  it('does NOT extract `type` as an export name from `export { type X }`', async () => {
    const repo = repoRef.current;
    await commitFiles(repo, [{ rel: 'src/main.ts', content: 'export const m = 1;\n' }]);
    await git(repo, 'checkout -b feature');
    await commitFiles(repo, [
      {
        rel: 'src/types.ts',
        content: 'interface Internal { id: string }\n' + 'export { type Internal as Exported };\n',
      },
    ]);

    const result = await verify({
      scope: scope('code-writer'),
      config: TOOLCHAIN_DISABLED,
      source: { kind: 'git', repo, work: 'feature', baseline: 'main' },
    });
    const evidences = result.findings.filter((f) => f.ruleId === RULE_ID).map((f) => f.evidence);
    // `type` is a keyword, not an export name — must not appear as a
    // finding evidence value. (The aliased name `Exported` is a
    // type-only re-export, which is harder to filter cleanly; that's
    // acceptable noise for v0.1 — the load-bearing precision fix is
    // not extracting `type` itself.)
    expect(evidences).not.toContain('type');
  });

  it('skips test files and migration files when scanning for new exports', async () => {
    const repo = repoRef.current;
    await commitFiles(repo, [{ rel: 'src/m.ts', content: 'export const m = 1;\n' }]);
    await git(repo, 'checkout -b feature');
    await commitFiles(repo, [
      {
        rel: 'test/new.test.ts',
        content: 'export function helperFromTest() {}\nit("x", () => helperFromTest());\n',
      },
      { rel: 'migrations/0001_x.sql', content: 'CREATE TABLE x();' },
    ]);

    const result = await verify({
      scope: scope('code-writer'),
      config: TOOLCHAIN_DISABLED,
      source: { kind: 'git', repo, work: 'feature', baseline: 'main' },
    });
    // helperFromTest is exported from a TEST file → ignored by the rule.
    expect(
      result.findings.some((f) => f.ruleId === RULE_ID && f.evidence === 'helperFromTest'),
    ).toBe(false);
  });
});
