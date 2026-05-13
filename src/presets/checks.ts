import { promises as fs } from 'node:fs';
import path from 'node:path';
import { scanFilesForEscapeHatches } from '../escape-hatches/scan.js';
import { validateEscapeHatches } from '../escape-hatches/validate.js';
import { compilePatterns } from '../glob.js';
import { classifyRegions } from '../syntax-regions.js';
import { walkSourceFiles } from '../walk.js';
import { catalogueStubChecks } from './rules/stubs.js';
import type { Finding } from '../schemas.js';
import type { ChangedFile, CustomCheck } from '../source/types.js';

/**
 * Built-in custom check used by the `exceptions.must-cite-justification`
 * rule in the recommended preset. Wired up in `defineConfig({ ... })` by
 * passing `customChecks: { ...presets.builtInChecks }` to verify().
 *
 * The check scans every changed file for suppression comments and
 * cross-references each one against the project's exception registry.
 */
export const exceptionsMustCiteJustification: CustomCheck = (rule, ctx) => {
  const hatches = scanFilesForEscapeHatches(ctx.changedFiles);
  return validateEscapeHatches({
    escapeHatches: hatches,
    registry: ctx.exceptionRegistry,
    ruleId: rule.id,
    category: rule.category,
  });
};

const TEST_FILE_RE = /\.(test|spec)\.(tsx?|jsx?|mjs|cjs)$/;
const DISABLE_METHOD_RE = /\b(?:it|test|describe)\.(skip|todo|skipIf|runIf)\(/g;
const DISABLE_LEGACY_RE = /\bx(it|test|describe)\(/g;
const EXCEPTION_ID_HINT = /exception-id\s*:\s*[\w.-]+/i;

/**
 * Real detection for the `no-disabled-tests-without-exception` rule.
 *
 * Scans each changed test file (`*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}`)
 * for the canonical test-disable shapes (`.skip` / `.todo` / `.skipIf` /
 * `.runIf` on `it`/`test`/`describe`, and the legacy `xit`/`xtest`/
 * `xdescribe` aliases). For each match, looks on the same line plus the
 * preceding and following lines for an `exception-id: <id>` annotation;
 * a finding is emitted only when no such annotation is found.
 *
 * The check trusts the exception-id annotation as surface evidence —
 * cross-referencing against the registry is left to the separate
 * `exceptions.must-cite-justification` rule, which validates *every*
 * escape-hatch citation against the registry. That separation keeps each
 * rule's failure mode legible: this rule says "no bare disables"; the
 * other says "every cited id resolves."
 */
function scanLine(line: string, pattern: RegExp): { shape: string; column: number }[] {
  const hits: { shape: string; column: number }[] = [];
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line)) !== null) {
    hits.push({ shape: match[1] ?? 'disable', column: match.index + 1 });
    if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
  }
  return hits;
}

export const noDisabledTestsWithoutException: CustomCheck = (rule, ctx) => {
  const findings: Finding[] = [];
  for (const file of ctx.changedFiles) {
    if (file.status === 'deleted') continue;
    if (!TEST_FILE_RE.test(file.path)) continue;
    // Region-aware: real `.skip()` calls are code; the same text inside
    // a string literal (test fixture passing skip-shaped input to the
    // rule under test) is not a real call. Compute regions once per
    // file; lookup per hit by global offset.
    const regions = classifyRegions(file.content);
    const lineStarts: number[] = [0];
    for (let i = 0; i < file.content.length; i += 1) {
      if (file.content.codePointAt(i) === 10) lineStarts.push(i + 1);
    }
    const lines = file.content.split('\n');
    /* eslint-disable security/detect-object-injection -- exception-id: caller-validated-dynamic-key */
    for (const [index, line] of lines.entries()) {
      const hits = [...scanLine(line, DISABLE_METHOD_RE), ...scanLine(line, DISABLE_LEGACY_RE)];
      if (hits.length === 0) continue;
      const lineStart = lineStarts[index] ?? 0;
      // Filter to hits that are real code (skip fixture-strings, comments).
      const codeHits = hits.filter((hit) => regions[lineStart + (hit.column - 1)] === 'code');
      if (codeHits.length === 0) continue;
      const context = [lines[index - 1] ?? '', line, lines[index + 1] ?? ''].join('\n');
      if (EXCEPTION_ID_HINT.test(context)) continue;
      for (const hit of codeHits) {
        findings.push({
          ruleId: rule.id,
          severity: rule.defaultSeverity,
          category: rule.category,
          message: `Disabled test (.${hit.shape}) without an exception-id annotation. Either fix the test, or register an exception under the config's \`exceptions\` field and cite its id in a comment above or beside the disable.`,
          evidence: line.trim(),
          location: { file: file.path, line: index + 1, column: hit.column },
          source: { kind: 'rule', ruleId: rule.id },
        });
      }
    }
    /* eslint-enable security/detect-object-injection */
  }
  return findings;
};

const MIGRATION_PATH_RE = /(?:^|\/)migrations?\//;
const MIGRATION_EXT_RE = /\.(sql|ts|js|mjs|cjs)$/;
const TEST_PATH_RE = /\.(test|spec)\.(tsx?|jsx?|mjs|cjs)$/;

function migrationStem(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath;
  return base.replace(/\.[^./]+$/, '');
}

function isMigrationFile(file: ChangedFile): boolean {
  if (TEST_PATH_RE.test(file.path)) return false;
  return MIGRATION_PATH_RE.test(file.path) && MIGRATION_EXT_RE.test(file.path);
}

function changedTestFiles(files: readonly ChangedFile[]): ChangedFile[] {
  return files.filter((f) => f.status !== 'deleted' && TEST_PATH_RE.test(f.path));
}

/**
 * Real detection for `migration-has-exercising-test`.
 *
 * For every NEW migration file (added in the diff under a `migrations/`
 * or `migration/` path with a `.sql`, `.ts`, `.js`, `.mjs`, or `.cjs`
 * extension), at least one test file in the diff must mention the
 * migration's filename stem. Tests that exist outside the diff are not
 * cross-referenced here — the failure mode this rule catches is
 * shipping a migration without authoring or updating a test in the
 * same change; pre-existing tests would already have failed when the
 * migration's new behavior changed real assertions.
 *
 * Detection is intentionally coarse — substring match on the stem —
 * because the surface-evidence question we want answered ("did the
 * worker author or touch a test alongside this migration?") doesn't
 * need an AST. Projects whose migration filenames are very short
 * (`0001.sql`) can override the check via `customChecks` if false
 * positives become an issue; the rule's prompt already steers workers
 * to write meaningfully-named migrations.
 */
export const migrationHasExercisingTest: CustomCheck = (rule, ctx) => {
  const newMigrations = ctx.changedFiles.filter((f) => f.status === 'added' && isMigrationFile(f));
  if (newMigrations.length === 0) return [];
  const tests = changedTestFiles(ctx.changedFiles);
  const findings: Finding[] = [];
  for (const migration of newMigrations) {
    const stem = migrationStem(migration.path);
    if (stem.length === 0) continue;
    const mentioned = tests.some((t) => t.content.includes(stem));
    if (mentioned) continue;
    findings.push({
      ruleId: rule.id,
      severity: rule.defaultSeverity,
      category: rule.category,
      message: `New migration ${migration.path} ships without an exercising test in the same diff. Add a test that seeds pre-migration state, runs the migration, and asserts the post-migration state — defensive no-op migrations that never fire against the condition they were nominally defending are the failure mode this rule catches.`,
      evidence: migration.path,
      location: { file: migration.path },
      source: { kind: 'rule', ruleId: rule.id },
    });
  }
  return findings;
};

const SOURCE_EXT_RE = /\.(tsx?|jsx?|mjs|cjs)$/;

const EXPORT_NAME_RES: readonly RegExp[] = [
  /^\s*export\s+function\s+(\w+)/gm,
  /^\s*export\s+async\s+function\s+(\w+)/gm,
  /^\s*export\s+const\s+(\w+)/gm,
  /^\s*export\s+let\s+(\w+)/gm,
  /^\s*export\s+var\s+(\w+)/gm,
  /^\s*export\s+class\s+(\w+)/gm,
  /^\s*export\s+default\s+function\s+(\w+)/gm,
  /^\s*export\s+default\s+async\s+function\s+(\w+)/gm,
  /^\s*export\s+default\s+class\s+(\w+)/gm,
];
const NAMED_RE_EXPORT_RE = /^\s*export\s*\{\s*([^}]+)\}/gm;
// `type` and `interface` keywords inside `export { ... }` are type-only
// re-exports — they have no runtime value and so by definition have no
// runtime callers. Filtering them here prevents the rule from extracting
// the literal word `type` (or `interface`) as an export name, which
// would otherwise trivially "match" everywhere via regex.
const TYPE_ONLY_KEYWORD_RE = /^(?:type|interface)\b/;

function extractExportNames(content: string): string[] {
  const names = new Set<string>();
  for (const re of EXPORT_NAME_RES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (m[1]) names.add(m[1]);
    }
  }
  NAMED_RE_EXPORT_RE.lastIndex = 0;
  let nm: RegExpExecArray | null;
  while ((nm = NAMED_RE_EXPORT_RE.exec(content)) !== null) {
    const inner = nm[1] ?? '';
    for (const part of inner.split(',')) {
      const cleaned = part.trim();
      if (cleaned.length === 0) continue;
      if (TYPE_ONLY_KEYWORD_RE.test(cleaned)) continue;
      // `export { foo as bar }` — bar is the exported name
      const aliasMatch = /\bas\s+(\w+)$/.exec(cleaned);
      const exportedName = aliasMatch?.[1] ?? cleaned.replace(/\s+/, ' ').split(' ')[0];
      if (exportedName && /^\w+$/.test(exportedName)) names.add(exportedName);
    }
  }
  return [...names];
}

/**
 * Whether `name` is referenced inside its own source file at a site
 * other than its export declaration(s) — a CLI-entry block that calls
 * an exported function, two same-file exports that compose, etc. The
 * cross-file caller walk skips the source file (a file isn't *its own*
 * external caller); this catches the same-file case so single-file
 * scripts that export + invoke don't false-positive.
 *
 * Implementation: count `\bname\b` occurrences in the file, subtract
 * occurrences inside export-declaration shapes that bind `name`. If
 * the difference is positive, the name appears somewhere outside an
 * export declaration — i.e. it's used.
 */
function hasSameFileUsage(content: string, name: string): boolean {
  // eslint-disable-next-line security/detect-non-literal-regexp -- exception-id: caller-validated-dynamic-key
  const wordRe = new RegExp(`\\b${name}\\b`, 'g');
  const totalMatches = content.match(wordRe);
  const totalCount = totalMatches === null ? 0 : totalMatches.length;
  if (totalCount === 0) return false;

  const exportPatterns: readonly RegExp[] = [
    // eslint-disable-next-line security/detect-non-literal-regexp -- exception-id: caller-validated-dynamic-key
    new RegExp(`^\\s*export\\s+(?:async\\s+)?function\\s+${name}\\b`, 'gm'),
    // eslint-disable-next-line security/detect-non-literal-regexp -- exception-id: caller-validated-dynamic-key
    new RegExp(`^\\s*export\\s+(?:const|let|var)\\s+${name}\\b`, 'gm'),
    // eslint-disable-next-line security/detect-non-literal-regexp -- exception-id: caller-validated-dynamic-key
    new RegExp(`^\\s*export\\s+class\\s+${name}\\b`, 'gm'),
    // eslint-disable-next-line security/detect-non-literal-regexp -- exception-id: caller-validated-dynamic-key
    new RegExp(`^\\s*export\\s+default\\s+(?:async\\s+)?function\\s+${name}\\b`, 'gm'),
    // eslint-disable-next-line security/detect-non-literal-regexp -- exception-id: caller-validated-dynamic-key
    new RegExp(`^\\s*export\\s+default\\s+class\\s+${name}\\b`, 'gm'),
  ];
  let declarationCount = 0;
  for (const re of exportPatterns) {
    const matches = content.match(re);
    if (matches !== null) declarationCount += matches.length;
  }

  // `export { name }` / `export { name as alias }` / `export { name } from '...'`
  // — one declaration per appearance of the name inside the braces.
  const namedExportBlocks = content.match(/^\s*export\s*\{[^}]+\}/gm) ?? [];
  // eslint-disable-next-line security/detect-non-literal-regexp -- exception-id: caller-validated-dynamic-key
  const insideBraceRe = new RegExp(`\\b${name}\\b`, 'g');
  for (const block of namedExportBlocks) {
    const blockMatches = block.match(insideBraceRe);
    if (blockMatches !== null) declarationCount += blockMatches.length;
  }

  return totalCount > declarationCount;
}

interface ExportRecord {
  file: ChangedFile;
  name: string;
}

/**
 * Real detection for `new-exports-have-non-test-callers`.
 *
 * Scans every newly added non-test source file in the diff for exported
 * names (functions, classes, consts, named re-exports, default function/
 * class declarations). For each exported name, walks the repository
 * looking for a non-test caller — any source file outside the test
 * pattern that references the name as a word. Files lacking any non-
 * test caller produce a HIGH finding flagging the export as scaffolded
 * without runtime wiring.
 *
 * What counts as a caller:
 * - Any reference to the exported name in a non-test source file other
 *   than the file the export lives in.
 * - Same-file references outside the export-declaration line itself.
 *   This catches single-file scripts that export a function and invoke
 *   it in their own CLI-entry block (e.g. `scripts/*.ts`), which
 *   external-import-based detection would mis-flag.
 *
 * Limitations (deliberate):
 * - Modified files: skipped. Without git baseline parsing we can't tell
 *   which exports are *new* vs. pre-existing. Coverage will catch this
 *   when we layer git baseline diff parsing in a follow-up.
 * - Type-only exports (`export type X`, `export interface Y`): not
 *   enumerated as exports in the first place — the regex set is
 *   value-only. `export { type X }` is filtered explicitly.
 * - Aggregate re-exports (`export * from './foo'`): skipped. Names
 *   are not visible at this point without resolving the re-export
 *   target.
 * - Default unnamed exports (`export default <expression>`): skipped.
 *   No name to search for.
 * - Framework-discovered hook exports (Next.js page/layout, etc.):
 *   not yet handled. The rule fires; projects suppress via the
 *   `disable` config or per-export exception until a path-convention
 *   model lands.
 *
 * Requires `ctx.repo` (git-backed source). For inline sources the check
 * silently returns no findings — there's no filesystem to walk.
 */
export const newExportsHaveNonTestCallers: CustomCheck = async (rule, ctx) => {
  if (ctx.repo === undefined) return [];
  const newSourceFiles = ctx.changedFiles.filter(
    (f) =>
      f.status === 'added' &&
      SOURCE_EXT_RE.test(f.path) &&
      !TEST_PATH_RE.test(f.path) &&
      !MIGRATION_PATH_RE.test(f.path),
  );
  if (newSourceFiles.length === 0) return [];

  const records: ExportRecord[] = [];
  for (const file of newSourceFiles) {
    for (const name of extractExportNames(file.content)) {
      records.push({ file, name });
    }
  }
  if (records.length === 0) return [];

  // Single repo walk; for each file, check every export name. Skip the
  // source file itself (a file is not its own caller).
  const seenAsNonTestCaller = new Set<string>();
  const newFilePaths = new Set(newSourceFiles.map((f) => f.path));
  const repoRoot = ctx.repo;
  const sourcePaths = await walkSourceFiles(repoRoot);
  for (const abs of sourcePaths) {
    const rel = path.relative(repoRoot, abs).replaceAll('\\', '/');
    if (newFilePaths.has(rel)) continue;
    if (TEST_PATH_RE.test(rel)) continue;
    let content: string;
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- exception-id: intentional-source-tree-walker
      content = await fs.readFile(abs, 'utf8');
    } catch {
      continue;
    }
    for (const r of records) {
      const key = `${r.file.path}|${r.name}`;
      if (seenAsNonTestCaller.has(key)) continue;
      // eslint-disable-next-line security/detect-non-literal-regexp -- exception-id: caller-validated-dynamic-key
      const wordRe = new RegExp(`\\b${r.name}\\b`);
      if (wordRe.test(content)) seenAsNonTestCaller.add(key);
    }
  }

  const findings: Finding[] = [];
  for (const r of records) {
    const key = `${r.file.path}|${r.name}`;
    if (seenAsNonTestCaller.has(key)) continue;
    // Same-file usage counts: a single-file script that exports a
    // function and invokes it in its own CLI-entry block is wired,
    // even though no *other* source file imports the name.
    if (hasSameFileUsage(r.file.content, r.name)) continue;
    findings.push({
      ruleId: rule.id,
      severity: rule.defaultSeverity,
      category: rule.category,
      message: `New export \`${r.name}\` in ${r.file.path} has no non-test caller. Wire it into a runtime path before shipping, or remove it — scaffolding tested in isolation drifts away from the real integration surface.`,
      evidence: r.name,
      location: { file: r.file.path },
      source: { kind: 'rule', ruleId: rule.id },
    });
  }
  return findings;
};

/**
 * Real detection for `protected-paths-respected`.
 *
 * Iterates the resolved-merged `ctx.protectedPaths` and checks each
 * changed file against each protected glob. A file matching ANY
 * protected glob produces a CRITICAL finding citing the matched
 * entry's rationale.
 *
 * Why per-entry matching (vs. an aggregate matcher): the rationale
 * is per-glob — a finding needs to say WHY this specific file is
 * protected ("the constitution itself; workers must not edit the
 * rules they're being held to"), not just "this file is protected
 * by some rule somewhere." So we test each glob individually and
 * cite the first match.
 *
 * No elevation mechanism in v0.1 — touching a protected file is
 * always a CRITICAL finding. Elevation is the reviewer-package's
 * concern; for now, constitutional changes happen outside the
 * worker loop (a human edits the config separately).
 */
export const protectedPathsRespected: CustomCheck = (rule, ctx) => {
  if (ctx.protectedPaths.length === 0) return [];
  const compiled = ctx.protectedPaths.map((entry) => ({
    entry,
    matcher: compilePatterns([entry.path]),
  }));
  const findings: Finding[] = [];
  for (const file of ctx.changedFiles) {
    if (file.status === 'deleted') {
      // Deleting a protected file is also a constitutional change;
      // surface it the same way.
    }
    for (const { entry, matcher } of compiled) {
      if (!matcher(file.path)) continue;
      findings.push({
        ruleId: rule.id,
        severity: rule.defaultSeverity,
        category: rule.category,
        message: `${file.path} is a protected file — ${entry.rationale} Workers cannot edit protected files as part of their work. Surface the need for a constitutional change via kickBack and stop; a reviewer or human with elevated scope makes the change separately.`,
        evidence: file.path,
        location: { file: file.path },
        source: { kind: 'rule', ruleId: rule.id },
      });
      break;
    }
  }
  return findings;
};

/**
 * Built-in custom-check registry. Merged into every verify() call by
 * default; users can override any entry by passing their own
 * `customChecks` map to verify(). Includes the substantive checks
 * and the catalogue-rule stubs (which return no findings until
 * project-specific implementations land).
 */
export const builtInChecks: Readonly<Record<string, CustomCheck>> = {
  exceptionsMustCiteJustification,
  noDisabledTestsWithoutException,
  migrationHasExercisingTest,
  newExportsHaveNonTestCallers,
  protectedPathsRespected,
  ...catalogueStubChecks,
};
