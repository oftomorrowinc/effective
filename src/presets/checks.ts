import { scanFilesForEscapeHatches } from '../escape-hatches/scan.js';
import { validateEscapeHatches } from '../escape-hatches/validate.js';
import { catalogueStubChecks } from './rules/stubs.js';
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

/**
 * Built-in custom-check registry. Merged into every verify() call by
 * default; users can override any entry by passing their own
 * `customChecks` map to verify(). Includes both the substantive
 * `exceptionsMustCiteJustification` check and the catalogue-rule stubs
 * (which return no findings until project-specific implementations
 * land).
 */
export const builtInChecks: Readonly<Record<string, CustomCheck>> = {
  exceptionsMustCiteJustification,
  ...catalogueStubChecks,
};
