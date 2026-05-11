import { beforeEach, describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { verify } from '../src/verify.js';
import { runCommand } from '../src/toolchain/run.js';
import { changed, laneRule, patternRule, scope } from './_helpers.js';
import { git, useEphemeralRepo } from './_git-helpers.js';
import type { Constitution, Scope } from '../src/schemas.js';

async function commitBaseline(repo: string): Promise<void> {
  await writeFile(path.join(repo, 'baseline.ts'), 'export const x = 1;\n');
  await git(repo, 'add baseline.ts');
  await git(repo, 'commit -m baseline');
}

async function setupFeatureBranch(repo: string, content = 'export const y = 2;\n'): Promise<void> {
  await git(repo, 'checkout -b feature');
  await writeFile(path.join(repo, 'src.ts'), content);
  await git(repo, 'add src.ts');
  await git(repo, 'commit -m "feature commit"');
}

function toolchainLintConfig(lintCommand: string): Constitution {
  return {
    rules: [
      {
        kind: 'toolchain',
        id: 'toolchain.lint',
        category: 'toolchain',
        defaultSeverity: 'CRITICAL',
        description: 'lint',
        tool: 'lint',
        failOn: 'non-zero-exit',
        prompt: { summary: 'Lint must pass.', guidance: 'Fix lint.' },
      },
    ],
    toolchain: { lint: lintCommand },
  };
}

describe('verify() — git source integration', () => {
  const repoRef = useEphemeralRepo();
  let repo: string;
  beforeEach(async () => {
    repo = repoRef.current;
    await commitBaseline(repo);
  });

  it("passes when the work ref's diff has no rule violations", async () => {
    await git(repo, 'checkout -b feature');
    await writeFile(path.join(repo, 'src.ts'), 'export const y = 2;\n');
    await git(repo, 'add src.ts');
    await git(repo, 'commit -m "clean add"');

    const config: Constitution = { rules: [patternRule('no-todo')] };
    const s: Scope = scope('free-form');
    const result = await verify({
      scope: s,
      config,
      source: { kind: 'git', repo, work: 'feature', baseline: 'main' },
    });
    expect(result.verdict).toBe('pass');
  });

  it('fails on a CRITICAL pattern violation in the diff', async () => {
    await git(repo, 'checkout -b feature');
    await writeFile(path.join(repo, 'src.ts'), '// TODO: implement\nexport const z = 3;\n');
    await git(repo, 'add src.ts');
    await git(repo, 'commit -m "add with todo"');

    const config: Constitution = { rules: [patternRule('no-todo')] };
    const result = await verify({
      scope: scope('free-form'),
      config,
      source: { kind: 'git', repo, work: 'feature', baseline: 'main' },
    });
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.ruleId).toBe('no-todo');
  });

  it('combines lane + pattern rules against the real diff', async () => {
    await git(repo, 'checkout -b feature');
    await runCommand({ command: 'mkdir -p src test', cwd: repo });
    await writeFile(path.join(repo, 'src/handler.ts'), 'export const y = 2;\n');
    await writeFile(path.join(repo, 'test/handler.test.ts'), 'it("x", () => {});\n');
    await git(repo, 'add src/handler.ts test/handler.test.ts');
    await git(repo, 'commit -m "add src and test"');

    const config: Constitution = { rules: [patternRule('no-todo'), laneRule()] };
    const s: Scope = scope('code-writer', { editable: ['src/**'] });
    const result = await verify({
      scope: s,
      config,
      source: { kind: 'git', repo, work: 'feature', baseline: 'main' },
    });
    expect(result.verdict).toBe('fail');
    const ruleIds = new Set(result.findings.map((f) => f.ruleId));
    expect(ruleIds).toContain('lane.editable-respected');
  });

  it('runs a configured toolchain command in an isolated worktree', async () => {
    await setupFeatureBranch(repo);
    // Use a fake "lint" command that always passes so we exercise the
    // worktree creation + command spawn path without needing real tools.
    const result = await verify({
      scope: scope('code-writer'),
      config: toolchainLintConfig(`node -e "process.stdout.write('[]')"`),
      source: { kind: 'git', repo, work: 'feature', baseline: 'main' },
    });
    expect(result.verdict).toBe('pass');
  });

  it('fails verify when a configured toolchain command exits non-zero', async () => {
    await setupFeatureBranch(repo);
    const result = await verify({
      scope: scope('code-writer'),
      config: toolchainLintConfig(`node -e "process.exit(1)"`),
      source: { kind: 'git', repo, work: 'feature', baseline: 'main' },
    });
    expect(result.verdict).toBe('fail');
    expect(result.findings.some((f) => f.ruleId === 'toolchain.lint')).toBe(true);
  });
});

describe('verify() — staged source integration', () => {
  const repoRef = useEphemeralRepo();
  let repo: string;
  beforeEach(async () => {
    repo = repoRef.current;
    await commitBaseline(repo);
  });

  it('runs rules against staged-but-uncommitted changes', async () => {
    await writeFile(path.join(repo, 'staged.ts'), '// TODO: write\nexport const z = 1;\n');
    await git(repo, 'add staged.ts');

    const config: Constitution = { rules: [patternRule('no-todo')] };
    const result = await verify({
      scope: scope('free-form'),
      config,
      source: { kind: 'staged', repo },
    });
    expect(result.verdict).toBe('fail');
    expect(result.findings[0]?.ruleId).toBe('no-todo');
  });
});

describe('verify() — InlineSource passthrough still works', () => {
  it('handles inline sources with top-level customChecks override', async () => {
    const config: Constitution = {
      rules: [
        {
          kind: 'custom',
          id: 'no-default',
          category: 'custom',
          defaultSeverity: 'CRITICAL',
          description: 'no defaults',
          checkRef: 'noDefault',
          prompt: { summary: 's', guidance: 'g' },
        },
      ],
    };
    const result = await verify({
      scope: scope('free-form'),
      config,
      source: { kind: 'inline', changedFiles: [changed('src/x.ts', 'export default {};')] },
      customChecks: {
        noDefault: (rule, ctx) =>
          ctx.changedFiles
            .filter((f) => f.content.includes('export default'))
            .map((f) => ({
              ruleId: rule.id,
              severity: 'CRITICAL' as const,
              category: rule.category,
              location: { file: f.path },
              evidence: 'export default found',
              message: 'no defaults',
              source: { kind: 'rule', ruleId: rule.id } as const,
            })),
      },
    });
    expect(result.verdict).toBe('fail');
  });
});
