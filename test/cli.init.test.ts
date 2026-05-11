import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInitCommand } from '../src/cli/init.js';
import { parseArgs } from '../src/cli/args.js';

async function makeDir(): Promise<string> {
  return await mkdtemp(path.join(tmpdir(), 'effective-init-'));
}

describe('runInitCommand', () => {
  it('scaffolds effective.config.ts, .effective/exceptions.ts, and .gitignore', async () => {
    const dir = await makeDir();
    try {
      const result = await runInitCommand(parseArgs(['init']), dir);
      expect(result.exitCode).toBe(0);
      const filesWritten = new Set(result.filesWritten.map((p) => path.relative(dir, p)));
      expect(filesWritten.has('effective.config.ts')).toBe(true);
      expect(filesWritten.has(path.join('.effective', 'exceptions.ts'))).toBe(true);
      expect(filesWritten.has('.gitignore')).toBe(true);

      const gi = await readFile(path.join(dir, '.gitignore'), 'utf8');
      expect(gi).toContain('.effective/');

      const config = await readFile(path.join(dir, 'effective.config.ts'), 'utf8');
      expect(config).toContain("from 'effective'");
      expect(config).toContain('defineConfig');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('detects pnpm scripts from package.json', async () => {
    const dir = await makeDir();
    try {
      await writeFile(
        path.join(dir, 'package.json'),
        JSON.stringify({
          packageManager: 'pnpm@10.0.0',
          scripts: { lint: 'eslint .', typecheck: 'tsc --noEmit', test: 'vitest run' },
        }),
      );
      await runInitCommand(parseArgs(['init']), dir);
      const config = await readFile(path.join(dir, 'effective.config.ts'), 'utf8');
      expect(config).toContain('pnpm run lint');
      expect(config).toContain('pnpm run typecheck');
      expect(config).toContain('pnpm run test');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('skips files that already exist (no overwrite without --force)', async () => {
    const dir = await makeDir();
    try {
      await writeFile(path.join(dir, 'effective.config.ts'), '// existing content');
      const result = await runInitCommand(parseArgs(['init']), dir);
      expect(result.filesSkipped.some((p) => p.endsWith('effective.config.ts'))).toBe(true);
      const config = await readFile(path.join(dir, 'effective.config.ts'), 'utf8');
      expect(config).toBe('// existing content');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('overwrites with --force', async () => {
    const dir = await makeDir();
    try {
      await writeFile(path.join(dir, 'effective.config.ts'), '// existing content');
      await runInitCommand(parseArgs(['init', '--force']), dir);
      const config = await readFile(path.join(dir, 'effective.config.ts'), 'utf8');
      expect(config).toContain('defineConfig');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('preserves existing .gitignore content while adding .effective/', async () => {
    const dir = await makeDir();
    try {
      await writeFile(path.join(dir, '.gitignore'), 'node_modules/\n');
      await runInitCommand(parseArgs(['init']), dir);
      const gi = await readFile(path.join(dir, '.gitignore'), 'utf8');
      expect(gi).toContain('node_modules/');
      expect(gi).toContain('.effective/');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not duplicate .effective/ in .gitignore', async () => {
    const dir = await makeDir();
    try {
      await writeFile(path.join(dir, '.gitignore'), '.effective/\nnode_modules/\n');
      await runInitCommand(parseArgs(['init']), dir);
      const gi = await readFile(path.join(dir, '.gitignore'), 'utf8');
      expect(gi.match(/\.effective\//g)?.length).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
