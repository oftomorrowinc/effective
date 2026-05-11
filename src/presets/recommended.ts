import { rule } from '../rules/factories.js';
import type { Constitution, Rule } from '../schemas.js';

const FOUNDATION_RULES: readonly Rule[] = [
  rule.lane(),
  rule.custom({
    id: 'exceptions.must-cite-justification',
    category: 'exceptions',
    defaultSeverity: 'CRITICAL',
    checkRef: 'exceptionsMustCiteJustification',
    prompt: {
      summary: 'Every escape hatch must cite a tracked exception id.',
      guidance:
        'Suppression comments — c8 ignore, @ts-expect-error, eslint-disable, prettier-ignore — must include `exception-id: <id>` matching an entry in `.effective/exceptions.ts`. Add a new exception (with category, context, retirement condition) rather than leaving a bare suppression.',
    },
  }),
  rule.toolchain({
    id: 'toolchain.lint-clean',
    tool: 'lint',
    failOn: 'count-non-zero',
    prompt: {
      summary: 'Lint reports zero issues.',
      guidance:
        'Fix the underlying issue. Do not disable the rule, suppress the warning, or weaken the lint config to make it green.',
    },
  }),
  rule.toolchain({
    id: 'toolchain.typecheck-clean',
    tool: 'typecheck',
    failOn: 'non-zero-exit',
    prompt: {
      summary: 'TypeScript compiles with zero errors.',
      guidance:
        'Resolve type errors at the source. Casts to `any` and `@ts-expect-error` without a justified exception are not acceptable shortcuts.',
    },
  }),
  rule.toolchain({
    id: 'toolchain.tests-pass',
    tool: 'test',
    failOn: 'non-zero-exit',
    prompt: {
      summary: 'Every test passes.',
      guidance:
        'A failing test means the work is not done. Fix the test or the code; do not skip or `.todo` it without a tracked exception.',
    },
  }),
  rule.toolchain({
    id: 'toolchain.coverage-non-decreasing',
    tool: 'coverage',
    failOn: 'any-output',
    prompt: {
      summary: 'Coverage thresholds are met.',
      guidance: 'Write the missing test. Do not lower the coverage threshold to silence the gate.',
    },
  }),
  rule.spec({
    id: 'spec.test-names-land-verbatim',
    check: 'test-names-land-verbatim',
    prompt: {
      summary: 'Tests declared in the spec appear verbatim in the test files.',
      guidance:
        'When `scope.spec` is set, every test name listed in the spec must appear verbatim as an `it(...)` or `test(...)` in a committed test file.',
    },
  }),
];

/**
 * Foundation-tier preset shipped with `effective`. Contains the rules that
 * don't depend on the failure catalogue (lane enforcement, exceptions
 * registry, toolchain gates, spec discipline). The full catalogue-driven
 * preset comes from the user-supplied catalogue content in a later phase.
 *
 * Use via `extends: ['recommended']` in your config, with the matching
 * `customChecks` from `presets.builtInChecks` passed into `verify()`.
 */
export const recommended: Constitution = {
  rules: [...FOUNDATION_RULES],
  meta: {
    name: 'effective/recommended',
    description: 'Foundation rules shipped with effective.',
  },
};
