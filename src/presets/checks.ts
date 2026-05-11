import { scanFilesForEscapeHatches } from '../escape-hatches/scan.js';
import { validateEscapeHatches } from '../escape-hatches/validate.js';
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

export const builtInChecks: Readonly<Record<string, CustomCheck>> = {
  exceptionsMustCiteJustification,
};
