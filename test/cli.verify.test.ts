import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runVerifyCommand } from '../src/cli/verify.js';
import { parseArgs } from '../src/cli/args.js';
import { git, useEphemeralRepo } from './_git-helpers.js';

async function writeConfig(repo: string, body: string): Promise<void> {
  await writeFile(
    path.join(repo, 'effective.config.ts'),
    `import { defineConfig, rule } from '${path.resolve('src/index.ts')}';\n${body}`,
  );
}

const NO_TODO_CONFIG = `export default defineConfig({ rules: [rule.forbidPattern(/TODO\\b/, { id: 'no-todo', matchInComments: true, matchInStrings: true })] });`;

async function setupConfiguredFeature(
  repo: string,
  config: string,
  featureFile?: { path: string; content: string },
): Promise<void> {
  await writeConfig(repo, config);
  await git(repo, 'add effective.config.ts');
  await git(repo, 'commit -m "config"');
  if (featureFile === undefined) return;
  await git(repo, 'checkout -b feature');
  await writeFile(path.join(repo, featureFile.path), featureFile.content);
  await git(repo, `add ${featureFile.path}`);
  await git(repo, 'commit -m "feature change"');
}

describe('runVerifyCommand', () => {
  const repoRef = useEphemeralRepo();

  it("exits 0 with verdict 'pass' on a clean diff", async () => {
    await setupConfiguredFeature(repoRef.current, NO_TODO_CONFIG, {
      path: 'clean.ts',
      content: 'export const x = 1;\n',
    });
    const result = await runVerifyCommand(
      parseArgs(['verify', '--work', 'feature', '--baseline', 'main']),
      repoRef.current,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
  });

  it('exits 1 on CRITICAL findings and shows them in the pretty report', async () => {
    await setupConfiguredFeature(repoRef.current, NO_TODO_CONFIG, {
      path: 'src.ts',
      content: '// TODO: do it\n',
    });
    const result = await runVerifyCommand(
      parseArgs(['verify', '--work', 'feature', '--baseline', 'main']),
      repoRef.current,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('FAIL');
    expect(result.stdout).toContain('no-todo');
  });

  it('supports --staged source', async () => {
    const repo = repoRef.current;
    await setupConfiguredFeature(repo, NO_TODO_CONFIG);
    await writeFile(path.join(repo, 'staged.ts'), '// TODO\n');
    await git(repo, 'add staged.ts');

    const result = await runVerifyCommand(parseArgs(['verify', '--staged']), repo);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('no-todo');
  });

  it('emits JSON when --reporter=json', async () => {
    await setupConfiguredFeature(repoRef.current, NO_TODO_CONFIG, {
      path: 'src.ts',
      content: '// TODO\n',
    });

    const result = await runVerifyCommand(
      parseArgs(['verify', '--work', 'feature', '--baseline', 'main', '--reporter=json']),
      repoRef.current,
    );
    expect(() => {
      JSON.parse(result.stdout);
    }).not.toThrow();
  });

  it('throws a clear error when no baseline is given and source is not staged', async () => {
    await setupConfiguredFeature(repoRef.current, NO_TODO_CONFIG);
    await expect(runVerifyCommand(parseArgs(['verify']), repoRef.current)).rejects.toThrowError(
      /baseline/,
    );
  });

  it('rejects an unknown --reporter value', async () => {
    await setupConfiguredFeature(repoRef.current, NO_TODO_CONFIG);
    await expect(
      runVerifyCommand(parseArgs(['verify', '--staged', '--reporter', 'xml']), repoRef.current),
    ).rejects.toThrowError(/Unknown --reporter/);
  });
});

describe('runVerifyCommand — worktree and config flags', () => {
  const repoRef = useEphemeralRepo();

  it('accepts --no-keep-worktree', async () => {
    await setupConfiguredFeature(repoRef.current, NO_TODO_CONFIG);
    const result = await runVerifyCommand(
      parseArgs(['verify', '--staged', '--no-keep-worktree']),
      repoRef.current,
    );
    expect(result.exitCode).toBe(0);
  });

  it('accepts an explicit --keep-worktree=never', async () => {
    await setupConfiguredFeature(repoRef.current, NO_TODO_CONFIG);
    const result = await runVerifyCommand(
      parseArgs(['verify', '--staged', '--keep-worktree=never']),
      repoRef.current,
    );
    expect(result.exitCode).toBe(0);
  });

  it('treats a bare --keep-worktree flag as always', async () => {
    await setupConfiguredFeature(repoRef.current, NO_TODO_CONFIG);
    const result = await runVerifyCommand(
      parseArgs(['verify', '--staged', '--keep-worktree']),
      repoRef.current,
    );
    expect(result.exitCode).toBe(0);
  });

  it('rejects an unknown --keep-worktree value', async () => {
    await setupConfiguredFeature(repoRef.current, NO_TODO_CONFIG);
    await expect(
      runVerifyCommand(
        parseArgs(['verify', '--staged', '--keep-worktree=sometimes']),
        repoRef.current,
      ),
    ).rejects.toThrowError(/Unknown --keep-worktree value/);
  });

  it('loads the constitution from an explicit --config path', async () => {
    await setupConfiguredFeature(repoRef.current, NO_TODO_CONFIG);
    const result = await runVerifyCommand(
      parseArgs(['verify', '--staged', '--config', 'effective.config.ts']),
      repoRef.current,
    );
    expect(result.exitCode).toBe(0);
  });
});

describe('runVerifyCommand — --governance-pr elevation', () => {
  const repoRef = useEphemeralRepo();

  const PROTECTED_CONFIG = `export default defineConfig({
  rules: [
    rule.forbidPattern(/TODO\\b/, { id: 'no-todo', matchInComments: true, matchInStrings: true }),
    rule.custom({
      id: 'protected-paths-respected',
      category: 'governance',
      defaultSeverity: 'CRITICAL',
      checkRef: 'protectedPathsRespected',
      prompt: {
        summary: 'Constitutional files are off-limits without elevation.',
        guidance: 'Surface the change via kickBack; a human with elevated scope edits protected files.',
      },
    }),
  ],
  protected: [{ path: 'infra.yml', rationale: 'The deployment gate.' }],
});`;

  it('fails on a protected-path edit without the flag', async () => {
    await setupConfiguredFeature(repoRef.current, PROTECTED_CONFIG, {
      path: 'infra.yml',
      content: 'jobs: {}\n',
    });
    const result = await runVerifyCommand(
      parseArgs(['verify', '--work', 'feature', '--baseline', 'main']),
      repoRef.current,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('protected-paths-respected');
    expect(result.stdout).not.toContain('Governance changes');
  });

  it('elevates the protected-path finding out of the gating set with the flag', async () => {
    await setupConfiguredFeature(repoRef.current, PROTECTED_CONFIG, {
      path: 'infra.yml',
      content: 'jobs: {}\n',
    });
    const result = await runVerifyCommand(
      parseArgs(['verify', '--work', 'feature', '--baseline', 'main', '--governance-pr']),
      repoRef.current,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
    // Elevated, not silenced: the finding is still printed, with its rationale.
    expect(result.stdout).toContain('Governance changes');
    expect(result.stdout).toContain('protected-paths-respected');
    expect(result.stdout).toContain('The deployment gate.');
  });

  it('still fails on non-governance findings in the same diff', async () => {
    const repo = repoRef.current;
    await setupConfiguredFeature(repo, PROTECTED_CONFIG, {
      path: 'infra.yml',
      content: 'jobs: {}\n',
    });
    await writeFile(path.join(repo, 'src.ts'), 'const x = 1; // TODO remove\n');
    await git(repo, 'add src.ts');
    await git(repo, 'commit -m "sneaky change"');
    const result = await runVerifyCommand(
      parseArgs(['verify', '--work', 'feature', '--baseline', 'main', '--governance-pr']),
      repo,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('no-todo');
    expect(result.stdout).toContain('Governance changes');
  });

  it('carries elevated findings under governanceFindings in the JSON reporter', async () => {
    await setupConfiguredFeature(repoRef.current, PROTECTED_CONFIG, {
      path: 'infra.yml',
      content: 'jobs: {}\n',
    });
    const result = await runVerifyCommand(
      parseArgs([
        'verify',
        '--work',
        'feature',
        '--baseline',
        'main',
        '--reporter=json',
        '--governance-pr',
      ]),
      repoRef.current,
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      verdict: string;
      findings: unknown[];
      governanceFindings: { ruleId: string }[];
    };
    expect(parsed.verdict).toBe('pass');
    expect(parsed.findings).toHaveLength(0);
    expect(parsed.governanceFindings).toHaveLength(1);
    expect(parsed.governanceFindings[0]?.ruleId).toBe('protected-paths-respected');
  });

  it('changes nothing when the flag is passed but no protected path was touched', async () => {
    await setupConfiguredFeature(repoRef.current, PROTECTED_CONFIG, {
      path: 'clean.ts',
      content: 'export const x = 1;\n',
    });
    const result = await runVerifyCommand(
      parseArgs(['verify', '--work', 'feature', '--baseline', 'main', '--governance-pr']),
      repoRef.current,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('Governance changes');
  });
});
