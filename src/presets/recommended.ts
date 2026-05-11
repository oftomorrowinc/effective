import { rule } from '../rules/factories.js';
import { architectureRules } from './rules/architecture.js';
import { testDisciplineRules } from './rules/test-discipline.js';
import { dataDisciplineRules } from './rules/data-discipline.js';
import { governanceRules } from './rules/governance.js';
import type { Constitution, Rule } from '../schemas.js';

/**
 * Foundation-tier rules — lane, exceptions, toolchain gates. These
 * are the package's own machinery, not catalogue-driven. Tests-pass /
 * lint-clean / typecheck-clean / coverage-non-decreasing are the four
 * universal toolchain gates every project should run; the lane and
 * exceptions rules enforce structural invariants the package itself
 * ships.
 */
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
];

/**
 * `effective/recommended` — the full preset shipped with the package.
 *
 * Composition: 6 foundation rules + 21 catalogue-driven rules across
 * four topical clusters (architecture, test-discipline, data-discipline,
 * governance). Catalogue-driven rules carry the prompt projection
 * derived from each failure entry's structural-countermeasure prose;
 * their detection logic is registered via stubs in
 * `presets/rules/stubs.ts` (returning no findings until project-
 * specific implementations land). The prompt projection is the
 * primary user-facing value — workers read the guidance via
 * `prepare()`; detection grows over time.
 *
 * Use via `extends: ['recommended']` in your config. The built-in
 * preset registry is auto-merged by `verify()` and `prepare()`, so
 * no manual registry wiring is required.
 *
 * Meta-rules (self-report checks that need the build-log as input) are
 * NOT included here — those need the MetaRule kind which lands in a
 * follow-up step. Until then, the catalogue entries for transparent-
 * /fabricated-/narrow-verification, sketch-contradiction-self-
 * correction, retry-scope-expansion, and primed-shell-verification
 * are documented in the failure catalogue but don't yet have
 * detection rules in this preset.
 */
export const recommended: Constitution = {
  rules: [
    ...FOUNDATION_RULES,
    ...architectureRules,
    ...testDisciplineRules,
    ...dataDisciplineRules,
    ...governanceRules,
  ],
  meta: {
    name: 'effective/recommended',
    description: 'Foundation + catalogue-driven rules shipped with effective.',
  },
};
