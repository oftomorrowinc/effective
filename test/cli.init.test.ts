import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInitCommand } from '../src/cli/init.js';
import { parseArgs } from '../src/cli/args.js';

async function makeDir(): Promise<string> {
  return await mkdtemp(path.join(tmpdir(), 'effective-init-'));
}

interface FixtureOptions {
  tsconfig?: boolean;
  packageJson?: Record<string, unknown>;
  lockfile?: 'pnpm' | 'yarn' | 'npm';
  gitignore?: string;
  existingFiles?: { rel: string; content: string }[];
}

async function makeFixture(opts: FixtureOptions = {}): Promise<string> {
  const dir = await makeDir();
  if (opts.tsconfig !== false) await writeFile(path.join(dir, 'tsconfig.json'), '{}');
  if (opts.packageJson !== undefined) {
    await writeFile(path.join(dir, 'package.json'), JSON.stringify(opts.packageJson));
  }
  if (opts.lockfile === 'pnpm') await writeFile(path.join(dir, 'pnpm-lock.yaml'), '');
  if (opts.lockfile === 'yarn') await writeFile(path.join(dir, 'yarn.lock'), '');
  if (opts.lockfile === 'npm') await writeFile(path.join(dir, 'package-lock.json'), '{}');
  if (opts.gitignore !== undefined) await writeFile(path.join(dir, '.gitignore'), opts.gitignore);
  for (const f of opts.existingFiles ?? []) {
    const abs = path.join(dir, f.rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, f.content);
  }
  return dir;
}

describe('runInitCommand — scaffolding', () => {
  it('creates effective.config.ts, .effective/exceptions.ts, and updates .gitignore', async () => {
    const dir = await makeFixture({ tsconfig: true });
    try {
      const result = await runInitCommand(parseArgs(['init']), dir);
      expect(result.exitCode).toBe(0);
      const rels = new Set(result.filesWritten.map((p) => path.relative(dir, p)));
      expect(rels.has('effective.config.ts')).toBe(true);
      expect(rels.has(path.join('.effective', 'exceptions.ts'))).toBe(true);
      expect(rels.has('.gitignore')).toBe(true);

      const config = await readFile(path.join(dir, 'effective.config.ts'), 'utf8');
      expect(config).toContain("import { defineConfig } from 'effective'");
      expect(config).toContain("extends: ['recommended']");
      expect(config).toContain('export default defineConfig({');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('emits .js when no tsconfig.json exists', async () => {
    const dir = await makeFixture({ tsconfig: false });
    try {
      const result = await runInitCommand(parseArgs(['init']), dir);
      expect(result.exitCode).toBe(0);
      const rels = new Set(result.filesWritten.map((p) => path.relative(dir, p)));
      expect(rels.has('effective.config.js')).toBe(true);
      expect(rels.has(path.join('.effective', 'exceptions.js'))).toBe(true);

      const config = await readFile(path.join(dir, 'effective.config.js'), 'utf8');
      expect(config).toContain("const { defineConfig } = require('effective')");
      expect(config).toContain('module.exports = defineConfig({');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('runInitCommand — package-manager detection', () => {
  it('detects pnpm from pnpm-lock.yaml', async () => {
    const dir = await makeFixture({
      tsconfig: true,
      lockfile: 'pnpm',
      packageJson: { scripts: { lint: 'eslint .', test: 'vitest run' } },
    });
    try {
      await runInitCommand(parseArgs(['init']), dir);
      const config = await readFile(path.join(dir, 'effective.config.ts'), 'utf8');
      expect(config).toContain('pnpm lint');
      expect(config).toContain('pnpm test');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('detects yarn from yarn.lock', async () => {
    const dir = await makeFixture({
      tsconfig: true,
      lockfile: 'yarn',
      packageJson: { scripts: { lint: 'eslint .' } },
    });
    try {
      await runInitCommand(parseArgs(['init']), dir);
      const config = await readFile(path.join(dir, 'effective.config.ts'), 'utf8');
      expect(config).toContain('yarn lint');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('detects npm from package-lock.json and uses `-- ` separator for forwarded flags', async () => {
    const dir = await makeFixture({
      tsconfig: true,
      lockfile: 'npm',
      packageJson: {
        scripts: { lint: 'eslint .' },
        devDependencies: { eslint: '^9.0.0' },
      },
    });
    try {
      await runInitCommand(parseArgs(['init']), dir);
      const config = await readFile(path.join(dir, 'effective.config.ts'), 'utf8');
      // npm needs `--` to forward flags to the underlying script
      expect(config).toContain('npm run lint -- --format json');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('falls back to packageManager field when no lockfile is present', async () => {
    const dir = await makeFixture({
      tsconfig: true,
      packageJson: { packageManager: 'pnpm@10.0.0', scripts: { lint: 'eslint .' } },
    });
    try {
      await runInitCommand(parseArgs(['init']), dir);
      const config = await readFile(path.join(dir, 'effective.config.ts'), 'utf8');
      expect(config).toContain('pnpm lint');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('runInitCommand — toolchain detection', () => {
  it('appends `--reporter json` to vitest test scripts', async () => {
    const dir = await makeFixture({
      tsconfig: true,
      lockfile: 'pnpm',
      packageJson: {
        scripts: { test: 'vitest run' },
        devDependencies: { vitest: '^3.0.0' },
      },
    });
    try {
      await runInitCommand(parseArgs(['init']), dir);
      const config = await readFile(path.join(dir, 'effective.config.ts'), 'utf8');
      expect(config).toContain("test: 'pnpm test --reporter json'");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('appends `--json` to jest test scripts', async () => {
    const dir = await makeFixture({
      tsconfig: true,
      lockfile: 'pnpm',
      packageJson: {
        scripts: { test: 'jest' },
        devDependencies: { jest: '^29.0.0' },
      },
    });
    try {
      await runInitCommand(parseArgs(['init']), dir);
      const config = await readFile(path.join(dir, 'effective.config.ts'), 'utf8');
      expect(config).toContain("test: 'pnpm test --json'");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('appends `--format json` to eslint lint scripts', async () => {
    const dir = await makeFixture({
      tsconfig: true,
      lockfile: 'pnpm',
      packageJson: {
        scripts: { lint: 'eslint .' },
        devDependencies: { eslint: '^9.0.0' },
      },
    });
    try {
      await runInitCommand(parseArgs(['init']), dir);
      const config = await readFile(path.join(dir, 'effective.config.ts'), 'utf8');
      expect(config).toContain("lint: 'pnpm lint --format json'");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('appends `--reporter json` for biome', async () => {
    const dir = await makeFixture({
      tsconfig: true,
      lockfile: 'pnpm',
      packageJson: {
        scripts: { lint: 'biome check' },
        devDependencies: { '@biomejs/biome': '^1.0.0' },
      },
    });
    try {
      await runInitCommand(parseArgs(['init']), dir);
      const config = await readFile(path.join(dir, 'effective.config.ts'), 'utf8');
      expect(config).toContain("lint: 'pnpm lint --reporter json'");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('prefers `:ci` script variants when present', async () => {
    const dir = await makeFixture({
      tsconfig: true,
      lockfile: 'pnpm',
      packageJson: {
        scripts: { lint: 'eslint .', 'lint:ci': 'eslint . --max-warnings 0' },
        devDependencies: { eslint: '^9.0.0' },
      },
    });
    try {
      await runInitCommand(parseArgs(['init']), dir);
      const config = await readFile(path.join(dir, 'effective.config.ts'), 'utf8');
      expect(config).toContain("lint: 'pnpm lint:ci --format json'");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('flags ambiguity when multiple test frameworks are present', async () => {
    const dir = await makeFixture({
      tsconfig: true,
      lockfile: 'pnpm',
      packageJson: {
        scripts: { test: 'vitest run' },
        devDependencies: { vitest: '^3.0.0', jest: '^29.0.0' },
      },
    });
    try {
      await runInitCommand(parseArgs(['init']), dir);
      const config = await readFile(path.join(dir, 'effective.config.ts'), 'utf8');
      expect(config).toContain('// EDIT: detected multiple test frameworks');
      expect(config).toContain('vitest, jest');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('runInitCommand — meta block', () => {
  it('uses package.json name and version', async () => {
    const dir = await makeFixture({
      tsconfig: true,
      packageJson: { name: 'my-app', version: '1.2.3' },
    });
    try {
      await runInitCommand(parseArgs(['init']), dir);
      const config = await readFile(path.join(dir, 'effective.config.ts'), 'utf8');
      expect(config).toContain("name: 'my-app'");
      expect(config).toContain("version: '1.2.3'");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('falls back to a placeholder name when package.json is absent', async () => {
    const dir = await makeFixture({ tsconfig: true });
    try {
      await runInitCommand(parseArgs(['init']), dir);
      const config = await readFile(path.join(dir, 'effective.config.ts'), 'utf8');
      expect(config).toContain("name: 'my-project'");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('runInitCommand — idempotency', () => {
  it('skips files that already exist (no overwrite without --force)', async () => {
    const dir = await makeFixture({
      tsconfig: true,
      existingFiles: [{ rel: 'effective.config.ts', content: '// existing content' }],
    });
    try {
      const result = await runInitCommand(parseArgs(['init']), dir);
      expect(result.filesSkipped.some((p) => p.endsWith('effective.config.ts'))).toBe(true);
      const config = await readFile(path.join(dir, 'effective.config.ts'), 'utf8');
      expect(config).toBe('// existing content');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('overwrites with --force', async () => {
    const dir = await makeFixture({
      tsconfig: true,
      existingFiles: [{ rel: 'effective.config.ts', content: '// existing content' }],
    });
    try {
      await runInitCommand(parseArgs(['init', '--force']), dir);
      const config = await readFile(path.join(dir, 'effective.config.ts'), 'utf8');
      expect(config).toContain('defineConfig');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fills in missing files when only some exist', async () => {
    const dir = await makeFixture({
      tsconfig: true,
      existingFiles: [{ rel: 'effective.config.ts', content: '// existing config' }],
    });
    try {
      const result = await runInitCommand(parseArgs(['init']), dir);
      expect(result.filesSkipped.some((p) => p.endsWith('effective.config.ts'))).toBe(true);
      expect(result.filesWritten.some((p) => p.endsWith('exceptions.ts'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('emits "already initialized" when every target file is already present', async () => {
    const dir = await makeFixture({
      tsconfig: true,
      gitignore: '.effective/node_modules/\n.effective/work/\n',
      existingFiles: [
        { rel: 'effective.config.ts', content: '// existing config' },
        { rel: '.effective/exceptions.ts', content: '// existing exceptions' },
      ],
    });
    try {
      const result = await runInitCommand(parseArgs(['init']), dir);
      expect(result.stdout).toContain('already initialized');
      expect(result.filesWritten).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('preserves existing .gitignore content while adding .effective/ subdirs', async () => {
    const dir = await makeFixture({ tsconfig: true, gitignore: 'node_modules/\n' });
    try {
      await runInitCommand(parseArgs(['init']), dir);
      const gi = await readFile(path.join(dir, '.gitignore'), 'utf8');
      expect(gi).toContain('node_modules/');
      expect(gi).toContain('.effective/node_modules/');
      expect(gi).toContain('.effective/work/');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('ignores `.effective/node_modules/` and `.effective/work/` only — leaves exceptions.ts trackable', async () => {
    const dir = await makeFixture({ tsconfig: true });
    try {
      await runInitCommand(parseArgs(['init']), dir);
      const gi = await readFile(path.join(dir, '.gitignore'), 'utf8');
      // The bare `.effective/` rule is NOT used — exceptions.ts must be
      // commitable per USAGE.md gradual-adoption path step 4.
      expect(gi.split('\n').some((line) => line.trim() === '.effective/')).toBe(false);
      expect(gi).toContain('.effective/node_modules/');
      expect(gi).toContain('.effective/work/');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not duplicate gitignore entries on re-run', async () => {
    const dir = await makeFixture({
      tsconfig: true,
      gitignore: '.effective/node_modules/\n.effective/work/\n',
    });
    try {
      await runInitCommand(parseArgs(['init']), dir);
      const gi = await readFile(path.join(dir, '.gitignore'), 'utf8');
      expect(gi.match(/\.effective\/node_modules\//g)?.length).toBe(1);
      expect(gi.match(/\.effective\/work\//g)?.length).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('runInitCommand — stdout', () => {
  it('includes the first-run slowness note', async () => {
    const dir = await makeFixture({ tsconfig: true });
    try {
      const result = await runInitCommand(parseArgs(['init']), dir);
      expect(result.stdout).toContain('first verify will be slower');
      expect(result.stdout).toContain('1-5 minutes');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('suggests the right next-step command per package manager', async () => {
    const dir = await makeFixture({ tsconfig: true, lockfile: 'pnpm' });
    try {
      const result = await runInitCommand(parseArgs(['init']), dir);
      expect(result.stdout).toContain('pnpm exec effective verify');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('runInitCommand — exceptions template', () => {
  it('uses seeds.builtInExceptions spread', async () => {
    const dir = await makeFixture({ tsconfig: true });
    try {
      await runInitCommand(parseArgs(['init']), dir);
      const body = await readFile(path.join(dir, '.effective', 'exceptions.ts'), 'utf8');
      expect(body).toContain('...seeds.builtInExceptions');
      expect(body).toContain('defineExceptions');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
