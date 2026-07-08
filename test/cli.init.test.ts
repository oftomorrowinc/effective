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

/**
 * Wrapper for the repeated try/finally + makeFixture + rm boilerplate.
 * The body runs against a fresh temp dir; the directory is removed
 * regardless of test outcome.
 */
async function withFixture<T>(opts: FixtureOptions, body: (dir: string) => Promise<T>): Promise<T> {
  const dir = await makeFixture(opts);
  try {
    return await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Run `init` against a fresh fixture and return the generated config
 * text — the shape almost every detection test needs. Asserts the run
 * succeeded so callers only state what the config must contain.
 */
async function initConfig(opts: FixtureOptions, file = 'effective.config.ts'): Promise<string> {
  return await withFixture(opts, async (dir) => {
    const result = await runInitCommand(parseArgs(['init']), dir);
    expect(result.exitCode).toBe(0);
    return await readFile(path.join(dir, file), 'utf8');
  });
}

describe('runInitCommand — scaffolding', () => {
  it('creates effective.config.ts and updates .gitignore (single-file shape)', async () => {
    await withFixture({ tsconfig: true }, async (dir) => {
      const result = await runInitCommand(parseArgs(['init']), dir);
      expect(result.exitCode).toBe(0);
      const rels = new Set(result.filesWritten.map((p) => path.relative(dir, p)));
      expect(rels.has('effective.config.ts')).toBe(true);
      expect(rels.has('.gitignore')).toBe(true);
      // Exceptions live inline on the Constitution now — no separate file.
      expect(rels.has(path.join('.effective', 'exceptions.ts'))).toBe(false);

      const config = await readFile(path.join(dir, 'effective.config.ts'), 'utf8');
      expect(config).toContain("import { defineConfig, seeds } from '@oftomorrow/effective'");
      expect(config).toContain("extends: ['recommended']");
      expect(config).toContain('export default defineConfig({');
      expect(config).toContain('exceptions: {');
      expect(config).toContain('...seeds.builtInExceptions');
    });
  });

  it('emits .js when no tsconfig.json exists', async () => {
    await withFixture({ tsconfig: false }, async (dir) => {
      const result = await runInitCommand(parseArgs(['init']), dir);
      expect(result.exitCode).toBe(0);
      const rels = new Set(result.filesWritten.map((p) => path.relative(dir, p)));
      expect(rels.has('effective.config.js')).toBe(true);

      const config = await readFile(path.join(dir, 'effective.config.js'), 'utf8');
      expect(config).toContain("const { defineConfig, seeds } = require('@oftomorrow/effective')");
      expect(config).toContain('module.exports = defineConfig({');
      expect(config).toContain('exceptions: {');
    });
  });
});

describe('runInitCommand — package-manager detection', () => {
  it('detects pnpm from pnpm-lock.yaml', async () => {
    const config = await initConfig({
      tsconfig: true,
      lockfile: 'pnpm',
      packageJson: { scripts: { lint: 'eslint .', test: 'vitest run' } },
    });
    expect(config).toContain('pnpm lint');
    expect(config).toContain('pnpm test');
  });

  it('detects yarn from yarn.lock', async () => {
    const config = await initConfig({
      tsconfig: true,
      lockfile: 'yarn',
      packageJson: { scripts: { lint: 'eslint .' } },
    });
    expect(config).toContain('yarn lint');
  });

  it('detects npm from package-lock.json and uses `-- ` separator for forwarded flags', async () => {
    const config = await initConfig({
      tsconfig: true,
      lockfile: 'npm',
      packageJson: {
        scripts: { lint: 'eslint .' },
        devDependencies: { eslint: '^9.0.0' },
      },
    });
    // npm needs `--` to forward flags to the underlying script
    expect(config).toContain('npm run lint -- --format json');
  });

  it('falls back to packageManager field when no lockfile is present', async () => {
    const config = await initConfig({
      tsconfig: true,
      packageJson: { packageManager: 'pnpm@10.0.0', scripts: { lint: 'eslint .' } },
    });
    expect(config).toContain('pnpm lint');
  });
});

describe('runInitCommand — toolchain detection', () => {
  it('appends `--reporter json` to vitest test scripts', async () => {
    const config = await initConfig({
      tsconfig: true,
      lockfile: 'pnpm',
      packageJson: {
        scripts: { test: 'vitest run' },
        devDependencies: { vitest: '^3.0.0' },
      },
    });
    expect(config).toContain('test: "pnpm test --reporter json"');
  });

  it('appends `--json` to jest test scripts', async () => {
    const config = await initConfig({
      tsconfig: true,
      lockfile: 'pnpm',
      packageJson: {
        scripts: { test: 'jest' },
        devDependencies: { jest: '^29.0.0' },
      },
    });
    expect(config).toContain('test: "pnpm test --json"');
  });

  it('appends `--format json` to eslint lint scripts', async () => {
    const config = await initConfig({
      tsconfig: true,
      lockfile: 'pnpm',
      packageJson: {
        scripts: { lint: 'eslint .' },
        devDependencies: { eslint: '^9.0.0' },
      },
    });
    expect(config).toContain('lint: "pnpm lint --format json"');
  });

  it('appends `--reporter json` for biome', async () => {
    const config = await initConfig({
      tsconfig: true,
      lockfile: 'pnpm',
      packageJson: {
        scripts: { lint: 'biome check' },
        devDependencies: { '@biomejs/biome': '^1.0.0' },
      },
    });
    expect(config).toContain('lint: "pnpm lint --reporter json"');
  });

  it('prefers `:ci` script variants when present', async () => {
    const config = await initConfig({
      tsconfig: true,
      lockfile: 'pnpm',
      packageJson: {
        scripts: { lint: 'eslint .', 'lint:ci': 'eslint . --max-warnings 0' },
        devDependencies: { eslint: '^9.0.0' },
      },
    });
    expect(config).toContain('lint: "pnpm lint:ci --format json"');
  });

  it('flags ambiguity when multiple test frameworks are present', async () => {
    const config = await initConfig({
      tsconfig: true,
      lockfile: 'pnpm',
      packageJson: {
        scripts: { test: 'vitest run' },
        devDependencies: { vitest: '^3.0.0', jest: '^29.0.0' },
      },
    });
    expect(config).toContain('// EDIT: detected multiple test frameworks');
    expect(config).toContain('vitest, jest');
  });

  it('detects jest via @types/jest alone', async () => {
    const config = await initConfig({
      tsconfig: true,
      lockfile: 'pnpm',
      packageJson: {
        scripts: { test: 'jest' },
        devDependencies: { '@types/jest': '^29.0.0' },
      },
    });
    expect(config).toContain('test: "pnpm test --json"');
  });

  it('detects node:test from a `node --test` script and appends its reporter flag', async () => {
    const config = await initConfig({
      tsconfig: true,
      lockfile: 'pnpm',
      packageJson: { scripts: { test: 'node --test test/' } },
    });
    expect(config).toContain('test: "pnpm test --test-reporter spec"');
  });

  it('appends `--format json` for oxlint', async () => {
    const config = await initConfig({
      tsconfig: true,
      lockfile: 'pnpm',
      packageJson: {
        scripts: { lint: 'oxlint' },
        devDependencies: { oxlint: '^0.9.0' },
      },
    });
    expect(config).toContain('lint: "pnpm lint --format json"');
  });

  it('flags ambiguity when multiple lint frameworks are present', async () => {
    const config = await initConfig({
      tsconfig: true,
      lockfile: 'pnpm',
      packageJson: {
        scripts: { lint: 'eslint .' },
        devDependencies: { eslint: '^9.0.0', '@biomejs/biome': '^1.0.0' },
      },
    });
    expect(config).toContain('// EDIT: detected multiple lint frameworks');
    expect(config).toContain('eslint, biome');
  });

  it('emits a coverage command from a test:coverage script', async () => {
    const config = await initConfig({
      tsconfig: true,
      lockfile: 'pnpm',
      packageJson: {
        scripts: { test: 'vitest run', 'test:coverage': 'vitest run --coverage' },
        devDependencies: { vitest: '^3.0.0' },
      },
    });
    expect(config).toContain('coverage: "pnpm test:coverage --reporter json"');
  });

  it('composes a plain `npm run` command when no reporter flag is forwarded', async () => {
    const config = await initConfig({
      tsconfig: true,
      lockfile: 'npm',
      packageJson: { scripts: { typecheck: 'tsc --noEmit' } },
    });
    expect(config).toContain('typecheck: "npm run typecheck"');
  });

  it('emits lint and test commands without flags when no framework is recognized', async () => {
    const config = await initConfig({
      tsconfig: true,
      lockfile: 'pnpm',
      packageJson: { scripts: { lint: 'mylinter .', test: 'node scripts/run-tests.js' } },
    });
    expect(config).toContain('lint: "pnpm lint",');
    expect(config).toContain('test: "pnpm test",');
  });
});

describe('runInitCommand — meta block', () => {
  it('uses package.json name and version', async () => {
    const config = await initConfig({
      tsconfig: true,
      packageJson: { name: 'my-app', version: '1.2.3' },
    });
    expect(config).toContain('name: "my-app"');
    expect(config).toContain('version: "1.2.3"');
  });

  it('falls back to a placeholder name when package.json is absent', async () => {
    const config = await initConfig({ tsconfig: true });
    expect(config).toContain('name: "my-project"');
  });
});

describe('runInitCommand — idempotency', () => {
  it('skips files that already exist (no overwrite without --force)', async () => {
    await withFixture(
      {
        tsconfig: true,
        existingFiles: [{ rel: 'effective.config.ts', content: '// existing content' }],
      },
      async (dir) => {
        const result = await runInitCommand(parseArgs(['init']), dir);
        expect(result.filesSkipped.some((p) => p.endsWith('effective.config.ts'))).toBe(true);
        const config = await readFile(path.join(dir, 'effective.config.ts'), 'utf8');
        expect(config).toBe('// existing content');
      },
    );
  });

  it('overwrites with --force', async () => {
    await withFixture(
      {
        tsconfig: true,
        existingFiles: [{ rel: 'effective.config.ts', content: '// existing content' }],
      },
      async (dir) => {
        await runInitCommand(parseArgs(['init', '--force']), dir);
        const config = await readFile(path.join(dir, 'effective.config.ts'), 'utf8');
        expect(config).toContain('defineConfig');
      },
    );
  });

  it('emits "already initialized" when the config file is already present', async () => {
    await withFixture(
      {
        tsconfig: true,
        gitignore: '.effective/\n',
        existingFiles: [{ rel: 'effective.config.ts', content: '// existing config' }],
      },
      async (dir) => {
        const result = await runInitCommand(parseArgs(['init']), dir);
        expect(result.stdout).toContain('already initialized');
        expect(result.filesWritten).toHaveLength(0);
      },
    );
  });

  it('preserves existing .gitignore content while adding .effective/', async () => {
    await withFixture({ tsconfig: true, gitignore: 'node_modules/\n' }, async (dir) => {
      await runInitCommand(parseArgs(['init']), dir);
      const gi = await readFile(path.join(dir, '.gitignore'), 'utf8');
      expect(gi).toContain('node_modules/');
      expect(gi).toContain('.effective/');
    });
  });

  it('does not duplicate the `.effective/` gitignore entry on re-run', async () => {
    await withFixture({ tsconfig: true, gitignore: '.effective/\n' }, async (dir) => {
      await runInitCommand(parseArgs(['init']), dir);
      const gi = await readFile(path.join(dir, '.gitignore'), 'utf8');
      const matches = gi.split('\n').filter((line) => line.trim() === '.effective/');
      expect(matches).toHaveLength(1);
    });
  });
});

describe('runInitCommand — stdout', () => {
  it('includes the first-run slowness note', async () => {
    await withFixture({ tsconfig: true }, async (dir) => {
      const result = await runInitCommand(parseArgs(['init']), dir);
      expect(result.stdout).toContain('first verify will be slower');
      expect(result.stdout).toContain('1-5 minutes');
    });
  });

  it('suggests the right next-step command per package manager', async () => {
    await withFixture({ tsconfig: true, lockfile: 'pnpm' }, async (dir) => {
      const result = await runInitCommand(parseArgs(['init']), dir);
      expect(result.stdout).toContain('pnpm exec effective verify');
    });
  });
});

describe('runInitCommand — exceptions inline', () => {
  it('emits seeds.builtInExceptions spread inside the config exceptions field', async () => {
    const body = await initConfig({ tsconfig: true });
    expect(body).toContain('exceptions: {');
    expect(body).toContain('...seeds.builtInExceptions');
  });
});

describe('runInitCommand — protected paths', () => {
  it('always emits the effective.config.ts entry', async () => {
    const body = await initConfig({ tsconfig: true });
    expect(body).toContain('protected: [');
    expect(body).toContain('path: "effective.config.ts"');
    expect(body).toContain('The constitution itself');
  });

  it('uses the .js fallback for JS-only projects', async () => {
    const body = await initConfig({ tsconfig: false }, 'effective.config.js');
    expect(body).toContain('path: "effective.config.js"');
    expect(body).not.toContain('path: "effective.config.ts"');
  });

  it('emits eslint configs when eslint is in devDependencies', async () => {
    const body = await initConfig({
      tsconfig: true,
      packageJson: { devDependencies: { eslint: '^9.0.0' } },
    });
    expect(body).toContain('path: "eslint.config.*"');
    expect(body).toContain('ESLint config controls lint behavior');
  });

  it('emits tsconfig*.json when tsconfig.json exists', async () => {
    const body = await initConfig({ tsconfig: true });
    expect(body).toContain('path: "tsconfig*.json"');
  });

  it('emits .github/workflows/** when the directory exists', async () => {
    const body = await initConfig({
      tsconfig: true,
      existingFiles: [{ rel: path.join('.github', 'workflows', '.gitkeep'), content: '' }],
    });
    expect(body).toContain('path: ".github/workflows/**"');
  });

  it('does NOT emit eslint configs when eslint is absent', async () => {
    const body = await initConfig({
      tsconfig: true,
      packageJson: { devDependencies: { vitest: '^3.0.0' } },
    });
    expect(body).not.toContain("path: 'eslint.config.*'");
  });
});

describe('runInitCommand — hostile package.json values are escaped', () => {
  it('renders a quote-bearing package name as data, not injectable config code', async () => {
    // A crafted `name` that would, if interpolated raw into a
    // single-quoted literal, close the string and inject an
    // executable expression into the (later jiti-executed) config.
    const hostile = "x', leaked: process.env, y: 'z";
    const config = await initConfig({
      packageJson: { name: hostile, version: "1.0.0'+process.exit(1)+'" },
    });
    // The whole hostile value lands INSIDE one escaped string
    // literal (data)…
    expect(config).toContain(`name: ${JSON.stringify(hostile)},`);
    // …and stripping the escaped literals leaves no payload
    // outside a string — nothing executable escaped the quotes.
    const outsideLiterals = config
      .replace(JSON.stringify(hostile), '""')
      .replace(JSON.stringify("1.0.0'+process.exit(1)+'"), '""');
    expect(outsideLiterals).not.toContain('process.env');
    expect(outsideLiterals).not.toContain('process.exit');
  });

  it('renders quote-bearing script names safely in toolchain commands', async () => {
    const config = await initConfig({
      packageJson: {
        scripts: { lint: 'eslint .' },
        devDependencies: { eslint: '^9.0.0' },
      },
      lockfile: 'pnpm',
    });
    // Commands are emitted as JSON-escaped double-quoted literals.
    expect(config).toContain('lint: "pnpm lint --format json",');
  });
});
