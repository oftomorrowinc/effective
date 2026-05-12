import { scanFilesForEscapeHatches } from '../escape-hatches/scan.js';
import { validateEscapeHatches } from '../escape-hatches/validate.js';
import { catalogueStubChecks } from './rules/stubs.js';
import type { Finding } from '../schemas.js';
import type { CustomCheck } from '../source/types.js';

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
    const lines = file.content.split('\n');
    for (const [index, line] of lines.entries()) {
      const hits = [...scanLine(line, DISABLE_METHOD_RE), ...scanLine(line, DISABLE_LEGACY_RE)];
      if (hits.length === 0) continue;
      const context = [lines[index - 1] ?? '', line, lines[index + 1] ?? ''].join('\n');
      if (EXCEPTION_ID_HINT.test(context)) continue;
      for (const hit of hits) {
        findings.push({
          ruleId: rule.id,
          severity: rule.defaultSeverity,
          category: rule.category,
          message: `Disabled test (.${hit.shape}) without an exception-id annotation. Either fix the test, or register an exception in .effective/exceptions.ts and cite its id in a comment above or beside the disable.`,
          evidence: line.trim(),
          location: { file: file.path, line: index + 1, column: hit.column },
          source: { kind: 'rule', ruleId: rule.id },
        });
      }
    }
  }
  return findings;
};

/**
 * Built-in custom-check registry. Merged into every verify() call by
 * default; users can override any entry by passing their own
 * `customChecks` map to verify(). Includes the substantive checks
 * (`exceptionsMustCiteJustification`, `noDisabledTestsWithoutException`)
 * and the catalogue-rule stubs (which return no findings until project-
 * specific implementations land).
 */
export const builtInChecks: Readonly<Record<string, CustomCheck>> = {
  exceptionsMustCiteJustification,
  noDisabledTestsWithoutException,
  ...catalogueStubChecks,
};
