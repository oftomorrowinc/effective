import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runRulesCommand } from '../src/cli/rules.js';
import { parseArgs } from '../src/cli/args.js';

async function makeDir(): Promise<string> {
  return await mkdtemp(path.join(tmpdir(), 'effective-rules-'));
}

async function writeConfig(dir: string, body: string): Promise<void> {
  await writeFile(
    path.join(dir, 'effective.config.ts'),
    `import { defineConfig, rule } from '${path.resolve('src/index.ts')}';\n${body}`,
  );
}

describe('runRulesCommand', () => {
  it('lists every resolved rule by id with severity and category', async () => {
    const dir = await makeDir();
    try {
      await writeConfig(
        dir,
        `export default defineConfig({
  rules: [
    rule.forbidPattern(/TODO/, { id: 'no-todo' }),
    rule.lane(),
  ],
});`,
      );
      const result = await runRulesCommand(parseArgs(['rules']), dir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('2 rule(s) active');
      expect(result.stdout).toContain('no-todo');
      expect(result.stdout).toContain('lane.editable-respected');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('shows rule detail when --search is provided', async () => {
    const dir = await makeDir();
    try {
      await writeConfig(
        dir,
        `export default defineConfig({
  rules: [rule.forbidPattern(/TODO/, { id: 'no-todo' })],
});`,
      );
      const result = await runRulesCommand(parseArgs(['rules', '--search', 'no-todo']), dir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('no-todo  [pattern]');
      expect(result.stdout).toContain('PROMPT SUMMARY');
      expect(result.stdout).toContain('PROMPT GUIDANCE');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('exits non-zero with a stderr message when search misses', async () => {
    const dir = await makeDir();
    try {
      await writeConfig(
        dir,
        `export default defineConfig({ rules: [rule.forbidPattern(/TODO/, { id: 'no-todo' })] });`,
      );
      const result = await runRulesCommand(parseArgs(['rules', '--search', 'nope']), dir);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('No rule with id "nope"');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('accepts the rule id as a positional argument too', async () => {
    const dir = await makeDir();
    try {
      await writeConfig(
        dir,
        `export default defineConfig({ rules: [rule.forbidPattern(/TODO/, { id: 'no-todo' })] });`,
      );
      const result = await runRulesCommand(parseArgs(['rules', 'no-todo']), dir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('no-todo  [pattern]');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('runRulesCommand — detail and config arms', () => {
  it('shows catalogue entry, related principle, and examples in detail view', async () => {
    const dir = await makeDir();
    try {
      await writeConfig(
        dir,
        `export default defineConfig({
  rules: [
    rule.forbidPattern(/it\\.skip/, {
      id: 'no-skipped-tests',
      catalogueEntry: 'tests-skipped-under-pressure',
      relatedPrinciple: 'mechanical-enforcement-over-instruction',
      prompt: { examples: { bad: 'it.skip("flaky")', good: 'it("fixed")' } },
    }),
  ],
});`,
      );
      const result = await runRulesCommand(parseArgs(['rules', 'no-skipped-tests']), dir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Catalogue entry:    tests-skipped-under-pressure');
      expect(result.stdout).toContain(
        'Related principle:  mechanical-enforcement-over-instruction',
      );
      expect(result.stdout).toContain('AVOID:');
      expect(result.stdout).toContain('PREFER:');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('loads the constitution from an explicit --config path', async () => {
    const dir = await makeDir();
    try {
      await writeConfig(
        dir,
        `export default defineConfig({ rules: [rule.forbidPattern(/TODO/, { id: 'no-todo' })] });`,
      );
      const result = await runRulesCommand(
        parseArgs(['rules', '--config', 'effective.config.ts']),
        dir,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('1 rule(s) active');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports an empty resolved constitution', async () => {
    const dir = await makeDir();
    try {
      await writeConfig(
        dir,
        `export default defineConfig({
  rules: [rule.forbidPattern(/TODO/, { id: 'no-todo' })],
  disable: { 'no-todo': 'exercising the empty-resolution path' },
});`,
      );
      const result = await runRulesCommand(parseArgs(['rules']), dir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No rules in the resolved constitution.');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
