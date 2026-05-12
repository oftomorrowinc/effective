import { describe, expect, it } from 'vitest';
import { verify } from '../src/verify.js';
import type { InlineSource } from '../src/source/inline.js';
import { changed, scope } from './_helpers.js';

const RULE_ID = 'migration-has-exercising-test';

function withFiles(
  files: { path: string; content: string; status?: 'added' | 'modified' }[],
): InlineSource {
  return {
    kind: 'inline',
    changedFiles: files.map((f) => changed(f.path, f.content, f.status ?? 'added')),
  };
}

describe('migration-has-exercising-test (CustomRule)', () => {
  it('flags a new migration with no exercising test in the diff', async () => {
    const result = await verify({
      scope: scope('code-writer'),
      config: { extends: ['recommended'] },
      source: withFiles([
        {
          path: 'migrations/2026-04-22-add-user-table.sql',
          content: 'CREATE TABLE user (id TEXT);',
        },
      ]),
    });
    expect(result.findings.some((f) => f.ruleId === RULE_ID)).toBe(true);
  });

  it('passes when a test file in the diff mentions the migration stem', async () => {
    const result = await verify({
      scope: scope('code-writer'),
      config: { extends: ['recommended'] },
      source: withFiles([
        {
          path: 'migrations/2026-04-22-add-user-table.sql',
          content: 'CREATE TABLE user (id TEXT);',
        },
        {
          path: 'test/migrations/add-user-table.test.ts',
          content:
            "import { runMigration } from '../../migrations/2026-04-22-add-user-table';\n" +
            "describe('add-user-table migration', () => {\n" +
            "  it('creates the user table', async () => { /* seed + run + assert */ });\n" +
            '});',
        },
      ]),
    });
    expect(result.findings.some((f) => f.ruleId === RULE_ID)).toBe(false);
  });

  it('passes when a modified test file mentions the migration', async () => {
    const result = await verify({
      scope: scope('code-writer'),
      config: { extends: ['recommended'] },
      source: withFiles([
        {
          path: 'migrations/0042_user_schema.sql',
          content: 'ALTER TABLE user ADD COLUMN role TEXT;',
        },
        {
          path: 'test/db/schema.test.ts',
          content: "it('0042_user_schema applies', () => {});",
          status: 'modified',
        },
      ]),
    });
    expect(result.findings.some((f) => f.ruleId === RULE_ID)).toBe(false);
  });

  it('flags ONLY migrations that lack an exercising test (mixed diff)', async () => {
    const result = await verify({
      scope: scope('code-writer'),
      config: { extends: ['recommended'] },
      source: withFiles([
        { path: 'migrations/0001_first.sql', content: 'CREATE TABLE a();' },
        { path: 'migrations/0002_second.sql', content: 'CREATE TABLE b();' },
        {
          path: 'test/migrations.test.ts',
          content: "it('0001_first works', () => {});", // mentions stem for first only
        },
      ]),
    });
    const findings = result.findings.filter((f) => f.ruleId === RULE_ID);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence).toBe('migrations/0002_second.sql');
  });

  it('ignores migrations that already existed (status: modified)', async () => {
    const result = await verify({
      scope: scope('code-writer'),
      config: { extends: ['recommended'] },
      source: withFiles([
        {
          path: 'migrations/0001_pre-existing.sql',
          content: '-- adjusted',
          status: 'modified',
        },
      ]),
    });
    expect(result.findings.some((f) => f.ruleId === RULE_ID)).toBe(false);
  });

  it('matches both `migration/` and `migrations/` directory conventions', async () => {
    const result = await verify({
      scope: scope('code-writer'),
      config: { extends: ['recommended'] },
      source: withFiles([{ path: 'db/migration/0001_x.sql', content: '...' }]),
    });
    expect(result.findings.some((f) => f.ruleId === RULE_ID)).toBe(true);
  });

  it('ignores added files that are NOT in a migrations directory', async () => {
    const result = await verify({
      scope: scope('code-writer'),
      config: { extends: ['recommended'] },
      source: withFiles([{ path: 'src/db/schema.sql', content: 'CREATE TABLE x();' }]),
    });
    expect(result.findings.some((f) => f.ruleId === RULE_ID)).toBe(false);
  });

  it('matches `.ts`, `.js`, and `.sql` migration extensions', async () => {
    for (const ext of ['sql', 'ts', 'js']) {
      const result = await verify({
        scope: scope('code-writer'),
        config: { extends: ['recommended'] },
        source: withFiles([{ path: `migrations/0001_x.${ext}`, content: '...' }]),
      });
      expect(
        result.findings.some((f) => f.ruleId === RULE_ID),
        `should flag migration .${ext}`,
      ).toBe(true);
    }
  });

  it('fails the verdict at CRITICAL', async () => {
    const result = await verify({
      scope: scope('code-writer'),
      config: { extends: ['recommended'] },
      source: withFiles([{ path: 'migrations/0001_x.sql', content: '...' }]),
    });
    expect(result.verdict).toBe('fail');
  });
});
