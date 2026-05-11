import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ParsedArgs } from './args.js';

export interface InitCliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly filesWritten: readonly string[];
  readonly filesSkipped: readonly string[];
}

interface DetectedToolchain {
  readonly lint?: string;
  readonly typecheck?: string;
  readonly test?: string;
  readonly coverage?: string;
}

interface PackageJsonShape {
  scripts?: Record<string, string>;
  packageManager?: string;
}

async function readPackageJson(cwd: string): Promise<PackageJsonShape | undefined> {
  try {
    const raw = await fs.readFile(path.join(cwd, 'package.json'), 'utf8');
    return JSON.parse(raw) as PackageJsonShape;
  } catch {
    return undefined;
  }
}

function pickScript(
  scripts: Record<string, string>,
  candidates: readonly string[],
): string | undefined {
  for (const name of candidates) {
    if (scripts[name] !== undefined) return name;
  }
  return undefined;
}

function detectPackageManager(pkg: PackageJsonShape | undefined): 'pnpm' | 'npm' | 'yarn' {
  const declared = pkg?.packageManager;
  if (declared?.startsWith('pnpm@')) return 'pnpm';
  if (declared?.startsWith('yarn@')) return 'yarn';
  if (declared?.startsWith('npm@')) return 'npm';
  return 'npm';
}

function detectToolchain(pkg: PackageJsonShape | undefined): DetectedToolchain {
  const scripts = pkg?.scripts ?? {};
  const pm = detectPackageManager(pkg);
  const out: { -readonly [K in keyof DetectedToolchain]: DetectedToolchain[K] } = {};
  const lint = pickScript(scripts, ['lint:ci', 'lint']);
  if (lint !== undefined) out.lint = `${pm} run ${lint}`;
  const typecheck = pickScript(scripts, ['typecheck', 'tsc', 'type-check']);
  if (typecheck !== undefined) out.typecheck = `${pm} run ${typecheck}`;
  const test = pickScript(scripts, ['test:ci', 'test']);
  if (test !== undefined) out.test = `${pm} run ${test}`;
  const coverage = pickScript(scripts, ['test:coverage', 'coverage']);
  if (coverage !== undefined) out.coverage = `${pm} run ${coverage}`;
  return out;
}

function renderConfigTemplate(toolchain: DetectedToolchain): string {
  const tcLines: string[] = [];
  if (toolchain.lint !== undefined) tcLines.push(`    lint: '${toolchain.lint}',`);
  if (toolchain.typecheck !== undefined) tcLines.push(`    typecheck: '${toolchain.typecheck}',`);
  if (toolchain.test !== undefined) tcLines.push(`    test: '${toolchain.test}',`);
  if (toolchain.coverage !== undefined) tcLines.push(`    coverage: '${toolchain.coverage}',`);
  const tcBlock =
    tcLines.length === 0
      ? "  // toolchain: { lint: 'pnpm lint', typecheck: 'pnpm typecheck', test: 'pnpm test' },"
      : `  toolchain: {\n${tcLines.join('\n')}\n  },`;
  return `import { defineConfig } from 'effective';

/**
 * Effective constitution for this project.
 *
 * Start by declaring a rule or two of your own; once you're ready, extend
 * \`presets.recommended\` from \`effective\` to pull in the shipped catalogue.
 *
 *   import { defineConfig, presets, rule } from 'effective';
 *   export default defineConfig({
 *     extends: ['recommended'],
 *     rules: [rule.forbidPattern(/TODO\\(@nobody\\)/, { in: 'src/**' })],
 *   });
 */
export default defineConfig({
  rules: [
    // Add project-specific rules here, or remove and use \`extends\` to pull
    // in a preset.
  ],
${tcBlock}
  meta: {
    name: 'my-project',
  },
});
`;
}

function renderExceptionsTemplate(): string {
  return `import { defineExceptions, seeds } from 'effective';

/**
 * Project-specific exceptions registry. Every escape-hatch comment in your
 * code (\`c8 ignore\`, \`@ts-expect-error\`, \`eslint-disable\`,
 * \`prettier-ignore\`) should cite an \`exception-id:\` matching one of
 * these entries. The \`...seeds.builtInExceptions\` spread pulls in the
 * shipped category templates (CLI fatal-exit, library drift, etc.).
 *
 * Add your own instances below with a context and retirement condition.
 */
export default defineExceptions({
  ...seeds.builtInExceptions,
});
`;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function writeIfMissing(
  p: string,
  body: string,
  force: boolean,
  written: string[],
  skipped: string[],
): Promise<void> {
  if (!force && (await exists(p))) {
    skipped.push(p);
    return;
  }
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, body);
  written.push(p);
}

async function ensureGitignore(repoRoot: string, written: string[]): Promise<void> {
  const gi = path.join(repoRoot, '.gitignore');
  let body = '';
  if (await exists(gi)) {
    body = await fs.readFile(gi, 'utf8');
    if (/^\.effective\/?$/m.test(body)) return;
    if (!body.endsWith('\n')) body += '\n';
  }
  body += '.effective/\n';
  await fs.writeFile(gi, body);
  written.push(gi);
}

export async function runInitCommand(args: ParsedArgs, cwd: string): Promise<InitCliResult> {
  const force = args.flags.has('force');
  const pkg = await readPackageJson(cwd);
  const toolchain = detectToolchain(pkg);
  const written: string[] = [];
  const skipped: string[] = [];

  await writeIfMissing(
    path.join(cwd, 'effective.config.ts'),
    renderConfigTemplate(toolchain),
    force,
    written,
    skipped,
  );
  await writeIfMissing(
    path.join(cwd, '.effective', 'exceptions.ts'),
    renderExceptionsTemplate(),
    force,
    written,
    skipped,
  );
  await ensureGitignore(cwd, written);

  const stdout: string[] = ['Effective init complete.', ''];
  if (written.length > 0) {
    stdout.push('Wrote:');
    for (const p of written) stdout.push(`  ${path.relative(cwd, p)}`);
  }
  if (skipped.length > 0) {
    stdout.push('', 'Skipped (already exist — pass --force to overwrite):');
    for (const p of skipped) stdout.push(`  ${path.relative(cwd, p)}`);
  }
  stdout.push('', 'Next: review effective.config.ts and run `npx effective verify --staged`.');

  return {
    stdout: `${stdout.join('\n')}\n`,
    stderr: '',
    exitCode: 0,
    filesWritten: written,
    filesSkipped: skipped,
  };
}
