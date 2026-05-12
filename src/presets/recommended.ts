import { rule } from '../rules/factories.js';
import { architectureRules } from './rules/architecture.js';
import { testDisciplineRules } from './rules/test-discipline.js';
import { dataDisciplineRules } from './rules/data-discipline.js';
import { governanceRules } from './rules/governance.js';
import { metaRules } from './rules/meta-rules.js';
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
        "Suppression comments — c8 ignore, @ts-expect-error, eslint-disable, prettier-ignore — must include `exception-id: <id>` matching an entry in the config's `exceptions` field. Add a new exception (with category, context, retirement condition) rather than leaving a bare suppression.",
    },
  }),
  rule.custom({
    id: 'protected-paths-respected',
    category: 'governance',
    defaultSeverity: 'CRITICAL',
    diffOnly: true,
    checkRef: 'protectedPathsRespected',
    relatedPrinciple: 'mechanical-enforcement-over-instruction',
    prompt: {
      summary:
        'Constitutional files are off-limits without elevation. Workers cannot edit the rules they are being held to.',
      guidance:
        "The config's `protected` field declares paths that no worker scope may edit as part of its work. Typical protected paths include `effective.config.{ts,js}` itself (the constitution), lint/typecheck/test configs (they define what `verify` enforces), CI workflow files (the deployment gate), and any pre-commit hook configuration. If a case genuinely requires a constitutional change (e.g., registering a new exception, adjusting a rule's severity), surface that need through `kickBack` and stop — a reviewer or human with elevated scope makes the constitutional change separately, outside the worker loop. Distinct from the lane rule: lane authorizes which files a scope can touch; protected asserts which files NO scope touches without elevation. Both can fire on the same file (two reasons it's wrong, two findings to triage).",
    },
  }),
  rule.forbidPattern(/\bconsole\.(log|error|warn|debug|trace|info)\b|\bdebugger\b|\/\/\s*DEBUG\b/, {
    id: 'no-stray-debug-output',
    category: 'hygiene',
    defaultSeverity: 'CRITICAL',
    relatedPrinciple: 'mechanical-enforcement-over-instruction',
    appliesToRoles: ['code-writer', 'free-form'],
    in: '**/*.{ts,tsx,js,jsx,mjs,cjs}',
    notIn: '**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}',
    prompt: {
      summary: 'No stray debug output in production code.',
      guidance:
        'Avoid `console.log` / `console.error` / `console.warn` / `console.debug` / `console.trace` / `console.info`, bare `debugger` statements, and `// DEBUG` markers in non-test source files. They are development scaffolding — ship them and they leak into production output, fill log aggregators, or worse, divulge internal state. Route real logging through the project logger; remove debug output before commit.',
      examples: {
        bad: 'console.log("got user", user);',
        good: 'logger.info({ userId: user.id }, "fetched user");',
      },
    },
  }),
  rule.forbidPattern(
    /AKIA[0-9A-Z]{16}|gh[psoru]_[A-Za-z0-9]{36,255}|eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|xox[abprs]-[0-9A-Za-z-]{10,}|sk_(?:live|test)_[A-Za-z0-9]{24,}|pk_(?:live|test)_[A-Za-z0-9]{24,}|AIza[0-9A-Za-z_-]{35}|sk-ant-[A-Za-z0-9_-]{40,}/,
    {
      id: 'no-hardcoded-secrets',
      category: 'security',
      defaultSeverity: 'CRITICAL',
      relatedPrinciple: 'mechanical-enforcement-over-instruction',
      appliesToRoles: ['code-writer', 'free-form'],
      prompt: {
        summary: 'No hardcoded secrets, tokens, or API keys.',
        guidance:
          'Credentials, OAuth tokens, JWTs, and high-entropy API keys (AWS, GitHub, Slack, Stripe, Google, Anthropic, and similar) must live in environment variables or a secret manager — never committed to source. The check matches known token shapes; matches in test files also fail (real-shaped tokens should never appear, even as fixtures — generate ephemeral test credentials or use clearly fake placeholders like `test-token-placeholder`).',
        examples: {
          bad: 'const apiKey = "sk-ant-api03-abc...";',
          good: 'const apiKey = process.env.ANTHROPIC_API_KEY;',
        },
      },
    },
  ),
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
    ...metaRules,
  ],
  meta: {
    name: 'effective/recommended',
    description: 'Foundation + catalogue-driven rules shipped with effective.',
  },
};
