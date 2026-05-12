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

type PackageManager = 'pnpm' | 'yarn' | 'npm';
type TestFramework = 'vitest' | 'jest' | 'node-test';
type LintFramework = 'eslint' | 'biome' | 'oxlint';

interface PackageJsonShape {
  name?: string;
  version?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface DetectedScripts {
  readonly lint?: string;
  readonly typecheck?: string;
  readonly test?: string;
  readonly coverage?: string;
}

interface InitContext {
  readonly pm: PackageManager;
  readonly typescript: boolean;
  readonly packageName?: string;
  readonly packageVersion?: string;
  readonly testFramework?: TestFramework;
  readonly testFrameworkCandidates: readonly TestFramework[];
  readonly lintFramework?: LintFramework;
  readonly lintFrameworkCandidates: readonly LintFramework[];
  readonly scripts: DetectedScripts;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readPackageJson(cwd: string): Promise<PackageJsonShape | undefined> {
  try {
    const raw = await fs.readFile(path.join(cwd, 'package.json'), 'utf8');
    return JSON.parse(raw) as PackageJsonShape;
  } catch {
    return undefined;
  }
}

async function detectPackageManager(
  cwd: string,
  pkg: PackageJsonShape | undefined,
): Promise<PackageManager> {
  if (await exists(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await exists(path.join(cwd, 'yarn.lock'))) return 'yarn';
  if (await exists(path.join(cwd, 'package-lock.json'))) return 'npm';
  const declared = pkg?.packageManager;
  if (declared?.startsWith('pnpm@')) return 'pnpm';
  if (declared?.startsWith('yarn@')) return 'yarn';
  if (declared?.startsWith('npm@')) return 'npm';
  return 'npm';
}

function allDeps(pkg: PackageJsonShape | undefined): Record<string, string> {
  return { ...pkg?.dependencies, ...pkg?.devDependencies };
}

function detectTestFrameworks(pkg: PackageJsonShape | undefined): TestFramework[] {
  const deps = allDeps(pkg);
  const out: TestFramework[] = [];
  if ('vitest' in deps) out.push('vitest');
  if ('jest' in deps || '@types/jest' in deps) out.push('jest');
  // node:test isn't a dependency — heuristically detect via a `node --test` script
  const scripts = pkg?.scripts ?? {};
  if (Object.values(scripts).some((s) => /\bnode\s+--test\b/.test(s))) out.push('node-test');
  return out;
}

function detectLintFrameworks(pkg: PackageJsonShape | undefined): LintFramework[] {
  const deps = allDeps(pkg);
  const out: LintFramework[] = [];
  if ('eslint' in deps) out.push('eslint');
  if ('@biomejs/biome' in deps) out.push('biome');
  if ('oxlint' in deps) out.push('oxlint');
  return out;
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

function detectScripts(pkg: PackageJsonShape | undefined): DetectedScripts {
  const scripts = pkg?.scripts ?? {};
  const out: { -readonly [K in keyof DetectedScripts]: DetectedScripts[K] } = {};
  const lint = pickScript(scripts, ['lint:ci', 'lint']);
  if (lint !== undefined) out.lint = lint;
  const typecheck = pickScript(scripts, ['typecheck', 'tsc', 'type-check']);
  if (typecheck !== undefined) out.typecheck = typecheck;
  const test = pickScript(scripts, ['test:ci', 'test']);
  if (test !== undefined) out.test = test;
  const coverage = pickScript(scripts, ['test:coverage', 'coverage']);
  if (coverage !== undefined) out.coverage = coverage;
  return out;
}

function lintReporterFlag(framework: LintFramework | undefined): string | undefined {
  if (framework === 'eslint' || framework === 'oxlint') return '--format json';
  if (framework === 'biome') return '--reporter json';
  return undefined;
}

function testReporterFlag(framework: TestFramework | undefined): string | undefined {
  if (framework === 'vitest') return '--reporter json';
  if (framework === 'jest') return '--json';
  if (framework === 'node-test') return '--test-reporter spec';
  return undefined;
}

function composeCommand(pm: PackageManager, scriptName: string, forwardedFlag?: string): string {
  if (forwardedFlag === undefined) {
    if (pm === 'npm') return `npm run ${scriptName}`;
    return `${pm} ${scriptName}`;
  }
  if (pm === 'npm') return `npm run ${scriptName} -- ${forwardedFlag}`;
  return `${pm} ${scriptName} ${forwardedFlag}`;
}

function buildToolchainBlock(ctx: InitContext): {
  lines: string[];
  ambiguityComments: string[];
} {
  const lines: string[] = [];
  const ambiguityComments: string[] = [];
  if (ctx.testFrameworkCandidates.length > 1) {
    ambiguityComments.push(
      `// EDIT: detected multiple test frameworks (${ctx.testFrameworkCandidates.join(', ')}); assumed ${ctx.testFramework ?? 'vitest'}.`,
    );
  }
  if (ctx.lintFrameworkCandidates.length > 1) {
    ambiguityComments.push(
      `// EDIT: detected multiple lint frameworks (${ctx.lintFrameworkCandidates.join(', ')}); assumed ${ctx.lintFramework ?? 'eslint'}.`,
    );
  }

  if (ctx.scripts.lint !== undefined) {
    const cmd = composeCommand(ctx.pm, ctx.scripts.lint, lintReporterFlag(ctx.lintFramework));
    lines.push(`    lint: '${cmd}',`);
  }
  if (ctx.scripts.typecheck !== undefined) {
    lines.push(`    typecheck: '${composeCommand(ctx.pm, ctx.scripts.typecheck)}',`);
  }
  if (ctx.scripts.test !== undefined) {
    const cmd = composeCommand(ctx.pm, ctx.scripts.test, testReporterFlag(ctx.testFramework));
    lines.push(`    test: '${cmd}',`);
  }
  if (ctx.scripts.coverage !== undefined) {
    const cmd = composeCommand(ctx.pm, ctx.scripts.coverage, testReporterFlag(ctx.testFramework));
    lines.push(`    coverage: '${cmd}',`);
  }
  return { lines, ambiguityComments };
}

function renderConfigTemplate(ctx: InitContext): string {
  const { lines, ambiguityComments } = buildToolchainBlock(ctx);
  const today = new Date().toISOString().slice(0, 10);
  const importStmt = ctx.typescript
    ? "import { defineConfig } from 'effective';"
    : "const { defineConfig } = require('effective');";
  const exportStmt = ctx.typescript ? 'export default' : 'module.exports =';
  const nameLine = `    name: '${ctx.packageName ?? 'my-project'}',`;
  const versionLine =
    ctx.packageVersion === undefined ? '' : `\n    version: '${ctx.packageVersion}',`;
  const toolchainBlock =
    lines.length > 0
      ? `${ambiguityComments.length === 0 ? '' : `${ambiguityComments.map((c) => `  ${c}`).join('\n')}\n`}  toolchain: {\n${lines.join('\n')}\n  },`
      : `  // toolchain: { lint: '...', typecheck: '...', test: '...', coverage: '...' },`;

  return `// effective.config${ctx.typescript ? '.ts' : '.js'}
// Generated by \`npx effective init\` on ${today}.
// Review and edit; the comments explain each section.

${importStmt}

${exportStmt} defineConfig({
  // The recommended preset includes the full catalogue at strict severity.
  // See DESIGN.md for the constitution-as-substance reframe.
  extends: ['recommended'],

  // How to run your toolchain. Detected from package.json scripts and
  // devDependencies. Reporter flags are appended for the JSON parsers
  // \`effective\` ships; if a script already emits JSON, the flag is harmless.
${toolchainBlock}

  // Disable rules that don't fit your project. Rationale required.
  // Example:
  //   disable: {
  //     'spec.assertion-narrowed': 'We use property-based tests; false positives here.',
  //   },

  // Downgrade severity for rules you can't satisfy yet. Promote back as you catch up.
  // Example:
  //   override: {
  //     'exceptions.must-cite-justification': {
  //       severity: 'HIGH',
  //       rationale: 'Existing escape hatches lack refs; warn now, retrofit gradually.',
  //     },
  //   },

  // Define custom roles for workflows beyond test-writer / code-writer / reviewer.
  // Example:
  //   roles: {
  //     'migration-writer': {
  //       defaultEditable: ['migrations/**', 'test/migrations/**'],
  //       expectations: { newMigrationExists: true, existingTestsPass: true },
  //     },
  //   },

  meta: {
${nameLine}${versionLine}
  },
});
`;
}

function renderExceptionsTemplate(typescript: boolean): string {
  const today = new Date().toISOString().slice(0, 10);
  const importStmt = typescript
    ? "import { defineExceptions, seeds } from 'effective';"
    : "const { defineExceptions, seeds } = require('effective');";
  const exportStmt = typescript ? 'export default' : 'module.exports =';
  return `// .effective/exceptions${typescript ? '.ts' : '.js'}
// Generated by \`npx effective init\` on ${today}.
// Add project-specific exception instances below \`seeds.builtInExceptions\`.

${importStmt}

${exportStmt} defineExceptions({
  // Built-in templates: CLI fatal-exit, external library drift defense,
  // type narrowing of impossible, TTY-bound paths, Zod internal
  // introspection, and others. See schemas/builtin.ts for the full list.
  ...seeds.builtInExceptions,

  // Project-specific exceptions go here. Each needs a category, mechanism,
  // context, retirementCondition, and addedDate.
  // Example:
  //   'our-postgres-driver-quirk': {
  //     id: 'our-postgres-driver-quirk',
  //     category: 'external-library-drift-defense',
  //     mechanism: 'ts-expect-error',
  //     context: 'pg@8.x leaves stale connections under specific error shapes',
  //     retirementCondition: 'Resolved when we migrate to pg@9 or postgres.js',
  //     addedDate: '${today}',
  //     status: 'active',
  //   },
});
`;
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

/**
 * Ignore the transient subdirectories of `.effective/` (the isolated
 * worktree and the cached install), but NOT the directory itself —
 * `.effective/exceptions.ts` is project state and belongs under
 * version control. See USAGE.md "gradual adoption path", step 4.
 */
const EFFECTIVE_GITIGNORE_ENTRIES = ['.effective/node_modules/', '.effective/work/'];

async function ensureGitignore(repoRoot: string, written: string[]): Promise<void> {
  const gi = path.join(repoRoot, '.gitignore');
  let body = '';
  let existed = false;
  if (await exists(gi)) {
    existed = true;
    body = await fs.readFile(gi, 'utf8');
  }
  const existingLines = new Set(body.split('\n').map((l) => l.trim()));
  const additions = EFFECTIVE_GITIGNORE_ENTRIES.filter((entry) => !existingLines.has(entry));
  if (additions.length === 0) return;
  if (body.length > 0 && !body.endsWith('\n')) body += '\n';
  body += `${additions.join('\n')}\n`;
  await fs.writeFile(gi, body);
  if (!existed) written.push(gi);
  else if (!written.includes(gi)) written.push(gi);
}

async function detectContext(cwd: string): Promise<InitContext> {
  const pkg = await readPackageJson(cwd);
  const pm = await detectPackageManager(cwd, pkg);
  const typescript = await exists(path.join(cwd, 'tsconfig.json'));
  const testCandidates = detectTestFrameworks(pkg);
  const lintCandidates = detectLintFrameworks(pkg);
  const ctx: {
    -readonly [K in keyof InitContext]: InitContext[K];
  } = {
    pm,
    typescript,
    testFrameworkCandidates: testCandidates,
    lintFrameworkCandidates: lintCandidates,
    scripts: detectScripts(pkg),
  };
  if (pkg?.name !== undefined) ctx.packageName = pkg.name;
  if (pkg?.version !== undefined) ctx.packageVersion = pkg.version;
  if (testCandidates[0] !== undefined) ctx.testFramework = testCandidates[0];
  if (lintCandidates[0] !== undefined) ctx.lintFramework = lintCandidates[0];
  return ctx;
}

export async function runInitCommand(args: ParsedArgs, cwd: string): Promise<InitCliResult> {
  const force = args.flags.has('force');
  const ctx = await detectContext(cwd);
  const written: string[] = [];
  const skipped: string[] = [];

  const configExt = ctx.typescript ? 'ts' : 'js';
  const configPath = path.join(cwd, `effective.config.${configExt}`);
  const exceptionsPath = path.join(cwd, '.effective', `exceptions.${configExt}`);

  await writeIfMissing(configPath, renderConfigTemplate(ctx), force, written, skipped);
  await writeIfMissing(
    exceptionsPath,
    renderExceptionsTemplate(ctx.typescript),
    force,
    written,
    skipped,
  );
  await ensureGitignore(cwd, written);

  const allSkipped = written.length === 0 && skipped.length > 0;
  if (allSkipped) {
    const stdout = `Effective is already initialized. See ${path.relative(cwd, configPath)}.\nPass --force to regenerate.\n`;
    return { stdout, stderr: '', exitCode: 0, filesWritten: written, filesSkipped: skipped };
  }

  const lines: string[] = [];
  for (const p of written) {
    const rel = path.relative(cwd, p);
    switch (rel) {
      case `effective.config.${configExt}`: {
        lines.push(
          `✓ Created ${rel} (extends recommended preset; toolchain detected from package.json)`,
        );
        break;
      }
      case path.join('.effective', `exceptions.${configExt}`): {
        lines.push(
          `✓ Created ${rel} (built-in categories ready; add project-specific instances as needed)`,
        );
        break;
      }
      case '.gitignore': {
        lines.push(`✓ Updated .gitignore (added .effective/)`);
        break;
      }
      default: {
        lines.push(`✓ Created ${rel}`);
      }
    }
  }
  for (const p of skipped) {
    lines.push(`• Skipped ${path.relative(cwd, p)} (already exists; pass --force to overwrite)`);
  }

  lines.push(
    '',
    'Next step:',
    `  Run \`${nextStepCommand(ctx.pm)}\` to see what the constitution flags. Your`,
    '  first verify will be slower (1-5 minutes) while it installs an',
    '  isolated node_modules; subsequent runs use the cached install.',
  );

  return {
    stdout: `${lines.join('\n')}\n`,
    stderr: '',
    exitCode: 0,
    filesWritten: written,
    filesSkipped: skipped,
  };
}

function nextStepCommand(pm: PackageManager): string {
  if (pm === 'pnpm') return 'pnpm exec effective verify';
  if (pm === 'yarn') return 'yarn effective verify';
  return 'npx effective verify';
}
