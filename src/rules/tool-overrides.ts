import type { Finding, Severity } from '../schemas.js';

/**
 * Apply severity overrides to findings a PARSER emitted.
 *
 * Parser findings (`coverage:lines-below-threshold`, `eslint:<rule>`,
 * `tsc:<code>`) carry severities the parser hardcodes. They are not
 * rules, so `override` could not reach them — it threw "unknown rule" —
 * and overriding the wrapping toolchain rule did not help either,
 * because the parser finding carried its own severity into the verdict.
 * An adopter ratcheting coverage up from 60% could downgrade
 * `toolchain.coverage-meets-threshold` and still fail the run.
 *
 * Same class as the escape-hatch severity bug fixed in rc.9, one layer
 * down: a finding-producing path that never read the resolved severity.
 */
export function applyToolFindingOverrides(
  findings: readonly Finding[],
  overrides: ReadonlyMap<string, Severity>,
): Finding[] {
  if (overrides.size === 0) return [...findings];
  return findings.map((finding) => {
    const severity = overrides.get(finding.ruleId);
    return severity === undefined ? finding : { ...finding, severity };
  });
}
