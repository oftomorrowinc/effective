import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runAuditEscapesCommand } from '../src/cli/audit-escapes.js';
import { parseArgs } from '../src/cli/args.js';

async function makeDir(): Promise<string> {
  return await mkdtemp(path.join(tmpdir(), 'effective-audit-'));
}

describe('runAuditEscapesCommand', () => {
  it('reports hatches missing an exception-id', async () => {
    const dir = await makeDir();
    try {
      await mkdir(path.join(dir, 'src'), { recursive: true });
      await writeFile(path.join(dir, 'src', 'a.ts'), `// @ts-expect-error legacy\n`);
      await writeFile(
        path.join(dir, 'src', 'b.ts'),
        `// eslint-disable-next-line no-console -- exception-id: cli-fatal-exit\nconsole.log(1);`,
      );
      const result = await runAuditEscapesCommand(parseArgs(['audit-escapes']), dir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Found 1 escape hatch');
      expect(result.stdout).toContain('src/a.ts');
      expect(result.stdout).not.toContain('src/b.ts');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('--all surfaces every hatch including justified ones', async () => {
    const dir = await makeDir();
    try {
      await writeFile(
        path.join(dir, 'a.ts'),
        `// eslint-disable-next-line foo -- exception-id: cli-fatal-exit\n// @ts-expect-error legacy\n`,
      );
      const result = await runAuditEscapesCommand(parseArgs(['audit-escapes', '--all']), dir);
      expect(result.stdout).toContain('Found 2 escape hatch');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports clean when no hatches need attention', async () => {
    const dir = await makeDir();
    try {
      await writeFile(path.join(dir, 'a.ts'), `export const x = 1;`);
      const result = await runAuditEscapesCommand(parseArgs(['audit-escapes']), dir);
      expect(result.stdout).toMatch(/No escape hatches missing/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('skips node_modules, dist, .git, .effective by default', async () => {
    const dir = await makeDir();
    try {
      await mkdir(path.join(dir, 'node_modules', 'lib'), { recursive: true });
      await writeFile(
        path.join(dir, 'node_modules', 'lib', 'index.ts'),
        `// @ts-expect-error vendor`,
      );
      await mkdir(path.join(dir, 'dist'), { recursive: true });
      await writeFile(path.join(dir, 'dist', 'bundle.js'), `// @ts-expect-error built`);
      await writeFile(path.join(dir, 'real.ts'), `// @ts-expect-error real`);
      const result = await runAuditEscapesCommand(parseArgs(['audit-escapes']), dir);
      expect(result.stdout).toContain('real.ts');
      expect(result.stdout).not.toContain('node_modules');
      expect(result.stdout).not.toContain('dist/bundle.js');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
